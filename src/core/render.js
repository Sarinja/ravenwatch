import { getContent, getStatus, getNavButtons } from "./dom.js";
import { state } from "./state.js";
import { renderDashboard } from "../features/dashboard/dashboardTab.js";
import { renderTravel } from "../features/travel/travelTab.js";
import { renderPlayerTab } from "../features/player/playerTab.js";
import { renderAlerts } from "../features/alerts/alertsTab.js";
import { renderSettings } from "../features/settings/settingsTab.js";
import {
  ensureChainGuardButton,
  syncChainGuardButtonVisuals,
  updateChainGuardAlarm
} from "../features/chainguard/chainguard.js";
import { bindDynamicEvents } from "./events.js";
import { renderInfoTab } from "../features/info/infoTab.js";

const tabs = {
  dashboard: renderDashboard,
  player: renderPlayerTab,
  travel: renderTravel,
  alerts: renderAlerts,
  settings: renderSettings,
  info: renderInfoTab
};

export function updateActiveTab() {
  getNavButtons().forEach(btn => {
    btn.classList.toggle("active-tab", btn.dataset.tab === state.currentTab);
  });
}

export function render() {
  const renderer = tabs[state.currentTab] || renderDashboard;
  const content = getContent();
  const status = getStatus();

  if (!content) {
    console.error("RavenWatch: #content was not found; render skipped.");
    return;
  }

  content.innerHTML = renderer();
  bindDynamicEvents();
  updateActiveTab();

  ensureChainGuardButton(render);
  updateChainGuardAlarm();
  syncChainGuardButtonVisuals();

  if (status && (!status.innerText || status.innerText === "Ready")) {
    status.innerText = `Viewing: ${state.currentTab}`;
  }
}
