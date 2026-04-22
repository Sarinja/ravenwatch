import { loadSetting, removeSetting, saveSetting } from "../storage.js";
import { SETTINGS_KEY } from "../services/dashboardConfig.js";

const APP_KEY_PREFIX = "ravenwatch:";

export function resetAppData() {
  try {
    const existingSettings = loadSetting(SETTINGS_KEY, {});
    const preservedLicenseHash = existingSettings?.licenseHash || "";

    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(APP_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    if (preservedLicenseHash) {
      saveSetting(SETTINGS_KEY, {
        licenseHash: preservedLicenseHash
      });
    }

    try {
      sessionStorage.clear();
    } catch {
      // Ignore session storage failures
    }
  } catch (error) {
    console.error("RavenWatch: failed to reset app data", error);
    throw error;
  }

  window.location.reload();
}