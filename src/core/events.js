import { getRefreshBtn, getToggleTopBtn, getNavButtons, getStatus } from "./dom.js";
import {
  state,
  clearCustomAsset,
  pushAlert,
  resetCustomAssets,
  setCurrentTab,
  saveTravelDrops,
  setCustomAsset,
  setSoundEnabled
} from "./state.js";
import { render } from "./render.js";
import {
  applyAlwaysOnTop,
  executeDashboardLoad,
  saveDashboardSettingsFromDom
} from "./actions.js";
import { getDashboardSettings, saveDashboardSettings } from "../services/dashboardConfig.js";
import { restartAutoRefresh, restartChainRefresh } from "./timers.js";
import { resetAppData } from "./reset.js";
import {
  clearTravelUiState,
  closeTravelEditor,
  importYataTravelData,
  openTravelEditor,
  toggleTravelItem,
  toggleTravelLocation
} from "../features/travel/travelTab.js";
import { toggleChainGuardAssetsSection } from "../features/settings/settingsTab.js";
import {
  deleteTravelDrop,
  updateTravelDrop
} from "../features/travel/travelStore.js";
import { state as appState } from "./state.js";
import { activateLicenseServerSide, isSavedLicenseValid } from "../services/license.js";
import {
  openArchitectProfile,
  openChangelogDoc,
  openReadmeDoc
} from "../features/info/infoTab.js";


function setStatus(text) {
  const status = getStatus();
  if (status) status.innerText = text;
}

const ASSET_INPUT_TO_KEY = {
  chainImageInput: "chainImage",
  criticalImageInput: "criticalImage",
  sound60Input: "sound60",
  sound10Input: "sound10"
};

const MAX_ASSET_SIZE_BYTES = 1024 * 1024 * 2;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function handleAssetUpload(input) {
  const key = ASSET_INPUT_TO_KEY[input?.id || ""];
  const file = input?.files?.[0];
  if (!key || !file) return;

  if (file.size > MAX_ASSET_SIZE_BYTES) {
    setStatus(`File too large for ${file.name}. Keep assets under 2 MB.`);
    pushAlert(`Asset upload skipped: ${file.name} is over 2 MB.`);
    input.value = "";
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    setCustomAsset(key, {
      name: file.name,
      type: file.type || "",
      dataUrl
    });
    pushAlert(`Saved custom asset: ${file.name}`);
    setStatus(`Saved ${file.name} for ${key}`);
    render();
  } catch (error) {
    console.error("RavenWatch: asset upload failed", error);
    setStatus(`Could not save ${file.name}`);
  } finally {
    input.value = "";
  }
}

function readTravelEditInputs() {
  const location = document.getElementById("travelEditLocation")?.value?.trim() || "";
  const item = document.getElementById("travelEditItem")?.value?.trim() || "";
  const dateValue = document.getElementById("travelEditTimestamp")?.value || "";
  const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;
  return { location, item, timestamp };
}

function findDrop(id) {
  return appState.travelDrops.find(drop => drop.id === id) || null;
}

export function bindStaticEvents() {
  getNavButtons().forEach(btn => {
    btn.addEventListener("click", () => {
      setCurrentTab(btn.dataset.tab || "dashboard");
      render();
    });
  });

  getRefreshBtn()?.addEventListener("click", async () => {
    await executeDashboardLoad(render);
    restartAutoRefresh();
    restartChainRefresh();
  });

  getToggleTopBtn()?.addEventListener("click", async () => {
    await applyAlwaysOnTop(!state.alwaysOnTop);
    render();
  });
}

