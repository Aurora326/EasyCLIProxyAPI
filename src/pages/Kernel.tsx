import { useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Terminal,
} from 'lucide-react';
import { type CoreStatus, useCoreRuntime } from '../coreRuntime';
import openaiIcon from '../assets/icons/openai-light.svg';
import claudeIcon from '../assets/icons/claude.svg';
import geminiIcon from '../assets/icons/gemini.svg';
import { clientApiProfiles } from '../services/clientAccess';
import { useI18n } from '../i18n';
import { useAppUpdate } from '../appUpdate';
import { FloatingNotice, useAppNotice } from '../appNotice';
import { VersionManagementPage, displayAppVersion } from './VersionManagementPage';

type CoreProcessCommand = 'start_core_process' | 'stop_core_process' | 'restart_core_process';

type GuiSettings = {
  host: string;
  port: number;
  runOnStartup: boolean;
};

type CoreConfigSummary = {
  apiKeys: Array<{ apiKey: string }>;
};

type CoreTlsSettings = {
  enabled: boolean;
  cert: string;
  key: string;
};

export type KernelView = 'home' | 'versions';

export function KernelPage({ view = 'home' }: { view?: KernelView }) {
  if (view === 'versions') {
    return <VersionManagementPage />;
  }

  const { t } = useI18n();
  const { info: appUpdate } = useAppUpdate();
  const {
    status: coreStatus,
    statusError,
    refreshStatus,
    publishStatus,
  } = useCoreRuntime();

  const [installedAppVersion, setInstalledAppVersion] = useState('');
  const [listenHost, setListenHost] = useState('127.0.0.1');
  const [customPort, setCustomPort] = useState('8317');
  const [processBusy, setProcessBusy] = useState(false);
  const processFeedback = useAppNotice();
  const { showNotice: showProcessNotice, clearNotice: clearProcessNotice } = processFeedback;
  const copyFeedback = useAppNotice();
  const [copiedApiField, setCopiedApiField] = useState('');
  const [homeApiKey, setHomeApiKey] = useState<string | null | undefined>(undefined);
  const [homeApiKeyError, setHomeApiKeyError] = useState(false);
  const [showHomeApiKey, setShowHomeApiKey] = useState(false);
  const [tlsEnabled, setTlsEnabled] = useState(false);
  const [snippetProto, setSnippetProto] = useState<'openai' | 'claude' | 'gemini'>('openai');
  const [snippetLang, setSnippetLang] = useState<'curl' | 'python' | 'node' | 'env'>('curl');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const savedPortRef = useRef(8317);
  const copiedApiTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlistenConfig: (() => void) | null = null;

    if (isTauri()) {
      void listen('config-files-changed', () => {
        if (disposed) return;
        void loadGuiSettings();
        void loadTlsSettings();
        void refreshStatus();
        void loadHomeApiKey();
      }).then((stop) => {
        if (disposed) stop();
        else unlistenConfig = stop;
      });
    }

    loadGuiSettings();
    void loadTlsSettings();
    if (isTauri()) {
      void getVersion()
        .then((version) => {
          if (!disposed) setInstalledAppVersion(version);
        })
        .catch(() => undefined);
    } else {
      setInstalledAppVersion('v0.2.96-anime');
    }
    void loadHomeApiKey();

    return () => {
      disposed = true;
      unlistenConfig?.();
      if (copiedApiTimerRef.current !== null) {
        window.clearTimeout(copiedApiTimerRef.current);
      }
    };
  }, []);

  const runCoreProcessCommand = async (command: CoreProcessCommand) => {
    const actionLabel =
      command === 'start_core_process'
        ? t('kernel.action.start')
        : command === 'stop_core_process'
          ? t('kernel.action.stop')
          : t('kernel.action.restart');
    setProcessBusy(true);
    clearProcessNotice();

    try {
      if (!isTauri()) {
        showProcessNotice({ key: 'kernel.notice.restarted' }, 'success');
        return true;
      }
      const result = await invoke<CoreStatus>(command);
      publishStatus(result);
      if (command === 'restart_core_process') {
        showProcessNotice({ key: 'kernel.notice.restarted' }, 'success');
      }
      return true;
    } catch (error) {
      const errorMessage = String(error);
      await refreshStatus();
      showProcessNotice(
        { key: 'kernel.notice.actionFailed', variables: { action: actionLabel, error: errorMessage } },
        'error',
      );
      return false;
    } finally {
      setProcessBusy(false);
    }
  };

  const loadGuiSettings = async () => {
    if (!isTauri()) return;
    try {
      const settings = await invoke<GuiSettings>('get_gui_settings');
      setListenHost(settings.host);
      setCustomPort(String(settings.port));
      savedPortRef.current = settings.port;
    } catch {}
  };

  const loadHomeApiKey = async () => {
    try {
      if (!isTauri()) {
        setHomeApiKey('leezhi');
        setHomeApiKeyError(false);
        return;
      }
      const settings = await invoke<CoreConfigSummary>('get_core_config_settings');
      setHomeApiKey(settings.apiKeys[0]?.apiKey ?? null);
      setHomeApiKeyError(false);
    } catch {
      setHomeApiKey(undefined);
      setHomeApiKeyError(true);
    }
  };

  const loadTlsSettings = async () => {
    try {
      const settings = await invoke<CoreTlsSettings>('get_core_tls_settings');
      setTlsEnabled(settings.enabled);
    } catch {
      setTlsEnabled(false);
    }
  };

  const copyApiValue = async (value: string, field: string) => {
    copyFeedback.clearNotice();
    try {
      await navigator.clipboard.writeText(value);
      setCopiedApiField(field);
      if (copiedApiTimerRef.current !== null) {
        window.clearTimeout(copiedApiTimerRef.current);
      }
      copiedApiTimerRef.current = window.setTimeout(() => {
        setCopiedApiField('');
        copiedApiTimerRef.current = null;
      }, 1800);
    } catch {
      copyFeedback.showNotice({ key: 'kernel.notice.copyFailed' }, 'error');
    }
  };

  const currentVersion = coreStatus?.currentVersion ?? '';
  const coreInstalled = Boolean(coreStatus?.installed);
  const coreRunning = Boolean(coreStatus?.running);
  const coreProcessBusy = processBusy || Boolean(coreStatus?.starting);

  const statusTone = statusError ? 'error' : coreRunning ? 'success' : 'neutral';
  const statusLabel = coreStatus
    ? coreRunning
      ? t('kernel.status.running')
      : coreInstalled
        ? t('kernel.status.stopped')
        : t('kernel.status.notInstalled')
    : statusError
      ? t('common.detectionFailed')
      : t('common.detecting');

  const resolvedAppVersion = appUpdate?.currentVersion || installedAppVersion;
  const currentAppVersion = resolvedAppVersion
    ? displayAppVersion(resolvedAppVersion)
    : t('common.detecting');

  const apiPort = Number(customPort);
  const apiProfiles = clientApiProfiles(
    Number.isInteger(apiPort) && apiPort >= 1 && apiPort <= 65535
      ? apiPort
      : savedPortRef.current,
    tlsEnabled,
    listenHost,
  );
  const apiProfileIcons = {
    openai: openaiIcon,
    claude: claudeIcon,
    gemini: geminiIcon,
  } as const;

  const generateSnippetCode = () => {
    const key = homeApiKey || 'YOUR_API_KEY';
    const baseUrl = apiProfiles.find((p) => p.id === snippetProto)?.baseUrl || `http://${listenHost}:${customPort}`;

    if (snippetProto === 'openai') {
      if (snippetLang === 'curl') {
        return `curl ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello world!"}]
  }'`;
      }
      if (snippetLang === 'python') {
        return `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${key}"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello world!"}]
)
print(response.choices[0].message.content)`;
      }
      if (snippetLang === 'node') {
        return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${key}",
});

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello world!" }],
});
console.log(response.choices[0].message.content);`;
      }
      if (snippetLang === 'env') {
        return `OPENAI_BASE_URL="${baseUrl}"
