import { state } from "../../core/state.js";
import { getDashboardSettings } from "../../scanner.js";
import { escapeAttr, escapeHtml } from "../../core/format.js";
import { getLicenseStatusText, isSavedLicenseValid } from "../../services/license.js";

let chainGuardAssetsOpen = false;

function getAssetMeta(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return { name: "Custom file saved", src: value, kind: "legacy" };
  }
  if (typeof value === "object") {
    return {
      name: value.name || "Custom file saved",
      src: value.dataUrl || value.src || "",
      kind: value.type || ""
    };
  }
  return null;
}

function renderAssetStatus(value, type) {
  const meta = getAssetMeta(value);
  if (!meta) return '<div class="helper-text">Using bundled default</div>';

  const preview = type === "image" && meta.src
    ? `<img class="asset-preview-image" src="${escapeAttr(meta.src)}" alt="Selected ${escapeAttr(meta.name)}">`
    : "";

  const audioPreview = type === "audio" && meta.src
    ? `<audio class="asset-preview-audio" controls preload="none" src="${escapeAttr(meta.src)}"></audio>`
    : "";

  return `
    <div class="helper-text asset-status-text">Using custom file: <strong>${escapeHtml(meta.name)}</strong></div>
    ${preview}
    ${audioPreview}
  `;
}

export function toggleChainGuardAssetsSection() {
  chainGuardAssetsOpen = !chainGuardAssetsOpen;
}

