import { loadSetting, saveSetting } from "../storage.js";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";

const WINDOW_STATE_KEY = "window_state";
let windowStateWatchHandle = null;
let lastSerializedState = "";

function getAppWindow() {
  try {
    return getCurrentWindow();
  } catch (error) {
    console.warn("RavenWatch: could not get current Tauri window", error);
    return null;
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeWindowState(raw) {
  if (!raw || typeof raw !== "object") return null;

  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  const maximized = !!raw.maximized;

  if (![x, y, width, height].every(isFiniteNumber)) {
    return null;
  }

  return {
    x,
    y,
    width: Math.max(640, Math.round(width)),
    height: Math.max(480, Math.round(height)),
    maximized
  };
}

async function readCurrentWindowState() {
  const appWindow = getAppWindow();
  if (!appWindow) return null;

  try {
    const [position, size, maximized] = await Promise.all([
      appWindow.innerPosition(),
      appWindow.innerSize(),
      appWindow.isMaximized()
    ]);

    return normalizeWindowState({
      x: Number(position?.x),
      y: Number(position?.y),
      width: Number(size?.width),
      height: Number(size?.height),
      maximized: !!maximized
    });
  } catch (error) {
    console.warn("RavenWatch: could not read window state", error);
    return null;
  }
}

export async function saveWindowStateSafe() {
  const state = await readCurrentWindowState();
  if (!state) return false;

  const serialized = JSON.stringify(state);
  if (serialized === lastSerializedState) return true;

  saveSetting(WINDOW_STATE_KEY, state);
  lastSerializedState = serialized;
  return true;
}

export async function restoreWindowStateSafe() {
  const saved = normalizeWindowState(loadSetting(WINDOW_STATE_KEY, null));
  const appWindow = getAppWindow();

  if (!saved || !appWindow) return false;

  try {
    if (saved.maximized) {
      await appWindow.maximize();
      lastSerializedState = JSON.stringify(saved);
      return true;
    }

    await appWindow.setSize(new LogicalSize(saved.width, saved.height));
    await appWindow.setPosition(new LogicalPosition(saved.x, saved.y));

    lastSerializedState = JSON.stringify(saved);
    return true;
  } catch (error) {
    console.warn("RavenWatch: could not restore window state", error);
    return false;
  }
}

export function startWindowStatePersistence() {
  if (windowStateWatchHandle) return;

  window.addEventListener("beforeunload", () => {
    void saveWindowStateSafe();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void saveWindowStateSafe();
    }
  });

  windowStateWatchHandle = window.setInterval(() => {
    void saveWindowStateSafe();
  }, 1000);
}

export async function setAlwaysOnTopSafe(value) {
  const appWindow = getAppWindow();
  if (!appWindow) return false;

  try {
    await appWindow.setAlwaysOnTop(!!value);
    return true;
  } catch (error) {
    console.warn("RavenWatch: could not set always-on-top", error);
    return false;
  }
}