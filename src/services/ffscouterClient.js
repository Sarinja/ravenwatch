const API_BASE = 'https://ffscouter.com/api/v1';

const CACHE_KEY = 'ffscouter_cache_v2';
const STATE_KEY = 'ffscouter_state_v2';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes

function normalizeIds(targetIds = []) {
  return Array.from(
    new Set(
      (targetIds || [])
        .map(id => Number(id))
        .filter(id => Number.isFinite(id) && id > 0)
    )
  );
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage write failures
  }
}

function loadCache() {
  return loadJson(CACHE_KEY, {});
}

function saveCache(cache) {
  saveJson(CACHE_KEY, cache);
}

function loadState() {
  const state = loadJson(STATE_KEY, {});
  const today = getTodayKey();

  if (state.dayKey !== today) {
    return {
      dayKey: today,
      dailyCalls: 0,
      failureCount: 0,
      disabledUntil: 0,
      lastFailureAt: 0,
      lastError: ''
    };
  }

  return {
    dayKey: today,
    dailyCalls: Number(state.dailyCalls || 0),
    failureCount: Number(state.failureCount || 0),
    disabledUntil: Number(state.disabledUntil || 0),
    lastFailureAt: Number(state.lastFailureAt || 0),
    lastError: String(state.lastError || '')
  };
}

function saveState(state) {
  saveJson(STATE_KEY, state);
}

function sanitizeFFEntry(raw = {}) {
  const fairFight = Number(raw?.fairFight);
  const bsEstimate = Number(raw?.bsEstimate);

  const safeFairFight =
    Number.isFinite(fairFight) && fairFight > 0 && fairFight <= 10
      ? fairFight
      : null;

  const safeBsEstimate =
    Number.isFinite(bsEstimate) && bsEstimate > 0
      ? bsEstimate
      : null;

  return {
    fairFight: safeFairFight,
    bsEstimate: safeBsEstimate,
    source: String(raw?.source || '').trim(),
    lastUpdated: Number(raw?.lastUpdated || 0),
    fetchedAt: Number(raw?.fetchedAt || 0),
    stale: Boolean(raw?.stale),
    lastError: String(raw?.lastError || '')
  };
}

function readCachedEntry(cache, playerId) {
  const entry = cache[String(playerId)];
  if (!entry || typeof entry !== 'object') return null;

  return {
    playerId: Number(playerId),
    ...sanitizeFFEntry(entry)
  };
}

function writeCachedEntry(cache, playerId, entry) {
  const clean = sanitizeFFEntry(entry);

  cache[String(playerId)] = {
    fairFight: clean.fairFight,
    bsEstimate: clean.bsEstimate,
    source: clean.source,
    lastUpdated: clean.lastUpdated,
    fetchedAt: clean.fetchedAt,
    stale: clean.stale,
    lastError: clean.lastError
  };
}

function isFresh(entry, ttlMs) {
  if (!entry?.fetchedAt) return false;
  return (Date.now() - Number(entry.fetchedAt)) < ttlMs;
}

function buildResultMapFromCache(ids, cache, { markStale = false, error = '' } = {}) {
  const result = new Map();

  for (const id of ids) {
    const entry = readCachedEntry(cache, id);
    if (!entry) continue;

    result.set(id, {
      fairFight: entry.fairFight,
      bsEstimate: entry.bsEstimate,
      source: entry.source,
      lastUpdated: entry.lastUpdated,
      fetchedAt: entry.fetchedAt,
      stale: markStale ? true : Boolean(entry.stale),
      lastError: error || entry.lastError || '',
      fromCache: true
    });
  }

  return result;
}

function mergeFreshIntoCache(cache, freshEntries) {
  const now = Date.now();

  for (const [playerId, value] of freshEntries.entries()) {
    writeCachedEntry(cache, playerId, {
      ...value,
      fetchedAt: now,
      stale: false,
      lastError: ''
    });
  }
}

function markCachedEntriesStale(cache, ids, errorMessage) {
  for (const id of ids) {
    const entry = readCachedEntry(cache, id);
    if (!entry) continue;

    writeCachedEntry(cache, id, {
      ...entry,
      stale: true,
      lastError: errorMessage || entry.lastError || 'FFScouter request failed'
    });
  }
}

