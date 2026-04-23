import { state, pushAlert } from './state.js';
import { getDashboardSettings } from '../scanner.js';
import { executeDashboardLoad, executeChainRefresh } from './actions.js';
import { render } from './render.js';
import { updateChainGuardAlarm, getLiveDashboard } from '../features/chainguard/chainguard.js';
import { isSavedLicenseValid } from '../services/license.js';

function getAdaptiveRefreshIntervalMs() {
  const settings = getDashboardSettings();
  const baseMs = Number(settings.refreshIntervalMs || 60000);
  const live = getLiveDashboard();
  const chainActive = !!live?.factionData?.chain?.active;
  const war = live?.factionData?.war;

  if (chainActive) {
    return Math.min(baseMs, 15000);
  }

  if (war?.active) {
    return Math.min(baseMs, 15000);
  }

  if (war?.scheduled && Number(war.startsIn || 0) > 0) {
    if (war.startsIn <= 1800) return Math.min(baseMs, 15000);
    if (war.startsIn <= 21600) return Math.min(baseMs, 30000);
  }

  return baseMs;
}

function shouldForceFreshDashboardRefresh() {
  const live = getLiveDashboard();
  const chainActive = !!live?.factionData?.chain?.active;
  const war = live?.factionData?.war;

  if (chainActive) return true;
  if (war?.active) return true;
  if (war?.scheduled && Number(war.startsIn || 0) <= 1800) return true;

  return false;
}

export function restartAutoRefresh() {
  if (state.autoRefreshHandle) {
    clearTimeout(state.autoRefreshHandle);
    state.autoRefreshHandle = null;
  }

  if (!isSavedLicenseValid()) return;

  const settings = getDashboardSettings();
  if (!settings.enabled) return;

  const runAutoRefresh = async () => {
    // If something else is running, retry quickly without re-adding the full interval.
    if (state.autoRefreshInFlight || state.chainRefreshInFlight) {
      state.autoRefreshHandle = setTimeout(runAutoRefresh, 1000);
      return;
    }

    state.autoRefreshInFlight = true;

    try {
      await executeDashboardLoad(render, {
        forceNetwork: shouldForceFreshDashboardRefresh()
      });
      state.failureCount = 0;
      state.lastError = null;
    } catch (error) {
      state.failureCount++;
      state.lastError = error;
      handleTornError(error);
    } finally {
      state.autoRefreshInFlight = false;
      const waitMs = getAdaptiveRefreshIntervalMs();
      state.autoRefreshHandle = setTimeout(runAutoRefresh, waitMs);
    }
  };

  const initialWaitMs = getAdaptiveRefreshIntervalMs();
  state.autoRefreshHandle = setTimeout(runAutoRefresh, initialWaitMs);
}

export function restartLiveTick() {
  if (state.liveTickHandle) {
    clearInterval(state.liveTickHandle);
    state.liveTickHandle = null;
  }

  state.liveTickHandle = setInterval(() => {
    if ((state.currentTab === 'dashboard' || state.currentTab === 'player') && state.dashboard.data) {
      render();
    } else {
      updateChainGuardAlarm();
    }
  }, 500);
}

function getChainRefreshIntervalMs() {
  const settings = getDashboardSettings();
  if (!settings.enabled || !settings.enableFactionData || !settings.apiKey) return 0;

  const baseMs = Number(settings.refreshIntervalMs || 60000);
  const live = getLiveDashboard();
  const chain = live?.factionData?.chain;
  const remaining = Number(chain?.timeout || 0);

  if (remaining > 0 && remaining <= 15) return 5000;
  if (remaining > 0 && remaining <= 30) return 5000;
  if (remaining > 0 && remaining <= 60) return 7500;

  return Math.max(15000, Math.min(baseMs, 30000));
}

export function restartChainRefresh() {
  if (state.chainRefreshHandle) {
    clearTimeout(state.chainRefreshHandle);
    state.chainRefreshHandle = null;
  }

  const settings = getDashboardSettings();
  if (!settings.enabled || !settings.enableFactionData || !settings.apiKey) return;

  const runChainRefreshLoop = async () => {
    // If dashboard is mid-flight, retry quickly without re-adding the full interval.
    if (state.autoRefreshInFlight || state.chainRefreshInFlight) {
      state.chainRefreshHandle = setTimeout(runChainRefreshLoop, 1000);
      return;
    }

    state.chainRefreshInFlight = true;

    try {
      await executeChainRefresh(render);
      state.failureCount = 0;
      state.lastError = null;
    } catch (error) {
      state.failureCount++;
      state.lastError = error;
      handleTornError(error);
    } finally {
      state.chainRefreshInFlight = false;
      const waitMs = getChainRefreshIntervalMs();
      if (waitMs) {
        state.chainRefreshHandle = setTimeout(runChainRefreshLoop, waitMs);
      }
    }
  };

  const initialWaitMs = getChainRefreshIntervalMs();
  if (!initialWaitMs) return;
  state.chainRefreshHandle = setTimeout(runChainRefreshLoop, initialWaitMs);
}

export function stopAutoRefresh() {
  if (state.autoRefreshHandle) {
    clearTimeout(state.autoRefreshHandle);
    state.autoRefreshHandle = null;
  }

  state.autoRefreshInFlight = false;
}

export function stopChainRefresh() {
  if (state.chainRefreshHandle) {
    clearTimeout(state.chainRefreshHandle);
    state.chainRefreshHandle = null;
  }

  state.chainRefreshInFlight = false;
}

export function stopLiveTick() {
  if (state.liveTickHandle) {
    clearInterval(state.liveTickHandle);
    state.liveTickHandle = null;
  }
}

function handleTornError(error) {
  const code = error?.tornCode;

  if (code === 2 || code === 9) {
    pushAlert('Invalid or disabled Torn API key. Auto refresh stopped.');
    stopAutoRefresh();
    stopChainRefresh();
    state.failureCount = 999;
    return;
  }

  if (code === 5) {
    pushAlert('Torn rate limit reached. Slowing down requests.');
    return;
  }

  if (code === 8) {
    pushAlert('Temporary Torn IP block detected. Stopping requests.');
    stopAutoRefresh();
    stopChainRefresh();
    state.failureCount = 999;
    return;
  }

  if (state.failureCount >= 3) {
    pushAlert('Multiple API failures. Auto refresh paused.');
    stopAutoRefresh();
    stopChainRefresh();
  }
}