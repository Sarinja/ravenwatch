const APP_KEY = "ravenwatch";

function scoped(key) {
  return `${APP_KEY}:${key}`;
}

export function saveSetting(key, value) {
  localStorage.setItem(scoped(key), JSON.stringify(value));
}

export function loadSetting(key, fallback = null) {
  const raw = localStorage.getItem(scoped(key));
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function removeSetting(key) {
  localStorage.removeItem(scoped(key));
}