async function fetchFreshFFScouterStats(targetIds = [], apiKey = '', timeoutMs = 2500) {
  const ids = normalizeIds(targetIds);
  const cleanKey = String(apiKey || '').trim();

  if (!cleanKey || !ids.length) {
    return new Map();
  }

  const BATCH_SIZE = 205;
  const combined = new Map();

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(`${API_BASE}/get-stats`);
      url.searchParams.set('key', cleanKey);
      url.searchParams.set('targets', batch.join(','));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = payload?.error || `HTTP ${response.status}`;
        throw new Error(`FFScouter error: ${detail}`);
      }

      const entries = Array.isArray(payload) ? payload : [];

      for (const entry of entries) {
        const playerId = Number(entry?.player_id);
        if (!Number.isFinite(playerId) || playerId <= 0) continue;

        combined.set(playerId, {
          fairFight: Number(entry?.fair_fight),
          bsEstimate: Number(entry?.bs_estimate),
          source: String(entry?.source || '').trim(),
          lastUpdated: Number(entry?.last_updated || 0),
          fromCache: false,
          stale: false,
          lastError: '',
          fetchedAt: Date.now()
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return combined;
}

export async function fetchFFScouterStats(targetIds = [], apiKey = '', timeoutMs = 2500, options = {}) {
  const ids = normalizeIds(targetIds);
  const cleanKey = String(apiKey || '').trim();

  const {
    forceRefresh = false,
    ttlMs = DEFAULT_TTL_MS,
    backoffMs = DEFAULT_BACKOFF_MS,
    maxDailyCalls = 480
  } = options || {};

  if (!cleanKey || !ids.length) {
    return new Map();
  }

  const cache = loadCache();
  const state = loadState();
  const now = Date.now();

  const cachedEntries = ids
    .map(id => [id, readCachedEntry(cache, id)])
    .filter(([, entry]) => entry);

  const allFresh = cachedEntries.length === ids.length &&
    cachedEntries.every(([, entry]) => isFresh(entry, ttlMs));

  if (!forceRefresh && allFresh) {
    return buildResultMapFromCache(ids, cache);
  }

  if (!forceRefresh && state.disabledUntil > now) {
    return buildResultMapFromCache(ids, cache, {
      markStale: true,
      error: state.lastError || 'FFScouter temporarily disabled'
    });
  }

  if (!forceRefresh && state.dailyCalls >= maxDailyCalls) {
    return buildResultMapFromCache(ids, cache, {
      markStale: true,
      error: 'FFScouter daily call limit reached'
    });
  }

  try {
    const freshMap = await fetchFreshFFScouterStats(ids, cleanKey, timeoutMs);

    mergeFreshIntoCache(cache, freshMap);
    saveCache(cache);

    state.dailyCalls += 1;
    state.failureCount = 0;
    state.disabledUntil = 0;
    state.lastFailureAt = 0;
    state.lastError = '';
    saveState(state);

    const merged = new Map();

    for (const id of ids) {
      if (freshMap.has(id)) {
        merged.set(id, freshMap.get(id));
        continue;
      }

      const cached = readCachedEntry(cache, id);
      if (cached) {
        merged.set(id, {
          fairFight: cached.fairFight,
          bsEstimate: cached.bsEstimate,
          source: cached.source,
          lastUpdated: cached.lastUpdated,
          fetchedAt: cached.fetchedAt,
          stale: true,
          lastError: 'FFScouter did not return this target in latest response',
          fromCache: true
        });
      }
    }

    return merged;
  } catch (err) {
    const message = String(err?.message || err || 'FFScouter request failed');

    markCachedEntriesStale(cache, ids, message);
    saveCache(cache);

    state.failureCount += 1;
    state.lastFailureAt = now;
    state.lastError = message;

    if (
      /invalid key/i.test(message) ||
      /limit/i.test(message) ||
      /rate/i.test(message) ||
      /403/.test(message) ||
      /429/.test(message)
    ) {
      state.disabledUntil = now + backoffMs;
    }

    saveState(state);

    const fallback = buildResultMapFromCache(ids, cache, {
      markStale: true,
      error: message
    });

    if (fallback.size) {
      return fallback;
    }

    throw err;
  }
}

export function clearFFScouterCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(STATE_KEY);
  } catch {
    // ignore
  }
}

export function getFFScouterDebugState() {
  return {
    cache: loadCache(),
    state: loadState()
  };
}