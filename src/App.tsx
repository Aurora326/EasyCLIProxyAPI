import { MessageNotice } from './appNotice';
import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Bot,
  Check,
  ExternalLink,
  History,
  House,
  Lock,
  LogIn,
  MessageCircle,
  Network,
  PackageOpen,
  Search,
  ServerCog,
  Settings,
  X,
  Zap,
} from 'lucide-react';
import appLogo from './assets/logo.jpg';
import { CommandPalette } from './components/CommandPalette';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { CoreRuntimeProvider, useCoreRuntime } from './coreRuntime';
import { CoreUpdateProvider, useCoreUpdate } from './coreUpdate';
import { ConfigPanelPage } from './pages/ConfigPanel';
import { ApiAccessPage } from './pages/ApiAccessPage';
import { KernelPage } from './pages/Kernel';
import { VersionManagementPage } from './pages/VersionManagementPage';
import { OAuthManagementPage } from './pages/ManagementPages';
import { AgentsPage } from './pages/AgentsPage';
import { EasyModePage } from './pages/EasyModePage';
import { UsageRecordsPage } from './pages/UsageRecordsPage';
import { useI18n } from './i18n';
import { AppUpdateDialog, AppUpdateProvider, useAppUpdate } from './appUpdate';
import { appUpdateIndicatorState } from './appUpdateModel';
import { canOpenAppPage, isAlwaysAvailablePage } from './navigation';
import { useThemePreference } from './theme';
import { useQuotaAutoRefresh } from './services/quotaAutoRefresh';

const CONTACT_URL = 'https://qm.qq.com/q/3queDaIG';

const pages = [
  {
    id: 'easy',
    labelKey: 'app.nav.easy',
    icon: House,
    component: HomePage,
  },
  {
    id: 'home',
    labelKey: 'app.nav.home',
    icon: House,
    component: HomePage,
  },
  {
    id: 'api',
    labelKey: 'app.nav.api',
    icon: Network,
    component: ApiAccessPage,
  },
  {
    id: 'playground',
    labelKey: 'app.nav.playground',
    icon: Zap,
    component: PlaygroundPage,
  },
  {
    id: 'oauth',
    labelKey: 'app.nav.oauth',
    icon: LogIn,
    component: OAuthManagementPage,
  },
  {
    id: 'agents',
    labelKey: 'app.nav.agents',
    icon: Bot,
    component: AgentsPage,
  },
  {
    id: 'usage-records',
    labelKey: 'app.nav.usageRecords',
    icon: History,
    component: UsageRecordsPage,
  },
  {
    id: 'config',
    labelKey: 'app.nav.config',
    icon: Settings,
    component: ConfigPanelPage,
  },
  {
    id: 'versions',
    labelKey: 'app.nav.versions',
    icon: PackageOpen,
    component: VersionManagementPageWrapper,
  },
] as const;

type PageId = (typeof pages)[number]['id'];
type WindowsCloseAction = 'exit' | 'minimize-to-tray';
type WindowsCloseBehavior = 'ask' | WindowsCloseAction;

type WindowsClosePrompt = {
  resolvingAction: WindowsCloseAction | null;
  rememberChoice: boolean;
  error: string | null;
};

type GuiSettings = {
  closeBehavior: WindowsCloseBehavior;
};

function HomePage() {
  return <KernelPage view="home" />;
}

function VersionManagementPageWrapper() {
  return <VersionManagementPage />;
}

function App() {
  return (
    <AppUpdateProvider>
      <CoreRuntimeProvider>
        <CoreUpdateProvider>
          <AppContent />
        </CoreUpdateProvider>
      </CoreRuntimeProvider>
    </AppUpdateProvider>
  );
}

