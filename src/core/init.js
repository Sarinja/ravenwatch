import { bindStaticEvents } from "./events.js";
import { restartAutoRefresh, restartChainRefresh, restartLiveTick } from "./timers.js";
import { render } from "./render.js";
import {
  restoreWindowStateSafe,
  startWindowStatePersistence,
  setAlwaysOnTopSafe
} from "../services/window.js";
import { state } from "./state.js";
import {
  validateLicenseOnStartup,
  validateLicenseSilently
} from "../services/license.js";

const LICENSE_RECHECK_MS = 10 * 60 * 1000;

export async function initApp() {
  bindStaticEvents();

  await restoreWindowStateSafe();
  await validateLicenseOnStartup();

  setInterval(() => {
    validateLicenseSilently();
  }, LICENSE_RECHECK_MS);

  if (state.alwaysOnTop) {
    await setAlwaysOnTopSafe(true);
  }

  startWindowStatePersistence();
  restartAutoRefresh();
  restartChainRefresh();
  restartLiveTick();
  render();
}