OPENAI_API_KEY="${key}"`;
      }
    }

    if (snippetProto === 'claude') {
      if (snippetLang === 'curl') {
        return `curl ${baseUrl}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${key}" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;
      }
      if (snippetLang === 'python') {
        return `import anthropic

client = anthropic.Anthropic(
    base_url="${baseUrl}",
    api_key="${key}"
)

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)`;
      }
      if (snippetLang === 'node') {
        return `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "${baseUrl}",
  apiKey: "${key}",
});

const message = await client.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(message.content[0].text);`;
      }
      if (snippetLang === 'env') {
        return `ANTHROPIC_BASE_URL="${baseUrl}"
ANTHROPIC_API_KEY="${key}"`;
      }
    }

    if (snippetProto === 'gemini') {
      if (snippetLang === 'curl') {
        return `curl ${baseUrl}/v1beta/models/gemini-1.5-flash:generateContent?key=${key} \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'`;
      }
      if (snippetLang === 'python') {
        return `import google.generativeai as genai

genai.configure(
    api_key="${key}",
    client_options={"api_endpoint": "${baseUrl}"}
)

model = genai.GenerativeModel("gemini-1.5-flash")
response = model.generate_content("Hello!")
print(response.text)`;
      }
      if (snippetLang === 'node') {
        return `import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("${key}");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const result = await model.generateContent("Hello!");
console.log(result.response.text());`;
      }
      if (snippetLang === 'env') {
        return `GEMINI_BASE_URL="${baseUrl}"
GEMINI_API_KEY="${key}"`;
      }
    }

    return '';
  };

  const copySnippet = async () => {
    const code = generateSnippetCode();
    await copyApiValue(code, 'home:snippet');
    setCopiedSnippet(true);
    window.setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <section className="page kernel-page home-page">
      <div className="kernel-layout home-layout">
        <div className="panel control-panel">
          <div className="panel-heading">
            <div>
              <h2>{t('kernel.control.title')}</h2>
            </div>
            <span className={`state-pill ${statusTone}`} title={statusError || undefined} role="status">
              <span className={`status-beacon-dot ${coreRunning ? 'running' : 'stopped'}`} style={{ marginRight: 6 }} aria-hidden="true" />
              {coreProcessBusy ? t('common.processing') : statusLabel}
            </span>
          </div>

          {/* 纯白未来科技感能量核心状态反应堆 */}
          <div className="energy-reactor-section">
            <div className="energy-reactor-ring-wrapper">
              <div className="energy-reactor-outer-ring" />
              <div className="energy-reactor-inner-ring" />
              <div className="energy-reactor-core">
                <span className={`energy-core-status-text ${coreRunning ? 'running' : 'stopped'}`}>
                  {coreRunning ? 'ONLINE' : 'OFFLINE'}
                </span>
                <span className="energy-core-sub-badge">
                  {coreRunning ? 'ACTIVE · 8317' : 'STANDBY'}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--clean-text-secondary)', fontWeight: 600, letterSpacing: '0.02em' }}>
              {coreRunning
                ? `⚡ ${t('kernel.status.running')} · 127.0.0.1:${customPort}`
                : coreInstalled
                  ? t('kernel.status.stopped')
                  : t('kernel.status.notInstalled')}
            </div>
          </div>

          <div className="apple-metric-grid">
            <div className="apple-metric-card">
              <span className="apple-metric-label">{t('kernel.control.installStatus')}</span>
              <span className="apple-metric-value">
                {coreStatus ? (coreInstalled ? t('kernel.control.installed') : t('kernel.status.notInstalled')) : t('common.detecting')}
              </span>
            </div>
            <div className="apple-metric-card">
              <span className="apple-metric-label">{t('kernel.control.runStatus')}</span>
              <span className="apple-metric-value">
                {coreStatus ? (coreRunning ? t('kernel.status.running') : t('kernel.control.notRunning')) : t('common.detecting')}
              </span>
            </div>
            <div className="apple-metric-card">
              <span className="apple-metric-label">{t('kernel.control.pid')}</span>
              <span className="apple-metric-value">
                {coreStatus?.processId || t('kernel.control.noPid')}
              </span>
            </div>
            <div className="apple-metric-card">
              <span className="apple-metric-label">{t('kernel.overview.coreVersion')}</span>
              <span className="apple-metric-value" title={currentVersion}>
                {currentVersion || (coreInstalled ? t('common.unavailable') : t('kernel.status.notInstalled'))}
              </span>
            </div>
            <div className="apple-metric-card">
              <span className="apple-metric-label">{t('kernel.overview.appVersion')}</span>
              <span className="apple-metric-value" title={currentAppVersion}>
                {currentAppVersion}
              </span>
            </div>
          </div>

          <div className="button-row panel-action-row control-action-row">
            <button
              type="button"
              className={coreRunning ? 'danger-button' : 'primary-button'}
              disabled={!coreInstalled || coreProcessBusy}
              onClick={() =>
                void runCoreProcessCommand(
                  coreRunning ? 'stop_core_process' : 'start_core_process',
                )
              }
            >
              {coreProcessBusy ? t('common.processing') : coreRunning ? t('kernel.action.stop') : t('kernel.action.start')}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!coreInstalled || !coreRunning || coreProcessBusy}
              onClick={() =>
                void runCoreProcessCommand('restart_core_process')
              }
            >
              {t('kernel.action.restart')}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={coreProcessBusy}
              onClick={() => void refreshStatus()}
            >
              {t('kernel.control.refresh')}
            </button>
          </div>
          <FloatingNotice key={processFeedback.revision} notice={processFeedback.notice} onDismiss={processFeedback.clearNotice} />
        </div>
      </div>

      <section className="panel client-api-panel">
        <div className="panel-heading client-api-heading">
          <div>
            <h2>{t('app.nav.api')}</h2>
          </div>
          <span className={`state-pill ${coreRunning ? 'success' : 'neutral'}`}>
            {coreRunning ? t('kernel.access.connectable') : t('kernel.access.waiting')}
          </span>
        </div>

        <div className="client-api-key-container">
          <span className="client-api-key-label">
            <Lock size={13} aria-hidden="true" />
            {t('kernel.access.firstKey')}
          </span>
          {homeApiKeyError ? (
            <span className="client-api-meta error">{t('common.detectionFailed')}</span>
          ) : homeApiKey ? (
            <>
              <code className="client-api-key-code">
                {showHomeApiKey ? homeApiKey : '••••••••••••••••'}
              </code>
              <div className="apple-key-actions">
                <button
                  type="button"
                  className="apple-copy-btn"
                  onClick={() => setShowHomeApiKey((current) => !current)}
                  title={showHomeApiKey ? t('config.keys.hide') : t('config.keys.show')}
                  aria-label={showHomeApiKey ? t('config.keys.hide') : t('config.keys.show')}
                >
                  {showHomeApiKey ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={`apple-copy-btn${copiedApiField === 'home:apikey' ? ' copied' : ''}`}
                  onClick={() => void copyApiValue(homeApiKey, 'home:apikey')}
                  title={copiedApiField === 'home:apikey' ? t('config.notice.keyCopied') : t('config.keys.copy')}
                  aria-label={copiedApiField === 'home:apikey' ? t('config.notice.keyCopied') : t('config.keys.copy')}
                >
                  {copiedApiField === 'home:apikey' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                </button>
              </div>
            </>
          ) : homeApiKey === null ? (
            <span className="client-api-meta quiet">{t('kernel.access.noConfiguredKey')}</span>
          ) : (
            <span className="client-api-meta quiet">{t('common.loading')}</span>
          )}
        </div>

        <FloatingNotice key={copyFeedback.revision} notice={copyFeedback.notice} onDismiss={copyFeedback.clearNotice} />

        <div className="client-api-grid">
          {apiProfiles.map((profile) => (
            <article key={profile.id} className={`client-api-card ${profile.id}`}>
              <div className="client-api-card-heading">
                <span className="client-api-logo">
                  <img src={apiProfileIcons[profile.id]} alt="" />
                </span>
                <div>
                  <strong>{profile.name}</strong>
                  <span>{profile.description}</span>
                </div>
              </div>

              <div className="apple-url-capsule">
                <code title={profile.baseUrl}>{profile.baseUrl}</code>
                <button
                  type="button"
                  className={`apple-copy-btn${copiedApiField === `${profile.id}:base` ? ' copied' : ''}`}
                  onClick={() =>
                    void copyApiValue(
                      profile.baseUrl,
                      `${profile.id}:base`,
                    )
                  }
                  title={t(copiedApiField === `${profile.id}:base` ? 'kernel.access.apiCopied' : 'kernel.access.copyApi', { name: profile.name })}
                  aria-label={t(copiedApiField === `${profile.id}:base` ? 'kernel.access.apiCopied' : 'kernel.access.copyApi', { name: profile.name })}
                >
                  {copiedApiField === `${profile.id}:base` ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* 开发者接入代码片段面板 */}
        <div className="snippet-panel clean-terminal-deck">
          <div className="snippet-panel-header">
            <div className="snippet-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="mac-window-dots" aria-hidden="true">
                  <span className="mac-dot close" />
                  <span className="mac-dot minimize" />
                  <span className="mac-dot maximize" />
                </div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Terminal size={15} aria-hidden="true" />
                  <span>{t('kernel.snippets.title')}</span>
                </h3>
              </div>
              <p style={{ margin: '3px 0 0' }}>{t('kernel.snippets.subtitle')}</p>
            </div>
            <div className="snippet-tabs-row">
              <button
                type="button"
                className={`snippet-tab-btn ${snippetProto === 'openai' ? 'active' : ''}`}
                onClick={() => setSnippetProto('openai')}
              >
                OpenAI 兼容
              </button>
              <button
                type="button"
                className={`snippet-tab-btn ${snippetProto === 'claude' ? 'active' : ''}`}
                onClick={() => setSnippetProto('claude')}
              >
                Claude 兼容
              </button>
              <button
                type="button"
                className={`snippet-tab-btn ${snippetProto === 'gemini' ? 'active' : ''}`}
                onClick={() => setSnippetProto('gemini')}
              >
                Gemini 兼容
              </button>
            </div>
          </div>

          <div className="snippet-subtabs-row">
            <div className="snippet-lang-tabs">
              <button
                type="button"
                className={`snippet-lang-pill ${snippetLang === 'curl' ? 'active' : ''}`}
                onClick={() => setSnippetLang('curl')}
              >
                {t('kernel.snippets.tab.curl')}
              </button>
              <button
                type="button"
                className={`snippet-lang-pill ${snippetLang === 'python' ? 'active' : ''}`}
                onClick={() => setSnippetLang('python')}
              >
                {t('kernel.snippets.tab.python')}
              </button>
              <button
                type="button"
                className={`snippet-lang-pill ${snippetLang === 'node' ? 'active' : ''}`}
                onClick={() => setSnippetLang('node')}
              >
                {t('kernel.snippets.tab.node')}
              </button>
              <button
                type="button"
                className={`snippet-lang-pill ${snippetLang === 'env' ? 'active' : ''}`}
                onClick={() => setSnippetLang('env')}
              >
                {t('kernel.snippets.tab.env')}
              </button>
            </div>

            <button
              type="button"
              className={`snippet-copy-action-btn ${copiedSnippet ? 'copied' : ''}`}
              onClick={() => void copySnippet()}
            >
              {copiedSnippet ? (
                <>
                  <Check size={13} aria-hidden="true" />
                  <span>{t('kernel.snippets.copied')}</span>
                </>
              ) : (
                <>
                  <Copy size={13} aria-hidden="true" />
                  <span>{t('kernel.snippets.copyCode')}</span>
                </>
              )}
            </button>
          </div>

          <div className="snippet-code-container">
            <pre>
              <code>{generateSnippetCode()}</code>
            </pre>
          </div>
        </div>
      </section>

    </section>
  );
}
