import { describe, expect, it } from 'bun:test';
import {
  calculateQuotaEstimate,
  extractAuthSource,
  extractConsumedTokens,
  formatTokenCount,
  formatUsdAmount,
} from '../src/services/quotaEstimate';

describe('extractAuthSource', () => {
  it('优先从 file.email 读取', () => {
    expect(extractAuthSource({ email: 'user@example.com' }, 'unnamed')).toBe('user@example.com');
  });

  it('支持从文件名中正则提取 email', () => {
    expect(extractAuthSource({}, 'antigravity-lz2644134983@gmail.com.json')).toBe('lz2644134983@gmail.com');
  });

  it('无有效标识时返回 undefined', () => {
    expect(extractAuthSource(null, 'custom-token.json')).toBeUndefined();
  });
});

describe('calculateQuotaEstimate 防护机制', () => {
  const provider = 'antigravity';
  const labelWeekly = 'Gemini 模型 · 每周额度';
  const label5h = 'Gemini 模型 · 5 小时额度';

  it('当已消耗低于 2%（剩余 99%）时，自动采用官方标准基准，防止小样本除法暴涨至数十亿', () => {
    // 即使传入了 155M 的巨额消耗（可能由多账号串台或历史遗留导致）
    const estimate = calculateQuotaEstimate(provider, labelWeekly, 99, undefined, 155_820_000);
    expect(estimate).not.toBeNull();
    // 官方 Gemini 周基准为 260M，剩余 99% 约为 257.4M，绝不能变成 18.82B
    expect(estimate!.isDynamic).toBe(false);
    expect(estimate!.estimatedTokens).toBeCloseTo(260_000_000 * 0.99, -4);
    expect(estimate!.tooltip).toContain('当前消耗比例极低已自动采用官方基准以避免放大误差');
  });

  it('当已消耗达到合理区间（剩余 80% 即消耗 20%）时，正确使用本地真实消耗动态反推', () => {
    // 消耗 20M，消耗比例 20%，反推总额 100M，剩余 80M
    const estimate = calculateQuotaEstimate(provider, label5h, 80, undefined, 20_000_000);
    expect(estimate).not.toBeNull();
    expect(estimate!.isDynamic).toBe(true);
    expect(estimate!.actualConsumedTokens).toBe(20_000_000);
    expect(estimate!.dynamicTotalTokens).toBe(100_000_000);
    expect(estimate!.estimatedTokens).toBe(80_000_000);
  });

  it('在 2% ~ 15% 的消耗区间进行置信度加权融合，平滑过渡无断崖跳跃', () => {
    // 消耗 5%（剩余 95%）
    const estimate = calculateQuotaEstimate(provider, labelWeekly, 95, undefined, 20_000_000);
    expect(estimate).not.toBeNull();
    expect(estimate!.isDynamic).toBe(true);
    expect(estimate!.tooltip).toContain('已融合官方基准平滑过渡');
    // 融合总额应该介于基准（260M）与钳位后的动态总额之间，不会产生失控数值
    expect(estimate!.dynamicTotalTokens).toBeGreaterThan(0);
    expect(estimate!.dynamicTotalTokens).toBeLessThan(260_000_000 * 3.5);
  });

  it('反推总额超出上限（3.5倍）时触发钳位保护', () => {
    // 消耗 10%（剩余 90%），如果传入 500M 消耗，粗算总额为 5000M（超基准 260M 的 19 倍）
    const estimate = calculateQuotaEstimate(provider, labelWeekly, 90, undefined, 500_000_000);
    expect(estimate).not.toBeNull();
    // 应该被安全钳位在基准的 3.5 倍以内（<= 910M）
    expect(estimate!.dynamicTotalTokens).toBeLessThanOrEqual(260_000_000 * 3.5 + 1);
  });
});
