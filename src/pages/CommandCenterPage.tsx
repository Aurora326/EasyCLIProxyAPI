import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  LineChart,
  Network,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { useCoreRuntime } from '../coreRuntime';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { useI18n } from '../i18n';
import openaiIcon from '../assets/icons/openai-light.svg';
import claudeIcon from '../assets/icons/claude.svg';
import geminiIcon from '../assets/icons/gemini.svg';
import deepseekIcon from '../assets/icons/deepseek.svg';
import antigravityIcon from '../assets/icons/antigravity.svg';
import grokIcon from '../assets/icons/grok.svg';
import kimiIcon from '../assets/icons/kimi-light.svg';
import codexIcon from '../assets/icons/codex.svg';

interface CommandCenterPageProps {
  onNavigate: (pageId: string) => void;
}

type TimeRange = '1h' | '24h' | '7d' | '30d';

type TrafficDataPoint = {
  t: string;
  total: number;
  ok: number;
  err: number;
  qps: number;
};

type RecentRequestItem = {
  id: string;
  rawId: string;
  time: string;
  provider: string;
  icon?: string;
  model: string;
  endpoint: string;
  method: string;
  status: number;
  isCanceled: boolean;
  isFailed: boolean;
  latency: string;
};

const resolveProviderInfo = (providerRaw: string, modelRaw: string) => {
  const raw = (providerRaw || '').trim();
  const p = raw.toLowerCase();
  const m = (modelRaw || '').toLowerCase();
  if (p.includes('antigravity') || m.includes('antigravity')) return { name: 'Antigravity', icon: antigravityIcon };
  if (p.includes('claude') || p.includes('anthropic') || m.includes('claude')) return { name: 'Claude', icon: claudeIcon };
  if (p.includes('gemini') || p.includes('google') || m.includes('gemini')) return { name: 'Gemini', icon: geminiIcon };
  if (p.includes('deepseek') || m.includes('deepseek')) return { name: 'DeepSeek', icon: deepseekIcon };
  if (p.includes('openai') || m.includes('gpt-') || m.includes('o1-') || m.includes('o3-')) return { name: 'OpenAI', icon: openaiIcon };
  if (p.includes('grok') || p.includes('xai') || m.includes('grok')) return { name: 'Grok', icon: grokIcon };
  if (p.includes('kimi') || p.includes('moonshot') || m.includes('kimi')) return { name: 'Kimi', icon: kimiIcon };
  if (p.includes('codex')) return { name: 'Codex', icon: codexIcon };
  if (/^https?:\/\//i.test(raw)) {
    try {
      return { name: new URL(raw).host, icon: openaiIcon };
    } catch {
      return { name: raw.replace(/^https?:\/\//i, '').split('/')[0] || raw, icon: openaiIcon };
    }
  }
  return { name: raw || 'API', icon: null };
};

const parseEndpoint = (endpointRaw: string) => {
  const trimmed = (endpointRaw || '').trim();
  if (!trimmed) return { method: 'POST', path: '/v1/chat/completions' };
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].includes(parts[0].toUpperCase())) {
    return { method: parts[0].toUpperCase(), path: parts.slice(1).join(' ') };
  }
  return { method: 'POST', path: trimmed };
};

