import { MessageNotice } from './appNotice';
import { useEffect, useRef, useState, useMemo } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Activity,
  Bot,
  Check,
  Cpu,
  ExternalLink,
  History,
  House,
  KeyRound,
  Layers,
  LineChart,
  Lock,
  LogIn,
  MessageCircle,
  Network,
  PackageOpen,
  Route,
  Search,
  ServerCog,
  Settings,
  ShieldCheck,
  Sliders,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import appLogo from './assets/logo.jpg';
import { CommandPalette } from './components/CommandPalette';
import { ConsoleSidebar } from './components/ConsoleSidebar';
import { ConsoleHeader } from './components/ConsoleHeader';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
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
import { ThinkingAliasesPage } from './pages/ThinkingAliasesPage';
import { useI18n } from './i18n';
import { AppUpdateDialog, AppUpdateProvider, useAppUpdate } from './appUpdate';
import { appUpdateIndicatorState } from './appUpdateModel';
import { canOpenAppPage, isAlwaysAvailablePage } from './navigation';
import { useThemePreference } from './theme';
import { useQuotaAutoRefresh } from './services/quotaAutoRefresh';

const CONTACT_URL = 'https://qm.qq.com/q/3queDaIG';

type WindowsCloseAction = 'exit' | 'minimize-to-tray';
type WindowsCloseBehavior = 'ask' | WindowsCloseAction;

type WindowsClosePrompt = {
  resolvingAction: WindowsCloseAction | null;
  rememberChoice: boolean;
  error: string | null;
};

type GuiSettings = {
  closeBehavior: WindowsCloseBehavior;
  port?: number;
};

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
  const [active, setActive] = useState<string>('overview');
  const [theme, setTheme] = useThemePreference();
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [windowsClosePrompt, setWindowsClosePrompt] = useState<WindowsClosePrompt | null>(null);
  const [corePort, setCorePort] = useState(8317);
  const closeDialogRef = useRef<HTMLElement>(null);
  const { status, refreshStatus } = useCoreRuntime();
  const coreRunning = Boolean(status?.running);
  useQuotaAutoRefresh(coreRunning);

  useEffect(() => {
    if (isTauri()) {
      void invoke<{ port: number }>('get_gui_settings')
        .then((settings) => {
          if (settings.port) setCorePort(settings.port);
        })
        .catch(() => undefined);
    }
  }, []);

  // 全局快捷键监听：Ctrl+K 打开命令面板
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    let port = corePort;
    let url = `http://127.0.0.1:${port}`;
    if (type === 'openai') url += '/v1';
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  };

  useEffect(() => {
    if (!canOpenAppPage(active, coreRunning)) {
      setActive('overview');
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

  const select = (pageId: string) => {
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

  // 页面元信息配置 (全中文沉浸式设计)
  const pageMeta = useMemo(() => {
    switch (active) {
      case 'overview':
      case 'home':
        return { title: 'AI 网关指挥中心' };
      case 'api':
        return { title: 'API 接入配置' };
      case 'providers':
        return { title: '供应商集群管理' };
      case 'routes':
        return { title: '路由转发配置' };
      case 'models':
        return { title: '模型清单列表' };
      case 'model-mapping':
        return { title: '模型别名映射' };
      case 'playground':
        return { title: '极速模型调试舱' };
      case 'logs':
      case 'traffic':
      case 'errors':
        return { title: '全量调用日志与用量统计' };
      case 'api-keys':
        return { title: 'API 密钥凭据管理' };
      case 'oauth':
        return { title: 'OAuth 授权凭据' };
      case 'permissions':
        return { title: '安全访问权限' };
      case 'smart-config':
        return { title: '智能体一键托管' };
      case 'config':
        return { title: '高级核心设置' };
      case 'versions':
        return { title: '版本与组件更新' };
      case 'usage-records':
        return { title: '用量与配额账单' };
      default:
        return { title: 'EasyCLIProxyAPI', subtitle: 'AI 网关 · 开发者控制台' };
    }
  }, [active]);

  // 渲染当前页面视图
  const renderCurrentView = () => {
    switch (active) {
      case 'overview':
      case 'home':
        return <CommandCenterPage onNavigate={select} />;
      case 'api':
        return <ApiAccessPage />;
      case 'providers':
        return <ProvidersPage />;
      case 'routes':
      case 'model-mapping':
        return <ThinkingAliasesPage />;
      case 'models':
        return <ApiAccessPage />;
      case 'playground':
        return <PlaygroundPage />;
      case 'logs':
      case 'traffic':
      case 'errors':
      case 'usage-records':
        return <UsageRecordsPage />;
      case 'api-keys':
        return <ApiKeysPage />;
      case 'oauth':
        return <OAuthManagementPage />;
      case 'permissions':
        return <ConfigPanelPage />;
      case 'smart-config':
        return <AgentsPage />;
      case 'config':
        return <ConfigPanelPage />;
      case 'versions':
        return <VersionManagementPage />;
      case 'easy':
        return (
          <EasyModePage
            onExit={() => select('overview')}
            theme={theme}
            setTheme={setTheme}
            locale={locale}
            setLocale={setLocale}
          />
        );
      default:
        return <CommandCenterPage onNavigate={select} />;
    }
  };

  return (
    <>
      <div className="console-shell">
        {active !== 'easy' ? (
          <ConsoleSidebar
            activeId={active}
            onSelect={select}
            coreRunning={coreRunning}
            corePort={corePort}
          />
        ) : null}

        <div className="console-workspace">
          {active !== 'easy' ? (
            <ConsoleHeader
              pageTitle={pageMeta.title}
              pageSubtitle={pageMeta.subtitle}
              onOpenSearch={() => setCmdPaletteOpen(true)}
              coreRunning={coreRunning}
              themePreference={theme}
              onThemeChange={setTheme}
              onOpenContact={() => void openContact()}
            />
          ) : null}

          <main className="console-main-content">
            {isAlwaysAvailablePage(active) || coreRunning ? (
              renderCurrentView()
            ) : (
              <CoreLockedPage />
            )}
          </main>
        </div>
      </div>

      {/* 命令面板 Ctrl+K */}
      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onNavigate={(pageId) => {
          select(pageId);
          setCmdPaletteOpen(false);
        }}
        onRunCoreCommand={handleRunCoreCommand}
        coreRunning={coreRunning}
        onCopyApiUrl={handleCopyApiUrl}
        currentTheme={theme}
        onSetTheme={setTheme}
      />

      {/* Windows 关闭确认弹窗 */}
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
            <p id="close-dialog-description">{t('app.close.description')}</p>
            {windowsClosePrompt.error ? (
              <MessageNotice
                message={windowsClosePrompt.error}
                onDismiss={() =>
                  setWindowsClosePrompt((current) =>
                    current ? { ...current, error: null } : current
                  )
                }
              />
            ) : null}
            <label className="close-dialog-remember">
              <input
                type="checkbox"
                checked={windowsClosePrompt.rememberChoice}
                disabled={windowsClosePrompt.resolvingAction !== null}
                onChange={(event) => {
                  const rememberChoice = event.currentTarget.checked;
                  setWindowsClosePrompt((current) =>
                    current ? { ...current, rememberChoice } : current
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
