import { loadSetting, saveSetting } from "../storage.js";

export const SETTINGS_KEY = "dashboard_settings";

export const DEFAULT_SETTINGS = {
  apiKey: "",
  endpointPath: "/user",
  endpointSelections: "profile,bars,cooldowns,money,travel,stocks,battlestats",
  refreshIntervalMs: 60000,
  cooldownMs: 2500,
  cacheTtlMs: 0,
  timeoutMs: 12000,
  enabled: false,
  factionId: "",
  enableFactionData: true,
  yataTravelExportUrl: "https://yata.yt/api/v1/travel/export/",
  yataApiKey: "",
  ffscouterApiKey: "",
  licenseApiBaseUrl: "https://journeytoragnarok.com/ravenwatch-api",
  deviceId: "",
  licenseToken: "",
  licenseLicenseKey: "",
  licenseLabel: "",
  licenseLastValidatedAt: 0,
  licenseServerStatus: "unlicensed",
};

function normalizeLicenseApiBaseUrl(rawValue) {
  const raw = String(rawValue || "").trim().replace(/\/+$/, "");
  const canonical = DEFAULT_SETTINGS.licenseApiBaseUrl;

  if (!raw) return canonical;

  const lowered = raw.toLowerCase();

  const legacyBadValues = new Set([
    "http://31.97.132.98:5000",
    "http://31.97.132.98:5000/ravenwatch-api",
    "https://31.97.132.98:5000",
    "https://31.97.132.98:5000/ravenwatch-api",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5000/ravenwatch-api",
    "https://127.0.0.1:5000",
    "https://127.0.0.1:5000/ravenwatch-api",
    "http://localhost:5000",
    "http://localhost:5000/ravenwatch-api",
    "https://localhost:5000",
    "https://localhost:5000/ravenwatch-api",
    "https://journeytoragnarok.com",
    "http://journeytoragnarok.com",
  ]);

  if (legacyBadValues.has(lowered)) {
    return canonical;
  }

  if (lowered === "https://journeytoragnarok.com/ravenwatch-api") {
    return canonical;
  }

  if (lowered.endsWith("/ravenwatch-api")) {
    return raw;
  }

  if (
    lowered.includes("journeytoragnarok.com") &&
    !lowered.endsWith("/ravenwatch-api")
  ) {
    return canonical;
  }

  return raw;
}

export function getDashboardSettings() {
  const stored = loadSetting(SETTINGS_KEY, {}) || {};

  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    licenseApiBaseUrl: normalizeLicenseApiBaseUrl(stored.licenseApiBaseUrl)
  };

  if (merged.licenseApiBaseUrl !== stored.licenseApiBaseUrl) {
    saveSetting(SETTINGS_KEY, merged);
  }

  return merged;
}

export function saveDashboardSettings(next) {
  const merged = {
    ...getDashboardSettings(),
    ...next
  };

  merged.licenseApiBaseUrl = normalizeLicenseApiBaseUrl(merged.licenseApiBaseUrl);

  saveSetting(SETTINGS_KEY, merged);
  return merged;
}