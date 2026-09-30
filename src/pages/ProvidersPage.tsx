import { useState, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  Link,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import openaiIcon from '../assets/icons/openai-light.svg';
import claudeIcon from '../assets/icons/claude.svg';
import geminiIcon from '../assets/icons/gemini.svg';
import deepseekIcon from '../assets/icons/deepseek.svg';
import antigravityIcon from '../assets/icons/antigravity.svg';
import kimiIcon from '../assets/icons/kimi-light.svg';
import grokIcon from '../assets/icons/grok.svg';
import devinIcon from '../assets/icons/devin.svg';

interface ProviderItem {
  id: string;
  name: string;
  type: string;
  icon: string;
  models: string[];
  status: 'connected' | 'offline' | 'checking';
  latency: number;
  baseUrl: string;
  enabled: boolean;
}

const initialProviders: ProviderItem[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: '官方 / 代理协议',
    icon: openaiIcon,
    models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'text-embedding-3-small'],
    status: 'connected',
    latency: 182,
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    type: '官方 Messages 协议',
    icon: claudeIcon,
    models: ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'],
    status: 'connected',
    latency: 241,
    baseUrl: 'https://api.anthropic.com/v1',
    enabled: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'Google AI Studio 协议',
    icon: geminiIcon,
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    status: 'connected',
    latency: 208,
    baseUrl: 'https://generativelanguage.googleapis.com',
    enabled: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'OpenAI 兼容协议',
    icon: deepseekIcon,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    status: 'connected',
    latency: 356,
    baseUrl: 'https://api.deepseek.com',
    enabled: true,
  },
  {
    id: 'antigravity',
    name: 'Antigravity / Vertex',
    type: 'Vertex AI 协议',
    icon: antigravityIcon,
    models: ['claude-3-5-sonnet@vertex', 'gemini-1.5-pro@vertex'],
    status: 'connected',
    latency: 290,
    baseUrl: 'https://us-central1-aiplatform.googleapis.com',
    enabled: true,
  },
  {
    id: 'kimi',
    name: 'Moonshot Kimi',
    type: 'Moonshot 开放平台协议',
    icon: kimiIcon,
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    status: 'connected',
    latency: 195,
    baseUrl: 'https://api.moonshot.cn/v1',
    enabled: true,
  },
];

export function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderItem[]>(initialProviders);
  const [filter, setFilter] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const testProvider = (id: string) => {
    setTestingId(id);
    setTimeout(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, latency: Math.floor(150 + Math.random() * 120), status: 'connected' }
            : p
        )
      );
      setTestingId(null);
    }, 600);
  };

  const toggleProvider = (id: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const filteredProviders = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.models.some((m) => m.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Provider 集群管理
          </h2>

        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="搜索 Provider 或模型..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '30px',
                paddingRight: '10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="button"
            className="ds-btn ds-btn-primary ds-btn-sm"
            onClick={() => alert('请在 API 接入页面配置新的 Provider 凭证与端点')}
          >
            <Plus size={13} />
            <span>添加供应商</span>
          </button>
        </div>
      </div>

      {/* Provider 卡片列表 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px',
        }}
      >
        {filteredProviders.map((provider) => (
          <div key={provider.id} className="ds-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px',
                  }}
                >
                  <img src={provider.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {provider.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {provider.type}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`ds-badge ${provider.enabled ? 'ds-badge-green' : 'ds-badge-mono'}`}>
                  {provider.enabled ? '● 已连接' : '已停用'}
                </span>
              </div>
            </div>

            {/* Base URL */}
            <div
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-subtle)',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {provider.baseUrl}
            </div>

            {/* 模型标签 */}
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                支持的模型 ({provider.models.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {provider.models.map((m) => (
                  <span key={m} className="ds-badge ds-badge-mono" style={{ fontSize: '10.5px' }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* 卡片底栏：延迟 & 连通性测试 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: '1px solid var(--border-color)',
                fontSize: '11px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Activity size={13} className="text-brand" />
                <span>延迟：</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {provider.latency}ms
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  onClick={() => testProvider(provider.id)}
                  disabled={testingId === provider.id}
                >
                  <RefreshCw size={11} className={testingId === provider.id ? 'spin' : ''} />
                  <span>{testingId === provider.id ? '测试中...' : '测试延迟'}</span>
                </button>

                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  onClick={() => toggleProvider(provider.id)}
                >
                  <Power size={11} />
                  <span>{provider.enabled ? '停用' : '启用'}</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
