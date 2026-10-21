import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  BrainCircuit,
  Check,
  Copy,
  Cpu,
  GitFork,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useCoreRuntime } from '../coreRuntime';
import { managementApi, responseList, readString } from '../services/managementApi';
import { autoSyncAntigravityUpstreamModels } from '../services/antigravityModels';
import { thinkingAliasSourceKindLabel } from './ThinkingAliasesPage';

interface ModelsCatalogPageProps {
  onTestModel: (modelName: string) => void;
  onNavigate: (pageId: string) => void;
}

type CatalogModelItem = {
  id: string;
  displayName?: string;
  isAlias: boolean;
  sourceModel?: string;
  provider: string;
  kind: string;
  effort?: string | null;
  fast?: boolean;
  supportsReasoning: boolean;
  reasoningLevels: string[];
};

type FilterTab = 'all' | 'alias' | 'reasoning' | 'source';

export function ModelsCatalogPage({ onTestModel, onNavigate }: ModelsCatalogPageProps) {
  const { status: coreStatus } = useCoreRuntime();
  const [items, setItems] = useState<CatalogModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isOnline = Boolean(coreStatus?.running);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const catalogMap = new Map<string, CatalogModelItem>();

    // 1. 读取 Tauri 后端的模型源与别名配置
    try {
      const [
        thinkingAliases,
        speedAliases,
        baseSources,
        thinkingSources,
      ] = await Promise.all([
        invoke<Array<{
          sourceModel: string;
          alias: string;
          effort: string | null;
          provider: string;
          kind: string;
        }>>('get_thinking_aliases').catch(() => []),
        invoke<Array<{
          sourceModel: string;
          alias: string;
          serviceTier: string;
          provider: string;
          kind: string;
        }>>('get_speed_aliases').catch(() => []),
        invoke<Array<{
          id: string;
          model: string;
          displayName: string | null;
          provider: string;
          kind: string;
          protocol: string;
          reasoningLevels: string[];
        }>>('get_model_alias_sources').catch(() => []),
        invoke<Array<{
          id: string;
          model: string;
          reasoningLevels: string[];
        }>>('get_thinking_alias_sources').catch(() => []),
      ]);

      const reasoningSet = new Set(
        (thinkingSources || []).map((s) => s.model.trim().toLowerCase()),
      );

      // 先添加自定义别名
      for (const entry of thinkingAliases || []) {
        const aliasName = entry.alias?.trim();
        if (!aliasName) continue;
        const key = aliasName.toLowerCase();
        catalogMap.set(key, {
          id: aliasName,
          isAlias: true,
          sourceModel: entry.sourceModel,
          provider: entry.provider || thinkingAliasSourceKindLabel(entry.kind),
          kind: entry.kind,
          effort: entry.effort,
          fast: false,
          supportsReasoning: Boolean(entry.effort) || reasoningSet.has(entry.sourceModel.toLowerCase()),
          reasoningLevels: entry.effort ? [entry.effort] : [],
        });
      }

      for (const entry of speedAliases || []) {
        const aliasName = entry.alias?.trim();
        if (!aliasName) continue;
        const key = aliasName.toLowerCase();
        const existing = catalogMap.get(key);
        if (existing) {
          existing.fast = Boolean(entry.serviceTier);
        } else {
          catalogMap.set(key, {
            id: aliasName,
            isAlias: true,
            sourceModel: entry.sourceModel,
            provider: entry.provider || thinkingAliasSourceKindLabel(entry.kind),
            kind: entry.kind,
            effort: null,
            fast: Boolean(entry.serviceTier),
            supportsReasoning: reasoningSet.has(entry.sourceModel.toLowerCase()),
            reasoningLevels: [],
          });
        }
      }

      // 添加上游源模型
      for (const src of baseSources || []) {
        const modelName = src.model?.trim();
        if (!modelName) continue;
        const key = modelName.toLowerCase();
        if (!catalogMap.has(key)) {
          const hasReasoning =
            (src.reasoningLevels && src.reasoningLevels.length > 0) ||
            reasoningSet.has(key);
          catalogMap.set(key, {
            id: modelName,
            displayName: src.displayName && src.displayName !== modelName ? src.displayName : undefined,
            isAlias: false,
            provider: src.provider || thinkingAliasSourceKindLabel(src.kind),
            kind: src.kind,
            supportsReasoning: hasReasoning,
            reasoningLevels: src.reasoningLevels || [],
          });
        }
      }
    } catch {
      // 忽略异常
    }

    // 2. 补充从 /config 与 /v1/models 发现的模型
    try {
      const configPayload = await managementApi.get('/config');
      if (configPayload && typeof configPayload === 'object') {
        const sections = [
          { key: 'codex-api-key', label: 'Codex API', kind: 'codex-api' },
          { key: 'openai-compatibility', label: 'OpenAI 兼容', kind: 'openai-compatible' },
          { key: 'claude-api-key', label: 'Claude API', kind: 'claude-api' },
          { key: 'gemini-api-key', label: 'Gemini API', kind: 'gemini-api' },
        ];
        for (const sec of sections) {
          const list = responseList(configPayload, sec.key);
          for (const item of list) {
            const providerLabel = readString(item, 'name', 'prefix') || sec.label;
            if (Array.isArray(item.models)) {
              for (const m of item.models) {
                const name = typeof m === 'string' ? m : readString(m, 'name');
                const alias = typeof m === 'object' && m !== null ? readString(m, 'alias') : '';
                if (alias && !catalogMap.has(alias.toLowerCase())) {
                  catalogMap.set(alias.toLowerCase(), {
                    id: alias,
                    isAlias: true,
                    sourceModel: name || undefined,
                    provider: providerLabel,
                    kind: sec.kind,
                    supportsReasoning: false,
                    reasoningLevels: [],
                  });
                }
                if (name && !catalogMap.has(name.toLowerCase())) {
                  catalogMap.set(name.toLowerCase(), {
                    id: name,
                    isAlias: false,
                    provider: providerLabel,
                    kind: sec.kind,
                    supportsReasoning: /reasoner|thinking|o1|o3|opus|sonnet|gemini-2\.5|gemini-3/i.test(name),
                    reasoningLevels: [],
                  });
                }
              }
            }
          }
        }
      }
    } catch {
      // 忽略
    }

    // 3. 自动同步并载入 Antigravity 上游实时探测模型
    try {
      const { models: upstreamModels } = await autoSyncAntigravityUpstreamModels();
      for (const m of upstreamModels || []) {
        const modelName = m.id?.trim();
        if (!modelName) continue;
        const key = modelName.toLowerCase();
        const existing = catalogMap.get(key);
        if (existing) {
          if (!existing.displayName && m.displayName && m.displayName !== modelName) {
            existing.displayName = m.displayName;
          }
          if (m.supportsThinking) {
            existing.supportsReasoning = true;
          }
        } else {
          catalogMap.set(key, {
            id: modelName,
            displayName: m.displayName && m.displayName !== modelName ? m.displayName : undefined,
            isAlias: false,
            provider: 'Antigravity OAuth',
            kind: 'antigravity',
            supportsReasoning: Boolean(m.supportsThinking),
            reasoningLevels: m.supportsThinking ? ['high'] : [],
          });
        }
      }
    } catch {
      // 忽略自动同步异常
    }

    const resultList = Array.from(catalogMap.values()).sort((a, b) => {
      if (a.isAlias !== b.isAlias) return a.isAlias ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    setItems(resultList);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, isOnline]);

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch {
      // 忽略复制异常
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const aliases = items.filter((i) => i.isAlias).length;
    const reasoning = items.filter((i) => i.supportsReasoning).length;
    const providers = new Set(items.map((i) => i.provider)).size;
    return { total, aliases, reasoning, providers };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeFilter === 'alias' && !item.isAlias) return false;
      if (activeFilter === 'reasoning' && !item.supportsReasoning) return false;
      if (activeFilter === 'source' && item.isAlias) return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        (item.sourceModel && item.sourceModel.toLowerCase().includes(q)) ||
        item.provider.toLowerCase().includes(q) ||
        thinkingAliasSourceKindLabel(item.kind).toLowerCase().includes(q)
      );
    });
  }, [items, search, activeFilter]);

  return (
    <section className="page management-page">
      {/* 顶部汇总指标卡片 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div className="ds-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--clean-text-secondary)' }}>已挂载模型总数</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clean-text-primary)', marginTop: 4 }}>
            {stats.total}
          </div>
        </div>
        <div className="ds-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--clean-text-secondary)' }}>自定义路由别名</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clean-primary)', marginTop: 4 }}>
            {stats.aliases}
          </div>
        </div>
        <div className="ds-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--clean-text-secondary)' }}>支持深度思考模型</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#8b5cf6', marginTop: 4 }}>
            {stats.reasoning}
          </div>
        </div>
        <div className="ds-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--clean-text-secondary)' }}>覆盖上游渠道</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
            {stats.providers}
          </div>
        </div>
      </div>

      {/* 筛选栏、搜索框与快捷操作 */}
      <div
        className="ds-card"
        style={{
          padding: '12px 16px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div className="chart-time-pill-group">
          {(
            [
              { key: 'all', label: `全部模型 (${items.length})` },
              { key: 'alias', label: `模型别名 (${stats.aliases})` },
              { key: 'source', label: `上游原模型 (${stats.total - stats.aliases})` },
              { key: 'reasoning', label: `深度思考 (${stats.reasoning})` },
            ] as Array<{ key: FilterTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`chart-time-btn ${activeFilter === tab.key ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: 240 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--clean-text-muted)',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型 ID、映射源模型或渠道..."
              style={{
                width: '100%',
                height: 32,
                paddingLeft: 32,
                paddingRight: 10,
                fontSize: 12.5,
                borderRadius: 6,
                border: '1px solid var(--clean-border)',
                background: 'var(--clean-card-bg)',
                color: 'var(--clean-text-primary)',
              }}
            />
          </div>
          <button
            type="button"
            className="ds-btn ds-btn-secondary ds-btn-sm"
            onClick={() => onNavigate('model-mapping')}
          >
            <GitFork size={13} />
            <span>配置模型别名</span>
          </button>
          <button
            type="button"
            className="ds-btn ds-btn-secondary ds-btn-sm"
            onClick={() => void loadCatalog()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 模型表格清单 */}
      <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="ds-table-wrapper">
          {loading ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--clean-text-muted)', fontSize: 13 }}>
              正在同步网关可用模型列表...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--clean-text-muted)' }}>
              <Cpu size={28} style={{ opacity: 0.4, marginBottom: 8, display: 'inline-block' }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>未找到匹配的模型</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                可前往「API 接入」或「OAuth 授权凭据」添加上游渠道，或在「模型映射与别名」中创建自定义别名
              </div>
            </div>
          ) : (
            <table className="ds-table">
              <thead>
                <tr>
                  <th>模型 ID (调用名称)</th>
                  <th>类型与特性</th>
                  <th>映射指向 / 原模型</th>
                  <th>来源渠道与协议</th>
                  <th style={{ textAlign: 'right' }}>快捷操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={`${item.isAlias ? 'alias' : 'src'}:${item.id}`}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong
                          style={{
                            fontFamily: 'var(--clean-font-mono)',
                            fontSize: 12.5,
                            color: item.isAlias ? 'var(--clean-primary)' : 'var(--clean-text-primary)',
                          }}
                        >
                          {item.id}
                        </strong>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {item.isAlias ? (
                          <span className="ds-badge ds-badge-green" style={{ fontSize: 10.5 }}>
                            路由别名
                          </span>
                        ) : (
                          <span className="ds-badge ds-badge-mono" style={{ fontSize: 10.5 }}>
                            原生模型
                          </span>
                        )}
                        {item.effort && (
                          <span
                            className="ds-badge"
                            style={{
                              fontSize: 10.5,
                              background: 'rgba(139, 92, 246, 0.14)',
                              color: '#8b5cf6',
                            }}
                          >
                            思考: {item.effort.toUpperCase()}
                          </span>
                        )}
                        {!item.effort && item.supportsReasoning && (
                          <span
                            className="ds-badge"
                            style={{
                              fontSize: 10.5,
                              background: 'rgba(139, 92, 246, 0.1)',
                              color: '#8b5cf6',
                            }}
                          >
                            <BrainCircuit size={11} style={{ marginRight: 3 }} />
                            支持思考
                          </span>
                        )}
                        {item.fast && (
                          <span
                            className="ds-badge"
                            style={{
                              fontSize: 10.5,
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#d97706',
                            }}
                          >
                            <Sparkles size={11} style={{ marginRight: 3 }} />
                            Fast 极速
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--clean-font-mono)', fontSize: 12, color: 'var(--clean-text-secondary)' }}>
                      {item.sourceModel ? item.sourceModel : item.displayName || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Layers size={13} style={{ color: 'var(--clean-text-muted)' }} />
                        <span style={{ fontSize: 12 }}>{thinkingAliasSourceKindLabel(item.kind)}</span>
                        {item.provider && item.provider !== thinkingAliasSourceKindLabel(item.kind) && (
                          <span style={{ fontSize: 11, color: 'var(--clean-text-muted)' }}>
                            ({item.provider})
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="ds-btn ds-btn-secondary ds-btn-sm"
                          onClick={() => void handleCopy(item.id)}
                          title="复制模型 ID"
                          style={{ padding: '4px 8px', fontSize: 11.5 }}
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check size={12} className="text-green" />
                              <span>已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>复制 ID</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn-primary ds-btn-sm"
                          onClick={() => onTestModel(item.id)}
                          title="在极速调试舱中测试此模型"
                          style={{ padding: '4px 9px', fontSize: 11.5 }}
                        >
                          <Zap size={12} />
                          <span>去测试</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
