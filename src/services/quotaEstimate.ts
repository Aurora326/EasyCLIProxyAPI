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

/**
 * 从授权凭据对象或文件名中提取账号标识（通常为邮箱或账号名），与 usage.db 中的 source 字段匹配
 */
export function extractAuthSource(file?: Record<string, unknown> | null, name?: string): string | undefined {
  if (!file && !name) return undefined;
  if (file) {
    for (const key of ['email', 'account', 'user_email', 'userEmail']) {
      const val = file[key];
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
  }
  const targetName = name || (typeof file?.name === 'string' ? file.name : '');
  if (targetName) {
    const cleanName = targetName.replace(/\.json$/i, '');
    const stripped = cleanName.replace(/^(?:antigravity|codex|claude|kimi|xai|devin)-+/i, '');
    const emailMatch = stripped.match(/([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/);
    if (emailMatch) return emailMatch[1];
  }
  return undefined;
}

const usageWindowCache = new Map<string, { timestamp: number; models: WindowUsageCategory[] }>();
const activeUsageQueries = new Map<string, Promise<WindowUsageCategory[]>>();

export async function fetchWindowUsageModels(
  provider: QuotaProvider | null | undefined,
  windowStartMs: number,
  source?: string
): Promise<WindowUsageCategory[]> {
  if (!isTauri() || !provider) return [];
  const normalizedSource = source?.trim() || '';
  const cacheKey = `${provider}:${normalizedSource}:${windowStartMs}`;
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
          source: normalizedSource || undefined,
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
 * 1. 采用置信度加权（Bayesian Blending）平滑过渡：
 *    - 当已消耗极低（< 2% 或剩余 > 98%）时，样本严重不足、除法放大误差极大，此时完全使用官方基准（Baseline）；
 *    - 当已消耗在 2% ~ 15% 之间时，进行置信度加权融合，基准逐步平滑过渡到动态反推；
 *    - 当已消耗 >= 15% 时，完全采用真实消耗反推值。
 * 2. 异常离群保护（Sanity Guard）：
 *    - 设定反推总额相对于官方基准的合理倍数（0.2x ~ 3.5x），避免多账号串流或统计偏差引发荒谬天文数字（如 18B）。
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
  const usedPercent = Math.max(0, 100 - remainingPercent);

  // 门槛 1：如果本地在当前窗口内记录了真实调用消耗，且已消耗比例达到统计学意义门槛（>= 2%）
  if (
    actualConsumedTokens !== undefined
    && actualConsumedTokens > 0
    && usedPercent >= 2.0
  ) {
    const usedFraction = usedPercent / 100;
    const rawDynamicTotal = actualConsumedTokens / usedFraction;

    // 门槛 2：异常离群钳位保护（防范异常暴涨，例如不得超出官方标准基准的 3.5 倍，亦不低于 0.2 倍）
    const maxAllowedTotal = baseline.baseTokens * 3.5;
    const minAllowedTotal = baseline.baseTokens * 0.2;
    const isClamped = rawDynamicTotal > maxAllowedTotal || rawDynamicTotal < minAllowedTotal;
    const boundedDynamicTotal = Math.max(minAllowedTotal, Math.min(maxAllowedTotal, rawDynamicTotal));

    // 门槛 3：在 2% ~ 15% 的低消耗区间进行置信度加权平滑，防止临界点阶跃突变
    const confidenceWeight = Math.min(1.0, Math.max(0, (usedPercent - 2.0) / 13.0));
    const dynamicTotalTokens = (1.0 - confidenceWeight) * baseline.baseTokens + confidenceWeight * boundedDynamicTotal;

    const estimatedTokens = dynamicTotalTokens * fraction;
    // 美金价值按照模型基准价格比例等比动态折算
    const estimatedCostUsd = baseline.baseUsd * (dynamicTotalTokens / baseline.baseTokens) * fraction;

    let tooltipExtra = '';
    if (confidenceWeight < 1.0) {
      tooltipExtra = '，已融合官方基准平滑过渡';
    } else if (isClamped) {
      tooltipExtra = '，已应用安全上限防抖保护';
    }

    return {
      estimatedTokens,
      estimatedTokensFormatted: formatTokenCount(estimatedTokens),
      estimatedCostUsd,
      estimatedCostUsdFormatted: formatUsdAmount(estimatedCostUsd),
      isDynamic: true,
      actualConsumedTokens,
      dynamicTotalTokens,
      tooltip: `预估剩余约 ${formatTokenCount(estimatedTokens)}（基于本地实际消耗 ${formatTokenCount(actualConsumedTokens)} 动态反推，周期总额约 ${formatTokenCount(dynamicTotalTokens)}${tooltipExtra}）`,
    };
  }

  // 兜底：刚重置、尚未消耗（100%）、消耗比例极低（< 2%）或本地尚无请求记录时，使用官方标准容量基准
  const estimatedTokens = baseline.baseTokens * fraction;
  const estimatedCostUsd = baseline.baseUsd * fraction;

  const lowSampleHint = (actualConsumedTokens && actualConsumedTokens > 0 && usedPercent < 2.0)
    ? '，当前消耗比例极低已自动采用官方基准以避免放大误差'
    : '';

  return {
    estimatedTokens,
    estimatedTokensFormatted: formatTokenCount(estimatedTokens),
    estimatedCostUsd,
    estimatedCostUsdFormatted: formatUsdAmount(estimatedCostUsd),
    isDynamic: false,
    tooltip: `预估剩余约 ${formatTokenCount(estimatedTokens)}（基于官方标准基准折算，周期基准总额约 ${formatTokenCount(baseline.baseTokens)}${lowSampleHint}）`,
  };
}
