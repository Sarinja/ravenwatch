import { getDashboardSettings, saveDashboardSettings } from "./dashboardConfig.js";
import {
  activateLicense as activateLicenseOnServer,
  getLicenseStatus,
  refreshLicenseToken
} from "./licenseClient.js";
import { getOrCreateDeviceId } from "./deviceId.js";

const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function normalize(value) {
  return String(value || "").trim();
}

function isRevokedResult(result) {
  return (
    !result?.ok &&
    Number(result?.status || 0) === 403 &&
    normalize(result?.error).toLowerCase().includes("revoked")
  );
}

function isHardRejectResult(result) {
  return !result?.ok && [401, 403, 404].includes(Number(result?.status || 0));
}

function markLicensed({ token, label }) {
  saveDashboardSettings({
    licenseToken: normalize(token),
    licenseLabel: normalize(label),
    licenseServerStatus: "licensed",
    licenseLastValidatedAt: Date.now()
  });
}

function markRevoked() {
  saveDashboardSettings({
    licenseToken: "",
    licenseServerStatus: "revoked"
  });
}

function markUnlicensed(preserve = {}) {
  saveDashboardSettings({
    licenseToken: "",
    licenseServerStatus: "unlicensed",
    ...preserve
  });
}

function markServerError(recentlyValidated) {
  saveDashboardSettings({
    licenseServerStatus: recentlyValidated ? "offline_grace" : "error"
  });
}

async function tryAutoReactivate(settings) {
  const licenseKey = normalize(settings?.licenseLicenseKey);
  const deviceId = normalize(settings?.deviceId);
  const deviceName = "RavenWatch Desktop";

  if (!licenseKey || !deviceId) {
    return { ok: false, reason: "missing_saved_key_or_device" };
  }

  const activateResult = await activateLicenseOnServer({
    licenseKey,
    deviceId,
    deviceName
  });

  if (activateResult?.ok && activateResult?.token) {
    saveDashboardSettings({
      licenseToken: normalize(activateResult.token),
      licenseLicenseKey: licenseKey,
      licenseLabel: normalize(activateResult?.license?.label || settings?.licenseLabel),
      licenseServerStatus: "licensed",
      licenseLastValidatedAt: Date.now()
    });

    return { ok: true };
  }

  if (isRevokedResult(activateResult)) {
    markRevoked();
    return { ok: false, reason: "revoked" };
  }

  if (isHardRejectResult(activateResult)) {
    markUnlicensed();
    return { ok: false, reason: "rejected" };
  }

  return {
    ok: false,
    reason: "unknown",
    error: activateResult?.error || "auto-reactivation failed"
  };
}

export async function validateLicenseOnStartup() {
  const settings = getDashboardSettings();
  const token = normalize(settings?.licenseToken);
  const lastValidatedAt = Number(settings?.licenseLastValidatedAt || 0);

  const now = Date.now();
  const recentlyValidated =
    lastValidatedAt > 0 && now - lastValidatedAt <= OFFLINE_GRACE_MS;

  if (!token) {
    try {
      const reactivation = await tryAutoReactivate(settings);

      if (reactivation?.ok) {
        return;
      }

      if (reactivation?.reason === "revoked") {
        return;
      }

      saveDashboardSettings({
        licenseServerStatus: "unlicensed"
      });
      return;
    } catch (error) {
      console.error("RavenWatch: startup auto-reactivation failed", error);
      markServerError(recentlyValidated);
      return;
    }
  }

  try {
    const statusResult = await getLicenseStatus(token);

    if (statusResult?.ok && statusResult?.valid) {
      saveDashboardSettings({
        licenseServerStatus: "licensed",
        licenseLastValidatedAt: Date.now()
      });
      return;
    }

    if (isRevokedResult(statusResult)) {
      markRevoked();

      const retrySettings = getDashboardSettings();
      const reactivation = await tryAutoReactivate(retrySettings);
      if (reactivation?.ok) return;

      return;
    }

    const refreshResult = await refreshLicenseToken(token);

    if (refreshResult?.ok && refreshResult?.token) {
      markLicensed({
        token: refreshResult.token,
        label: refreshResult?.license?.label || settings?.licenseLabel || ""
      });
      return;
    }

    if (isRevokedResult(refreshResult)) {
      markRevoked();

      const retrySettings = getDashboardSettings();
      const reactivation = await tryAutoReactivate(retrySettings);
      if (reactivation?.ok) return;

      return;
    }

    markUnlicensed();
  } catch (error) {
    console.error("RavenWatch: startup license validation failed", error);
    markServerError(recentlyValidated);
  }
}

export async function validateLicenseSilently() {
  const settings = getDashboardSettings();
  const token = normalize(settings?.licenseToken);

  if (!token) return;

  try {
    const statusResult = await getLicenseStatus(token);

    if (statusResult?.ok && statusResult?.valid) {
      saveDashboardSettings({
        licenseServerStatus: "licensed",
        licenseLastValidatedAt: Date.now()
      });
      return;
    }

    if (isRevokedResult(statusResult)) {
      markRevoked();
      return;
    }

    const refreshResult = await refreshLicenseToken(token);

    if (refreshResult?.ok && refreshResult?.token) {
      markLicensed({
        token: refreshResult.token,
        label: refreshResult?.license?.label || settings?.licenseLabel || ""
      });
      return;
    }

    if (isRevokedResult(refreshResult)) {
      markRevoked();
      return;
    }
  } catch (error) {
    console.warn("RavenWatch: silent license check failed", error);
  }
}

export function isSavedLicenseValid(settings = getDashboardSettings()) {
  const token = normalize(settings?.licenseToken);
  const status = normalize(settings?.licenseServerStatus);
  return !!token && (status === "licensed" || status === "offline_grace");
}

export function getLicenseStatusText(settings = getDashboardSettings()) {
  const status = normalize(settings?.licenseServerStatus);
  const label = normalize(settings?.licenseLabel);
  const hasToken = !!normalize(settings?.licenseToken);

  if (status === "licensed" && hasToken) {
    return label ? "Licensed" : "Licensed";
  }

  if (status === "offline_grace" && hasToken) {
    return label ? "Licensed (offline)" : "Licensed (offline)";
  }

  if (status === "revoked") {
    return label ? `Revoked - ${label}` : "Revoked";
  }

  if (status === "error") {
    return "License server unavailable";
  }

  if (status === "expired") {
    return "License expired - please reactivate";
  }

  return "Unlicensed - enter a valid license key and click Save";
}

export async function activateLicenseServerSide(
  rawKey,
  deviceName = "RavenWatch Desktop"
) {
  const licenseKey = normalize(rawKey);
  if (!licenseKey) {
    throw new Error("License key is required");
  }

  const deviceId = getOrCreateDeviceId();

  const result = await activateLicenseOnServer({
    licenseKey,
    deviceId,
    deviceName
  });

  if (!result?.ok || !result?.token) {
    saveDashboardSettings({
      licenseToken: "",
      licenseLicenseKey: licenseKey,
      licenseLabel: "",
      licenseServerStatus: "unlicensed"
    });

    throw new Error(result?.error || "License activation failed");
  }

  saveDashboardSettings({
    licenseToken: normalize(result.token),
    licenseLicenseKey: licenseKey,
    licenseLabel: normalize(result?.license?.label || ""),
    licenseLastValidatedAt: Date.now(),
    licenseServerStatus: "licensed"
  });

  return result;
}