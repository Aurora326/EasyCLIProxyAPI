import { invoke, isTauri } from '@tauri-apps/api/core';
import type { QuotaProvider } from './quotaService';

export interface QuotaEstimate {
  estimatedTokens: number;
  estimatedTokensFormatted: string;
  estimatedCostUsd: number;
  estimatedCostUsdFormatted: string;
  isDynamic: boolean;
  actualConsumedTokens?: number;
  dynamicTotalTokens?: number;
  tooltip?: string;
}

export interface WindowUsageCategory {
  key: string;
  label: string;
  requests: number;
  failures: number;
  tokens: number;
}

interface UsageAnalysisResult {
  models?: WindowUsageCategory[];
  providers?: WindowUsageCategory[];
}

export type QuotaDisplayMode = 'current' | 'estimate';

export const QUOTA_DISPLAY_MODE_KEY = 'cpa-quota-display-mode';

export function getStoredQuotaDisplayMode(): QuotaDisplayMode {
  try {
    const saved = localStorage.getItem(QUOTA_DISPLAY_MODE_KEY);
    if (saved === 'current' || saved === 'estimate') {
      return saved;
    }
  } catch {
    // 忽略安全沙箱或无本地存储异常
  }
  return 'estimate'; // 默认开启预估模式以提供更丰富的量化数据
}

export function setStoredQuotaDisplayMode(mode: QuotaDisplayMode): void {
  try {
    localStorage.setItem(QUOTA_DISPLAY_MODE_KEY, mode);
  } catch {
    // 忽略异常
  }
}

export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0.00';
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(2)}B`;
  }
  // 优先以 M 为统一计量单位（>= 100K 统一格式化为 M，如 0.50M、65.00M）
  if (tokens >= 100_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(2)}K`;
  }
  return Math.round(tokens).toString();
}

export function formatUsdAmount(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00';
  return `$${usd.toFixed(2)}`;
}

interface BaseLimit {
  baseTokens: number;
  baseUsd: number;
}

/**
 * 官方标准基准容量表（用于尚未开始消耗 100% 或本地尚无请求记录时的兜底基线）
 */
function resolveBaseline(
  provider: QuotaProvider | null | undefined,
  label: string,
  detail?: string
): BaseLimit | null {
  const normLabel = label.trim().toLowerCase();
  // 移除所有空格、制表符、短横线、下划线、间隔号，避免“5 小时额度”因空格无法匹配的问题
  const cleanLabel = normLabel.replace(/[\s\-_·\.]/g, '');

  const is5h = cleanLabel.includes('5h')
    || cleanLabel.includes('5小时')
    || cleanLabel.includes('5hour')
    || cleanLabel.includes('5時間')
    || cleanLabel.includes('fivehour')
    || cleanLabel.includes('five')
    || cleanLabel.includes('primary');

  if (provider === 'antigravity') {
    const is3p = cleanLabel.includes('claude') || cleanLabel.includes('gpt') || cleanLabel.includes('3p');
    if (is3p) {
      // Claude & GPT 3P 模型：5 小时基准 500K tokens ($3.00)，每周基准 2.50M tokens ($15.00)
      return is5h
        ? { baseTokens: 500_000, baseUsd: 3.0 }
        : { baseTokens: 2_500_000, baseUsd: 15.0 };
    }
    // Gemini 官方模型：5 小时基准 65.00M tokens ($5.00)，每周基准 260.00M tokens ($19.50)
    return is5h
      ? { baseTokens: 65_000_000, baseUsd: 5.0 }
      : { baseTokens: 260_000_000, baseUsd: 19.5 };
  }

  if (provider === 'kimi') {
    return is5h
      ? { baseTokens: 2_500_000, baseUsd: 8.0 }
      : { baseTokens: 15_000_000, baseUsd: 50.0 };
  }

  if (provider === 'codex') {
    return is5h
      ? { baseTokens: 2_000_000, baseUsd: 10.0 }
      : { baseTokens: 15_000_000, baseUsd: 75.0 };
  }

  if (provider === 'claude') {
    return is5h
      ? { baseTokens: 1_000_000, baseUsd: 6.0 }
      : { baseTokens: 6_000_000, baseUsd: 36.0 };
  }

  if (provider === 'xai') {
    if (detail) {
      const match = detail.match(/\$([\d\.]+)/);
      if (match) {
        const usd = parseFloat(match[1]);
        if (!Number.isNaN(usd)) {
          return { baseTokens: usd * 400_000, baseUsd: usd };
        }
      }
    }
    return is5h
      ? { baseTokens: 2_000_000, baseUsd: 5.0 }
      : { baseTokens: 10_000_000, baseUsd: 25.0 };
  }

  if (provider === 'devin') {
    const isDaily = cleanLabel.includes('daily') || cleanLabel.includes('日');
    return isDaily
      ? { baseTokens: 5_000_000, baseUsd: 15.0 }
      : { baseTokens: 30_000_000, baseUsd: 90.0 };
  }

  return null;
}

export function getWindowDurationMs(label: string): number {
  const cleanLabel = label.trim().toLowerCase().replace(/[\s\-_·\.]/g, '');
  if (
    cleanLabel.includes('5h')
    || cleanLabel.includes('5小时')
    || cleanLabel.includes('5hour')
    || cleanLabel.includes('5時間')
    || cleanLabel.includes('fivehour')
    || cleanLabel.includes('five')
    || cleanLabel.includes('primary')
  ) {
    return 5 * 3600 * 1000;
  }
  if (cleanLabel.includes('daily') || cleanLabel.includes('日') || cleanLabel.includes('day')) {
    return 24 * 3600 * 1000;
  }
  return 7 * 24 * 3600 * 1000; // 每周
}

