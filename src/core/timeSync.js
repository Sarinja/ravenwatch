const syncState = {
  offsetMs: 0,
  lastRttMs: 0,
  lastSyncAtMs: 0,
  source: 'local'
};

export function recordServerSync({
  requestStartedAtMs,
  responseReceivedAtMs,
  serverNowUnixMs = null,
  source = 'api'
} = {}) {
  const started = Number(requestStartedAtMs || 0);
  const received = Number(responseReceivedAtMs || 0);

  if (!started || !received || received < started) {
    return { ...syncState };
  }

  const midpointMs = started + Math.round((received - started) / 2);
  const serverNowMs = Number(serverNowUnixMs || midpointMs);

  syncState.offsetMs = serverNowMs - midpointMs;
  syncState.lastRttMs = received - started;
  syncState.lastSyncAtMs = received;
  syncState.source = source;

  return { ...syncState };
}

export function getCorrectedNowMs() {
  return Date.now() + Number(syncState.offsetMs || 0);
}

export function getRemainingSecondsFromAbsolute(absoluteUnixMs) {
  const target = Number(absoluteUnixMs || 0);
  if (!target) return 0;
  return Math.max(0, Math.floor((target - getCorrectedNowMs()) / 1000));
}

export function createAbsoluteUnixMsFromRelativeSeconds(relativeSeconds, anchorMs = getCorrectedNowMs()) {
  const seconds = Number(relativeSeconds || 0);
  if (seconds <= 0) return 0;
  return Math.round(Number(anchorMs || getCorrectedNowMs()) + seconds * 1000);
}

export function getTimeSyncSnapshot() {
  return { ...syncState };
}
