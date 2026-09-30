import {
  Bell,
  Command,
  ExternalLink,
  Moon,
  Search,
  Sun,
  Monitor,
  CheckCircle2,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { ThemePreference } from '../theme';

interface ConsoleHeaderProps {
  pageTitle: string;
  pageSubtitle?: string;
  onOpenSearch: () => void;
  coreRunning: boolean;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onOpenContact: () => void;
}

export function ConsoleHeader({
  pageTitle,
  pageSubtitle,
  onOpenSearch,
  coreRunning,
  themePreference,
  onThemeChange,
  onOpenContact,
}: ConsoleHeaderProps) {
  const { t } = useI18n();

  const currentEffectiveTheme =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? 'dark'
      : themePreference === 'dark'
        ? 'dark'
        : 'light';

  const toggleTheme = () => {
    onThemeChange(currentEffectiveTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="console-header">
      {/* 页面标题 */}
      <div className="header-left">
        <span className="header-title">{pageTitle}</span>
        {pageSubtitle ? <span className="header-subtitle">{pageSubtitle}</span> : null}
      </div>

      {/* 全局命令与搜索栏 */}
      <div className="header-center">
        <button
          type="button"
          className="header-search-btn"
          onClick={onOpenSearch}
          title="搜索 API、模型、日志、快捷操作 (Ctrl+K)"
        >
          <Search size={14} className="search-icon" aria-hidden="true" />
          <span>搜索 API、模型、日志、快捷操作...</span>
          <span className="kbd-badge">Ctrl+K</span>
        </button>
      </div>

      {/* 右侧操作区 */}
      <div className="header-right">
        {/* 网关在线运行状态 */}
        <div className={`header-status-pill ${coreRunning ? 'online' : ''}`}>
          <div className={`status-pulse-dot ${coreRunning ? 'online' : 'offline'}`} />
          <span>{coreRunning ? '网关运行中 · 127.0.0.1:8317' : '网关服务已离线'}</span>
        </div>

        {/* 深浅主题切换 */}
        <button
          type="button"
          className="header-action-btn"
          onClick={toggleTheme}
          title={themePreference === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
          aria-label="切换主题"
        >
          {themePreference === 'dark' ? (
            <Sun size={15} aria-hidden="true" />
          ) : (
            <Moon size={15} aria-hidden="true" />
          )}
        </button>

        {/* 社区技术交流 */}
        <button
          type="button"
          className="header-action-btn"
          onClick={onOpenContact}
          title="QQ 群技术交流与问题反馈"
          aria-label="技术交流"
        >
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
