import { useState } from 'react';
import { Check, Copy, Laptop, Terminal, Sparkles, ChevronDown, ChevronUp, Code2 } from 'lucide-react';
import { useI18n } from '../i18n';

type IdeTarget = 'cursor' | 'cline' | 'continue' | 'terminal' | 'cherry';

export function IdeIntegrationHub({ defaultPort = 8317 }: { defaultPort?: number }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<IdeTarget>('cursor');
  const [copied, setCopied] = useState(false);

  const baseUrl = `http://127.0.0.1:${defaultPort}/v1`;

  const configs: Record<IdeTarget, { title: string; desc: string; code: string; lang: string }> = {
    cursor: {
      title: 'Cursor',
      desc: '在 Cursor 设置 -> Models -> OpenAI API Key 中启用并填入：',
      code: `Base URL: ${baseUrl}\nAPI Key: any-proxy-key (可在上方添加的本地 Key)\nOverride Models: claude-3-5-sonnet, deepseek-chat, gpt-4o`,
      lang: 'yaml',
    },
    cline: {
      title: 'Cline / Roo Code',
      desc: '在 VS Code 插件设置中，API Provider 选择 OpenAI-Compatible：',
      code: `{\n  "apiProvider": "openai",\n  "openAiBaseUrl": "${baseUrl}",\n  "openAiApiKey": "any-proxy-key",\n  "openAiModelId": "claude-3-5-sonnet"\n}`,
      lang: 'json',
    },
    continue: {
      title: 'Continue',
      desc: '在 ~/.continue/config.json 的 "models" 列表中追加：',
      code: `{\n  "title": "CPA Proxy Model",\n  "provider": "openai",\n  "model": "claude-3-5-sonnet",\n  "apiBase": "${baseUrl}",\n  "apiKey": "any-proxy-key"\n}`,
      lang: 'json',
    },
    terminal: {
      title: 'Aider / Terminal CLI',
      desc: '在终端中一键注入环境变量（适用于 Aider / Shell 脚本）：',
      code: `# PowerShell:\n$env:OPENAI_BASE_URL="${baseUrl}"\n$env:OPENAI_API_KEY="any-proxy-key"\n\n# Bash / Zsh:\nexport OPENAI_BASE_URL="${baseUrl}"\nexport OPENAI_API_KEY="any-proxy-key"`,
      lang: 'bash',
    },
    cherry: {
      title: '沉浸式翻译 / Cherry Studio',
      desc: '在沉浸式翻译等扩展中自定义 OpenAI 兼容接口：',
      code: `接口地址: ${baseUrl}/chat/completions\nAPI 密钥: any-proxy-key\n模型名称: deepseek-chat / gpt-4o`,
      lang: 'text',
    },
  };

  const current = configs[activeTab];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="panel" style={{
      marginBottom: 16,
      background: 'linear-gradient(180deg, #ffffff 0%, #fcfdfd 100%)',
      border: '1px solid rgba(226, 232, 240, 0.95)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: expanded ? '1px solid rgba(226, 232, 240, 0.8)' : 'none',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'var(--clean-primary-soft, #ecfeff)',
            color: 'var(--clean-primary, #06b6d4)',
            border: '1px solid var(--clean-primary-border, rgba(6, 182, 212, 0.2))',
          }}>
            <Laptop size={16} />
          </div>
          <div>
            <strong style={{ fontSize: 13, color: '#0f172a' }}>
              🚀 主流 IDE 客户端一键接入中心 (IDE Integration Hub)
            </strong>
            <span style={{ display: 'block', fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
              一键生成 Cursor、Cline、Roo Code、Continue、Aider 等工具的快速连接配置
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--clean-primary, #0891b2)', fontWeight: 500 }}>
            {expanded ? '收起配置' : '快速展开'}
          </span>
          {expanded ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}>
            {(['cursor', 'cline', 'continue', 'terminal', 'cherry'] as IdeTarget[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`usage-quick-pill ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {configs[tab].title}
              </button>
            ))}
          </div>

          <div style={{
            padding: '12px',
            borderRadius: 8,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>
                {current.desc}
              </span>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={handleCopy}
                style={{ height: 26, fontSize: 11 }}
              >
                {copied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
                {copied ? '已复制到剪贴板' : '一键复制'}
              </button>
            </div>

            <pre style={{
              margin: 0,
              padding: '10px 12px',
              borderRadius: 6,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              fontFamily: 'var(--clean-font-mono, monospace)',
              fontSize: 12,
              lineHeight: 1.5,
              color: '#0f172a',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
            }}>
              {current.code}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