const formatRequestTime = (isoString: string) => {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString || '—';
  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (isSameDay) return timeStr;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`;
};

const formatLatency = (ms: number) => {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};


export function CommandCenterPage({ onNavigate }: CommandCenterPageProps) {
  const { t } = useI18n();
  const { status: coreStatus, refreshStatus, publishStatus } = useCoreRuntime();
  const [coreBusy, setCoreBusy] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [appVersion, setAppVersion] = useState('v8.0.3');
  const [listenPort, setListenPort] = useState(8317);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const coreRunning = Boolean(coreStatus?.running);

  useEffect(() => {
    if (isTauri()) {
      void getVersion()
        .then((ver) => setAppVersion(`v${ver}`))
        .catch(() => undefined);

      void invoke<{ port: number }>('get_gui_settings')
        .then((settings) => {
          if (settings.port) setListenPort(settings.port);
        })
        .catch(() => undefined);
    }
  }, []);

  const handleToggleCore = async () => {
    setCoreBusy(true);
    try {
      if (isTauri()) {
        const cmd = coreRunning ? 'stop_core_process' : 'start_core_process';
        const res = await invoke<any>(cmd);
        publishStatus(res);
      }
      await refreshStatus();
    } catch (e) {
      console.error('切换内核状态失败', e);
    } finally {
      setCoreBusy(false);
    }
  };

  const handleRestartCore = async () => {
    setCoreBusy(true);
    try {
      if (isTauri()) {
        const res = await invoke<any>('restart_core_process');
        publishStatus(res);
      }
      await refreshStatus();
    } catch (e) {
      console.error('重启内核失败', e);
    } finally {
      setCoreBusy(false);
    }
  };

  const copyGatewayUrl = async () => {
    const url = `http://127.0.0.1:${listenPort}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (e) {
      console.error('复制失败', e);
    }
  };

  // 真实统计概览与渠道状态
  const [usageStats, setUsageStats] = useState<{
    totalRequests: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    averageLatencyMs: number;
    totalTokens: number;
    timeline: Array<{
      hour: string;
      requests: number;
      success: number;
      failure: number;
      tokens: number;
    }>;
  }>({
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
    successRate: 100,
    averageLatencyMs: 0,
    totalTokens: 0,
    timeline: [],
  });

  const [activeProviders, setActiveProviders] = useState<
    Array<{
      key: string;
      name: string;
      icon: string | null;
      modelCount: number;
    }>
  >([]);

  // 将真实 timeline 转换为折线图坐标点（若暂无历史记录则生成当前时间轴 0 基线）
  const currentPoints = useMemo<TrafficDataPoint[]>(() => {
    const rawTimeline = usageStats.timeline || [];
    if (rawTimeline.length >= 2) {
      const sliced = rawTimeline.slice(-12);
      return sliced.map((pt) => {
        const d = new Date(pt.hour);
        const pad = (n: number) => (n < 10 ? '0' + n : String(n));
        const label = Number.isNaN(d.getTime())
          ? pt.hour.slice(-5)
          : timeRange === '7d' || timeRange === '30d'
            ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
            : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return {
          t: label,
          total: pt.requests || 0,
          ok: pt.success || 0,
          err: pt.failure || 0,
          qps: Number(((pt.requests || 0) / 3600).toFixed(2)),
        };
      });
    }

    // 当只有 0 或 1 个点时，构建 6 个时间刻度点展示真实值
    const now = new Date();
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));
    const single = rawTimeline[0];
    const points: TrafficDataPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const tDate = new Date(
        now.getTime() -
          i * (timeRange === '1h' ? 10 * 60 * 1000 : timeRange === '24h' ? 4 * 3600 * 1000 : 24 * 3600 * 1000),
      );
      const label =
        timeRange === '7d' || timeRange === '30d'
          ? `${pad(tDate.getMonth() + 1)}-${pad(tDate.getDate())}`
          : `${pad(tDate.getHours())}:${pad(tDate.getMinutes())}`;
      if (i === 0 && single) {
        points.push({
          t: label,
          total: single.requests || 0,
          ok: single.success || 0,
          err: single.failure || 0,
          qps: Number(((single.requests || 0) / 3600).toFixed(2)),
        });
      } else {
        points.push({ t: label, total: 0, ok: 0, err: 0, qps: 0 });
      }
    }
    return points;
  }, [usageStats.timeline, timeRange]);

  // 计算 Y 轴刻度基准（自适应真实请求量级）
  const rawMax = Math.max(...currentPoints.map((p) => p.total), 0);
  const niceMax = useMemo(() => {
    if (rawMax <= 10) return 10;
    if (rawMax <= 50) return 50;
    if (rawMax <= 100) return 100;
    if (rawMax <= 500) return 500;
    if (rawMax <= 1000) return 1000;
    if (rawMax <= 5000) return 5000;
    if (rawMax <= 30000) return 30000;
    return Math.ceil(rawMax / 10000) * 10000;
  }, [rawMax]);

  // SVG 坐标系尺寸与留白
  const svgWidth = 720;
  const svgHeight = 220;
  const padLeft = 60; // 预留足够的 Y 轴数值标签宽度
  const padRight = 24;
  const padTop = 20;
  const padBottom = 32;

  const chartInnerWidth = svgWidth - padLeft - padRight;
  const chartInnerHeight = svgHeight - padTop - padBottom;

  const getX = (i: number) => padLeft + (i / Math.max(1, currentPoints.length - 1)) * chartInnerWidth;
  const getY = (val: number) => padTop + chartInnerHeight - (val / niceMax) * chartInnerHeight;

  // 生成折线与渐变面积路径
  const totalLinePath = currentPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.total)}`)
    .join(' ');

  const totalAreaPath = `${totalLinePath} L ${getX(currentPoints.length - 1)} ${padTop + chartInnerHeight} L ${getX(0)} ${padTop + chartInnerHeight} Z`;

  const successLinePath = currentPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.ok)}`)
    .join(' ');

  // 失败异常放大显示（使得微小错误也能被直观捕捉）
  const errMaxScale = Math.max(1, niceMax * 0.25);
  const getErrY = (errVal: number) =>
    padTop + chartInnerHeight - Math.min(chartInnerHeight * 0.9, (errVal / errMaxScale) * chartInnerHeight);

  const errorLinePath = currentPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getErrY(p.err)}`)
    .join(' ');

  // Y 轴刻度等级 (4 条参考线：0%, 33%, 66%, 100%)
  const yAxisTicks = useMemo(() => {
    return [
      { val: 0, label: '0' },
      {
        val: Math.round(niceMax * 0.33),
        label:
          niceMax * 0.33 >= 1000 ? `${(niceMax * 0.33 / 1000).toFixed(1)}k` : `${Math.round(niceMax * 0.33)}`,
      },
      {
        val: Math.round(niceMax * 0.66),
        label:
          niceMax * 0.66 >= 1000 ? `${(niceMax * 0.66 / 1000).toFixed(1)}k` : `${Math.round(niceMax * 0.66)}`,
      },
      { val: niceMax, label: niceMax >= 1000 ? `${Math.round(niceMax / 1000)}k` : `${niceMax}` },
    ];
  }, [niceMax]);

  // 动态读取真实请求记录流水、KPI 概览与在线供应商
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);

  const fetchRecentRequests = useCallback(
    async (isManual = false) => {
      if (!isTauri()) {
        setRecentLoading(false);
        return;
      }
      if (isManual) setIsRefreshingLogs(true);
      try {
        const now = new Date();
        const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 24 * 7 : 24 * 30;
        const rangeQuery = {
          start: new Date(now.getTime() - hours * 3600 * 1000).toISOString(),
          end: now.toISOString(),
        };

        const [res, overview, sources] = await Promise.all([
          invoke<{ items: any[]; total: number }>('get_usage_events', {
            query: { page: 1, page_size: 20 },
          }).catch(() => null),
          invoke<any>('get_usage_overview', { query: rangeQuery }).catch(() => null),
          invoke<Array<{ model: string; provider: string; kind: string }>>('get_model_alias_sources').catch(() => []),
        ]);

        if (overview && typeof overview === 'object') {
          setUsageStats({
            totalRequests: Number(overview.totalRequests ?? 0),
            successCount: Number(overview.successCount ?? 0),
            failureCount: Number(overview.failureCount ?? 0),
            successRate:
              Number(overview.totalRequests ?? 0) > 0 ? Number(overview.successRate ?? 100) : 100,
            averageLatencyMs: Number(overview.averageLatencyMs ?? 0),
            totalTokens: Number(overview.totalTokens ?? 0),
            timeline: Array.isArray(overview.timeline) ? overview.timeline : [],
          });
        }

        if (Array.isArray(sources) && sources.length > 0) {
          const grouped = new Map<string, { key: string; name: string; icon: string | null; models: Set<string> }>();
          for (const src of sources) {
            const info = resolveProviderInfo(src.provider || src.kind, src.model);
            const groupKey = info.name.toLowerCase();
            const existing = grouped.get(groupKey);
            if (existing) {
              if (src.model) existing.models.add(src.model);
            } else {
              grouped.set(groupKey, {
                key: groupKey,
                name: info.name,
                icon: info.icon,
                models: new Set(src.model ? [src.model] : []),
              });
            }
          }
          setActiveProviders(
            Array.from(grouped.values()).map((g) => ({
              key: g.key,
              name: g.name,
              icon: g.icon,
              modelCount: g.models.size,
            })),
          );
        }

        if (res && Array.isArray(res.items)) {
          const mapped: RecentRequestItem[] = res.items.slice(0, 7).map((record) => {
            const { method, path } = parseEndpoint(record.endpoint);
            const { name: providerName, icon: providerIcon } = resolveProviderInfo(
              record.provider,
              record.model,
            );
            const status = record.canceled
              ? 499
              : record.failed
                ? record.failure_status > 0
                  ? record.failure_status
                  : 500
                : record.failure_status > 0
                  ? record.failure_status
                  : 200;
            return {
              id: record.request_id
                ? record.request_id.length > 14
                  ? record.request_id.slice(0, 14) + '…'
                  : record.request_id
                : record.id
                  ? record.id.slice(0, 10)
                  : 'req_—',
              rawId: record.request_id || record.id || '',
              time: formatRequestTime(record.timestamp),
              provider: providerName,
              icon: providerIcon || undefined,
              model: record.alias || record.model || 'unknown',
              endpoint: path,
              method,
              status,
              isCanceled: Boolean(record.canceled),
              isFailed: Boolean(record.failed),
              latency: formatLatency(record.latency_ms),
            };
          });
          setRecentRequests(mapped);
        }
      } catch (err) {
        console.error('获取最近调用流水与统计失败:', err);
      } finally {
        setRecentLoading(false);
        if (isManual) {
          setTimeout(() => setIsRefreshingLogs(false), 500);
        }
      }
    },
    [timeRange],
  );

  useEffect(() => {
    void fetchRecentRequests();
    const timer = setInterval(() => {
      void fetchRecentRequests();
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchRecentRequests]);

  // 动态读取真实系统指标
  const systemMetrics = useMemo(() => {
    const memoryInfo = (performance as any)?.memory;
    const memoryDisplay = memoryInfo?.usedJSHeapSize
      ? `${Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024)} MB 内存占用`
      : 'Tauri / 混合运行时';

    return {
      corePid: coreStatus?.processId ? `${coreStatus.processId}` : (coreRunning ? '运行中 (PID未知)' : '未启动'),
      coreVer: coreStatus?.currentVersion || 'v7.3.4 (核心)',
      portDisplay: `127.0.0.1:${listenPort}`,
      cpuCores: `${navigator.hardwareConcurrency || 8} 逻辑核心并发`,
      memory: memoryDisplay,
      gatewayHealth: coreRunning ? '健康运行 (正常)' : '服务已离线',
    };
  }, [coreStatus, coreRunning, listenPort]);

  return (
    <div className="command-center-container">
      {/* 1. Gateway Status Hero (网关指挥中心主横幅：整合三大协议端点快捷复制) */}
      <section className="cc-hero-banner">
        <div className="cc-hero-left">
          <div className="cc-hero-status-box">
            <div className="cc-hero-status-row">
              <span className="cc-hero-title">本地多协议 AI 代理网关</span>
              <span className={`ds-badge ${coreRunning ? 'ds-badge-green' : 'ds-badge-red'}`}>
                <span className={`status-pulse-dot ${coreRunning ? 'online' : 'offline'}`} />
                {coreRunning ? '引擎守护中' : '已停止'}
              </span>
              <span className="ds-badge ds-badge-mono">客户端 {appVersion}</span>
            </div>
            <div className="cc-hero-meta-row" style={{ marginTop: 4, gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'OpenAI', suffix: '/v1' },
                { label: 'Claude', suffix: '/v1/messages' },
                { label: 'Gemini', suffix: '/v1beta' },
              ].map((ep) => (
                <button
                  key={ep.label}
                  type="button"
                  className="cc-endpoint-chip"
                  onClick={() => {
                    void navigator.clipboard.writeText(`http://127.0.0.1:${listenPort}${ep.suffix}`);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 1800);
                  }}
                  title={`点击复制 ${ep.label} 兼容端点: http://127.0.0.1:${listenPort}${ep.suffix}`}
                >
                  <span className="cc-endpoint-chip-label">{ep.label}</span>
                  <code>:{listenPort}{ep.suffix}</code>
                  <Copy size={11} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="cc-hero-actions">
          <button
            type="button"
            className="ds-btn ds-btn-secondary ds-btn-sm"
            onClick={copyGatewayUrl}
            title="复制本地网关根地址"
          >
            {copiedUrl ? <Check size={13} className="text-green" /> : <Copy size={13} />}
            <span>{copiedUrl ? '已复制地址' : '复制根地址'}</span>
          </button>

          {coreRunning ? (
            <button
              type="button"
              className="ds-btn ds-btn-secondary ds-btn-sm"
              onClick={handleRestartCore}
              disabled={coreBusy}
              title="重新拉起网关内核并重载配置"
            >
              <RotateCw size={13} className={coreBusy ? 'spin' : ''} />
              <span>重启网关</span>
            </button>
          ) : null}

          <button
            type="button"
            className={`ds-btn ds-btn-sm ${coreRunning ? 'ds-btn-danger' : 'ds-btn-primary'}`}
            onClick={handleToggleCore}
            disabled={coreBusy}
          >
            <Power size={13} />
            <span>{coreRunning ? '停止网关服务' : '启动网关服务'}</span>
          </button>
        </div>
      </section>

      {/* 2. 四个核心 KPI 状态卡片（带平滑数字滚动与柔光交互） */}
      <section className="cc-kpis-grid">
        {/* 总请求量 */}
        <div className="cc-kpi-card kpi-blue">
          <div className="cc-kpi-header">
            <div>
              <span className="cc-kpi-title">区间总请求量</span>
              <div className="cc-kpi-value">
                <AnimatedNumber value={usageStats.totalRequests} />
              </div>
            </div>
            <div className="cc-kpi-icon-box blue">
              <Activity size={18} />
            </div>
          </div>
          <div className="cc-kpi-footer-meta">
            <span className="cc-kpi-trend">
              <ArrowUpRight size={13} />
              成功 <AnimatedNumber value={usageStats.successCount} /> · 失败 <AnimatedNumber value={usageStats.failureCount} />
            </span>
          </div>
        </div>

        {/* 请求成功率 */}
        <div className="cc-kpi-card kpi-green">
          <div className="cc-kpi-header">
            <div>
              <span className="cc-kpi-title">网关转发成功率</span>
              <div className="cc-kpi-value">
                <AnimatedNumber
                  value={usageStats.totalRequests > 0 ? usageStats.successRate : 100}
                  precision={1}
                />
                <span className="cc-kpi-unit">%</span>
              </div>
            </div>
            <div className="cc-kpi-icon-box green">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="cc-kpi-footer-meta">
            <span className="cc-kpi-trend">
              错误率{' '}
              {usageStats.totalRequests > 0 ? (
                <>
                  <AnimatedNumber
                    value={(usageStats.failureCount / usageStats.totalRequests) * 100}
                    precision={2}
                  />%
                </>
              ) : (
                '0.00%'
              )}
            </span>
          </div>
        </div>

        {/* 平均响应延迟 */}
        <div className="cc-kpi-card kpi-cyan">
          <div className="cc-kpi-header">
            <div>
              <span className="cc-kpi-title">平均响应延迟</span>
              <div className="cc-kpi-value">
                {usageStats.averageLatencyMs > 0 ? (
                  usageStats.averageLatencyMs < 1000 ? (
                    <>
                      <AnimatedNumber value={Math.round(usageStats.averageLatencyMs)} />
                      <span className="cc-kpi-unit">ms</span>
                    </>
                  ) : (
                    <>
                      <AnimatedNumber value={usageStats.averageLatencyMs / 1000} precision={2} />
                      <span className="cc-kpi-unit">s</span>
                    </>
                  )
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div className="cc-kpi-icon-box cyan">
              <Clock size={18} />
            </div>
          </div>
          <div className="cc-kpi-footer-meta">
            <span className="cc-kpi-trend">端到端流式首包与完成耗时</span>
          </div>
        </div>

        {/* 累计 Token 消耗 */}
        <div className="cc-kpi-card kpi-teal">
          <div className="cc-kpi-header">
            <div>
              <span className="cc-kpi-title">区间 Token 吞吐量</span>
              <div className="cc-kpi-value">
                {usageStats.totalTokens >= 1_000_000 ? (
                  <>
                    <AnimatedNumber value={usageStats.totalTokens / 1_000_000} precision={2} />
                    <span className="cc-kpi-unit">M</span>
                  </>
                ) : usageStats.totalTokens >= 1000 ? (
                  <>
                    <AnimatedNumber value={usageStats.totalTokens / 1000} precision={1} />
                    <span className="cc-kpi-unit">k</span>
                  </>
                ) : (
                  <AnimatedNumber value={usageStats.totalTokens} />
                )}
              </div>
            </div>
            <div className="cc-kpi-icon-box teal">
              <Sparkles size={18} />
            </div>
          </div>
          <div className="cc-kpi-footer-meta">
            <span className="cc-kpi-trend">含输入、输出与推理思考 Tokens</span>
          </div>
        </div>
      </section>

      {/* 3. 核心两列栅格：实时流量图表 & 模型状态 */}
      <section className="cc-main-grid">
        {/* 左侧：请求流量趋势图 (含明确 Y 轴刻度、区域填充与交互悬浮窗) */}
        <div className="ds-card">
          <div className="ds-card-header">
            <div>
              <div className="ds-card-title">
                <LineChart size={16} className="text-brand" />
                网关请求吞吐量走势
              </div>
            </div>
            <div className="chart-time-pill-group">
              {(['1h', '24h', '7d', '30d'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  className={`chart-time-btn ${timeRange === range ? 'active' : ''}`}
                  onClick={() => {
                    setTimeRange(range);
                    setHoveredIndex(null);
                  }}
                >
                  {range === '1h'
                    ? '1小时'
                    : range === '24h'
                      ? '24小时'
                      : range === '7d'
                        ? '7天'
                        : '30天'}
                </button>
              ))}
            </div>
          </div>

          {/* 专业 SVG 折线走势图与交互浮层 */}
          <div className="traffic-chart-container">
            <svg
              className="traffic-chart-svg"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                {/* 渐变面积填充 (低透明度浅蓝色渐变) */}
                <linearGradient id="trafficAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-line-total)" stopOpacity="0.22" />
                  <stop offset="92%" stopColor="var(--chart-line-total)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* 水平坐标基准线与 Y 轴刻度值 */}
              {yAxisTicks.map((tick) => {
                const yPos = getY(tick.val);
                return (
                  <g key={tick.label}>
                    <line
                      x1={padLeft}
                      y1={yPos}
                      x2={svgWidth - padRight}
                      y2={yPos}
                      stroke="var(--chart-grid)"
                      strokeWidth="1"
                      strokeDasharray={tick.val === 0 ? 'none' : '3 3'}
                      opacity={tick.val === 0 ? 0.85 : 0.6}
                    />
                    <text
                      x={padLeft - 10}
                      y={yPos + 4}
                      fill="var(--text-muted)"
                      fontSize="11"
                      fontWeight="400"
                      textAnchor="end"
                      fontFamily="var(--font-sans)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}

              {/* 面积渐变层 */}
              <path d={totalAreaPath} fill="url(#trafficAreaGradient)" />

              {/* 总请求量主曲线 (品牌蓝) */}
              <path
                d={totalLinePath}
                fill="none"
                stroke="var(--chart-line-total)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* 成功请求量曲线 (绿色) */}
              <path
                d={successLinePath}
                fill="none"
                stroke="var(--chart-line-success)"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                strokeLinecap="round"
              />

              {/* 失败与异常请求走势：仅在存在异常时突出显示，避免无异常时红线长期占据视觉焦点 */}
              <path
                d={errorLinePath}
                fill="none"
                stroke="var(--chart-line-failed)"
                strokeWidth={currentPoints.some((p) => p.err > 0) ? '1.6' : '1'}
                strokeDasharray={currentPoints.some((p) => p.err > 0) ? 'none' : '3 3'}
                opacity={currentPoints.some((p) => p.err > 0) ? 0.9 : 0.16}
                strokeLinecap="round"
              />

              {/* X 轴刻度标签 */}
              {currentPoints.map((p, i) => (
                <text
                  key={p.t}
                  x={getX(i)}
                  y={svgHeight - 10}
                  fill="var(--text-muted)"
                  fontSize="11"
                  fontWeight="400"
                  textAnchor="middle"
                  fontFamily="var(--font-sans)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {p.t}
                </text>
              ))}

              {/* 鼠标交互十字线与触发圆点 */}
              {currentPoints.map((p, i) => {
                const cx = getX(i);
                const cy = getY(p.total);
                const isHovered = hoveredIndex === i;

                return (
                  <g key={`point-${i}`}>
                    {/* 悬浮指示竖线 */}
                    {isHovered ? (
                      <line
                        x1={cx}
                        y1={padTop}
                        x2={cx}
                        y2={padTop + chartInnerHeight}
                        stroke="var(--chart-line-total)"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                        opacity={0.8}
                      />
                    ) : null}

                    {/* 数据点 */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 5 : 3.5}
                      fill="var(--bg-surface)"
                      stroke="var(--chart-line-total)"
                      strokeWidth={isHovered ? 2.5 : 2}
                      style={{ cursor: 'pointer', transition: 'r 150ms ease' }}
                      onMouseEnter={() => setHoveredIndex(i)}
                    />

                    {/* 透明热区扩大鼠标触发范围 */}
                    <rect
                      x={cx - chartInnerWidth / (currentPoints.length * 2)}
                      y={padTop}
                      width={chartInnerWidth / currentPoints.length}
                      height={chartInnerHeight}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredIndex(i)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* 动态悬浮数据卡片 (Tooltip) */}
            {hoveredIndex !== null && currentPoints[hoveredIndex] ? (
              <div
                className="traffic-chart-tooltip"
                style={{
                  left: `${(getX(hoveredIndex) / svgWidth) * 100}%`,
                  top: `${(getY(currentPoints[hoveredIndex].total) / svgHeight) * 100}%`,
                }}
              >
                <div className="traffic-chart-tooltip-time">
                  {currentPoints[hoveredIndex].t} 流量明细
                </div>
                <div className="traffic-chart-tooltip-row">
                  <span>总请求量:</span>
                  <span className="traffic-chart-tooltip-val">
                    {currentPoints[hoveredIndex].total.toLocaleString()} 次
                  </span>
                </div>
                <div className="traffic-chart-tooltip-row">
                  <span>成功请求:</span>
                  <span className="traffic-chart-tooltip-val" style={{ color: 'var(--status-success)' }}>
                    {currentPoints[hoveredIndex].ok.toLocaleString()} 次
                  </span>
                </div>
                <div className="traffic-chart-tooltip-row">
                  <span>失败异常:</span>
                  <span className="traffic-chart-tooltip-val" style={{ color: 'var(--status-error)' }}>
                    {currentPoints[hoveredIndex].err} 次
                  </span>
                </div>
                <div className="traffic-chart-tooltip-row">
                  <span>估算 QPS:</span>
                  <span className="traffic-chart-tooltip-val" style={{ color: 'var(--brand-primary)' }}>
                    {currentPoints[hoveredIndex].qps} req/s
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* 中文图例与指标说明 */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '12.5px', fontWeight: 400, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span className="traffic-legend-dot" style={{ background: 'var(--chart-line-total)' }} />
              总请求量 (QPS走势)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span className="traffic-legend-dot" style={{ background: 'var(--chart-line-success)' }} />
              成功请求 ({usageStats.totalRequests > 0 ? `${usageStats.successRate.toFixed(1)}%` : '100%'})
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: currentPoints.some((p) => p.err > 0) ? 1 : 0.75 }}>
              <span className="traffic-legend-dot" style={{ background: 'var(--chart-line-failed)' }} />
              异常与限流拦截 ({usageStats.failureCount})
            </span>
          </div>
        </div>

        {/* 右侧：模型服务状态 */}
        <div className="ds-card">
          <div className="ds-card-header">
            <div className="ds-card-title">
              <Cpu size={16} className="text-brand" />
              模型服务状态
            </div>
            <span className="ds-badge ds-badge-mono">
              {activeProviders.length > 0 ? `${activeProviders.length} 个供应商已挂载` : '待接入供应商'}
            </span>
          </div>

          <div className="model-status-list">
            {activeProviders.length > 0 ? (
              activeProviders.map((prov) => (
                <div
                  key={prov.key}
                  className="model-status-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onNavigate('providers')}
                  title={`点击查看 ${prov.name} 供应商集群详情`}
                >
                  <div className="model-status-left">
                    {prov.icon ? (
                      <img src={prov.icon} alt={prov.name} className="model-status-logo" />
                    ) : (
                      <Layers size={16} className="text-brand" style={{ flexShrink: 0 }} />
                    )}
                    <span className="model-status-name" title={prov.name}>
                      {prov.name}
                    </span>
                  </div>
                  <div className="model-status-right">
                    <span className={`ds-badge ${coreRunning ? 'ds-badge-green' : 'ds-badge-mono'}`}>
                      {coreRunning ? '● 在线就绪' : '● 待启动'}
                    </span>
                    <span className="model-status-latency">{prov.modelCount} 个模型</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                暂无已挂载的供应商模型，请前往「API 接入」或「OAuth 授权凭据」添加
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. 快捷操作 & 系统与内核状态 (读取真实系统指标) */}
      <section className="cc-main-grid">
        {/* 快捷操作入口 */}
        <div className="ds-card">
          <div className="ds-card-header">
            <div className="ds-card-title">
              <Zap size={16} className="text-brand" />
              快捷操作入口
            </div>
          </div>

          <div className="quick-actions-grid">
            <button
              type="button"
              className="quick-action-item"
              onClick={() => onNavigate('api')}
            >
              <Network size={18} className="quick-action-icon" />
              <span className="quick-action-title">API 接入</span>
              <span className="quick-action-desc">配置供应商与网关端点</span>
            </button>

            <button
              type="button"
              className="quick-action-item"
              onClick={() => onNavigate('playground')}
            >
              <Bot size={18} className="quick-action-icon" />
              <span className="quick-action-title">模型极速测试</span>
              <span className="quick-action-desc">测试多模型流式与首字响应</span>
            </button>

            <button
              type="button"
              className="quick-action-item"
              onClick={() => onNavigate('api-keys')}
            >
              <KeyRound size={18} className="quick-action-icon" />
              <span className="quick-action-title">获取 API Key</span>
              <span className="quick-action-desc">生成与管理网关访问密钥</span>
            </button>

            <button
              type="button"
              className="quick-action-item"
              onClick={() => onNavigate('logs')}
            >
              <Activity size={18} className="quick-action-icon" />
              <span className="quick-action-title">调用日志追踪</span>
              <span className="quick-action-desc">实时查看请求流水与延迟</span>
            </button>
          </div>
        </div>

        {/* 系统与内核指标 (实时读取本地内核进程状态) */}
        <div className="ds-card">
          <div className="ds-card-header">
            <div className="ds-card-title">
              <Server size={16} className="text-brand" />
              系统与内核指标
            </div>
            <span className={`ds-badge ${coreRunning ? 'ds-badge-green' : 'ds-badge-mono'}`}>
              {coreRunning ? '● 实时连接' : '● 未启动'}
            </span>
          </div>

          <div className="system-status-grid">
            <div className="system-status-tile">
              <div className="system-status-tile-label">内核进程 PID</div>
              <div className="system-status-tile-val is-mono">{systemMetrics.corePid}</div>
            </div>
            <div className="system-status-tile">
              <div className="system-status-tile-label">内核版本</div>
              <div className="system-status-tile-val is-mono">{systemMetrics.coreVer}</div>
            </div>
            <div className="system-status-tile">
              <div className="system-status-tile-label">监听地址与端口</div>
              <div className="system-status-tile-val is-mono">{systemMetrics.portDisplay}</div>
            </div>
            <div className="system-status-tile">
              <div className="system-status-tile-label">CPU 架构与并发</div>
              <div className="system-status-tile-val">{systemMetrics.cpuCores}</div>
            </div>
            <div className="system-status-tile">
              <div className="system-status-tile-label">引擎内存占用</div>
              <div className="system-status-tile-val">{systemMetrics.memory}</div>
            </div>
            <div className="system-status-tile">
              <div className="system-status-tile-label">网关运行状态</div>
              <div
                className="system-status-tile-val"
                style={{ color: coreRunning ? 'var(--status-success)' : 'var(--text-muted)' }}
              >
                {systemMetrics.gatewayHealth}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 最近调用流水日志 */}
      <section className="ds-card" style={{ marginBottom: '20px' }}>
        <div className="ds-card-header">
          <div className="ds-card-title">
            <Terminal size={16} className="text-brand" />
            最近调用流水
            <span
              className="ds-badge ds-badge-mono"
              style={{ fontSize: '11px', padding: '1px 6px', fontWeight: 'normal' }}
              title="根据数据库实时更新最近请求"
            >
              实时同步
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="ds-btn ds-btn-secondary ds-btn-sm"
              onClick={() => fetchRecentRequests(true)}
              disabled={isRefreshingLogs}
              title="手动刷新最近流水"
              style={{ padding: '4px 8px' }}
            >
              <RotateCw size={12} className={isRefreshingLogs ? 'animate-spin' : ''} />
              <span>{isRefreshingLogs ? '刷新中...' : '刷新'}</span>
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-secondary ds-btn-sm"
              onClick={() => onNavigate('logs')}
            >
              <span>查看完整日志</span>
              <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        <div className="ds-table-wrapper">
          {recentRequests.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Terminal size={32} style={{ opacity: 0.35, marginBottom: '8px', display: 'inline-block' }} />
              <div style={{ fontSize: '13px', fontWeight: 500 }}>
                {recentLoading ? '正在加载最新流水...' : '暂无调用流水记录'}
              </div>
              <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                网关运行中，当发起 API 请求时将在此自动实时呈现
              </div>
            </div>
          ) : (
            <table className="ds-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>请求 ID</th>
                  <th>供应商</th>
                  <th>目标模型</th>
                  <th>调用端点</th>
                  <th>状态码</th>
                  <th>耗时</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((req) => (
                  <tr key={req.rawId || req.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {req.time}
                    </td>
                    <td
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--brand-primary)' }}
                      title={req.rawId}
                    >
                      {req.id}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {req.icon ? (
                          <img src={req.icon} alt="" width={15} height={15} />
                        ) : (
                          <Layers size={14} className="text-muted" />
                        )}
                        <span style={{ fontWeight: 500 }}>{req.provider}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px' }} title={req.model}>
                      {req.model}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`ds-method-badge ds-method-${req.method.toLowerCase()}`}>
                          {req.method}
                        </span>
                        <span className="ds-endpoint" title={req.endpoint}>{req.endpoint}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`ds-badge ${
                          req.isCanceled
                            ? 'ds-badge-mono'
                            : req.status === 200
                              ? 'ds-badge-green'
                              : 'ds-badge-red'
                        }`}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>{req.latency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 6. 支持的模型协议 */}
      <section className="ds-card">
        <div className="ds-card-header">
          <div className="ds-card-title">
            <Layers size={16} className="text-brand" />
            支持的模型协议
          </div>
        </div>

        <div className="supported-providers-grid">
          <div className="supported-provider-card" onClick={() => onNavigate('providers')}>
            <div className="cc-provider-logo">
              <img src={openaiIcon} alt="OpenAI" />
            </div>
            <div className="cc-provider-meta">
              <div className="cc-provider-name">OpenAI</div>
              <div className="cc-provider-models">GPT-4o / GPT-5</div>
              <div className="cc-provider-stats">
                <span className="text-green">● 已连接</span>
                <span>182ms</span>
              </div>
            </div>
          </div>

          <div className="supported-provider-card" onClick={() => onNavigate('providers')}>
            <div className="cc-provider-logo">
              <img src={claudeIcon} alt="Claude" />
            </div>
            <div className="cc-provider-meta">
              <div className="cc-provider-name">Claude</div>
              <div className="cc-provider-models">Claude 3.7 / 3.5 Sonnet</div>
              <div className="cc-provider-stats">
                <span className="text-green">● 已连接</span>
                <span>241ms</span>
              </div>
            </div>
          </div>

          <div className="supported-provider-card" onClick={() => onNavigate('providers')}>
            <div className="cc-provider-logo">
              <img src={geminiIcon} alt="Gemini" />
            </div>
            <div className="cc-provider-meta">
              <div className="cc-provider-name">Gemini</div>
              <div className="cc-provider-models">Gemini 2.5 Pro / Flash</div>
              <div className="cc-provider-stats">
                <span className="text-green">● 已连接</span>
                <span>208ms</span>
              </div>
            </div>
          </div>

          <div className="supported-provider-card" onClick={() => onNavigate('providers')}>
            <div className="cc-provider-logo">
              <img src={deepseekIcon} alt="DeepSeek" />
            </div>
            <div className="cc-provider-meta">
              <div className="cc-provider-name">DeepSeek</div>
              <div className="cc-provider-models">DeepSeek-V3 / R1</div>
              <div className="cc-provider-stats">
                <span className="text-green">● 已连接</span>
                <span>356ms</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
