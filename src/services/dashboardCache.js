import { loadSetting, saveSetting } from "../storage.js";
import { getCorrectedNowMs } from "../core/timeSync.js";

const CACHE_KEY = "dashboard_cache";

export function getCachedDashboard() {
  return loadSetting(CACHE_KEY, null);
}

export function saveCachedDashboard(payload) {
  saveSetting(CACHE_KEY, payload);
}

export function isCacheFresh(cache, ttlMs) {
  if (!cache?.timestamp) return false;
  return getCorrectedNowMs() - cache.timestamp <= ttlMs;
}