export function bindDynamicEvents() {
  document.querySelectorAll("[data-settings-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.settingsToggle === "chainguard-assets") {
        toggleChainGuardAssetsSection();
        render();
      }
    });
  });

  document.getElementById("openReadmeBtn")?.addEventListener("click", async () => {
    await openReadmeDoc();
  });

  document.getElementById("openChangelogBtn")?.addEventListener("click", async () => {
    await openChangelogDoc();
  });

  document.getElementById("infoArchitectLink")?.addEventListener("click", async event => {
    await openArchitectProfile(event);
  });

  let resetConfirmUntil = 0;
  
  document.getElementById("resetAppDataBtn")?.addEventListener("click", () => {
    const now = Date.now();
  
    if (now > resetConfirmUntil) {
      resetConfirmUntil = now + 5000;
      pushAlert("Click Reset App Data again within 5 seconds to confirm.");
      setStatus("Click again to confirm reset");
      return;
    }
  
    try {
      pushAlert("Resetting RavenWatch...");
      setStatus("Resetting RavenWatch...");
      resetAppData();
    } catch (error) {
      console.error("RavenWatch: reset failed", error);
      pushAlert("Reset failed.");
      setStatus("Reset failed");
      render();
    } finally {
      resetConfirmUntil = 0;
    }
  });
  Object.keys(ASSET_INPUT_TO_KEY).forEach(id => {
    document.getElementById(id)?.addEventListener("change", async event => {
      await handleAssetUpload(event.target);
    });
  });

  document.querySelectorAll("[data-clear-asset]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.clearAsset || "";
      if (!key) return;
      clearCustomAsset(key);
      pushAlert(`Reset ${key} to default.`);
      setStatus(`${key} reset to default`);
      render();
    });
  });

  document.querySelectorAll("[data-reset-assets]").forEach(btn => {
    btn.addEventListener("click", () => {
      resetCustomAssets();
      pushAlert("All ChainGuard assets reset to defaults.");
      setStatus("All ChainGuard assets reset");
      render();
    });
  });

  document.getElementById("saveDashboardSettingsBtn")?.addEventListener("click", async () => {  
    try {  
      const licenseKeyInput = document.getElementById("licenseKeyInput");  
      const rawLicenseKey = String(licenseKeyInput?.value || "").trim();  
    
      let settings = await saveDashboardSettingsFromDom();  
    
      if (rawLicenseKey) {  
        await activateLicenseServerSide(rawLicenseKey);  
        settings = getDashboardSettings();  
        if (licenseKeyInput) {  
          licenseKeyInput.value = "";  
        }  
      }  
    
      const licensed = isSavedLicenseValid(settings);  
    
      restartAutoRefresh();  
      restartChainRefresh();  
    
      pushAlert(  
        licensed  
          ? "Dashboard settings saved. License activated."  
          : "Settings saved. License not yet valid."  
      );  
    
      setStatus(  
        licensed  
          ? `Settings saved • Refresh ${Math.floor(settings.refreshIntervalMs / 1000)}s`  
          : "Settings saved • Unlicensed"  
      );  
    
      render();  
    } catch (error) {  
      console.error("RavenWatch: save settings failed", error);  
      pushAlert(`Settings save failed: ${error?.message || "unknown error"}`);  
      setStatus(`Save failed: ${error?.message || "unknown error"}`);  
      render();  
    }  
  });  

  document.getElementById("loadDashboardBtn")?.addEventListener("click", async () => {
    if (!isSavedLicenseValid()) {
      pushAlert("Blocked: enter a valid license key in Settings.");
      setStatus("Unlicensed");
      return;
    }

    await executeDashboardLoad(render);
    restartAutoRefresh();
    restartChainRefresh();
  });

  document.getElementById("toggleAutoRefreshBtn")?.addEventListener("click", () => {
    if (!isSavedLicenseValid()) {
      pushAlert("Blocked: enter a valid license key in Settings.");
      setStatus("Unlicensed");
      return;
    }

    const settings = getDashboardSettings();
    saveDashboardSettings({ enabled: !settings.enabled });

    restartAutoRefresh();
    restartChainRefresh();

    setStatus(!settings.enabled ? "Auto refresh started" : "Auto refresh stopped");
    render();
  });

  document.getElementById("alwaysTopToggle")?.addEventListener("change", async event => {
    await applyAlwaysOnTop(!!event.target?.checked);
    render();
  });

  document.getElementById("soundEnabledToggle")?.addEventListener("change", event => {
    const enabled = !!event.target?.checked;
    setSoundEnabled(enabled);
    setStatus(enabled ? "Sounds enabled" : "Sounds disabled");
    pushAlert(enabled ? "Sounds enabled." : "Sounds disabled.");
    render();
  });

  document.getElementById("pullYataBtn")?.addEventListener("click", async () => {
    if (!isSavedLicenseValid()) {
      pushAlert("Blocked: enter a valid license key in Settings.");
      setStatus("Unlicensed");
      return;
    }

    try {
      setStatus("Pulling YATA travel data...");
      const result = await importYataTravelData();
      setStatus(result.message);
      if (result.ok) pushAlert(result.message);
    } catch (error) {
      console.error("RavenWatch: YATA import failed", error);
      setStatus(`YATA import failed: ${error?.message || "unknown error"}`);
    }
    render();
  });

  document.getElementById("clearTravelDataBtn")?.addEventListener("click", () => {
    state.travelDrops = [];
    saveTravelDrops();
    clearTravelUiState();
    setStatus("Travel data cleared");
    pushAlert("Travel data cleared.");
    render();
  });

  document.querySelectorAll("[data-travel-location-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      toggleTravelLocation(btn.dataset.travelLocationToggle || "");
      render();
    });
  });

  document.querySelectorAll("[data-travel-item-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      toggleTravelItem(btn.dataset.travelItemToggle || "");
      render();
    });
  });

  document.querySelectorAll("[data-travel-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const drop = findDrop(btn.dataset.travelEdit || "");
      if (!drop) return;
      openTravelEditor(drop);
      render();
    });
  });

  document.querySelectorAll("[data-travel-cancel]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeTravelEditor();
      render();
    });
  });

  document.querySelectorAll("[data-travel-save]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.travelSave || "";
      const updates = readTravelEditInputs();
      const ok = updateTravelDrop(id, updates);
      if (ok) {
        closeTravelEditor();
        pushAlert("Travel drop updated.");
        setStatus("Travel drop updated");
      } else {
        setStatus("Could not save travel drop");
      }
      render();
    });
  });

  document.querySelectorAll("[data-travel-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const ok = deleteTravelDrop(btn.dataset.travelDelete || "");
      if (ok) {
        closeTravelEditor();
        pushAlert("Travel drop deleted.");
        setStatus("Travel drop deleted");
      }
      render();
    });
  });
}