import { loadSetting, removeSetting, saveSetting } from "../storage.js";
import { nowTime } from "./format.js";



function normalizeCustomAssets(assets) {
  if (!assets || typeof assets !== "object") return {};

  return Object.fromEntries(
    Object.entries(assets).flatMap(([key, value]) => {
      if (!value) return [];
      if (typeof value === "string") {
        return [[key, { name: "Custom file saved", dataUrl: value, type: "" }]];
      }
      if (typeof value === "object") {
        const dataUrl = value.dataUrl || value.src || "";
        if (!dataUrl) return [];
        return [[key, {
          name: value.name || "Custom file saved",
          dataUrl,
          type: value.type || ""
        }]];
      }
      return [];
    })
  );
}

export const state = {
  currentTab: "dashboard",
  alwaysOnTop: loadSetting("always_on_top", false),
  autoRefreshHandle: null,
  liveTickHandle: null,
  chainRefreshHandle: null,
  autoRefreshInFlight: false,
  chainRefreshInFlight: false,

  failureCount: 0,
  lastError: null,

  chainGuardEnabled: loadSetting("chain_guard_enabled", false),
  soundEnabled: loadSetting("sound_enabled", true),
  customAssets: normalizeCustomAssets(loadSetting("custom_assets", {})),

  alerts: loadSetting("alerts", [{ time: nowTime(), text: "RavenWatch booted." }]),

  debug: {
    moneyRaw: null,
    stockRaw: null,
    fullRaw: null
  },

  dashboard: {
    data: null,
    source: "none",
    stale: false,
    warning: null,
    timestamp: null
  },

  travelDrops: loadSetting("travel_drops", [])
};

export function setCurrentTab(tab) {
  state.currentTab = tab;
}

export function setAlwaysOnTopLocal(value) {
  state.alwaysOnTop = value;
  saveSetting("always_on_top", value);
}

export function setChainGuardEnabled(value) {
  state.chainGuardEnabled = value;
  saveSetting("chain_guard_enabled", value);
}

export function setSoundEnabled(value) {
  state.soundEnabled = value;
  saveSetting("sound_enabled", value);
}

export function saveAlerts() {
  saveSetting("alerts", state.alerts);
}

export function saveTravelDrops() {
  saveSetting("travel_drops", state.travelDrops);
}

export function pushAlert(text) {
  state.alerts.unshift({ time: nowTime(), text });
  state.alerts = state.alerts.slice(0, 100);
  saveAlerts();
}

export function saveCustomAssets() {
  saveSetting("custom_assets", state.customAssets);
}

export function setCustomAsset(key, value) {
  state.customAssets = {
    ...(state.customAssets || {}),
    [key]: value
  };
  saveCustomAssets();
}

export function clearCustomAsset(key) {
  if (!state.customAssets || !(key in state.customAssets)) return;

  const next = { ...(state.customAssets || {}) };
  delete next[key];
  state.customAssets = next;

  if (Object.keys(next).length) {
    saveCustomAssets();
  } else {
    removeSetting("custom_assets");
  }
}

export function resetCustomAssets() {
  state.customAssets = {};
  removeSetting("custom_assets");
}
