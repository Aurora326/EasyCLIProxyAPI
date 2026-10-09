import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  Layers,
  LogIn,
  Network,
  Plus,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import { useCoreRuntime } from '../coreRuntime';
import { managementApi, responseList, readString } from '../services/managementApi';
import { thinkingAliasSourceKindLabel } from './ThinkingAliasesPage';
import openaiIcon from '../assets/icons/openai-light.svg';
import claudeIcon from '../assets/icons/claude.svg';
import geminiIcon from '../assets/icons/gemini.svg';
import deepseekIcon from '../assets/icons/deepseek.svg';
import antigravityIcon from '../assets/icons/antigravity.svg';
import kimiIcon from '../assets/icons/kimi-light.svg';
import grokIcon from '../assets/icons/grok.svg';
import devinIcon from '../assets/icons/devin.svg';
import codexIcon from '../assets/icons/codex.svg';
import vertexIcon from '../assets/icons/vertex.svg';

interface ProvidersPageProps {
  onNavigate?: (pageId: string) => void;
  onTestModel?: (modelName: string) => void;
}

interface ProviderClusterItem {
  id: string;
  name: string;
  kind: string;
  typeLabel: string;
  icon: string;
  models: string[];
  baseUrl: string;
  status: 'online' | 'standby' | 'error';
  latency: number | null;
  requestsCount: number;
  failuresCount: number;
  sourcePage: 'api' | 'oauth';
}

const resolveClusterIcon = (kind: string, name: string) => {
  const k = `${kind} ${name}`.toLowerCase();
  if (k.includes('antigravity')) return antigravityIcon;
  if (k.includes('vertex')) return vertexIcon;
  if (k.includes('claude') || k.includes('anthropic')) return claudeIcon;
  if (k.includes('gemini') || k.includes('aistudio') || k.includes('google')) return geminiIcon;
  if (k.includes('deepseek')) return deepseekIcon;
  if (k.includes('kimi') || k.includes('moonshot')) return kimiIcon;
  if (k.includes('grok') || k.includes('xai')) return grokIcon;
  if (k.includes('devin')) return devinIcon;
  if (k.includes('codex')) return codexIcon;
  return openaiIcon;
};

const defaultEndpointForKind = (kind: string) => {
  if (kind.includes('antigravity')) return 'Google Cloud Code / Antigravity OAuth';
  if (kind.includes('claude-oauth')) return 'Anthropic Claude OAuth 授权通道';
  if (kind.includes('codex-oauth')) return 'OpenAI Codex OAuth 授权通道';
  if (kind.includes('aistudio')) return 'Google AI Studio OAuth 通道';
  if (kind.includes('vertex')) return 'Google Cloud Vertex AI 通道';
  if (kind.includes('kimi')) return 'Moonshot Kimi OAuth 通道';
  if (kind.includes('xai')) return 'xAI Grok OAuth 通道';
  if (kind.includes('devin')) return 'Devin OAuth 通道';
  if (kind.includes('claude')) return 'https://api.anthropic.com';
  if (kind.includes('gemini')) return 'https://generativelanguage.googleapis.com';
  return 'https://api.openai.com/v1';
};