export function computeWindowStartMs(resetAtMs?: number, label?: string): number {
  const duration = label ? getWindowDurationMs(label) : 5 * 3600 * 1000;
  if (resetAtMs && resetAtMs > Date.now()) {
    return Math.max(0, resetAtMs - duration);
  }
  return Math.max(0, Date.now() - duration);
}

const usageWindowCache = new Map<string, { timestamp: number; models: WindowUsageCategory[] }>();
const activeUsageQueries = new Map<string, Promise<WindowUsageCategory[]>>();

export async function fetchWindowUsageModels(
  provider: QuotaProvider | null | undefined,
  windowStartMs: number
): Promise<WindowUsageCategory[]> {
  if (!isTauri() || !provider) return [];
  const cacheKey = `${provider}:${windowStartMs}`;
  const now = Date.now();
  const cached = usageWindowCache.get(cacheKey);
  if (cached && now - cached.timestamp < 15_000) {
    return cached.models;
  }
  if (activeUsageQueries.has(cacheKey)) {
    return activeUsageQueries.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const res = await invoke<UsageAnalysisResult>('get_usage_analysis', {
        query: {
          start: new Date(windowStartMs).toISOString(),
          provider,
          failed: false,
        },
      });
      const models = Array.isArray(res?.models) ? res.models : [];
      usageWindowCache.set(cacheKey, { timestamp: Date.now(), models });
      return models;
    } catch {
      return [];
    } finally {
      activeUsageQueries.delete(cacheKey);
    }
  })();

  activeUsageQueries.set(cacheKey, promise);
  return promise;
}

export function extractConsumedTokens(
  models: WindowUsageCategory[] | undefined,
  provider: QuotaProvider | null | undefined,
  label: string
): number {
  if (!models || models.length === 0) return 0;
  const cleanLabel = label.trim().toLowerCase().replace(/[\s\-_·\.]/g, '');

  if (provider === 'antigravity') {
    const is3p = cleanLabel.includes('claude') || cleanLabel.includes('gpt') || cleanLabel.includes('3p');
    return models
      .filter((m) => {
        const k = (m.key || '').toLowerCase();
        return is3p ? (k.includes('claude') || k.includes('gpt')) : k.includes('gemini');
      })
      .reduce((sum, m) => sum + (m.tokens || 0), 0);
  }

  return models.reduce((sum, m) => sum + (m.tokens || 0), 0);
}

/**
 * 计算预估额度：
 * 优先依据本地 usage.db 中该窗口内的真实 Token 消耗动态反推总额（方案 B）；
 * 若本周期刚重置、尚未消耗（100%）或本地无调用记录，则以官方标准基准平滑兜底。
 */
export function calculateQuotaEstimate(
  provider: QuotaProvider | null | undefined,
  label: string,
  remainingPercent: number | null,
  detail?: string,
  actualConsumedTokens?: number
): QuotaEstimate | null {
  if (remainingPercent === null || !Number.isFinite(remainingPercent)) {
    return null;
  }

  const baseline = resolveBaseline(provider, label, detail);
  if (!baseline) {
    return null;
  }

  const fraction = Math.max(0, Math.min(1, remainingPercent / 100));
  const usedPercent = 100 - remainingPercent;

  // 方案 B：如果本地在当前窗口内记录了真实调用消耗，且官方显示已有比例消耗（>= 0.5%）
  // 则依据真实使用数据反推实际动态总额！
  if (
    actualConsumedTokens !== undefined
    && actualConsumedTokens > 0
    && usedPercent >= 0.5
  ) {
    const usedFraction = usedPercent / 100;
    const dynamicTotalTokens = actualConsumedTokens / usedFraction;
    const estimatedTokens = dynamicTotalTokens * fraction;
    // 美金价值按照模型基准价格比例等比动态折算
    const estimatedCostUsd = baseline.baseUsd * (dynamicTotalTokens / baseline.baseTokens) * fraction;

    return {
      estimatedTokens,
      estimatedTokensFormatted: formatTokenCount(estimatedTokens),
      estimatedCostUsd,
      estimatedCostUsdFormatted: formatUsdAmount(estimatedCostUsd),
      isDynamic: true,
      actualConsumedTokens,
      dynamicTotalTokens,
      tooltip: `预估剩余约 ${formatTokenCount(estimatedTokens)}（基于本地实际消耗 ${formatTokenCount(actualConsumedTokens)} 动态反推，周期总额约 ${formatTokenCount(dynamicTotalTokens)}）`,
    };
  }

  // 兜底：刚重置、尚未消耗（100%）或本地尚无请求记录时，使用官方标准容量基准
  const estimatedTokens = baseline.baseTokens * fraction;
  const estimatedCostUsd = baseline.baseUsd * fraction;

  return {
    estimatedTokens,
    estimatedTokensFormatted: formatTokenCount(estimatedTokens),
    estimatedCostUsd,
    estimatedCostUsdFormatted: formatUsdAmount(estimatedCostUsd),
    isDynamic: false,
    tooltip: `预估剩余约 ${formatTokenCount(estimatedTokens)}（基于官方标准基准折算，周期基准总额约 ${formatTokenCount(baseline.baseTokens)}）`,
  };
}
