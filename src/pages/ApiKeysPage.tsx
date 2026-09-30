import { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';

interface ApiKeyItem {
  id: string;
  name: string;
  keyMasked: string;
  rawKey: string;
  created: string;
  lastUsed: string;
  rateLimit: string;
  status: 'active' | 'revoked';
}

const initialKeys: ApiKeyItem[] = [
  {
    id: 'key_1',
    name: 'Default Master Key',
    keyMasked: 'cpa-live-9f2a********************4b8e',
    rawKey: 'cpa-live-9f2a71d8c03e481b95764b8e',
    created: '2026-09-20',
    lastUsed: '2 分钟前',
    rateLimit: '1,000 req/min',
    status: 'active',
  },
  {
    id: 'key_2',
    name: 'Cursor & VS Code Dev',
    keyMasked: 'cpa-dev-3c8b********************91da',
    rawKey: 'cpa-dev-3c8b41e2a09f482d881991da',
    created: '2026-09-22',
    lastUsed: '15 分钟前',
    rateLimit: '500 req/min',
    status: 'active',
  },
  {
    id: 'key_3',
    name: 'Claude Desktop Integration',
    keyMasked: 'cpa-cl-77a1********************22f5',
    rawKey: 'cpa-cl-77a1098bca4412f9104022f5',
    created: '2026-09-25',
    lastUsed: '1 小时前',
    rateLimit: '无限制',
    status: 'active',
  },
];

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const copyKey = async (id: string, raw: string) => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopiedKeyId(id);
      setTimeout(() => setCopiedKeyId(null), 1800);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    const randomHex = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const newKey: ApiKeyItem = {
      id: `key_${Date.now()}`,
      name: newKeyName.trim(),
      keyMasked: `cpa-live-${randomHex.slice(0, 4)}********************${randomHex.slice(-4)}`,
      rawKey: `cpa-live-${randomHex}`,
      created: new Date().toISOString().split('T')[0],
      lastUsed: '从未使用',
      rateLimit: '1,000 req/min',
      status: 'active',
    };
    setKeys([newKey, ...keys]);
    setNewKeyName('');
    setShowCreateModal(false);
  };

  const revokeKey = (id: string) => {
    setKeys(keys.filter((k) => k.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 头部标题与新建按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            API Keys 网关密钥管理
          </h2>

        </div>

        <button
          type="button"
          className="ds-btn ds-btn-primary ds-btn-sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={13} />
          <span>创建新密钥</span>
        </button>
      </div>

      {/* 快速调用示例 Banner */}
      <div
        className="ds-card"
        style={{
          background: 'var(--bg-subtle)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Terminal size={18} className="text-brand" />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            网关调用认证请求头：
            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginLeft: '6px' }}>
              Authorization: Bearer {'<YOUR_API_KEY>'}
            </code>
          </div>
        </div>
        <span className="ds-badge ds-badge-blue">Bearer Token 认证</span>
      </div>

      {/* API Key 列表表格 */}
      <div className="ds-card" style={{ padding: '0' }}>
        <div className="ds-table-wrapper" style={{ border: 'none' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>密钥名称</th>
                <th>密钥令牌</th>
                <th>创建时间</th>
                <th>最后调用</th>
                <th>速率限额</th>
                <th>状态</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <KeyRound size={14} className="text-brand" />
                      <span style={{ fontWeight: 600 }}>{k.name}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11.5px',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-subtle)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {revealedKeyId === k.id ? k.rawKey : k.keyMasked}
                      </span>
                      <button
                        type="button"
                        className="ds-btn ds-btn-secondary ds-btn-sm"
                        style={{ height: '24px', padding: '0 6px' }}
                        onClick={() => setRevealedKeyId(revealedKeyId === k.id ? null : k.id)}
                        title={revealedKeyId === k.id ? '隐藏密钥' : '显示完整密钥'}
                      >
                        {revealedKeyId === k.id ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <button
                        type="button"
                        className="ds-btn ds-btn-secondary ds-btn-sm"
                        style={{ height: '24px', padding: '0 6px' }}
                        onClick={() => copyKey(k.id, k.rawKey)}
                        title="复制完整密钥"
                      >
                        {copiedKeyId === k.id ? <Check size={11} className="text-green" /> : <Copy size={11} />}
                      </button>
                    </div>
                  </td>
                  <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{k.created}</td>
                  <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{k.lastUsed}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>{k.rateLimit}</td>
                  <td>
                    <span className="ds-badge ds-badge-green">● 生效中</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="ds-btn ds-btn-secondary ds-btn-sm"
                      style={{ color: 'var(--status-error)' }}
                      onClick={() => revokeKey(k.id)}
                      title="吊销/删除密钥"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 创建模态对话框 */}
      {showCreateModal ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="ds-card"
            style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700 }}>生成新 API Key</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>密钥标识名称</label>
              <input
                type="text"
                placeholder="例如: Cline / OpenCode API Token"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '12.5px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="ds-btn ds-btn-secondary ds-btn-sm"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="ds-btn ds-btn-primary ds-btn-sm"
                onClick={handleCreateKey}
              >
                创建密钥
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
