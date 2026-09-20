import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Send,
  Sparkles,
  Zap,
  RotateCcw,
  Bot,
  User,
  Clock,
  Gauge,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { useCoreRuntime } from '../coreRuntime';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  ttftMs?: number;
  tps?: number;
  totalTimeMs?: number;
}

export function PlaygroundPage() {
  const { t } = useI18n();
  const { status: coreStatus } = useCoreRuntime();

  const [model, setModel] = useState('claude-3-5-sonnet');
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});

  // 遥测数据
  const [lastTtft, setLastTtft] = useState<number | null>(null);
  const [lastTps, setLastTps] = useState<number | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const [port, setPort] = useState(8317);

  useEffect(() => {
    invoke<any>('get_core_config_settings')
      .then((cfg) => {
        if (cfg?.port) setPort(cfg.port);
      })
      .catch(() => {});
  }, []);

  const isOnline = Boolean(coreStatus?.running);

  const commonModels = [
    'claude-3-5-sonnet',
    'claude-3-7-sonnet',
    'deepseek-chat',
    'deepseek-reasoner',
    'gpt-4o',
    'gpt-4o-mini',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
  ];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = inputPrompt.trim();
    if (!trimmed || isGenerating || !isOnline) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMessageId, role: 'user', content: trimmed },
    ];

    setMessages(newMessages);
    setInputPrompt('');
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = performance.now();
    let firstTokenTime: number | null = null;
    let assistantText = '';
    let assistantReasoning = '';
    let tokenEstimate = 0;

    // 添加助理占位消息
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '...' },
    ]);

    try {
      const payloadMessages: Array<{ role: string; content: string }> = [];
      if (systemPrompt.trim()) {
        payloadMessages.push({ role: 'system', content: systemPrompt.trim() });
      }
      payloadMessages.push(...newMessages.map((m) => ({ role: m.role, content: m.content })));

      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer any-proxy-key',
        },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
          temperature,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (!reader) throw new Error('Response body is null');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || cleanLine.startsWith(':')) continue;
          if (cleanLine === 'data: [DONE]') break;

          if (cleanLine.startsWith('data: ')) {
            try {
              const json = JSON.parse(cleanLine.slice(6));
              const delta = json.choices?.[0]?.delta;

              if (delta) {
                if (firstTokenTime === null) {
                  firstTokenTime = performance.now();
                  const ttft = Math.round(firstTokenTime - startTime);
                  setLastTtft(ttft);
                }

                if (delta.reasoning_content) {
                  assistantReasoning += delta.reasoning_content;
                }
                if (delta.content) {
                  assistantText += delta.content;
                  tokenEstimate += 1;
                }

                // 实时更新助理消息
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: assistantText,
                          reasoning: assistantReasoning,
                        }
                      : m
                  )
                );
              }
            } catch {
              // ignore partial line parsing error
            }
          }
        }
      }

      const endTime = performance.now();
      const totalDuration = Math.round(endTime - startTime);
      const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : totalDuration;
      const generationDurationSeconds = Math.max(0.01, (endTime - (firstTokenTime || startTime)) / 1000);
      const tps = Math.round(tokenEstimate / generationDurationSeconds);

      setLastDuration(totalDuration);
      setLastTps(tps);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: assistantText || '(空回复)',
                reasoning: assistantReasoning,
                ttftMs: ttft,
                tps: tps > 0 ? tps : undefined,
                totalTimeMs: totalDuration,
              }
            : m
        )
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // aborted by user
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: `⚠️ 请求失败: ${err.message}` }
              : m
          )
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleClear = () => {
    setMessages([]);
    setLastTtft(null);
    setLastTps(null);
    setLastDuration(null);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <section className="page playground-page">
      <header className="management-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={22} style={{ color: 'var(--clean-primary, #06b6d4)' }} />
            模型极速测试舱 (Playground)
          </h1>
        </div>

        <div className="management-heading-actions">
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Sliders size={15} />
            参数配置
          </button>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={handleClear}
            disabled={messages.length === 0}
          >
            <RotateCcw size={15} />
            清空对话
          </button>
        </div>
      </header>

      {/* 参数抽屉面板 */}
      {showSettings && (
        <div className="panel" style={{
          padding: '12px 16px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              采样温度 (Temperature): {temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              系统提示词 (System Prompt)
            </label>
            <input
              type="text"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="可选系统人设..."
              style={{ width: '100%', height: 28, fontSize: 12 }}
            />
          </div>
        </div>
      )}

      {/* 顶部控制栏与实时遥测指标 */}
      <div className="playground-top-controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>测试模型:</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ height: 32, fontSize: 12.5, fontWeight: 600, color: '#0891b2', minWidth: 180 }}
          >
            {commonModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* 遥测指标胶囊 */}
        <div className="playground-telemetry-bar">
          <div className="playground-telemetry-item">
            <Clock size={13} style={{ color: '#06b6d4' }} />
            首字响应 (TTFT): <strong>{lastTtft !== null ? `${lastTtft}ms` : '—'}</strong>
          </div>
          <div className="playground-telemetry-item">
            <Gauge size={13} style={{ color: '#3b82f6' }} />
            吞吐速度: <strong>{lastTps !== null ? `${lastTps} tok/s` : '—'}</strong>
          </div>
          <div className="playground-telemetry-item">
            <CheckCircle2 size={13} style={{ color: isOnline ? '#10b981' : '#f43f5e' }} />
            状态: <strong>{isOnline ? 'Core 就绪' : 'Core 未启动'}</strong>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div style={{
          padding: '10px 14px',
          background: '#fff1f2',
          border: '1px solid #fecdd3',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12.5,
          color: '#be123c',
        }}>
          <AlertCircle size={16} />
          <span>内核代理尚未启动，请先在首页控制台点击「启动内核」后再进行测试。</span>
        </div>
      )}

      {/* 对话消息滚动视窗 */}
      <div className="playground-chat-container">
        {messages.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#94a3b8',
            gap: 8,
            padding: '40px 0',
          }}>
            <Sparkles size={32} style={{ color: 'var(--clean-primary, #06b6d4)', opacity: 0.6 }} />
            <strong style={{ fontSize: 14, color: '#475569' }}>欢迎使用内置模型测试舱</strong>
            <span style={{ fontSize: 12 }}>输入测试指令，快速验证本地代理的流式响应、思考链和速度指标</span>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`playground-message-bubble ${
                m.role === 'user' ? 'playground-message-user' : 'playground-message-assistant'
              }`}
            >
              {/* 思考过程折叠器 */}
              {m.reasoning && (
                <div className="playground-reasoning-box">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                      marginBottom: expandedReasoning[m.id] ? 6 : 0,
                    }}
                    onClick={() =>
                      setExpandedReasoning((prev) => ({
                        ...prev,
                        [m.id]: !prev[m.id],
                      }))
                    }
                  >
                    <span style={{ fontWeight: 600, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={12} />
                      思考链过程 (Thinking Process)
                    </span>
                    {expandedReasoning[m.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  {expandedReasoning[m.id] && (
                    <div style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>{m.reasoning}</div>
                  )}
                </div>
              )}

              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

              {m.ttftMs && (
                <div style={{
                  marginTop: 6,
                  fontSize: 10.5,
                  color: '#94a3b8',
                  fontFamily: 'var(--clean-font-mono)',
                  display: 'flex',
                  gap: 10,
                }}>
                  <span>TTFT: {m.ttftMs}ms</span>
                  {m.tps && <span>Speed: {m.tps} tok/s</span>}
                  {m.totalTimeMs && <span>Total: {m.totalTimeMs}ms</span>}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* 底部输入舱 */}
      <div className="playground-input-deck">
        <textarea
          className="playground-textarea"
          placeholder="输入您的测试 Prompt (按 Ctrl+Enter 快速发送)..."
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          disabled={!isOnline || isGenerating}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <small style={{ fontSize: 11, color: '#94a3b8' }}>
            提示: 按 <kbd style={{ padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', border: '1px solid #cbd5e1' }}>Ctrl + Enter</kbd> 极速发送
          </small>
          {isGenerating ? (
            <button type="button" className="danger-button compact-button" onClick={handleStop}>
              停止生成
            </button>
          ) : (
            <button
              type="button"
              className="primary-button compact-button"
              onClick={handleSend}
              disabled={!isOnline || !inputPrompt.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={14} />
              发送测试
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
