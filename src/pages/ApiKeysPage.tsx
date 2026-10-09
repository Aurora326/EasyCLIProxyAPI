import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { FloatingNotice, useAppNotice } from '../appNotice';
import { webUiManagementUrl } from '../services/clientAccess';

type CoreApiKey = {
  apiKey: string;
  remark: string;
};

type CoreConfigSettings = {
  apiKeys: CoreApiKey[];
  host: string;
  port: number;
};

type CoreTlsSettings = {
  enabled: boolean;
  cert: string;
  key: string;
};

type ApiKeyUsageStat = {
  requests: number;
  tokens: number;
};

function maskApiKey(apiKey: string) {
  const value = apiKey.trim();
  if (!value) return '';
  if (value.length <= 6) {
    return `${value.slice(0, 1)}****${value.slice(-1)}`;
  }
  const prefix = value.slice(0, Math.min(6, Math.floor(value.length / 3)));
  const suffix = value.slice(-4);
  return `${prefix}••••••••••••••••${suffix}`;
}

export function ApiKeysPage() {
  const [settings, setSettings] = useState<CoreConfigSettings | null>(null);
  const [tlsSettings, setTlsSettings] = useState<CoreTlsSettings | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, ApiKeyUsageStat>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyAction, setBusyAction] = useState<
    'add-key' | 'update-key' | 'delete-key' | 'management-secret' | null
  >(null);

  // 列表交互状态
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  // 新增/编辑弹窗状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOriginalKey, setEditingOriginalKey] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [draftRemark, setDraftRemark] = useState('');
  const [showDraftKey, setShowDraftKey] = useState(true);
  const [formError, setFormError] = useState('');

  // 删除确认弹窗状态
  const [deletingEntry, setDeletingEntry] = useState<CoreApiKey | null>(null);

  // WebUI 管理密钥状态
  const [managementSecretDraft, setManagementSecretDraft] = useState('');
  const [managementSecretConfirm, setManagementSecretConfirm] = useState('');
  const [showManagementSecret, setShowManagementSecret] = useState(false);
  const [managementSecretError, setManagementSecretError] = useState('');

  const feedback = useAppNotice();
  const copyTimerRef = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    if (!isTauri()) {
      setSettings({
        apiKeys: [{ apiKey: 'sk-local-default', remark: '默认网关访问密钥' }],
        host: '127.0.0.1',
        port: 8317,
      });
      setTlsSettings({ enabled: false, cert: '', key: '' });
      setLoading(false);
      return;
    }

    try {
      const [cfg, tls] = await Promise.all([
        invoke<CoreConfigSettings>('get_core_config_settings'),
        invoke<CoreTlsSettings>('get_core_tls_settings').catch(() => ({
          enabled: false,
          cert: '',
          key: '',
        })),
      ]);
      setSettings(cfg);
      setTlsSettings(tls);

      // 尝试关联历史调用统计
      try {
        const analysis = await invoke<{
          apiKeys?: Array<{ key: string; label: string; requests: number; tokens: number }>;
        }>('get_usage_analysis', { query: {} });
        const nextMap: Record<string, ApiKeyUsageStat> = {};
        for (const item of analysis?.apiKeys || []) {
          if (item.label) {
            nextMap[item.label] = { requests: item.requests || 0, tokens: item.tokens || 0 };
          }
          if (item.key) {
            nextMap[item.key] = { requests: item.requests || 0, tokens: item.tokens || 0 };
          }
        }
        setUsageMap(nextMap);
      } catch {
        // 忽略统计读取异常
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenFn: (() => void) | null = null;
    void loadData();

    if (isTauri()) {
      void listen('config-files-changed', () => {
        if (!disposed) {
          void loadData();
        }
      }).then((stop) => {
        if (disposed) stop();
        else unlistenFn = stop;
      });
    }

    return () => {
      disposed = true;
      unlistenFn?.();
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, [loadData]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKey(null);
      }, 1800);
    } catch {
      feedback.showNotice('复制密钥失败，请检查剪贴板权限', 'error');
    }
  };

  const openCreateDialog = () => {
    feedback.clearNotice();
    setEditingOriginalKey(null);
    setDraftKey('');
    setDraftRemark('');
    setShowDraftKey(true);
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (entry: CoreApiKey) => {
    feedback.clearNotice();
    setEditingOriginalKey(entry.apiKey);
    setDraftKey(entry.apiKey);
    setDraftRemark(entry.remark || '');
    setShowDraftKey(false);
    setFormError('');
    setDialogOpen(true);
  };

  const generateRandomApiKey = () => {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    setDraftKey(`sk-cpa-${hex}`);
    setShowDraftKey(true);
    setFormError('');
  };

  const handleSubmitKey = async (e: FormEvent) => {
    e.preventDefault();
    const apiKey = draftKey.trim();
    if (!apiKey) {
      setFormError('请输入或随机生成 API 密钥');
      return;
    }
    if (!/^[\x21-\x7e]+$/.test(apiKey)) {
      setFormError('密钥仅允许包含可见 ASCII 字符（不含空格）');
      return;
    }
    if (
      settings?.apiKeys.some(
        (entry) => entry.apiKey === apiKey && entry.apiKey !== editingOriginalKey,
      )
    ) {
      setFormError('该 API 密钥已存在，请勿重复添加');
      return;
    }
    const remark = draftRemark.trim();
    if (remark.length > 80) {
      setFormError('备注长度不能超过 80 个字符');
      return;
    }

    const isEditing = editingOriginalKey !== null;
    setBusyAction(isEditing ? 'update-key' : 'add-key');
    try {
      const result = await invoke<CoreConfigSettings>(
        isEditing ? 'update_core_api_key' : 'add_core_api_key',
        isEditing
          ? { originalApiKey: editingOriginalKey, apiKey, remark }
          : { apiKey, remark },
      );
      setSettings(result);
      setDialogOpen(false);
      setEditingOriginalKey(null);
      feedback.showNotice(
        isEditing ? 'API 密钥已更新并同步至 config.yaml' : '新 API 密钥已创建并写入 config.yaml',
        'success',
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    setBusyAction('delete-key');
    try {
      const result = await invoke<CoreConfigSettings>('delete_core_api_key', {
        apiKey: deletingEntry.apiKey,
      });
      setSettings(result);
      setDeletingEntry(null);
      feedback.showNotice('API 密钥已从网关配置中移除', 'success');
    } catch (error) {
      feedback.showNotice(`删除失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const generateManagementSecret = () => {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const secret = `webui-${value}`;
    setManagementSecretDraft(secret);
    setManagementSecretConfirm(secret);
    setShowManagementSecret(true);
    setManagementSecretError('');
  };

  const handleSaveManagementSecret = async (e: FormEvent) => {
    e.preventDefault();
    const secretKey = managementSecretDraft.trim();
    if (!secretKey) {
      setManagementSecretError('请输入新的管理密钥');
      return;
    }
    if (secretKey === '123456') {
      setManagementSecretError('出于安全考虑，禁止使用弱默认密钥 123456');
      return;
    }
    if (secretKey !== managementSecretConfirm.trim()) {
      setManagementSecretError('两次输入的管理密钥不一致');
      return;
    }

    setBusyAction('management-secret');
    try {
      const result = await invoke<CoreConfigSettings>('set_core_management_secret_key', {
        secretKey,
      });
      setSettings(result);
      setManagementSecretDraft('');
      setManagementSecretConfirm('');
      setShowManagementSecret(false);
      setManagementSecretError('');
      feedback.showNotice('WebUI 管理密钥已更新生效', 'success');
    } catch (error) {
      setManagementSecretError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenWebUi = async () => {
    if (!settings) return;
    try {
      await invoke('open_external_url', {
        url: webUiManagementUrl(settings.port, tlsSettings?.enabled, settings.host),
      });
    } catch (error) {
      feedback.showNotice(`打开管理页面失败：${String(error)}`, 'error');
    }
  };

  const apiKeys = settings?.apiKeys || [];
  const endpointBase = `http://${settings?.host || '127.0.0.1'}:${settings?.port || 8317}/v1`;
  const sampleKey = apiKeys[0]?.apiKey || '<YOUR_API_KEY>';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FloatingNotice key={feedback.revision} notice={feedback.notice} onDismiss={feedback.clearNotice} />

      {/* 顶部鉴权说明与快捷操作栏 */}
      <div
        className="ds-card"
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--brand-subtle)',
              color: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Terminal size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                客户端 Bearer 鉴权密钥（实时同步 config.yaml）
              </span>
              <span className="ds-badge ds-badge-blue">共 {apiKeys.length} 个生效密钥</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
              外部工具（Cursor / Claude Code / Cherry Studio 等）调用{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {endpointBase}
              </code>{' '}
              时需传入{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                Authorization: Bearer {apiKeys[0] ? maskApiKey(apiKeys[0].apiKey) : '<API_KEY>'}
              </code>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="ds-btn ds-btn-secondary ds-btn-sm"
            onClick={() => void loadData()}
            disabled={loading}
            title="从本地 config.yaml 重新加载"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>刷新</span>
          </button>
          <button
            type="button"
            className="ds-btn ds-btn-primary ds-btn-sm"
            onClick={openCreateDialog}
            disabled={loading || busyAction !== null}
          >
            <Plus size={14} />
            <span>新增访问密钥</span>
          </button>
        </div>
      </div>

      {/* 客户端 API Key 列表卡片 */}
      <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loadError ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--status-error)' }}>
            <AlertCircle size={24} style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '13px', fontWeight: 600 }}>读取网关密钥配置失败</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {loadError}
            </div>
          </div>
        ) : apiKeys.length === 0 && !loading ? (
          <div style={{ padding: '42px 24px', textAlign: 'center' }}>
            <KeyRound size={28} style={{ color: 'var(--text-tertiary)', marginBottom: '10px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              当前未配置任何客户端 API 密钥
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginTop: '4px',
                marginBottom: '16px',
              }}
            >
              未设置密钥时，本地网关允许任意客户端免密请求；建议至少添加 1 个密钥以保障接口安全。
            </div>
            <button
              type="button"
              className="ds-btn ds-btn-primary ds-btn-sm"
              onClick={openCreateDialog}
            >
              <Plus size={14} />
              <span>立即创建首个密钥</span>
            </button>
          </div>
        ) : (
          <div className="ds-table-wrapper" style={{ border: 'none' }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th style={{ width: '64px' }}>序号</th>
                  <th>备注名称</th>
                  <th>密钥令牌 (API Key)</th>
                  <th>累计调用统计</th>
                  <th>状态</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((entry, idx) => {
                  const isRevealed = revealedKey === entry.apiKey;
                  const isCopied = copiedKey === `key-${idx}`;
                  const stat =
                    usageMap[entry.remark] ||
                    usageMap[entry.apiKey] ||
                    usageMap[maskApiKey(entry.apiKey)];

                  return (
                    <tr key={`${idx}-${entry.apiKey}`}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                        #{String(idx + 1).padStart(2, '0')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <KeyRound size={14} className="text-brand" />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {entry.remark || '未命名网关密钥'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <code
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '12px',
                              color: 'var(--text-primary)',
                              background: 'var(--bg-subtle)',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {isRevealed ? entry.apiKey : maskApiKey(entry.apiKey)}
                          </code>
                          <button
                            type="button"
                            className="ds-btn ds-btn-secondary ds-btn-sm"
                            style={{ height: '26px', padding: '0 7px' }}
                            onClick={() => setRevealedKey(isRevealed ? null : entry.apiKey)}
                            title={isRevealed ? '隐藏密钥明文' : '查看完整密钥'}
                          >
                            {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            type="button"
                            className="ds-btn ds-btn-secondary ds-btn-sm"
                            style={{ height: '26px', padding: '0 8px' }}
                            onClick={() => void handleCopy(entry.apiKey, `key-${idx}`)}
                            title="复制完整密钥"
                          >
                            {isCopied ? (
                              <>
                                <Check size={12} className="text-green" />
                                <span style={{ fontSize: '11px', color: 'var(--status-online)' }}>已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span style={{ fontSize: '11px' }}>复制</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                      <td>
                        {stat ? (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {stat.requests.toLocaleString()} 次请求
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            已就绪
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="ds-badge ds-badge-green">● 生效中</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="ds-btn ds-btn-secondary ds-btn-sm"
                            onClick={() => openEditDialog(entry)}
                            disabled={busyAction !== null}
                            title="编辑密钥或备注"
                          >
                            <Pencil size={12} />
                            <span>编辑</span>
                          </button>
                          <button
                            type="button"
                            className="ds-btn ds-btn-secondary ds-btn-sm"
                            style={{ color: 'var(--status-error)' }}
                            onClick={() => setDeletingEntry(entry)}
                            disabled={busyAction !== null}
                            title="删除该密钥"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 下半部分：双栏辅助卡片（cURL 接入示例 + WebUI 管理密钥配置） */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '16px',
        }}
      >
        {/* 左侧：快速调用代码片段 */}
        <div className="ds-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={15} className="text-brand" />
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                客户端快速接入示例
              </span>
            </div>
            <button
              type="button"
              className="ds-btn ds-btn-secondary ds-btn-sm"
              onClick={() =>
                void handleCopy(
                  `curl ${endpointBase}/models -H "Authorization: Bearer ${sampleKey}"`,
                  'curl-sample',
                )
              }
            >
              {copiedKey === 'curl-sample' ? <Check size={12} className="text-green" /> : <Copy size={12} />}
              <span>{copiedKey === 'curl-sample' ? '已复制命令' : '复制测试命令'}</span>
            </button>
          </div>
          <div
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11.5px',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              overflowX: 'auto',
            }}
          >
            <div># 验证网关密钥与可用模型列表</div>
            <div style={{ color: 'var(--brand-primary)' }}>
              curl {endpointBase}/models \
            </div>
            <div>
              {'  '}-H &quot;Authorization: Bearer {apiKeys[0] ? maskApiKey(apiKeys[0].apiKey) : '<YOUR_API_KEY>'}&quot;
            </div>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            提示：在此页面创建或修改的任何密钥均直接写入内核配置文件 <code style={{ fontFamily: 'var(--font-mono)' }}>config.yaml</code>，无需重启桌面端即可实时生效。
          </div>
        </div>

        {/* 右侧：WebUI 远程管理密钥 */}
        <div className="ds-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={15} className="text-brand" />
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                WebUI 管理后台保护密钥
              </span>
            </div>
            <button
              type="button"
              className="ds-btn ds-btn-secondary ds-btn-sm"
              onClick={() => void handleOpenWebUi()}
              disabled={!settings}
            >
              <ExternalLink size={12} />
              <span>打开 WebUI 控制台</span>
            </button>
          </div>

          <form
            onSubmit={(e) => void handleSaveManagementSecret(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>新管理密钥</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showManagementSecret ? 'text' : 'password'}
                    className="ds-input"
                    style={{ paddingRight: '30px', fontSize: '12px' }}
                    placeholder="输入新管理密钥..."
                    value={managementSecretDraft}
                    onChange={(e) => {
                      setManagementSecretDraft(e.target.value);
                      setManagementSecretError('');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowManagementSecret((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title={showManagementSecret ? '隐藏' : '显示'}
                  >
                    {showManagementSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>确认管理密钥</label>
                <input
                  type={showManagementSecret ? 'text' : 'password'}
                  className="ds-input"
                  style={{ fontSize: '12px' }}
                  placeholder="再次输入确认..."
                  value={managementSecretConfirm}
                  onChange={(e) => {
                    setManagementSecretConfirm(e.target.value);
                    setManagementSecretError('');
                  }}
                />
              </div>
            </div>

            {managementSecretError ? (
              <div style={{ fontSize: '11.5px', color: 'var(--status-error)' }}>
                {managementSecretError}
              </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
              <button
                type="button"
                className="ds-btn ds-btn-secondary ds-btn-sm"
                onClick={generateManagementSecret}
                disabled={busyAction !== null}
              >
                <Sparkles size={12} />
                <span>随机生成强密钥</span>
              </button>
              <button
                type="submit"
                className="ds-btn ds-btn-primary ds-btn-sm"
                disabled={busyAction !== null || !managementSecretDraft.trim()}
              >
                <Check size={13} />
                <span>{busyAction === 'management-secret' ? '保存中...' : '更新管理密钥'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 新增 / 编辑 API Key 模态框 */}
      {dialogOpen ? (
        <div
          className="config-dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && busyAction === null) {
              setDialogOpen(false);
            }
          }}
        >
          <form
            className="config-dialog"
            role="dialog"
            aria-modal="true"
            onSubmit={(e) => void handleSubmitKey(e)}
          >
            <div className="config-dialog-heading">
              <div>
                <KeyRound size={18} />
                <h2>{editingOriginalKey === null ? '新增客户端 API 密钥' : '编辑客户端 API 密钥'}</h2>
              </div>
              <button
                type="button"
                className="icon-button quiet"
                onClick={() => setDialogOpen(false)}
                disabled={busyAction !== null}
              >
                <X size={18} />
              </button>
            </div>

            <label className="config-dialog-field">
              <span>密钥令牌 (API Key)</span>
              <div className="config-secret-input">
                <input
                  autoFocus
                  type={showDraftKey ? 'text' : 'password'}
                  value={draftKey}
                  onChange={(e) => {
                    setDraftKey(e.target.value);
                    setFormError('');
                  }}
                  disabled={busyAction !== null}
                  placeholder="例如：sk-cpa-..."
                />
                <button
                  type="button"
                  className="icon-button quiet"
                  onClick={() => setShowDraftKey((v) => !v)}
                  title={showDraftKey ? '隐藏密钥' : '显示密钥'}
                >
                  {showDraftKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label className="config-dialog-field">
              <span>备注名称（用于区分调用客户端）</span>
              <input
                className="config-dialog-text-input"
                type="text"
                maxLength={80}
                value={draftRemark}
                onChange={(e) => {
                  setDraftRemark(e.target.value);
                  setFormError('');
                }}
                disabled={busyAction !== null}
                placeholder="例如：Cursor IDE / Claude Code / 本地脚本"
              />
            </label>

            {formError ? (
              <div className="config-form-message error" role="alert">
                {formError}
              </div>
            ) : null}

            <div className="config-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={generateRandomApiKey}
                disabled={busyAction !== null}
              >
                随机生成密钥
              </button>
              <button type="submit" className="primary-button" disabled={busyAction !== null}>
                {editingOriginalKey === null ? <Plus size={16} /> : <Check size={16} />}
                <span>
                  {busyAction === 'add-key' || busyAction === 'update-key'
                    ? '正在保存...'
                    : editingOriginalKey === null
                      ? '确认添加'
                      : '保存修改'}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* 删除确认弹窗 */}
      {deletingEntry ? (
        <div
          className="config-dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && busyAction === null) {
              setDeletingEntry(null);
            }
          }}
        >
          <div className="config-dialog config-delete-dialog" role="alertdialog" aria-modal="true">
            <div className="config-dialog-heading">
              <div>
                <Trash2 size={18} />
                <h2>确认删除此 API 密钥？</h2>
              </div>
            </div>
            <code className="config-delete-key">
              {deletingEntry.remark ? `${deletingEntry.remark} (${maskApiKey(deletingEntry.apiKey)})` : maskApiKey(deletingEntry.apiKey)}
            </code>
            {apiKeys.length === 1 ? (
              <div className="config-delete-warning">
                <AlertCircle size={16} />
                <span>注意：这是最后一个网关密钥，删除后本地网关将不再校验客户端 Bearer Token。</span>
              </div>
            ) : null}
            <div className="config-dialog-actions two-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeletingEntry(null)}
                disabled={busyAction === 'delete-key'}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void handleConfirmDelete()}
                disabled={busyAction === 'delete-key'}
              >
                <Trash2 size={15} />
                <span>{busyAction === 'delete-key' ? '正在删除...' : '确认删除'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