export function ProvidersPage({ onNavigate, onTestModel }: ProvidersPageProps = {}) {
  const { status: coreStatus } = useCoreRuntime();
  const [providers, setProviders] = useState<ProviderClusterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [port, setPort] = useState(8317);
  const [apiKey, setApiKey] = useState('');

  const coreRunning = Boolean(coreStatus?.running);

  const loadClusters = useCallback(async () => {
    setLoading(true);
    const clusterMap = new Map<string, ProviderClusterItem>();

    // 读取端口与密钥设置
    try {
      const cfg = await invoke<any>('get_core_config_settings');
      if (cfg?.port) setPort(cfg.port);
      if (cfg?.apiKeys?.[0]?.apiKey) setApiKey(cfg.apiKeys[0].apiKey);
    } catch {
      // 忽略
    }

    // 读取历史调用统计（按 provider 聚合）
    const providerStatsMap = new Map<string, { requests: number; failures: number }>();
    try {
      const analysis = await invoke<{
        providers?: Array<{ key: string; label: string; requests: number; failures: number }>;
      }>('get_usage_analysis', { query: {} });
      for (const p of analysis?.providers || []) {
        const k = (p.label || p.key || '').toLowerCase();
        if (k) {
          providerStatsMap.set(k, { requests: p.requests || 0, failures: p.failures || 0 });
        }
      }
    } catch {
      // 忽略
    }

    // 1. 从 get_model_alias_sources 聚合已激活的 OAuth 与 API 渠道模型
    try {
      const sources = await invoke<
        Array<{
          id: string;
          model: string;
          provider: string;
          kind: string;
          protocol: string;
        }>
      >('get_model_alias_sources').catch(() => []);

      for (const src of sources || []) {
        const kindLabel = thinkingAliasSourceKindLabel(src.kind);
        const rawProv = (src.provider || '').trim();
        const isUrlProv = /^https?:\/\//i.test(rawProv);
        let shortProv = rawProv;
        if (isUrlProv) {
          try {
            shortProv = new URL(rawProv).host;
          } catch {
            shortProv = rawProv.replace(/^https?:\/\//i, '').split('/')[0] || rawProv;
          }
        }
        const providerName =
          shortProv && shortProv !== kindLabel
            ? `${kindLabel} · ${shortProv}`
            : kindLabel;
        const clusterKey = `${src.kind}:${rawProv || kindLabel}`.toLowerCase();

        const existing = clusterMap.get(clusterKey);
        if (existing) {
          if (src.model && !existing.models.includes(src.model)) {
            existing.models.push(src.model);
          }
        } else {
          const isOAuth = src.kind.endsWith('-oauth');
          const matchedStats =
            providerStatsMap.get(rawProv.toLowerCase()) ||
            providerStatsMap.get(shortProv.toLowerCase()) ||
            providerStatsMap.get(src.kind.replace('-oauth', '').replace('-api', '').toLowerCase()) || {
              requests: 0,
              failures: 0,
            };

          clusterMap.set(clusterKey, {
            id: clusterKey,
            name: providerName,
            kind: src.kind,
            typeLabel: isOAuth ? 'OAuth 授权集群' : 'API 密钥集群',
            icon: resolveClusterIcon(src.kind, providerName),
            models: src.model ? [src.model] : [],
            baseUrl: isUrlProv ? rawProv : defaultEndpointForKind(src.kind),
            status: coreRunning ? 'online' : 'standby',
            latency: null,
            requestsCount: matchedStats.requests,
            failuresCount: matchedStats.failures,
            sourcePage: isOAuth ? 'oauth' : 'api',
          });
        }
      }
    } catch {
      // 忽略
    }

    // 2. 从 /config 补充配置的 API 渠道（若已由 get_model_alias_sources 聚合则合并，避免重复卡片）
    try {
      const configPayload = await managementApi.get('/config');
      if (configPayload && typeof configPayload === 'object') {
        const sections = [
          { key: 'codex-api-key', kind: 'codex-api', label: 'Codex API' },
          { key: 'openai-compatibility', kind: 'openai-compatible', label: 'OpenAI 兼容渠道' },
          { key: 'claude-api-key', kind: 'claude-api', label: 'Claude API' },
          { key: 'gemini-api-key', kind: 'gemini-api', label: 'Gemini API' },
        ];
        for (const sec of sections) {
          const items = responseList(configPayload, sec.key);
          items.forEach((item, idx) => {
            const rawName = readString(item, 'name', 'prefix');
            const baseUrl = readString(item, 'base-url', 'baseUrl') || defaultEndpointForKind(sec.kind);
            const customName = rawName || `${sec.label} #${idx + 1}`;
            const clusterKey = `${sec.kind}:${customName}`.toLowerCase();
            const urlKey = `${sec.kind}:${baseUrl}`.toLowerCase();
            const models: string[] = [];
            if (Array.isArray(item.models)) {
              for (const m of item.models) {
                const mName = typeof m === 'string' ? m : readString(m, 'alias', 'name');
                if (mName && !models.includes(mName)) models.push(mName);
              }
            }
            const existing =
              clusterMap.get(clusterKey) ||
              clusterMap.get(urlKey) ||
              Array.from(clusterMap.values()).find(
                (c) => c.kind === sec.kind && c.baseUrl.toLowerCase() === baseUrl.toLowerCase(),
              );
            if (existing) {
              existing.baseUrl = baseUrl;
              if (rawName) existing.name = rawName;
              for (const m of models) {
                if (!existing.models.includes(m)) existing.models.push(m);
              }
            } else {
              clusterMap.set(clusterKey, {
                id: clusterKey,
                name: customName,
                kind: sec.kind,
                typeLabel: 'API 密钥集群',
                icon: resolveClusterIcon(sec.kind, customName),
                models,
                baseUrl,
                status: coreRunning ? 'online' : 'standby',
                latency: null,
                requestsCount: 0,
                failuresCount: 0,
                sourcePage: 'api',
              });
            }
          });
        }
      }
    } catch {
      // 忽略
    }

    setProviders(Array.from(clusterMap.values()));
    setLoading(false);
  }, [coreRunning]);

  useEffect(() => {
    void loadClusters();
  }, [loadClusters]);

  // 真实网关探测测速
  const testClusterLatency = async (cluster: ProviderClusterItem) => {
    setTestingId(cluster.id);
    const startTime = performance.now();
    try {
      const headers: Record<string, string> = {};
      const keyToSend = apiKey.trim() || 'any-proxy-key';
      headers['Authorization'] = `Bearer ${keyToSend}`;
      const res = await fetch(`http://127.0.0.1:${port}/v1/models`, { headers });
      const elapsed = Math.max(1, Math.round(performance.now() - startTime));
      setProviders((prev) =>
        prev.map((p) =>
          p.id === cluster.id
            ? {
                ...p,
                latency: elapsed,
                status: res.ok ? 'online' : 'error',
              }
            : p,
        ),
      );
    } catch {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === cluster.id
            ? {
                ...p,
                latency: null,
                status: 'error',
              }
            : p,
        ),
      );
    } finally {
      setTestingId(null);
    }
  };

  const filteredProviders = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.typeLabel.toLowerCase().includes(q) ||
        p.baseUrl.toLowerCase().includes(q) ||
        p.models.some((m) => m.toLowerCase().includes(q)),
    );
  }, [providers, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* 顶部集群状态与工具栏 */}
      <div
        className="ds-card"
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="ds-badge ds-badge-blue">
            活跃集群 {providers.length}
          </span>
          <span className="ds-badge ds-badge-mono">
            OAuth 授权通道 {providers.filter((p) => p.sourcePage === 'oauth').length}
          </span>
          <span className="ds-badge ds-badge-mono">
            API 密钥通道 {providers.filter((p) => p.sourcePage === 'api').length}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '230px' }}>
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
              placeholder="搜索已接入供应商或模型..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: '100%',
                height: '32px',
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
            className="ds-btn ds-btn-secondary ds-btn-sm"
            onClick={() => void loadClusters()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>刷新集群</span>
          </button>

          {onNavigate && (
            <>
              <button
                type="button"
                className="ds-btn ds-btn-secondary ds-btn-sm"
                onClick={() => onNavigate('oauth')}
              >
                <LogIn size={13} />
                <span>OAuth 授权接入</span>
              </button>
              <button
                type="button"
                className="ds-btn ds-btn-primary ds-btn-sm"
                onClick={() => onNavigate('api')}
              >
                <Plus size={13} />
                <span>添加 API 供应商</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 集群卡片列表 */}
      {loading ? (
        <div className="ds-card" style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
          正在读取已接入的供应商集群与模型状态...
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="ds-card" style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Network size={32} style={{ opacity: 0.4, marginBottom: 8, display: 'inline-block' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {providers.length === 0 ? '尚未接入任何上游供应商集群' : '没有匹配的供应商集群'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, marginBottom: 14 }}>
            您可以通过「API 接入」配置 OpenAI / Claude / Gemini / DeepSeek 密钥，或通过「OAuth 授权凭据」一键登录账号
          </div>
          {onNavigate && (
            <div style={{ display: 'inline-flex', gap: 10 }}>
              <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={() => onNavigate('api')}>
                <Plus size={13} />
                <span>前往 API 接入</span>
              </button>
              <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => onNavigate('oauth')}>
                <LogIn size={13} />
                <span>前往 OAuth 授权</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredProviders.map((provider) => {
            const visibleModels = provider.models.slice(0, 8);
            const remainingCount = Math.max(0, provider.models.length - visibleModels.length);

            return (
              <div
                key={provider.id}
                className="ds-card"
                style={{ display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
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
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={provider.icon}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '14.5px',
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={provider.name}
                        >
                          {provider.name}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            marginTop: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {provider.typeLabel} · 已挂载 {provider.models.length} 个模型
                        </div>
                      </div>
                    </div>

                    <span
                      className={`ds-badge ${
                        provider.status === 'online'
                          ? 'ds-badge-green'
                          : provider.status === 'error'
                            ? 'ds-badge-red'
                            : 'ds-badge-mono'
                      }`}
                      style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {provider.status === 'online'
                        ? '● 在线就绪'
                        : provider.status === 'error'
                          ? '● 连接异常'
                          : '● 待启动'}
                    </span>
                  </div>

                  {/* 接入端点说明 */}
                  <div
                    style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-subtle)',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={provider.baseUrl}
                  >
                    {provider.baseUrl}
                  </div>

                  {/* 可用模型标签（点击可直接跳转调试舱测试） */}
                  <div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        marginBottom: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>可用模型 ({provider.models.length})</span>
                      {onTestModel && provider.models.length > 0 && (
                        <span style={{ fontSize: '11.5px', opacity: 0.85 }}>点击模型名可直接测试</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {visibleModels.length === 0 ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>暂未同步具体模型列表</span>
                      ) : (
                        visibleModels.map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="ds-badge"
                            onClick={() => onTestModel?.(m)}
                            title={onTestModel ? `点击在极速调试舱中测试 ${m}` : m}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11.5px',
                              fontWeight: 400,
                              border: '1px solid var(--border-color)',
                              cursor: onTestModel ? 'pointer' : 'default',
                            }}
                          >
                            {m}
                          </button>
                        ))
                      )}
                      {remainingCount > 0 && (
                        <button
                          type="button"
                          className="ds-badge ds-badge-mono"
                          onClick={() => onNavigate?.('models')}
                          title="查看全部模型清单"
                          style={{
                            fontSize: '11.5px',
                            cursor: 'pointer',
                            color: 'var(--brand-primary)',
                          }}
                        >
                          +{remainingCount} 更多...
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 卡片底栏：网关探测延迟 & 快捷管理 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-color)',
                    fontSize: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: 'var(--text-secondary)',
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                      <Activity size={13} className="text-brand" style={{ flexShrink: 0 }} />
                      响应:{' '}
                      <strong
                        style={{
                          fontWeight: 500,
                          fontVariantNumeric: 'tabular-nums',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {provider.latency !== null ? `${provider.latency}ms` : '未测速'}
                      </strong>
                    </span>
                    {provider.requestsCount > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                        <CheckCircle2 size={12} style={{ color: '#10b981', flexShrink: 0 }} />
                        调用:{' '}
                        <strong style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                          {provider.requestsCount}
                        </strong>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="ds-btn ds-btn-secondary ds-btn-sm"
                      onClick={() => void testClusterLatency(provider)}
                      disabled={testingId === provider.id || !coreRunning}
                      title={coreRunning ? '探测网关模型端点实时响应耗时' : '请先启动网关服务'}
                    >
                      <Zap size={11} className={testingId === provider.id ? 'spin' : ''} />
                      <span>{testingId === provider.id ? '探测中...' : '实时测速'}</span>
                    </button>

                    {onNavigate && (
                      <button
                        type="button"
                        className="ds-btn ds-btn-secondary ds-btn-sm"
                        onClick={() => onNavigate(provider.sourcePage)}
                        title="前往管理该渠道凭据与模型"
                      >
                        <ExternalLink size={11} />
                        <span>配置</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
