import { MessageNotice } from '../appNotice';
import { useEffect, useState, useCallback } from 'react';
import {
  Check,
  Copy,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  X,
  Globe,
  ArrowDownToLine,
  KeyRound,
  Info,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { managementApi, readString, isRecord } from '../services/managementApi';
import { oauthModelsFromPayload } from '../services/oauthModels';
import {
  fetchUpstreamAntigravityModels,
  syncUpstreamAntigravityModelsToGateway,
  type AntigravityDiscoveredModel,
} from '../services/antigravityModels';

type AuthFileModelsDialogProps = {
  name: string;
  onClose: () => void;
};

export type ModelDisplayItem = {
  id: string;
  displayName?: string;
  contextLength?: number;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  isRealtimeUpstream?: boolean;
};

export function AuthFileModelsDialog({ name, onClose }: AuthFileModelsDialogProps) {
  const { t } = useI18n();
  const [models, setModels] = useState<ModelDisplayItem[]>([]);
  const [rawUpstreamModels, setRawUpstreamModels] = useState<AntigravityDiscoveredModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState('');
  const [isRealtime, setIsRealtime] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isAntigravity = name.toLowerCase().includes('antigravity');

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    setModels([]);
    setRawUpstreamModels([]);
    setIsRealtime(false);

    try {
      if (isAntigravity) {
        // 1. 尝试获取该凭据的 auth_index 与 project_id
        let authIndex = '';
        let projectId = '';
        try {
          const authFilesPayload = await managementApi.get<Record<string, unknown>>('/auth-files');
          const files = isRecord(authFilesPayload) && Array.isArray(authFilesPayload.files)
            ? authFilesPayload.files
            : [];
          const matched = files.find((f) => isRecord(f) && readString(f, 'name', 'id') === name);
          if (matched && isRecord(matched)) {
            authIndex = readString(matched, 'auth_index', 'authIndex');
            projectId = readString(matched, 'project_id', 'projectId');
          }
        } catch {
          // 忽略 auth-files 读取失败，继续尝试降级
        }

        // 2. 如果找到了 authIndex，向 Google 上游发起实时探测
        if (authIndex) {
          try {
            const upstreamModels = await fetchUpstreamAntigravityModels(authIndex, projectId);
            if (upstreamModels.length > 0) {
              setRawUpstreamModels(upstreamModels);
              setModels(
                upstreamModels.map((m: AntigravityDiscoveredModel) => ({
                  id: m.id,
                  displayName: m.displayName,
                  contextLength: m.contextLength,
                  supportsThinking: m.supportsThinking,
                  supportsWebSearch: m.supportsWebSearch,
                  isRealtimeUpstream: true,
                }))
              );
              setIsRealtime(true);
              setLoading(false);
              return;
            }
          } catch {
            // 上游探测失败，平滑降级走核心本地管理接口
          }
        }
      }

      // 3. 通用或降级：从核心 /auth-files/models 获取
      const payload = await managementApi.get('/auth-files/models', { name });
      const baseModels = oauthModelsFromPayload(payload);
      setModels(
        baseModels.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          isRealtimeUpstream: false,
        }))
      );
    } catch (requestError: unknown) {
      setError(String(requestError));
    } finally {
      setLoading(false);
    }
  }, [name, isAntigravity]);

  useEffect(() => {
    let cancelled = false;
    void loadModels().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadModels]);

  const query = search.trim().toLowerCase();
  const visibleModels = models.filter((model) =>
    [model.id, model.displayName ?? ''].join(' ').toLowerCase().includes(query),
  );

  const copyModel = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    } catch (copyError) {
      setError(String(copyError));
    }
  };

  const handleSyncToGateway = async () => {
    if (rawUpstreamModels.length === 0 || syncing) return;
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const { addedCount } = await syncUpstreamAntigravityModelsToGateway(rawUpstreamModels);
      if (addedCount > 0) {
        setNotice(t('authFiles.models.syncSuccess', { count: addedCount }));
      } else {
        setNotice(t('authFiles.models.syncAlreadyUpToDate'));
      }
    } catch (syncError) {
      setError(String(syncError));
    } finally {
      setSyncing(false);
    }
  };

  const formatTokens = (tokens?: number) => {
    if (!tokens || tokens <= 0) return null;
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
    return `${tokens}`;
  };

  return (
    <div
      className="model-discovery-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="model-discovery-dialog auth-model-dialog auth-model-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-model-view-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <div className="auth-model-view-header">
          <div className="auth-model-view-header-main">
            <div className="auth-model-view-title-row">
              <h2 id="auth-model-view-title">
                {t('authFiles.models.viewTitle')}
              </h2>
              {isRealtime ? (
                <span className="auth-model-status-badge upstream">
                  <Globe size={12} />
                  {t('authFiles.models.realtimeUpstream', { count: models.length })}
                </span>
              ) : (
                <span className="auth-model-status-badge fallback">
                  <Info size={12} />
                  <span>已注册 ({models.length})</span>
                </span>
              )}
            </div>
            <div className="auth-model-view-target-row">
              <span className="auth-model-view-target-chip" title={name}>
                <KeyRound size={12} />
                <span>{name}</span>
              </span>
              <span className="auth-model-view-desc">
                {t('authFiles.models.viewDescription')}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              className="icon-button quiet"
              onClick={() => void loadModels()}
              disabled={loading}
              title={t('authFiles.models.refresh')}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button
              type="button"
              className="icon-button quiet"
              onClick={onClose}
              title={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="auth-model-view-search-wrapper">
          <Search size={15} color="var(--theme-7a746c)" aria-hidden="true" />
          <input
            autoFocus
            className="auth-model-view-search-input"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t('authFiles.models.search')}
          />
          {search ? (
            <button
              type="button"
              className="icon-button quiet"
              onClick={() => setSearch('')}
              style={{ padding: '2px' }}
              title={t('common.clear')}
            >
              <X size={14} />
            </button>
          ) : null}
          <span className="auth-model-view-search-count">
            {visibleModels.length} / {models.length}
          </span>
        </div>

        <div className="auth-model-view-body">
          {loading ? (
            <div className="model-discovery-message" style={{ margin: 'auto' }}>
              <LoaderCircle size={22} className="spin" />
              <span>{t('authFiles.models.loading')}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              <MessageNotice message={error} onDismiss={() => setError('')} />
              {notice ? (
                <div
                  style={{
                    margin: '8px 8px 0',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    color: '#16a34a',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{notice}</span>
                  <button
                    type="button"
                    className="icon-button quiet"
                    onClick={() => setNotice('')}
                    style={{ padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}
              {visibleModels.length === 0 ? (
                <div className="model-discovery-message" style={{ margin: 'auto' }}>
                  {t(models.length ? 'authFiles.models.noMatch' : 'authFiles.models.viewEmpty')}
                </div>
              ) : (
                <div className="auth-model-view-scroll-list">
                  {visibleModels.map((model) => {
                    const tokenText = formatTokens(model.contextLength);
                    const isCopied = copied === model.id;
                    return (
                      <button
                        type="button"
                        className={`auth-model-card-item ${isCopied ? 'copied' : ''}`}
                        key={model.id}
                        onClick={() => void copyModel(model.id)}
                        title={t('authFiles.models.copyModel')}
                      >
                        <div className="auth-model-card-main">
                          <div className="auth-model-card-top">
                            <span className="auth-model-card-name">
                              {model.displayName || model.id}
                            </span>
                            {tokenText ? (
                              <span className="auth-model-card-badge context">
                                {t('authFiles.models.context', { tokens: tokenText })}
                              </span>
                            ) : null}
                            {model.supportsThinking ? (
                              <span className="auth-model-card-badge thinking">
                                <Sparkles size={10} />
                                {t('common.thinking')}
                              </span>
                            ) : null}
                            {model.isRealtimeUpstream ? (
                              <span className="auth-model-card-badge upstream-source">
                                Google Upstream
                              </span>
                            ) : null}
                          </div>
                          <div className="auth-model-card-id-row">
                            <code className="auth-model-card-id">{model.id}</code>
                          </div>
                        </div>

                        <div className={`auth-model-card-action ${isCopied ? 'copied' : ''}`}>
                          {isCopied ? (
                            <>
                              <Check size={14} color="#16a34a" />
                              <span>已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>复制 ID</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="auth-model-view-footer">
          <div>
            {isRealtime && rawUpstreamModels.length > 0 ? (
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => void handleSyncToGateway()}
                disabled={syncing || loading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="将抓取到的所有上游模型注入本地网关，供 Cursor / Claude Code / OpenAI 客户端直接调用"
              >
                {syncing ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <ArrowDownToLine size={14} />
                )}
                <span>
                  {syncing
                    ? t('authFiles.models.syncing')
                    : t('authFiles.models.syncToGateway')}
                </span>
              </button>
            ) : (
              <span className="auth-model-view-footer-hint">
                <Info size={13} />
                <span>{t('authFiles.models.copyHint')}</span>
              </span>
            )}
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </section>
    </div>
  );
}
