import { getDashboardSettings, saveDashboardSettings } from "./dashboardConfig.js";

function normalize(value) {
  return String(value || "").trim();
}

function generateDeviceId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `rw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateDeviceId() {
  const settings = getDashboardSettings();
  const existing = normalize(settings?.deviceId);

  if (existing) {
    return existing;
  }

  const deviceId = generateDeviceId();
  saveDashboardSettings({ deviceId });
  return deviceId;
}