function AppContent() {
  const { locale, setLocale, t } = useI18n();
  const { info: appUpdateInfo, hasUpdate, processing: appUpdateProcessing } = useAppUpdate();
  const { latest: coreLatest, hasUpdate: coreHasUpdate } = useCoreUpdate();
  const [active, setActive] = useState<PageId>('home');
  const [theme, setTheme] = useThemePreference();
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [windowsClosePrompt, setWindowsClosePrompt] = useState<WindowsClosePrompt | null>(null);
  const closeDialogRef = useRef<HTMLElement>(null);
  const { status, refreshStatus } = useCoreRuntime();
  const coreRunning = Boolean(status?.running);
  useQuotaAutoRefresh(coreRunning);

  // 全局快捷键监听：Ctrl+K 打开命令面板，Ctrl+1~7 快速切页
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        const num = Number.parseInt(event.key, 10);
        if (num >= 1 && num <= 7) {
          const navPages = pages.filter((p) => p.id !== 'easy');
          const targetPage = navPages[num - 1];
          if (targetPage && canOpenAppPage(targetPage.id, coreRunning)) {
            event.preventDefault();
            setActive(targetPage.id);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [coreRunning]);

  const handleRunCoreCommand = async (cmd: 'start_core_process' | 'stop_core_process' | 'restart_core_process') => {
    try {
      if (isTauri()) {
        await invoke(cmd);
      }
      await refreshStatus();
    } catch (e) {
      console.error('执行内核命令失败', e);
    }
  };

  const handleCopyApiUrl = async (type: 'openai' | 'claude' | 'gemini') => {
    let port = 8317;
    try {
      if (isTauri()) {
        const settings = await invoke<{ port: number }>('get_gui_settings');
        if (settings.port) port = settings.port;
      }
    } catch {}
    let url = `http://127.0.0.1:${port}`;
    if (type === 'openai') url += '/v1';
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  };
  const activePage = pages.find((page) => page.id === active) ?? pages[0];
  const ActivePage = activePage.component;
  const availableUpdateLabel = [
    hasUpdate
      ? t('appUpdate.badgeAvailable', { version: appUpdateInfo?.latestVersion ?? '' })
      : '',
    coreHasUpdate
      ? `${t('kernel.versions.coreCardTitle')}: ${t('kernel.update.available')} ${coreLatest?.version ?? ''}`.trim()
      : '',
  ].filter(Boolean).join(' · ');
  useEffect(() => {
    if (!canOpenAppPage(active, coreRunning)) {
      setActive('home');
    }
  }, [active, coreRunning]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;

    const handleWindowsCloseRequest = async () => {
      try {
        const settings = await invoke<GuiSettings>('get_gui_settings');
        if (settings.closeBehavior !== 'ask') {
          await resolveWindowsCloseRequest(settings.closeBehavior, false);
          return;
        }
      } catch (error) {
        console.error('读取关闭行为设置失败', error);
      }

      setWindowsClosePrompt((current) =>
        current ?? {
          resolvingAction: null,
          rememberChoice: false,
          error: null,
        },
      );
    };

    if (isTauri()) {
      void listen('windows-close-requested', () => {
        void handleWindowsCloseRequest();
      })
        .then((stop) => {
          if (disposed) {
            stop();
          } else {
            stopListening = stop;
          }
        })
        .catch((error) => {
          console.error('监听 Windows 关闭确认事件失败', error);
        });
    }

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  useEffect(() => {
    if (!windowsClosePrompt || windowsClosePrompt.resolvingAction) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      closeDialogRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [windowsClosePrompt]);

  const select = (pageId: PageId) => {
    if (!canOpenAppPage(pageId, coreRunning)) {
      return;
    }
    setActive(pageId);
  };

  const openContact = async () => {
    try {
      if (!isTauri()) {
        window.open(CONTACT_URL, '_blank');
        return;
      }
      await invoke('open_external_url', { url: CONTACT_URL });
    } catch (error) {
      console.error('打开联系我们链接失败', error);
    }
  };

  const resolveWindowsCloseRequest = async (
    action: WindowsCloseAction,
    remember = windowsClosePrompt?.rememberChoice ?? false,
  ) => {
    setWindowsClosePrompt((current) =>
      current
        ? {
            ...current,
            resolvingAction: action,
            error: null,
          }
        : current,
    );

    try {
      await invoke('resolve_windows_close_request', { action, remember });
      setWindowsClosePrompt(null);
    } catch (error) {
      setWindowsClosePrompt((current) =>
        current
          ? {
              ...current,
              resolvingAction: null,
              error: error instanceof Error ? error.message : String(error),
            }
          : {
              resolvingAction: null,
              rememberChoice: false,
              error: error instanceof Error ? error.message : String(error),
            },
      );
    }
  };

  return (
    <>
      <div className={`app-shell${active === "easy" ? " app-shell-easy-mode" : ""}`}>
        {active !== "easy" ? (
          <aside className="sidebar">
          <div className="sidebar-brand" title={t('app.desktopConsole')}>
            <img src={appLogo} alt="" className="brand-mark brand-logo" width={36} height={36} />
            <div>
              <strong>EasyCLIProxyAPI</strong>
              <span>{t('app.desktopConsole')}</span>
            </div>
          </div>

          <nav className="nav-section" aria-label={t('app.navigation')}>
            {pages.filter((page) => page.id !== 'easy').map((page) => {
              const Icon = page.icon;
              const locked = !canOpenAppPage(page.id, coreRunning);
              const updateIndicator = page.id === 'versions'
                ? appUpdateIndicatorState(hasUpdate, coreHasUpdate, appUpdateProcessing)
                : null;
              return (
                <button
                  key={page.id}
                  type="button"
                  className={[
                    page.id === active ? 'active' : '',
                    locked ? 'locked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={locked}
                  title={locked ? t('app.nav.lockedHint') : undefined}
                  onClick={() => select(page.id)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{t(page.labelKey)}</span>
                  {locked ? (
                    <Lock size={13} className="nav-lock-icon" aria-hidden="true" />
                  ) : updateIndicator ? (
                    <i
                      className={`nav-update-indicator ${updateIndicator}`}
                      title={updateIndicator === 'processing'
                        ? t('appUpdate.progressTitle')
                        : availableUpdateLabel}
                      aria-label={updateIndicator === 'processing'
                        ? t('appUpdate.progressTitle')
                        : availableUpdateLabel}
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-bottom">
            <div
              className="sidebar-theme-selector"
              role="group"
              aria-label={t('app.theme.label')}
            >
              <button
                type="button"
                className={theme === 'light' ? 'active' : ''}
                aria-pressed={theme === 'light'}
                title={t('app.theme.switchToLight')}
                onClick={() => setTheme('light')}
              >
                {t('app.theme.light')}
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'active' : ''}
                aria-pressed={theme === 'dark'}
                title={t('app.theme.switchToDark')}
                onClick={() => setTheme('dark')}
              >
                {t('app.theme.dark')}
              </button>
              <button
                type="button"
                className={theme === 'system' ? 'active' : ''}
                aria-pressed={theme === 'system'}
                title={t('app.theme.switchToSystem')}
                onClick={() => setTheme('system')}
              >
                {t('app.theme.system')}
              </button>
            </div>
            <button
              type="button"
              className="sidebar-contact"
              title={t('app.contact.title')}
              onClick={() => void openContact()}
            >
              <MessageCircle size={16} aria-hidden="true" />
              <span>{t('app.contact.label')}</span>
              <ExternalLink size={13} aria-hidden="true" />
            </button>
          </div>
          </aside>
        ) : null}

        <div className="workspace">
          {active !== 'easy' ? (
            <header className="apple-toolbar">
              <div className="apple-toolbar-title-group">
                <span className="apple-toolbar-title">{t(activePage.labelKey)}</span>
                <span className="apple-toolbar-badge">EasyCLIProxyAPI</span>
              </div>
              <div className="apple-toolbar-actions">
                <button
                  type="button"
                  className="toolbar-cmd-trigger"
                  onClick={() => setCmdPaletteOpen(true)}
                  title={t('commandPalette.triggerTip')}
                >
                  <Search size={13} aria-hidden="true" />
                  <span>{t('commandPalette.placeholder').split('(')[0].trim()}</span>
                  <span className="cmd-kbd-badge">Ctrl+K</span>
                </button>
                <span className={`state-pill ${coreRunning ? 'success' : 'neutral'}`}>
                  <span className={`status-beacon-dot ${coreRunning ? 'running' : 'stopped'}`} aria-hidden="true" />
                  <span>{coreRunning ? t('kernel.status.running') : t('kernel.control.notRunning')}</span>
                </span>
              </div>
            </header>
          ) : null}
          <main className="content">
            {isAlwaysAvailablePage(activePage.id) || coreRunning ? (
              activePage.id === 'easy' ? (
                <EasyModePage
                  onExit={() => select('home')}
                  theme={theme}
                  setTheme={setTheme}
                  locale={locale}
                  setLocale={setLocale}
                />
              ) : (
                <ActivePage />
              )
            ) : (
              <CoreLockedPage />
            )}
          </main>
        </div>
      </div>

      {windowsClosePrompt ? (
        <div className="close-dialog-backdrop">
          <section
            ref={closeDialogRef}
            className="close-dialog"
            role="alertdialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="close-dialog-title"
            aria-describedby="close-dialog-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
              }
            }}
          >
            <button
              type="button"
              className="close-dialog-dismiss"
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
              disabled={windowsClosePrompt.resolvingAction !== null}
              onClick={() => setWindowsClosePrompt(null)}
            >
              <X size={17} aria-hidden="true" />
            </button>
            <div className="close-dialog-heading">
              <h2 id="close-dialog-title">{t('app.close.title')}</h2>
            </div>
            <p id="close-dialog-description">
              {t('app.close.description')}
            </p>
            {windowsClosePrompt.error ? (
              <MessageNotice message={windowsClosePrompt.error} onDismiss={() => setWindowsClosePrompt(current => current ? { ...current, error: null } : current)} />
            ) : null}
            <label className="close-dialog-remember">
              <input
                type="checkbox"
                checked={windowsClosePrompt.rememberChoice}
                disabled={windowsClosePrompt.resolvingAction !== null}
                onChange={(event) => {
                  const rememberChoice = event.currentTarget.checked;
                  setWindowsClosePrompt((current) =>
                    current ? { ...current, rememberChoice } : current,
                  );
                }}
              />
              <span>{t('app.close.remember')}</span>
            </label>
            <div className="close-dialog-actions">
              <button
                type="button"
                className="close-choice-button primary-button"
                disabled={windowsClosePrompt.resolvingAction !== null}
                onClick={() => void resolveWindowsCloseRequest('minimize-to-tray')}
              >
                <span>
                  {windowsClosePrompt.resolvingAction === 'minimize-to-tray'
                    ? t('app.close.minimizing')
                    : t('app.close.minimize')}
                </span>
              </button>
              <button
                type="button"
                className="close-choice-button danger-button"
                disabled={windowsClosePrompt.resolvingAction !== null}
                onClick={() => void resolveWindowsCloseRequest('exit')}
              >
                <span>
                  {windowsClosePrompt.resolvingAction === 'exit'
                    ? t('app.close.exiting')
                    : t('app.close.exit')}
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <AppUpdateDialog />
      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onNavigate={(pageId) => select(pageId as PageId)}
        onRunCoreCommand={handleRunCoreCommand}
        coreRunning={coreRunning}
        onCopyApiUrl={handleCopyApiUrl}
        currentTheme={theme}
        onSetTheme={setTheme}
      />
    </>
  );
}

function CoreLockedPage() {
  const { t } = useI18n();
  return (
    <section className="page core-locked-page">
      <div className="empty-state core-locked-panel">
        <ServerCog size={26} aria-hidden="true" />
        <strong>{t('app.coreRequired.title')}</strong>
        <span>{t('app.coreRequired.description')}</span>
      </div>
    </section>
  );
}

export default App;
