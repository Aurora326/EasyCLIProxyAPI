import { useCallback, useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Bot,
  Cpu,
  Gauge,
  History,
  House,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  Network,
  PackageOpen,
  Settings,
  Sliders,
  Zap,
} from 'lucide-react';
import appLogo from '../assets/logo.jpg';
import { useI18n } from '../i18n';

export type NavItem = {
  id: string;
  label: string;
  icon: typeof House;
  badge?: string;
  alwaysAvailable?: boolean;
};

export type NavSection = {
  key: string;
  label: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    key: 'gateway',
    label: '核心网关',
    items: [
      { id: 'overview', label: '运行概览', icon: Gauge, alwaysAvailable: true },
      { id: 'providers', label: '供应商集群', icon: Layers, alwaysAvailable: true },
      { id: 'api', label: 'API 接入', icon: Network, alwaysAvailable: true },
      { id: 'oauth', label: 'OAuth 授权凭据', icon: LogIn, alwaysAvailable: true },
    ],
  },
  {
    key: 'models',
    label: '模型与调试',
    items: [
      { id: 'models', label: '模型清单', icon: Cpu, alwaysAvailable: true },
      { id: 'model-mapping', label: '模型映射与别名', icon: Sliders, alwaysAvailable: true },
      { id: 'playground', label: '极速调试舱', icon: Zap, alwaysAvailable: true },
    ],
  },
  {
    key: 'system',
    label: '监控与运维',
    items: [
      { id: 'logs', label: '调用日志', icon: History, alwaysAvailable: true },
      { id: 'api-keys', label: 'API 密钥管理', icon: KeyRound, alwaysAvailable: true },
      { id: 'smart-config', label: '智能体一键托管', icon: Bot, alwaysAvailable: true },
      { id: 'config', label: '高级核心设置', icon: Settings, alwaysAvailable: true },
      { id: 'versions', label: '版本更新管理', icon: PackageOpen, alwaysAvailable: true },
    ],
  },
];

interface ConsoleSidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  coreRunning: boolean;
  corePort: number;
}

export function ConsoleSidebar({
  activeId,
  onSelect,
  coreRunning,
  corePort,
}: ConsoleSidebarProps) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refreshCounts = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [sources, thinkingAliases, speedAliases, cfg] = await Promise.all([
        invoke<Array<{ model?: string; provider?: string; kind?: string }>>(
          'get_model_alias_sources',
        ).catch(() => []),
        invoke<Array<{ alias?: string; sourceModel?: string }>>('get_thinking_aliases').catch(
          () => [],
        ),
        invoke<Array<{ alias?: string; sourceModel?: string }>>('get_speed_aliases').catch(
          () => [],
        ),
        invoke<{ apiKeys?: Array<{ apiKey: string }> }>('get_core_config_settings').catch(
          () => null,
        ),
      ]);

      const modelSet = new Set<string>();
      const providerSet = new Set<string>();
      for (const s of sources || []) {
        if (s.model) modelSet.add(s.model.toLowerCase());
        if (s.kind || s.provider) {
          providerSet.add(`${s.kind || ''}:${s.provider || ''}`.toLowerCase());
        }
      }

      const aliasSet = new Set<string>();
      for (const a of [...(thinkingAliases || []), ...(speedAliases || [])]) {
        if (a.alias) {
          aliasSet.add(a.alias.toLowerCase());
          modelSet.add(a.alias.toLowerCase());
        }
        if (a.sourceModel) {
          modelSet.add(a.sourceModel.toLowerCase());
        }
      }

      setCounts({
        providers: providerSet.size,
        models: modelSet.size,
        'model-mapping': aliasSet.size,
        'api-keys': cfg?.apiKeys?.length ?? 0,
      });
    } catch {
      // 忽略统计异常
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen('config-files-changed', () => {
      if (!disposed) void refreshCounts();
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshCounts, coreRunning]);

  return (
    <aside className="console-sidebar">
      {/* 品牌标识 */}
      <div className="sidebar-header">
        <div className="sidebar-brand-badge">
          <img src={appLogo} alt="EasyCLIProxyAPI 标识" />
        </div>
        <div className="sidebar-brand-info">
          <span className="sidebar-brand-title">EasyCLIProxyAPI</span>
          <span className="sidebar-brand-subtitle">AI 网关 · 开发者控制台</span>
        </div>
      </div>

      {/* 3 组紧凑导航列表 */}
      <div className="sidebar-nav-container">
        {navSections.map((section) => (
          <div key={section.key} className="sidebar-section">
            {section.label ? (
              <span className="sidebar-section-label">{section.label}</span>
            ) : null}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeId === item.id;
              const locked = !item.alwaysAvailable && !coreRunning;
              const dynamicCount = counts[item.id];
              const badgeText =
                item.badge ?? (dynamicCount && dynamicCount > 0 ? String(dynamicCount) : undefined);

              return (
                <button
                  key={item.id}
                  type="button"
                  data-page-id={item.id}
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  disabled={locked}
                  onClick={() => onSelect(item.id)}
                  title={locked ? t('app.nav.lockedHint') : undefined}
                >
                  <span className="nav-icon-box" aria-hidden="true">
                    <Icon size={15} className="nav-icon" />
                  </span>
                  <span className="nav-text">{item.label}</span>
                  {locked ? (
                    <Lock size={12} className="nav-lock-icon" aria-hidden="true" />
                  ) : badgeText ? (
                    <span className="nav-badge">{badgeText}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 底栏内核引擎卡片 */}
      <div className="sidebar-footer">
        <div className="sidebar-status-card">
          <div className="status-indicator-group">
            <div className={`status-pulse-dot ${coreRunning ? 'online' : 'offline'}`} />
            <div>
              <div className="sidebar-status-title">CLIProxyAPI 内核</div>
              <div className="sidebar-status-desc">
                {coreRunning ? `127.0.0.1:${corePort} 守护中` : '本地代理待命'}
              </div>
            </div>
          </div>
          <span className={`ds-badge ${coreRunning ? 'ds-badge-green' : 'ds-badge-mono'}`}>
            {coreRunning ? '在线' : '待命'}
          </span>
        </div>
      </div>
    </aside>
  );
}
