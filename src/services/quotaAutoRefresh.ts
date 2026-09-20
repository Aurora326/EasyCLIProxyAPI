import { useEffect, useState } from 'react';
import { managementApi, readBoolean, responseList } from './managementApi';
import { dedupeAuthFiles } from './authFiles';
import { fileName, loadQuota, providerForFile, quotaKey, type AuthFile } from './quotaService';
import {
  captureQuotaCacheGeneration,
  commitQuotaCacheIfCurrent,
  updateQuotaCache,
} from './quotaCache';

export const QUOTA_AUTO_REFRESH_INTERVAL_KEY = 'cpa-gui.quota-auto-refresh-interval.v1';

export const QUOTA_AUTO_REFRESH_OPTIONS = [
  { value: 0, labelKey: 'config.software.quotaAutoRefresh.disabled' },
  { value: 15, labelKey: 'config.software.quotaAutoRefresh.15m' },
  { value: 30, labelKey: 'config.software.quotaAutoRefresh.30m' },
  { value: 60, labelKey: 'config.software.quotaAutoRefresh.1h' },
  { value: 120, labelKey: 'config.software.quotaAutoRefresh.2h' },
  { value: 360, labelKey: 'config.software.quotaAutoRefresh.6h' },
] as const;

export type QuotaAutoRefreshMinutes = (typeof QUOTA_AUTO_REFRESH_OPTIONS)[number]['value'];

const listeners = new Set<() => void>();

export const readQuotaAutoRefreshInterval = (): number => {
  if (typeof window === 'undefined') return 0;
  try {
    const saved = window.localStorage.getItem(QUOTA_AUTO_REFRESH_INTERVAL_KEY);
    if (!saved) return 0;
    const parsed = Number(saved);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

export const writeQuotaAutoRefreshInterval = (minutes: number) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUOTA_AUTO_REFRESH_INTERVAL_KEY, String(minutes));
    listeners.forEach((listener) => listener());
  } catch {
  }
};

let isRefreshing = false;
let lastRefreshedAt = Date.now();

export const executeQuotaAutoRefresh = async (): Promise<boolean> => {
  if (isRefreshing) return false;
  isRefreshing = true;
  try {
    const payload = await managementApi.get('/auth-files');
    const allFiles = dedupeAuthFiles(responseList(payload, 'files'));
    const queryableFiles = allFiles.filter(
      (file: AuthFile) => !readBoolean(file, 'disabled') && providerForFile(file),
    );
    if (queryableFiles.length === 0) return true;

    const cacheGeneration = captureQuotaCacheGeneration();
    const BATCH_SIZE = 3;
    for (let index = 0; index < queryableFiles.length; index += BATCH_SIZE) {
      const batch = queryableFiles.slice(index, index + BATCH_SIZE);
      await Promise.all(
        batch.map(async (file) => {
          try {
            const result = await loadQuota(file);
            commitQuotaCacheIfCurrent(cacheGeneration, () => {
              updateQuotaCache((current) => ({
                ...current,
                [quotaKey(file)]: result,
              }));
            });
          } catch (error) {
            console.warn(`[QuotaAutoRefresh] failed to refresh ${fileName(file)}:`, error);
          }
        }),
      );
    }
    lastRefreshedAt = Date.now();
    return true;
  } catch (error) {
    console.warn('[QuotaAutoRefresh] batch refresh failed:', error);
    return false;
  } finally {
    isRefreshing = false;
  }
};

export function useQuotaAutoRefresh(coreRunning: boolean) {
  const [intervalMinutes, setIntervalMinutes] = useState(readQuotaAutoRefreshInterval);

  useEffect(() => {
    const onChange = () => setIntervalMinutes(readQuotaAutoRefreshInterval());
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (!coreRunning || intervalMinutes <= 0) return undefined;

    const intervalMs = intervalMinutes * 60 * 1000;
    const checkTimer = window.setInterval(() => {
      const elapsed = Date.now() - lastRefreshedAt;
      if (elapsed >= intervalMs) {
        void executeQuotaAutoRefresh();
      }
    }, 30_000);

    return () => {
      window.clearInterval(checkTimer);
    };
  }, [coreRunning, intervalMinutes]);

  return { intervalMinutes, setIntervalMinutes: writeQuotaAutoRefreshInterval };
}
