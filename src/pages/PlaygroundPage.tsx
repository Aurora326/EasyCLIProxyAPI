import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Send,
  Sparkles,
  Zap,
  RotateCcw,
  Clock,
  Columns2,
  Copy,
  Gauge,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  Sliders,
  AlertCircle,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useCoreRuntime } from '../coreRuntime';
import { managementApi, responseList, readString } from '../services/managementApi';

type PlaygroundProtocol = 'openai-chat' | 'claude-messages' | 'openai-responses';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  modelName?: string;
  content: string;
  reasoning?: string;
  ttftMs?: number;
  tps?: number;
  totalTimeMs?: number;
  // 双模型对比模式下右侧模型（Model B）的响应数据
  compare?: {
    modelName: string;
    content: string;
    reasoning?: string;
    ttftMs?: number;
    tps?: number;
    totalTimeMs?: number;
  };
}

interface PlaygroundPageProps {
  initialModel?: string;
}

const fallbackDefaultModels = [
  'claude-3-5-sonnet',
  'claude-3-7-sonnet',
  'deepseek-chat',
  'deepseek-reasoner',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];

export function PlaygroundPage({ initialModel }: PlaygroundPageProps = {}) {
  const { status: coreStatus } = useCoreRuntime();

  const [model, setModel] = useState(initialModel || 'claude-3-5-sonnet');
  const [compareMode, setCompareMode] = useState(false);
  const [compareModel, setCompareModel] = useState('gpt-4o');
  const [protocol, setProtocol] = useState<PlaygroundProtocol>('openai-chat');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [aliasModels, setAliasModels] = useState<Set<string>>(new Set());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [compareDropdownOpen, setCompareDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [compareModelSearch, setCompareModelSearch] = useState('');
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});

  // 鉴权配置与端口
  const [port, setPort] = useState(8317);
  const [apiKey, setApiKey] = useState('');

  // 遥测数据
  const [lastTtft, setLastTtft] = useState<number | null>(null);
  const [lastTps, setLastTps] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const compareDropdownRef = useRef<HTMLDivElement | null>(null);
  const initialModelRef = useRef<string | undefined>(initialModel);

  const isOnline = Boolean(coreStatus?.running);

  useEffect(() => {
    if (initialModel && initialModel.trim()) {
      initialModelRef.current = initialModel.trim();
      setModel(initialModel.trim());
    }
  }, [initialModel]);

  // 点击外部自动收起模型下拉面板
  useEffect(() => {
    if (!dropdownOpen && !compareDropdownOpen) return undefined;
    const handleOutsideClick = (event: PointerEvent) => {
      if (dropdownOpen && !dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
        setModelSearch('');
      }
      if (compareDropdownOpen && !compareDropdownRef.current?.contains(event.target as Node)) {
        setCompareDropdownOpen(false);
        setCompareModelSearch('');
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [dropdownOpen, compareDropdownOpen]);

  // 动态加载内核已挂载模型与已配置模型
  const loadModels = useCallback(async (targetPort = port, targetKey = apiKey) => {
    setIsLoadingModels(true);
    const discovered = new Set<string>();
    const aliases = new Set<string>();

    // 1. 优先尝试从核心 /v1/models 获取实际可用模型列表
    try {
      const headers: Record<string, string> = {};
      const keyToSend = targetKey.trim() || 'any-proxy-key';
      if (keyToSend) {
        headers['Authorization'] = `Bearer ${keyToSend}`;
      }
      const res = await fetch(`http://127.0.0.1:${targetPort}/v1/models`, {
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        for (const item of list) {
          const id = typeof item === 'string' ? item : item?.id;
          if (id && typeof id === 'string' && id.trim()) {
            discovered.add(id.trim());
          }
        }
      }
    } catch {
      // 忽略网络或未启动异常
    }

    // 2. 从 Tauri 后端同步配置的模型别名与可用源模型
    try {
      const [thinkingAliases, speedAliases, aliasSources] = await Promise.all([
        invoke<Array<{ alias?: string; sourceModel?: string }>>('get_thinking_aliases').catch(() => []),
        invoke<Array<{ alias?: string; sourceModel?: string }>>('get_speed_aliases').catch(() => []),
        invoke<Array<{ model?: string }>>('get_model_alias_sources').catch(() => []),
      ]);
      for (const entry of [...(thinkingAliases || []), ...(speedAliases || [])]) {
        const aliasName = entry?.alias?.trim();
        if (aliasName) {
          discovered.add(aliasName);
          aliases.add(aliasName);
        }
        const srcModel = entry?.sourceModel?.trim();
        if (srcModel) {
          discovered.add(srcModel);
        }
      }
      for (const src of aliasSources || []) {
        const modelName = src?.model?.trim();
        if (modelName) {
          discovered.add(modelName);
        }
      }
    } catch {
      // 忽略非 Tauri 环境或调用异常
    }

    // 3. 从管理 API /config 读取配置的各渠道模型
    try {
      const configPayload = await managementApi.get('/config');
      if (configPayload && typeof configPayload === 'object') {
        const sections = ['codex-api-key', 'openai-compatibility', 'claude-api-key', 'gemini-api-key'];
        for (const s of sections) {
          const items = responseList(configPayload, s);
          for (const item of items) {
            if (Array.isArray(item.models)) {
              for (const m of item.models) {
                const name = typeof m === 'string' ? m : readString(m, 'name', 'alias');
                if (name) discovered.add(name);
                if (typeof m === 'object' && m !== null) {
                  const alias = readString(m, 'alias');
                  if (alias) {
                    discovered.add(alias);
                    aliases.add(alias);
                  }
                }
              }
            }
          }
        }
        // 别名
        const aliasPayload = (configPayload as any)['oauth-model-alias'];
        if (aliasPayload && typeof aliasPayload === 'object') {
          for (const channel of Object.keys(aliasPayload)) {
            const arr = aliasPayload[channel];
            if (Array.isArray(arr)) {
              for (const entry of arr) {
                const alias = readString(entry, 'alias', 'name');
                if (alias) {
                  discovered.add(alias);
                  aliases.add(alias);
                }
              }
            }
          }
        }
      }
    } catch {
      // 忽略
    }

    let modelList = Array.from(discovered);
    if (modelList.length === 0) {
      modelList = [...fallbackDefaultModels];
    } else {
      // 已配置的模型别名优先置顶展示，其余按字母序排列
      modelList.sort((a, b) => {
        const aIsAlias = aliases.has(a);
        const bIsAlias = aliases.has(b);
        if (aIsAlias !== bIsAlias) return aIsAlias ? -1 : 1;
        return a.localeCompare(b);
      });
    }

    setAliasModels(aliases);
    setAvailableModels(modelList);
    setIsLoadingModels(false);

    // 若有外部跳转指定的模型则优先保留，否则自动选用第 1 个可用模型
    setModel((prev) => {
      if (initialModelRef.current) {
        return initialModelRef.current;
      }
      if (!prev || (!discovered.has(prev) && !fallbackDefaultModels.includes(prev))) {
        return modelList[0] || 'claude-3-5-sonnet';
      }
      if (discovered.size > 0 && !discovered.has(prev)) {
        return modelList[0] || prev;
      }
      return prev;
    });

    setCompareModel((prev) => {
      if (discovered.size > 0 && !discovered.has(prev)) {
        return modelList[1] || modelList[0] || prev;
      }
      return prev;
    });
  }, [port, apiKey]);

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return availableModels;
    return availableModels.filter((m) => m.toLowerCase().includes(q));
  }, [availableModels, modelSearch]);

  const filteredCompareModels = useMemo(() => {
    const q = compareModelSearch.trim().toLowerCase();
    if (!q) return availableModels;
    return availableModels.filter((m) => m.toLowerCase().includes(q));
  }, [availableModels, compareModelSearch]);

  useEffect(() => {
    let currentPort = port;
    let currentKey = apiKey;

    invoke<any>('get_core_config_settings')
      .then((cfg) => {
        if (cfg?.port) {
          currentPort = cfg.port;
          setPort(cfg.port);
        }
        if (cfg?.apiKeys && Array.isArray(cfg.apiKeys) && cfg.apiKeys.length > 0) {
          const firstKey = cfg.apiKeys[0]?.apiKey;
          if (firstKey) {
            currentKey = firstKey;
            setApiKey(firstKey);
          }
        }
        void loadModels(currentPort, currentKey);
      })
      .catch(() => {
        void loadModels(currentPort, currentKey);
      });
  }, []);

  // 核心就绪状态变化时重新加载模型
  useEffect(() => {
    if (isOnline) {
      void loadModels(port, apiKey);
    }
  }, [isOnline]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 生成当前配置的 cURL 命令
  const handleCopyCurl = async () => {
    const keyToSend = apiKey.trim() || 'your-api-key';
    const promptText = inputPrompt.trim() || '你好，请做个简短的自我介绍。';
    let url = `http://127.0.0.1:${port}/v1/chat/completions`;
    let bodyObj: Record<string, unknown> = {};
    let extraHeaders = `-H "Authorization: Bearer ${keyToSend}"`;

    if (protocol === 'claude-messages') {
      url = `http://127.0.0.1:${port}/v1/messages`;
      extraHeaders = `-H "x-api-key: ${keyToSend}" -H "anthropic-version: 2023-06-01"`;
      bodyObj = {
        model,
        max_tokens: 4096,
        temperature,
        ...(systemPrompt.trim() ? { system: systemPrompt.trim() } : {}),
        messages: [{ role: 'user', content: promptText }],
        stream: true,
      };
    } else if (protocol === 'openai-responses') {
      url = `http://127.0.0.1:${port}/v1/responses`;
      bodyObj = {
        model,
        ...(systemPrompt.trim() ? { instructions: systemPrompt.trim() } : {}),
        input: promptText,
        temperature,
        stream: true,
      };
    } else {
      bodyObj = {
        model,
        messages: [
          ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
          { role: 'user', content: promptText },
        ],
        temperature,
        stream: true,
      };
    }

    const jsonStr = JSON.stringify(bodyObj).replace(/"/g, '\\"');
    const curlCmd = `curl -X POST "${url}" -H "Content-Type: application/json" ${extraHeaders} -d "${jsonStr}"`;
    try {
      await navigator.clipboard.writeText(curlCmd);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      // 忽略复制异常
    }
  };

  // 单模型流式请求执行器
  const streamModelResponse = async (
    targetModel: string,
    historyMessages: ChatMessage[],
    signal: AbortSignal,
    onUpdate: (partial: {
      content: string;
      reasoning: string;
      ttftMs?: number;
      tps?: number;
      totalTimeMs?: number;
    }) => void,
  ) => {
    const startTime = performance.now();
    let firstTokenTime: number | null = null;
    let assistantText = '';
    let assistantReasoning = '';
    let tokenEstimate = 0;

    const keyToSend = apiKey.trim() || 'any-proxy-key';
    let endpoint = `http://127.0.0.1:${port}/v1/chat/completions`;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keyToSend}`,
    };

    const chatHistory = historyMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let reqBody: Record<string, unknown>;
    if (protocol === 'claude-messages') {
      endpoint = `http://127.0.0.1:${port}/v1/messages`;
      reqHeaders['x-api-key'] = keyToSend;
      reqHeaders['anthropic-version'] = '2023-06-01';
      reqBody = {
        model: targetModel,
        max_tokens: 4096,
        temperature,
        ...(systemPrompt.trim() ? { system: systemPrompt.trim() } : {}),
        messages: chatHistory,
        stream: true,
      };
    } else if (protocol === 'openai-responses') {
      endpoint = `http://127.0.0.1:${port}/v1/responses`;
      reqBody = {
        model: targetModel,
        ...(systemPrompt.trim() ? { instructions: systemPrompt.trim() } : {}),
        input: chatHistory.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        stream: true,
      };
    } else {
      const payloadMessages: Array<{ role: string; content: string }> = [];
      if (systemPrompt.trim()) {
        payloadMessages.push({ role: 'system', content: systemPrompt.trim() });
      }
      payloadMessages.push(...chatHistory);
      reqBody = {
        model: targetModel,
        messages: payloadMessages,
        temperature,
        stream: true,
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(reqBody),
      signal,
    });

    if (!response.ok) {
      let errMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errBody = await response.json();
        if (errBody?.error) {
          const detail =
            typeof errBody.error === 'string'
              ? errBody.error
              : errBody.error.message || JSON.stringify(errBody.error);
          errMessage = `HTTP ${response.status}: ${detail}`;
        }
      } catch {
        // 保留默认状态文本
      }
      throw new Error(errMessage);
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
        if (!cleanLine || cleanLine.startsWith(':') || cleanLine.startsWith('event:')) continue;
        if (cleanLine === 'data: [DONE]') break;

        if (cleanLine.startsWith('data: ')) {
          try {
            const json = JSON.parse(cleanLine.slice(6));
            let textPiece = '';
            let reasoningPiece = '';

            // 1. OpenAI Chat Completions 格式
            const delta = json.choices?.[0]?.delta;
            if (delta) {
              if (delta.reasoning_content) reasoningPiece += delta.reasoning_content;
              if (delta.content) textPiece += delta.content;
            }

            // 2. Claude Messages SSE 格式
            if (json.type === 'content_block_delta' && json.delta) {
              if (json.delta.type === 'text_delta' && json.delta.text) {
                textPiece += json.delta.text;
              } else if (json.delta.type === 'thinking_delta' && json.delta.thinking) {
                reasoningPiece += json.delta.thinking;
              }
            }

            // 3. OpenAI Responses SSE 格式
            if (json.type === 'response.output_text.delta' && typeof json.delta === 'string') {
              textPiece += json.delta;
            } else if (
              (json.type === 'response.reasoning_summary_text.delta' ||
                json.type === 'response.reasoning.delta') &&
              typeof json.delta === 'string'
            ) {
              reasoningPiece += json.delta;
            }

            if (textPiece || reasoningPiece) {
              if (firstTokenTime === null) {
                firstTokenTime = performance.now();
              }
              if (reasoningPiece) assistantReasoning += reasoningPiece;
              if (textPiece) {
                assistantText += textPiece;
                tokenEstimate += 1;
              }

              const currentTtft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined;
              onUpdate({
                content: assistantText,
                reasoning: assistantReasoning,
                ttftMs: currentTtft,
              });
            }
          } catch {
            // 忽略分片解析异常
          }
        }
      }
    }

    const endTime = performance.now();
    const totalDuration = Math.round(endTime - startTime);
    const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : totalDuration;
    const generationDurationSeconds = Math.max(0.01, (endTime - (firstTokenTime || startTime)) / 1000);
    const tps = Math.round(tokenEstimate / generationDurationSeconds);

    onUpdate({
      content: assistantText || '(空回复)',
      reasoning: assistantReasoning,
      ttftMs: ttft,
      tps: tps > 0 ? tps : undefined,
      totalTimeMs: totalDuration,
    });

    return { ttft, tps, totalDuration };
  };

  const handleSend = async (overridePrompt?: string) => {
    const trimmed = (overridePrompt ?? inputPrompt).trim();
    if (!trimmed || isGenerating) return;
    if (!isOnline) {
      setInputPrompt(trimmed);
      return;
    }

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMessageId, role: 'user', content: trimmed },
    ];

    setMessages(newMessages);
    if (!overridePrompt) {
      setInputPrompt('');
    }
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 添加助理占位消息
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        modelName: model,
        content: '...',
        ...(compareMode
          ? {
              compare: {
                modelName: compareModel,
                content: '...',
              },
            }
          : {}),
      },
    ]);

    try {
      const primaryTask = streamModelResponse(
        model,
        newMessages,
        controller.signal,
        (partial) => {
          if (partial.ttftMs) setLastTtft(partial.ttftMs);
          if (partial.tps) setLastTps(partial.tps);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: partial.content,
                    reasoning: partial.reasoning,
                    ttftMs: partial.ttftMs ?? m.ttftMs,
                    tps: partial.tps ?? m.tps,
                    totalTimeMs: partial.totalTimeMs ?? m.totalTimeMs,
                  }
                : m,
            ),
          );
        },
      ).catch((err: any) => {
        if (err.name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: `⚠️ 请求失败: ${err.message}` }
                : m,
            ),
          );
        }
      });

      const secondaryTask = compareMode
        ? streamModelResponse(
            compareModel,
            newMessages,
            controller.signal,
            (partial) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        compare: {
                          modelName: compareModel,
                          content: partial.content,
                          reasoning: partial.reasoning,
                          ttftMs: partial.ttftMs ?? m.compare?.ttftMs,
                          tps: partial.tps ?? m.compare?.tps,
                          totalTimeMs: partial.totalTimeMs ?? m.compare?.totalTimeMs,
                        },
                      }
                    : m,
                ),
              );
            },
          ).catch((err: any) => {
            if (err.name !== 'AbortError') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        compare: {
                          modelName: compareModel,
                          content: `⚠️ 请求失败: ${err.message}`,
                        },
                      }
                    : m,
                ),
              );
            }
          })
        : Promise.resolve();

      await Promise.all([primaryTask, secondaryTask]);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleClear = () => {
    setMessages([]);
    setLastTtft(null);
    setLastTps(null);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  // 渲染通用模型下拉选择器
  const renderModelDropdown = (
    currentValue: string,
    onSelectValue: (val: string) => void,
    isOpen: boolean,
    setIsOpen: (open: boolean | ((prev: boolean) => boolean)) => void,
    searchVal: string,
    setSearchVal: (val: string) => void,
    filteredList: string[],
    refObj: React.RefObject<HTMLDivElement | null>,
    placeholderText = '选择或输入测试模型...',
  ) => (
    <div ref={refObj} style={{ position: 'relative', minWidth: 235 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 32,
          borderRadius: 6,
          border: isOpen ? '1px solid var(--clean-primary)' : '1px solid var(--clean-border)',
          background: 'var(--clean-card-bg)',
          paddingRight: 4,
          transition: 'border-color 0.15s ease',
        }}
      >
        <input
          type="text"
          value={currentValue}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onChange={(e) => onSelectValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              setSearchVal('');
            }
          }}
          placeholder={placeholderText}
          style={{
            flex: 1,
            height: '100%',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--clean-primary)',
            padding: '0 10px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            boxShadow: 'none',
            minWidth: 0,
          }}
        />
        {aliasModels.has(currentValue) && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'rgba(6, 182, 212, 0.12)',
              color: 'var(--clean-primary, #06b6d4)',
              marginRight: 2,
              flexShrink: 0,
            }}
          >
            别名
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => !prev);
            if (isOpen) setSearchVal('');
          }}
          title="展开全部可用模型列表"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: 'var(--clean-text-secondary)',
            cursor: 'pointer',
            borderRadius: 4,
            padding: 0,
            flexShrink: 0,
          }}
        >
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 300,
            width: 'max-content',
            maxWidth: 420,
            background: 'var(--clean-card-bg)',
            border: '1px solid var(--clean-border)',
            borderRadius: 8,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 4px 10px -2px rgba(0, 0, 0, 0.08)',
            zIndex: 100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderBottom: '1px solid var(--clean-border)',
              background: 'var(--clean-card-muted)',
            }}
          >
            <Search size={13} style={{ color: 'var(--clean-text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  setSearchVal('');
                } else if (e.key === 'Enter' && filteredList.length > 0) {
                  e.preventDefault();
                  onSelectValue(filteredList[0]);
                  setIsOpen(false);
                  setSearchVal('');
                }
              }}
              placeholder={`筛选模型 (共 ${availableModels.length} 个)...`}
              style={{
                flex: 1,
                height: 24,
                fontSize: 12,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--clean-text-primary)',
                boxShadow: 'none',
                padding: 0,
              }}
            />
          </div>

          <div
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {filteredList.length === 0 ? (
              <div
                style={{
                  padding: '14px 10px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'var(--clean-text-muted)',
                }}
              >
                未找到匹配模型，可直接回车使用上方输入的模型名
              </div>
            ) : (
              filteredList.map((m) => {
                const isSelected = m === currentValue;
                const isAlias = aliasModels.has(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onSelectValue(m);
                      setIsOpen(false);
                      setSearchVal('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                      padding: '7px 10px',
                      border: 'none',
                      borderRadius: 6,
                      background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                      color: isSelected ? 'var(--clean-primary)' : 'var(--clean-text-primary)',
                      fontSize: 12.5,
                      fontWeight: isSelected ? 600 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span>{m}</span>
                      {isAlias && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'rgba(6, 182, 212, 0.14)',
                            color: 'var(--clean-primary, #06b6d4)',
                            flexShrink: 0,
                          }}
                        >
                          别名
                        </span>
                      )}
                    </span>
                    {isSelected && <Check size={14} style={{ color: 'var(--clean-primary)', flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section className="page playground-page">
      {/* 一体化顶置控制栏（去除重复大标题，紧凑聚合模型选择与协议动作） */}
      <div
        className="ds-card"
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        {/* 左侧：模型选择与同步 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--clean-text-primary)' }}>
            {compareMode ? '模型 A' : '当前模型'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {renderModelDropdown(
              model,
              (val) => {
                initialModelRef.current = val;
                setModel(val);
              },
              dropdownOpen,
              setDropdownOpen,
              modelSearch,
              setModelSearch,
              filteredModels,
              dropdownRef,
              '选择或输入模型 A...',
            )}

            {compareMode && (
              <>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'var(--clean-primary-soft)',
                    color: 'var(--clean-primary)',
                  }}
                >
                  VS
                </span>
                {renderModelDropdown(
                  compareModel,
                  setCompareModel,
                  compareDropdownOpen,
                  setCompareDropdownOpen,
                  compareModelSearch,
                  setCompareModelSearch,
                  filteredCompareModels,
                  compareDropdownRef,
                  '选择或输入对比模型 B...',
                )}
              </>
            )}

            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => void loadModels(port, apiKey)}
              disabled={isLoadingModels}
              title="重新从核心与配置同步模型列表"
              style={{ padding: '0 9px', height: 32 }}
            >
              <RefreshCw size={13} className={isLoadingModels ? 'spin' : ''} />
              <span style={{ fontSize: 11.5 }}>{isLoadingModels ? '同步中' : '刷新'}</span>
            </button>
          </div>

          {availableModels.length > 0 && (
            <span className="ds-badge ds-badge-mono" title="已挂载模型与自定义别名统计">
              共 {availableModels.length} 模型 · {aliasModels.size} 别名
            </span>
          )}
        </div>

        {/* 右侧：协议切换与操作按钮组 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="chart-time-pill-group" title="切换调用的网关协议端点">
            {(
              [
                { id: 'openai-chat', label: 'OpenAI Chat' },
                { id: 'claude-messages', label: 'Claude Messages' },
                { id: 'openai-responses', label: 'Responses API' },
              ] as Array<{ id: PlaygroundProtocol; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chart-time-btn ${protocol === item.id ? 'active' : ''}`}
                onClick={() => setProtocol(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`secondary-button compact-button ${compareMode ? 'active' : ''}`}
            onClick={() => setCompareMode((prev) => !prev)}
            title="开启双模型并排对比测试 (Arena 模式)"
            style={
              compareMode
                ? {
                    borderColor: 'var(--clean-primary)',
                    color: 'var(--clean-primary)',
                    background: 'var(--clean-primary-soft)',
                    height: 32,
                  }
                : { height: 32 }
            }
          >
            <Columns2 size={14} />
            双模型对比
          </button>

          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => void handleCopyCurl()}
            title="复制当前模型与协议对应的终端 cURL 命令"
            style={{ height: 32 }}
          >
            {copiedCurl ? <Check size={14} className="text-green" /> : <Terminal size={14} />}
            {copiedCurl ? '已复制 cURL' : '复制 cURL'}
          </button>

          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => setShowSettings(!showSettings)}
            style={{ height: 32 }}
          >
            <Sliders size={14} />
            参数
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={handleClear}
              style={{ height: 32 }}
            >
              <RotateCcw size={14} />
              清空
            </button>
          )}
        </div>
      </div>

      {/* 参数抽屉面板 */}
      {showSettings && (
        <div
          className="panel"
          style={{
            padding: '12px 16px',
            background: 'var(--clean-card-muted)',
            border: '1px solid var(--clean-border)',
            borderRadius: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--clean-text-secondary)',
                display: 'block',
                marginBottom: 4,
              }}
            >
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
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--clean-text-secondary)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              系统提示词
            </label>
            <input
              type="text"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="可选系统人设..."
              style={{ width: '100%', height: 28, fontSize: 12 }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--clean-text-secondary)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              鉴权密钥 (API Key)
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="默认从系统配置自动读取..."
              style={{ width: '100%', height: 28, fontSize: 12 }}
            />
          </div>
        </div>
      )}

      {!isOnline && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--clean-status-red-bg)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: 'var(--clean-status-red-text)',
          }}
        >
          <AlertCircle size={16} />
          <span>内核代理尚未启动，请先在顶栏或首页点击「启动」后再进行测试。</span>
        </div>
      )}

      {/* 对话消息滚动视窗 */}
      <div className="playground-chat-container">
        {messages.length === 0 ? (
          <div className="playground-empty-hero">
            <div className="playground-empty-icon-ring">
              <Sparkles size={24} />
            </div>
            <strong style={{ fontSize: 15, color: 'var(--clean-text-primary)', marginTop: 4 }}>
              准备就绪 · 选择下方测试场景一键验证模型响应
            </strong>
            <span style={{ fontSize: 12.5, color: 'var(--clean-text-secondary)', maxWidth: 520, textAlign: 'center' }}>
              当前已选定模型 <code style={{ color: 'var(--clean-primary)', fontWeight: 700 }}>{model}</code>
              {compareMode ? (
                <>
                  {' '}与对比模型 <code style={{ color: 'var(--clean-primary)', fontWeight: 700 }}>{compareModel}</code>
                </>
              ) : null}
              ，点击任意预设卡片立即发起流式测试：
            </span>

            <div className="playground-preset-grid">
              {[
                {
                  badge: '⚡ 连通性与延迟',
                  title: '极速握手与首字响应探测',
                  desc: '验证当前渠道密钥、协议转发与首字延迟 (TTFT)',
                  prompt: '你好！请用一句话简短介绍你当前的模型身份，并输出“网关转发连通正常”。',
                },
                {
                  badge: '🧠 深度思考推理',
                  title: '思维链 (Thinking) 逻辑推导',
                  desc: '测试模型是否正常输出 reasoning 思考过程与严密结论',
                  prompt: '桌上有 3 个盒子，分别贴着“全是红球”、“全是蓝球”、“一红一蓝”的标签，但所有标签都贴错了。你只能从一个盒子里摸出一个球看颜色，如何推断出所有盒子的真实情况？请展示简要推导过程。',
                },
                {
                  badge: '💻 代码与流式吞吐',
                  title: 'TypeScript 并发控制器生成',
                  desc: '测试长文本流式输出速率 (tok/s) 与代码排版质量',
                  prompt: '请使用 TypeScript 编写一个轻量级并发限制器函数 `pLimit(concurrency: number)`，附带简短的类型定义与调用示例。',
                },
                {
                  badge: '📊 结构化格式',
                  title: '严格 JSON 格式数据生成',
                  desc: '验证模型遵循指令输出标准 JSON 对象的稳定性',
                  prompt: '请仅输出一段合法的 JSON 对象（不要包含多余解释），包含 3 个主流 AI 模型家族的名称、代表模型和核心特长字段。',
                },
              ].map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  className="playground-preset-card"
                  disabled={!isOnline || isGenerating}
                  onClick={() => void handleSend(preset.prompt)}
                >
                  <div className="playground-preset-badge">{preset.badge}</div>
                  <div className="playground-preset-title">{preset.title}</div>
                  <div className="playground-preset-desc">{preset.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="playground-message-bubble playground-message-user">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              );
            }

            // 单模型或双模型对比渲染
            const renderAssistantCard = (
              cardKey: string,
              titleModel: string | undefined,
              content: string,
              reasoning: string | undefined,
              ttftMs: number | undefined,
              tps: number | undefined,
              totalTimeMs: number | undefined,
            ) => (
              <div
                key={cardKey}
                className="playground-message-bubble playground-message-assistant"
                style={compareMode ? { maxWidth: '100%', flex: 1, minWidth: 260 } : undefined}
              >
                {titleModel && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--clean-primary)',
                      marginBottom: 6,
                      fontFamily: 'var(--clean-font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{titleModel}</span>
                  </div>
                )}
                {reasoning && (
                  <div className="playground-reasoning-box">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        marginBottom: expandedReasoning[cardKey] ? 6 : 0,
                      }}
                      onClick={() =>
                        setExpandedReasoning((prev) => ({
                          ...prev,
                          [cardKey]: !prev[cardKey],
                        }))
                      }
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--clean-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Sparkles size={12} />
                        深度思考过程
                      </span>
                      {expandedReasoning[cardKey] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                    {expandedReasoning[cardKey] && (
                      <div style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>{reasoning}</div>
                    )}
                  </div>
                )}

                <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>

                {ttftMs !== undefined && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10.5,
                      color: 'var(--clean-text-muted)',
                      fontFamily: 'var(--clean-font-mono)',
                      display: 'flex',
                      gap: 10,
                    }}
                  >
                    <span>TTFT: {ttftMs}ms</span>
                    {tps && <span>Speed: {tps} tok/s</span>}
                    {totalTimeMs && <span>Total: {totalTimeMs}ms</span>}
                  </div>
                )}
              </div>
            );

            if (m.compare) {
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 12,
                    width: '100%',
                  }}
                >
                  {renderAssistantCard(
                    `${m.id}-a`,
                    m.modelName || model,
                    m.content,
                    m.reasoning,
                    m.ttftMs,
                    m.tps,
                    m.totalTimeMs,
                  )}
                  {renderAssistantCard(
                    `${m.id}-b`,
                    m.compare.modelName,
                    m.compare.content,
                    m.compare.reasoning,
                    m.compare.ttftMs,
                    m.compare.tps,
                    m.compare.totalTimeMs,
                  )}
                </div>
              );
            }

            return renderAssistantCard(
              m.id,
              m.modelName,
              m.content,
              m.reasoning,
              m.ttftMs,
              m.tps,
              m.totalTimeMs,
            );
          })
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--clean-text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              按 <span className="cmd-kbd-badge">Ctrl + Enter</span> 发送 · 端点:{' '}
              <code style={{ color: 'var(--clean-text-secondary)', fontWeight: 600 }}>
                {protocol === 'openai-chat'
                  ? '/v1/chat/completions'
                  : protocol === 'claude-messages'
                    ? '/v1/messages'
                    : '/v1/responses'}
              </code>
            </span>
            {lastTtft !== null && (
              <span className="ds-badge ds-badge-blue" style={{ fontSize: 10.5 }}>
                <Clock size={11} />
                TTFT {lastTtft}ms
              </span>
            )}
            {lastTps !== null && (
              <span className="ds-badge ds-badge-green" style={{ fontSize: 10.5 }}>
                <Gauge size={11} />
                {lastTps} tok/s
              </span>
            )}
          </div>
          {isGenerating ? (
            <button type="button" className="danger-button compact-button" onClick={handleStop}>
              停止生成
            </button>
          ) : (
            <button
              type="button"
              className="primary-button compact-button"
              onClick={() => void handleSend()}
              disabled={!isOnline || !inputPrompt.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={14} />
              {compareMode ? '并发对比发送' : '发送测试'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