export function renderSettings() {
  const settings = getDashboardSettings();
  const assets = state.customAssets || {};

  return `
    <section class="panel-section">
      <div class="section-title">Connection</div>
      <div class="card compact-card">
        <div class="field-group">
          <label class="field-label" for="apiKeyInput">API Key</label>
          <input type="password" id="apiKeyInput" placeholder="Torn API key" value="${escapeAttr(settings.apiKey)}">
        </div>

        <div class="field-group">
          <label class="field-label" for="factionIdInput">Faction ID (optional)</label>
          <input type="text" id="factionIdInput" value="${escapeAttr(settings.factionId || "")}">
        </div>

        <div class="field-group">
          <label class="field-label" for="endpointPathInput">Endpoint</label>
          <input type="text" id="endpointPathInput" value="${escapeAttr(settings.endpointPath)}">
        </div>

        <div class="field-group">
          <label class="field-label" for="endpointSelectionsInput">Selections</label>
          <input type="text" id="endpointSelectionsInput" value="${escapeAttr(settings.endpointSelections)}">
        </div>

        <div class="field-group">
          <label class="field-label" for="refreshIntervalInput">Refresh Seconds</label>
          <input type="number" id="refreshIntervalInput" value="${Math.floor(settings.refreshIntervalMs / 1000)}">
        </div>

        <div class="field-group">
          <label class="field-label" for="yataTravelExportUrlInput">YATA Travel Export URL</label>
          <input
            type="text"
            id="yataTravelExportUrlInput"
            placeholder="https://yata.yt/api/v1/travel/export/"
            value="${escapeAttr(settings.yataTravelExportUrl || "https://yata.yt/api/v1/travel/export/")}"
          >
        </div>

        <div class="field-group">
          <label class="field-label" for="yataApiKeyInput">YATA API Key (optional)</label>
          <input
            type="password"
            id="yataApiKeyInput"
            placeholder="YATA API Key (future use)"
            value="${escapeAttr(settings.yataApiKey || "")}"
          >
          <div class="helper-text">Currently optional. Stored now so RavenWatch is ready if YATA auth changes later.</div>
        </div>

        <div class="field-group">
          <label class="field-label" for="ffscouterApiKeyInput">FFScouter API Key (optional)</label>
          <input
            type="password"
            id="ffscouterApiKeyInput"
            placeholder="FFScouter API key"
            value="${escapeAttr(settings.ffscouterApiKey || "")}"
          >
          <div class="helper-text">Optional. Used only to enrich Save the Chain target ranking with fair-fight estimates.</div>
        </div>

        <div class="field-group">
          <label class="field-label" for="licenseKeyInput">License Key</label>
          <input
            type="password"
            id="licenseKeyInput"
            placeholder="Enter license key"
            value=""
            autocomplete="off"
          >
          <div class="helper-text">
            Status: <strong>${escapeHtml(getLicenseStatusText(settings))}</strong>${isSavedLicenseValid(settings) ? " ✓" : ""}
          </div>
        </div>

        <div class="button-row">
          <button id="saveDashboardSettingsBtn">Save</button>
          <button id="loadDashboardBtn">Load Me</button>
          <button id="toggleAutoRefreshBtn">${settings.enabled ? "Stop Auto" : "Start Auto"}</button>
        </div>
      </div>
    </section>
    <section class="panel-section">
      <div class="section-title">FFScouter</div>
      <div class="card compact-card">
        <div class="field-group">
          <label class="field-label" for="maxFfTargetsInput">How many FF targets?</label>
          <input
            type="number"
            id="maxFfTargetsInput"
            min="1"
            max="20"
            value="${Number(settings.maxFfTargets || 5)}"
          >
          <div class="helper-text">Default is 5.</div>
        </div>
      </div>
    </section>

    <section class="panel-section">
      <div class="section-title">Sound</div>
      <div class="card compact-card">
        <label class="toggle-row">
          <span>Allow sounds</span>
          <input type="checkbox" id="soundEnabledToggle" ${state.soundEnabled ? "checked" : ""}>
        </label>
      </div>
    </section>

    <section class="panel-section">
      <div class="section-title">Window</div>
      <div class="card compact-card">
        <label class="toggle-row">
          <span>Always on top</span>
          <input type="checkbox" id="alwaysTopToggle" ${state.alwaysOnTop ? "checked" : ""}>
        </label>
      </div>
    </section>

    <section class="panel-section">
      <div class="card compact-card settings-collapsible-card">
        <button
          class="settings-section-toggle"
          type="button"
          data-settings-toggle="chainguard-assets"
          aria-expanded="${chainGuardAssetsOpen ? "true" : "false"}"
        >
          <div class="settings-section-toggle-main">
            <span class="travel-location-caret">${chainGuardAssetsOpen ? "▾" : "▸"}</span>
            <span class="section-title settings-section-title-inline">ChainGuard Assets</span>
          </div>
          <div class="travel-location-summary">
            ${Object.keys(assets).length ? `${Object.keys(assets).length} custom asset${Object.keys(assets).length === 1 ? "" : "s"} configured` : "Using bundled defaults"}
          </div>
        </button>

        ${chainGuardAssetsOpen ? `
        <div class="settings-section-body">
          <div class="field-group">
            <label class="field-label" for="chainImageInput">Main image (60s to 31s)</label>
            <input type="file" id="chainImageInput" accept="image/*">
            ${renderAssetStatus(assets.chainImage, "image")}
            <div class="button-row small-gap">
              <button type="button" data-clear-asset="chainImage">Use Default</button>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="criticalImageInput">Critical image (30s and under)</label>
            <input type="file" id="criticalImageInput" accept="image/*">
            ${renderAssetStatus(assets.criticalImage, "image")}
            <div class="button-row small-gap">
              <button type="button" data-clear-asset="criticalImage">Use Default</button>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="sound60Input">60-second alert sound</label>
            <input type="file" id="sound60Input" accept="audio/*">
            ${renderAssetStatus(assets.sound60, "audio")}
            <div class="button-row small-gap">
              <button type="button" data-clear-asset="sound60">Use Default</button>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="sound10Input">10-second alert sound</label>
            <input type="file" id="sound10Input" accept="audio/*">
            ${renderAssetStatus(assets.sound10, "audio")}
            <div class="button-row small-gap">
              <button type="button" data-clear-asset="sound10">Use Default</button>
            </div>
          </div>

          <div class="button-row">
            <button type="button" data-reset-assets="true">Reset All Assets</button>
          </div>

          <div class="helper-text">Upload files once and RavenWatch saves them in the browser for this install. Leave them blank to use the packaged defaults.</div>
        </div>
        ` : ""}
      </div>
    </section>

    <section class="panel-section">
      <div class="section-title">Reset</div>
      <div class="card compact-card">
        <div class="button-row">
          <button id="resetAppDataBtn" class="danger-btn">Reset App Data</button>
        </div>
        <div class="helper-text">
          Clears saved settings, cache, custom assets, travel data, and local app state for this install. Your saved license will remain intact.
        </div>
      </div>
    </section>
  `;
}
