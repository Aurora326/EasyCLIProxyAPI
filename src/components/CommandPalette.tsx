import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Bot,
  Command,
  CornerDownLeft,
  FileCode,
  Globe,
  History,
  House,
  LogIn,
  Moon,
  Network,
  PackageOpen,
  Power,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { ThemePreference } from '../theme';

export type CommandAction = {
  id: string;
  title: string;
  subtitle?: string;
  category: 'navigation' | 'actions';
  icon: typeof House;
  keywords?: string[];
  run: () => void | Promise<void>;
};

type CommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (pageId: string) => void;
  onRunCoreCommand: (cmd: 'start_core_process' | 'stop_core_process' | 'restart_core_process') => void;
  coreRunning: boolean;
  onCopyApiUrl: (type: 'openai' | 'claude' | 'gemini') => void;
  currentTheme: ThemePreference;
  onSetTheme: (theme: ThemePreference) => void;
};

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onRunCoreCommand,
  coreRunning,
  onCopyApiUrl,
  currentTheme,
  onSetTheme,
}: CommandPaletteProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 构造所有可执行的指令列表
  const allCommands = useMemo<CommandAction[]>(() => {
    return [
      // 导航类
      {
        id: 'nav-home',
        title: t('app.nav.home'),
        subtitle: '跳转至首页运行控制',
        category: 'navigation',
        icon: House,
        keywords: ['home', 'shouye', '控制台', '首页'],
        run: () => onNavigate('home'),
      },
      {
        id: 'nav-api',
        title: t('app.nav.api'),
        subtitle: '跳转至 Provider 与 API 接入管理',
        category: 'navigation',
        icon: Network,
        keywords: ['api', 'provider', '接入', 'jieru'],
        run: () => onNavigate('api'),
      },
      {
        id: 'nav-playground',
        title: t('app.nav.playground'),
        subtitle: '跳转至模型极速测试舱 (Playground)',
        category: 'navigation',
        icon: Zap,
        keywords: ['playground', 'test', 'ceshi', '测试', '对话', '流式'],
        run: () => onNavigate('playground'),
      },
      {
        id: 'nav-oauth',
        title: t('app.nav.oauth'),
        subtitle: '跳转至 OAuth 账号授权管理',
        category: 'navigation',
        icon: LogIn,
        keywords: ['oauth', 'shouquan', '授权', '账号'],
        run: () => onNavigate('oauth'),
      },
      {
        id: 'nav-agents',
        title: t('app.nav.agents'),
        subtitle: '跳转至智能体客户端配置',
        category: 'navigation',
        icon: Bot,
        keywords: ['agent', 'zhinengti', '智能体', 'claude', 'codex'],
        run: () => onNavigate('agents'),
      },
      {
        id: 'nav-usage',
        title: t('app.nav.usageRecords'),
        subtitle: '跳转至使用记录与 Token 统计',
        category: 'navigation',
        icon: History,
        keywords: ['usage', 'records', 'token', 'shiyong', '记录', '统计'],
        run: () => onNavigate('usage-records'),
      },
      {
        id: 'nav-config',
        title: t('app.nav.config'),
        subtitle: '跳转至高级设置与规则配置',
        category: 'navigation',
        icon: Settings,
        keywords: ['config', 'settings', 'gaoji', '设置', '配置'],
        run: () => onNavigate('config'),
      },
      {
        id: 'nav-versions',
        title: t('app.nav.versions'),
        subtitle: '跳转至版本与内核更新管理',
        category: 'navigation',
        icon: PackageOpen,
        keywords: ['version', 'update', 'banben', '版本', '更新'],
        run: () => onNavigate('versions'),
      },

      // 快捷操作类
      {
        id: 'action-copy-openai',
        title: t('commandPalette.copyOpenAiUrl'),
        subtitle: '一键复制本地 OpenAI 兼容端点',
        category: 'actions',
        icon: FileCode,
        keywords: ['openai', 'copy', 'fuzhi', 'url', '地址'],
        run: () => onCopyApiUrl('openai'),
      },
      {
        id: 'action-copy-claude',
        title: t('commandPalette.copyClaudeUrl'),
        subtitle: '一键复制本地 Claude 兼容端点',
        category: 'actions',
        icon: FileCode,
        keywords: ['claude', 'copy', 'fuzhi', 'url', '地址'],
        run: () => onCopyApiUrl('claude'),
      },
      {
        id: 'action-copy-gemini',
        title: t('commandPalette.copyGeminiUrl'),
        subtitle: '一键复制本地 Gemini 兼容端点',
        category: 'actions',
        icon: FileCode,
        keywords: ['gemini', 'copy', 'fuzhi', 'url', '地址'],
        run: () => onCopyApiUrl('gemini'),
      },
      {
        id: 'action-toggle-core',
        title: coreRunning ? t('commandPalette.stopCore') : t('commandPalette.startCore'),
        subtitle: coreRunning ? '停止当前正在运行的内核进程' : '拉起本地 CLIProxyAPI 内核服务',
        category: 'actions',
        icon: Power,
        keywords: ['core', 'start', 'stop', 'restart', 'qidong', 'guanbi', '启动', '关闭'],
        run: () => onRunCoreCommand(coreRunning ? 'stop_core_process' : 'start_core_process'),
      },
      {
        id: 'action-restart-core',
        title: t('commandPalette.restartCore'),
        subtitle: '重新拉起本地内核以重新加载所有设置',
        category: 'actions',
        icon: RefreshCw,
        keywords: ['restart', 'chongqi', '重启'],
        run: () => onRunCoreCommand('restart_core_process'),
      },
      {
        id: 'action-theme-light',
        title: t('commandPalette.themeLight'),
        subtitle: '切换界面为明亮高对比度风格',
        category: 'actions',
        icon: Sun,
        keywords: ['light', 'theme', 'baise', '浅色', '日间'],
        run: () => onSetTheme('light'),
      },
      {
        id: 'action-theme-dark',
        title: t('commandPalette.themeDark'),
        subtitle: '切换界面为护眼深色极客风格',
        category: 'actions',
        icon: Moon,
        keywords: ['dark', 'theme', 'heise', '深色', '夜间'],
        run: () => onSetTheme('dark'),
      },
    ];
  }, [t, onNavigate, onCopyApiUrl, coreRunning, onRunCoreCommand, onSetTheme]);

  // 根据 query 进行模糊搜索匹配
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter((cmd) => {
      if (cmd.title.toLowerCase().includes(q)) return true;
      if (cmd.subtitle?.toLowerCase().includes(q)) return true;
      if (cmd.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [allCommands, query]);

  // 弹窗打开时重置状态并聚焦
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // 边界保护
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(0);
    }
  }, [filteredCommands.length, selectedIndex]);

  // 快捷键上下选择与回车触发
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev <= 0 ? Math.max(0, filteredCommands.length - 1) : prev - 1,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filteredCommands[selectedIndex];
      if (current) {
        onClose();
        void current.run();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="cmd-palette-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="cmd-palette-modal">
        <div className="cmd-palette-search-box">
          <Search size={18} className="cmd-palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-search-input"
            placeholder={t('commandPalette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="icon-button"
            style={{ width: 24, height: 24, padding: 0 }}
            onClick={onClose}
            title="关闭"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="cmd-palette-list" ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--clean-text-muted)', fontSize: 13 }}>
              {t('commandPalette.noResults')}
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  className={`cmd-palette-item ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    onClose();
                    void cmd.run();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="cmd-palette-item-icon">
                    <Icon size={16} aria-hidden="true" />
                  </div>
                  <div className="cmd-palette-item-content">
                    <span className="cmd-palette-item-title">{cmd.title}</span>
                    {cmd.subtitle ? (
                      <span className="cmd-palette-item-subtitle">{cmd.subtitle}</span>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <CornerDownLeft size={13} style={{ color: 'var(--clean-primary)' }} aria-hidden="true" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="cmd-palette-footer">
          <div className="cmd-palette-shortcuts-hint">
            <span>
              <span className="cmd-kbd-badge">↑</span> <span className="cmd-kbd-badge">↓</span> 选择
            </span>
            <span>
              <span className="cmd-kbd-badge">↵</span> 确认
            </span>
            <span>
              <span className="cmd-kbd-badge">ESC</span> 关闭
            </span>
          </div>
          <span>EasyCLIProxyAPI</span>
        </div>
      </div>
    </div>
  );
}
