import { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Moon,
  Power,
  Search,
  Sun,
} from 'lucide-react';
import type { ThemePreference } from '../theme';

interface ConsoleHeaderProps {
  pageTitle: string;
  pageSubtitle?: string;
  onOpenSearch: () => void;
  coreRunning: boolean;
  corePort?: number;
  onToggleCore?: () => void;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onOpenContact: () => void;
}

export function ConsoleHeader({
  pageTitle,
  pageSubtitle,
  onOpenSearch,
  coreRunning,
  corePort = 8317,
  onToggleCore,
  themePreference,
  onThemeChange,
  onOpenContact,
}: ConsoleHeaderProps) {
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const currentEffectiveTheme =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? 'dark'
      : themePreference === 'dark'
        ? 'dark'
        : 'light';

  const toggleTheme = () => {
    onThemeChange(currentEffectiveTheme === 'dark' ? 'light' : 'dark');
  };

  const handleCopyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(`http://127.0.0.1:${corePort}/v1`);
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 1800);
    } catch {
      // 忽略复制异常
    }
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
        {/* 可交互网关运行状态与快捷控制胶囊 */}
        <div
          className={`header-status-pill ${coreRunning ? 'online' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            paddingRight: onToggleCore ? 4 : 10,
          }}
        >
          <button
            type="button"
            onClick={() => void handleCopyEndpoint()}
            title="点击复制本地网关 OpenAI 兼容端点 (http://127.0.0.1:端口/v1)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'inherit',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              cursor: 'pointer',
            }}
          >
            <div className={`status-pulse-dot ${coreRunning ? 'online' : 'offline'}`} />
            <span>
              {copiedEndpoint
                ? '已复制网关地址'
                : coreRunning
                  ? `127.0.0.1:${corePort}`
                  : '网关未启动'}
            </span>
            {copiedEndpoint ? (
              <Check size={12} style={{ opacity: 0.9 }} />
            ) : (
              <Copy size={11} style={{ opacity: 0.6 }} />
            )}
          </button>

          {onToggleCore && (
            <button
              type="button"
              onClick={onToggleCore}
              title={coreRunning ? '点击停止网关内核' : '点击一键启动网关内核'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 999,
                border: 'none',
                background: coreRunning ? 'rgba(16, 185, 129, 0.16)' : 'rgba(37, 99, 235, 0.14)',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                marginLeft: 2,
              }}
            >
              <Power size={11} />
            </button>
          )}
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
      </div>
    </header>
  );
}
