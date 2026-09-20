import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  HelpCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  HardDrive,
} from 'lucide-react';
import { useI18n } from '../i18n';

export interface R2SyncSettings {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectKey: string;
  masterPassword: string;
  autoSync: boolean;
  includeApiKeys: boolean;
  includeAgents: boolean;
  includeAliases: boolean;
  includeOAuthFiles: boolean;
}

export function CloudSyncPanel() {
  const { t } = useI18n();

  const [settings, setSettings] = useState<R2SyncSettings>({
    endpoint: '',
    bucket: '',
    region: 'auto',
    accessKeyId: '',
    secretAccessKey: '',
    objectKey: 'easy-cliproxy-sync.enc',
    masterPassword: '',
    autoSync: false,
    includeApiKeys: false,
    includeAgents: true,
    includeAliases: true,
    includeOAuthFiles: true,
  });

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [cloudModified, setCloudModified] = useState<string | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await invoke<R2SyncSettings>('get_r2_sync_settings');
      if (res) {
        setSettings(res);
        if (res.endpoint && res.bucket) {
          void checkCloudStatus(res);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const checkCloudStatus = async (currentSettings: R2SyncSettings) => {
    try {
      const modified = await invoke<string | null>('get_r2_cloud_status', { settings: currentSettings });
      setCloudModified(modified);
    } catch {
      // ignore
    }
  };

  const getCleanSettings = (): R2SyncSettings => ({
    ...settings,
    endpoint: settings.endpoint.trim(),
    bucket: settings.bucket.trim(),
    region: settings.region.trim() || 'auto',
    accessKeyId: settings.accessKeyId.trim(),
    secretAccessKey: settings.secretAccessKey.trim(),
    objectKey: settings.objectKey.trim() || 'easy-cliproxy-sync.enc',
    masterPassword: settings.masterPassword.trim(),
  });

  const handleSaveSettings = async () => {
    setSaving(true);
    setNotice(null);
    const cleaned = getCleanSettings();
    setSettings(cleaned);
    try {
      await invoke('save_r2_sync_settings_cmd', { settings: cleaned });
      setNotice({ type: 'success', text: 'Cloudflare R2 同步参数已成功保存在本地！' });
    } catch (err: any) {
      setNotice({ type: 'error', text: `保存失败: ${err}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const cleaned = getCleanSettings();
    setSettings(cleaned);
    if (!cleaned.endpoint || !cleaned.bucket || !cleaned.accessKeyId || !cleaned.secretAccessKey) {
      setNotice({ type: 'error', text: '请先填写完整的 Endpoint、Bucket 名称以及 Access/Secret Key！' });
      return;
    }

    setTesting(true);
    setNotice(null);
    try {
      const message = await invoke<string>('test_r2_sync_connection', { settings: cleaned });
      setNotice({ type: 'success', text: message });
      void checkCloudStatus(cleaned);
    } catch (err: any) {
      setNotice({ type: 'error', text: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handlePush = async () => {
    const cleaned = getCleanSettings();
    setSettings(cleaned);
    if (!cleaned.masterPassword) {
      setNotice({ type: 'error', text: '请设置端到端加密主密码 (Master Password)，以保障云端数据安全！' });
      return;
    }

    setPushing(true);
    setNotice(null);
    try {
      const res: any = await invoke('push_config_to_r2', { settings: cleaned });
      setNotice({ type: 'success', text: res.message || '配置已成功加密推送到 Cloudflare R2！' });
      void checkCloudStatus(cleaned);
    } catch (err: any) {
      setNotice({ type: 'error', text: `推送失败: ${err}` });
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    const cleaned = getCleanSettings();
    setSettings(cleaned);
    if (!cleaned.masterPassword) {
      setNotice({ type: 'error', text: '请输入解密主密码 (Master Password)！' });
      return;
    }

    if (!window.confirm('从云端拉取配置将覆盖当前电脑的相应设置，是否确定继续？')) {
      return;
    }

    setPulling(true);
    setNotice(null);
    try {
      const res: any = await invoke('pull_config_from_r2', { settings: cleaned });
      setNotice({ type: 'success', text: res.message || '配置已成功拉取并还原！' });
      void checkCloudStatus(cleaned);
    } catch (err: any) {
      setNotice({ type: 'error', text: `拉取还原失败: ${err}` });
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="panel config-subpage-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部标题与状态仪表卡 */}
      <div style={{
        padding: '16px 18px',
        background: 'linear-gradient(180deg, #ffffff 0%, #fcfdfd 100%)',
        border: '1px solid rgba(226, 232, 240, 0.95)',
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 8,
              background: '#ecfeff',
              color: '#06b6d4',
              border: '1px solid rgba(6, 182, 212, 0.2)',
            }}>
              <Cloud size={20} />
            </div>
            <div>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>
                Cloudflare R2 对象存储配置云漫游
              </strong>
              <span style={{ display: 'block', fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                S3 兼容通用协议 · 本地 AES-256-GCM 零知识加密 · 多设备无缝漫游
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={handleTestConnection}
              disabled={testing || loading}
            >
              {testing ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
              测试连通性
            </button>
            <button
              type="button"
              className="primary-button compact-button"
              onClick={handlePush}
              disabled={pushing || loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {pushing ? <LoaderCircle size={14} className="spin" /> : <CloudUpload size={14} />}
              加密推送到云端 (Push)
            </button>
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={handlePull}
              disabled={pulling || loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {pulling ? <LoaderCircle size={14} className="spin" /> : <CloudDownload size={14} />}
              从云端拉取还原 (Pull)
            </button>
          </div>
        </div>

        {/* 状态徽章与最后同步时间 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: 6,
          fontSize: 12,
          color: '#475569',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: settings.endpoint && settings.bucket ? '#10b981' : '#cbd5e1',
            }} />
            存储桶: <strong>{settings.bucket || '未配置'}</strong>
          </span>
          <span>
            云端最后更新时间: <strong>{cloudModified || '未检测到云端备份'}</strong>
          </span>
        </div>
      </div>

      {/* 提示消息 */}
      {notice && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 12.5,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: notice.type === 'success' ? '#f0fdf4' : notice.type === 'error' ? '#fff1f2' : '#f0f9ff',
          color: notice.type === 'success' ? '#15803d' : notice.type === 'error' ? '#b91c1c' : '#0369a1',
          border: `1px solid ${notice.type === 'success' ? '#bbf7d0' : notice.type === 'error' ? '#fecdd3' : '#bae6fd'}`,
        }}>
          {notice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* R2 参数配置面板 */}
      <div style={{
        padding: '16px 18px',
        background: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.95)',
        borderRadius: 12,
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyRound size={16} style={{ color: '#06b6d4' }} />
          Cloudflare R2 凭据与存储参数
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              S3 / R2 API Endpoint (终端节点)
            </label>
            <input
              type="text"
              value={settings.endpoint}
              onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
              placeholder="https://<account-id>.r2.cloudflarestorage.com"
              style={{ width: '100%', height: 32, fontSize: 12 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              存储桶名称 (Bucket Name)
            </label>
            <input
              type="text"
              value={settings.bucket}
              onChange={(e) => setSettings({ ...settings, bucket: e.target.value })}
              placeholder="如 cliproxy-backup"
              style={{ width: '100%', height: 32, fontSize: 12 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              Access Key ID
            </label>
            <input
              type="text"
              value={settings.accessKeyId}
              onChange={(e) => setSettings({ ...settings, accessKeyId: e.target.value })}
              placeholder="R2 API Token 的 Access Key ID"
              style={{ width: '100%', height: 32, fontSize: 12 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              Secret Access Key
            </label>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                value={settings.secretAccessKey}
                onChange={(e) => setSettings({ ...settings, secretAccessKey: e.target.value })}
                placeholder="R2 API Token 的 Secret Access Key"
                style={{ width: '100%', height: 32, fontSize: 12, paddingRight: 32 }}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                style={{
                  position: 'absolute',
                  right: 6,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid #f1f5f9' }} />

        {/* 端到端零知识加密主密码 */}
        <div style={{
          padding: '14px 16px',
          background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ShieldCheck size={18} style={{ color: '#0891b2' }} />
            <strong style={{ fontSize: 13, color: '#0f172a' }}>端到端零知识加密主口令 (Master Passphrase)</strong>
            <span style={{ fontSize: 11, color: '#0891b2', background: '#ecfeff', padding: '2px 8px', borderRadius: 9999 }}>
              AES-256-GCM
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: '#475569', margin: '0 0 10px 0', lineHeight: 1.5 }}>
            此密码仅存在于您的记忆中，客户端会在本地进行加密后再推送到 Cloudflare。云端存储的是纯密文，没有主口令任何人都无法解密。
          </p>
          <div style={{ display: 'flex', alignItems: 'center', maxWidth: 460, position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={settings.masterPassword}
              onChange={(e) => setSettings({ ...settings, masterPassword: e.target.value })}
              placeholder="请输入您自定义的加密/解密主口令..."
              style={{ width: '100%', height: 34, fontSize: 13, paddingRight: 32 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
              }}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* 同步资产勾选 */}
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>
            选择同步范围 (Selective Sync)
          </label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.includeAgents}
                onChange={(e) => setSettings({ ...settings, includeAgents: e.target.checked })}
              />
              <span>智能体与工作流配置 (agents.yaml)</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.includeAliases}
                onChange={(e) => setSettings({ ...settings, includeAliases: e.target.checked })}
              />
              <span>模型思考别名与重映射 (Thinking Aliases)</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.includeApiKeys}
                onChange={(e) => setSettings({ ...settings, includeApiKeys: e.target.checked })}
              />
              <span>本地分发的 API 密钥 (默认不勾选，防泄露)</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.includeOAuthFiles}
                onChange={(e) => setSettings({ ...settings, includeOAuthFiles: e.target.checked })}
              />
              <span style={{ fontWeight: 600, color: '#0891b2' }}>OAuth 账号凭据文件 (oauth/*.json · 跨设备免重新扫码登录)</span>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="secondary-button"
            onClick={handleSaveSettings}
            disabled={saving}
          >
            {saving ? <LoaderCircle size={14} className="spin" /> : null}
            保存参数配置
          </button>
        </div>
      </div>

      {/* Cloudflare R2 开通新手引导指南 */}
      <div style={{
        background: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.95)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setShowGuide(!showGuide)}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
            <HelpCircle size={16} style={{ color: '#06b6d4' }} />
            1 分钟新手指南：如何获取 Cloudflare R2 凭证？
          </span>
          {showGuide ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
        </div>

        {showGuide && (
          <div style={{ padding: '0 16px 16px 16px', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
            <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>登录 <strong>Cloudflare Dashboard</strong>，在左侧菜单点击 <strong>R2 对象存储</strong>；</li>
              <li>点击 <strong>创建存储桶 (Create Bucket)</strong>，命名（例如 <code>cliproxy-backup</code>），位置选择 <code>自动 (Auto)</code>；</li>
              <li>在 R2 首页右侧点击 <strong>管理 R2 API 令牌 (Manage R2 API Tokens)</strong>；</li>
              <li>点击 <strong>创建 API 令牌</strong>，权限推荐选择 <strong>管理员读写 (Admin Read & Write)</strong>（同时支持存储桶连通性检测与对象加密存取），存储桶选所有或指定桶，TTL 选择永久或按需；</li>
              <li>复制生成的 <strong>Access Key ID</strong>、<strong>Secret Access Key</strong> 以及最下方的 <strong>S3 终端节点 URL</strong> 填入上方输入框即可！</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
