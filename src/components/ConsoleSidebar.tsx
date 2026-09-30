import {
  Activity,
  Bot,
  Compass,
  Cpu,
  Database,
  FileCode,
  Gauge,
  History,
  House,
  KeyRound,
  Layers,
  LineChart,
  Lock,
  LogIn,
  Network,
  PackageOpen,
  Route,
  ServerCog,
  Settings,
  ShieldCheck,
  Sliders,
  Terminal,
  TriangleAlert,
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
    key: 'overview',
    label: '运行概览',
    items: [
      { id: 'overview', label: '运行概览', icon: Gauge, alwaysAvailable: true },
    ],
  },
  {
    key: 'gateway',
    label: '网关服务',
    items: [
      { id: 'api', label: 'API 接入', icon: Network, alwaysAvailable: true },
      { id: 'providers', label: '供应商集群', icon: Layers, alwaysAvailable: true },
      { id: 'routes', label: '路由转发', icon: Route, alwaysAvailable: true },
    ],
  },
  {
    key: 'models',
    label: '模型生态',
    items: [
      { id: 'models', label: '模型清单', icon: Cpu, alwaysAvailable: true },
      { id: 'model-mapping', label: '模型映射与别名', icon: Sliders, alwaysAvailable: true },
      { id: 'playground', label: '极速调试舱', icon: Zap, alwaysAvailable: true },
    ],
  },
  {
    key: 'observability',
    label: '监控追踪',
    items: [
      { id: 'logs', label: '调用日志', icon: History, alwaysAvailable: true },
    ],
  },
  {
    key: 'access',
    label: '访问控制',
    items: [
      { id: 'api-keys', label: 'API 密钥管理', icon: KeyRound, alwaysAvailable: true },
      { id: 'oauth', label: 'OAuth 授权凭据', icon: LogIn, alwaysAvailable: true },
      { id: 'permissions', label: '安全访问权限', icon: ShieldCheck, alwaysAvailable: true },
    ],
  },
  {
    key: 'system',
    label: '系统运维',
    items: [
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

      {/* 分组导航列表 */}
      <div className="sidebar-nav-container">
        {navSections.map((section) => (
          <div key={section.key} className="sidebar-section">
            <span className="sidebar-section-label">{section.label}</span>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeId === item.id;
              const locked = !item.alwaysAvailable && !coreRunning;

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
                  <Icon size={15} className="nav-icon" aria-hidden="true" />
                  <span className="nav-text">{item.label}</span>
                  {locked ? (
                    <Lock size={12} className="nav-lock-icon" aria-hidden="true" />
                  ) : item.badge ? (
                    <span className="nav-badge">{item.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 底栏网关状态卡片 */}
      <div className="sidebar-footer">
        <div className="sidebar-status-card">
          <div className="status-indicator-group">
            <div className={`status-pulse-dot ${coreRunning ? 'online' : 'offline'}`} />
            <div>
              <div className="sidebar-status-title">
                {coreRunning ? '网关运行中' : '网关已就绪'}
              </div>
              <div className="sidebar-status-desc">
                {coreRunning ? `127.0.0.1:${corePort}` : '就绪待启动'}
              </div>
            </div>
          </div>
          <span className={`ds-badge ${coreRunning ? 'ds-badge-green' : 'ds-badge-mono'}`}>
            {coreRunning ? '在线' : '就绪'}
          </span>
        </div>
      </div>
    </aside>
  );
}
