import {
  getDashboardSettings,
  saveDashboardSettings,
  runDashboardFetchWithCacheFallback,
  runChainRefresh
} from "../scanner.js";
import { getStatus } from "./dom.js";
import {
  state,
  pushAlert,
  setAlwaysOnTopLocal
} from "./state.js";
import { setAlwaysOnTopSafe } from "../services/window.js";
import { getCorrectedNowMs } from "./timeSync.js";
import { isSavedLicenseValid } from "../services/license.js";

function setStatus(text) {
  const status = getStatus();
  if (status) {
    status.innerText = text;
  }
}

export function readDashboardSettingsFromDom() {
  return {
    apiKey: document.getElementById("apiKeyInput")?.value?.trim() ?? "",
    endpointPath: document.getElementById("endpointPathInput")?.value?.trim() || "/user",
    endpointSelections:
      document.getElementById("endpointSelectionsInput")?.value?.trim() ||
      "profile,bars,cooldowns,money,travel,stocks",
    refreshIntervalMs:
      Math.max(10, Number(document.getElementById("refreshIntervalInput")?.value || 60)) * 1000,
    factionId: document.getElementById("factionIdInput")?.value?.trim() ?? "",
    enableFactionData: true,
    yataTravelExportUrl:
      document.getElementById("yataTravelExportUrlInput")?.value?.trim() ||
      "https://yata.yt/api/v1/travel/export/",
    yataApiKey: document.getElementById("yataApiKeyInput")?.value?.trim() ?? "",
    maxFfTargets:
      Math.max(1, Math.min(20, Number(document.getElementById("maxFfTargetsInput")?.value || 5))),
    ffscouterApiKey: document.getElementById("ffscouterApiKeyInput")?.value?.trim() ?? ""
  };
}

export async function executeDashboardLoad(render, options = {}) {
  const settings = getDashboardSettings();

  if (!isSavedLicenseValid(settings)) {
    const licenseStatus = String(settings?.licenseServerStatus || "").trim();
    const licenseLabel = String(settings?.licenseLabel || "").trim();

    if (licenseStatus === "revoked") {
      pushAlert("Blocked: license has been revoked.");
      setStatus(licenseLabel ? `Revoked - ${licenseLabel}` : "Revoked");
      return;
    }

    if (licenseStatus === "expired") {
      pushAlert("Blocked: license has expired.");
      setStatus(licenseLabel ? `Expired - ${licenseLabel}` : "Expired");
      return;
    }

    if (licenseStatus === "error") {
      pushAlert("Blocked: license server unavailable.");
      setStatus("License server unavailable");
      return;
    }

    pushAlert("Blocked: invalid or missing license key.");
    setStatus("Unlicensed");
    return;
  }

  if (!settings.apiKey) {
    pushAlert("Blocked: missing API key.");
    setStatus("Missing API key");
    return;
  }

  setStatus("Loading your character...");

  try {
    const result = await runDashboardFetchWithCacheFallback(options);

    state.dashboard = {
      data: result.dashboard,
      source: result.source || "unknown",
      stale: !!result.stale,
      warning: result.warning || null,
      timestamp: result.timestamp || getCorrectedNowMs()
    };

    state.debug.moneyRaw = result.moneyRaw ?? null;
    state.debug.stockRaw = result.stockRaw ?? null;
    state.debug.fullRaw = result.raw ?? null;

    setStatus(`Loaded ${result.dashboard?.name || "character"}`);
    pushAlert(`Character data loaded from ${state.dashboard.source}.`);

    if (typeof render === "function") {
      render();
    }
  } catch (error) {
    setStatus(`Load failed: ${error.message}`);
    pushAlert(`Load failed: ${error.message}`);

    if (typeof render === "function") {
      render();
    }
  }
}

export async function applyAlwaysOnTop(value) {
  setAlwaysOnTopLocal(value);
  await setAlwaysOnTopSafe(value);
  setStatus(value ? "Pinned above other windows" : "Normal window mode");
}

export async function executeChainRefresh(render) {
  try {
    const result = await runChainRefresh();

    state.dashboard = {
      ...state.dashboard,
      data: {
        ...(state.dashboard.data || {}),
        factionData: {
          ...(state.dashboard.data?.factionData || {}),
          ...(result.dashboard?.factionData || {}),
          chain: result.dashboard?.factionData?.chain || state.dashboard.data?.factionData?.chain
        }
      },
      source: result.source || "network-chain",
      stale: !!result.stale,
      warning: result.warning || null,
      timestamp: result.timestamp || getCorrectedNowMs()
    };

    pushAlert(`Chain refreshed • ${result.dashboard?.factionData?.chain?.count || 0} hits`);
    setStatus(`Chain updated • ${result.dashboard?.factionData?.chain?.count || 0} hits`);

    if (typeof render === "function") {
      render();
    }
  } catch (error) {
    console.error("RavenWatch: chain refresh failed", error);
    pushAlert(`Chain refresh failed: ${error.message}`);
    throw error;
  }
}

export async function saveDashboardSettingsFromDom() {
  const baseSettings = readDashboardSettingsFromDom();

  return saveDashboardSettings({
    ...baseSettings
  });
}