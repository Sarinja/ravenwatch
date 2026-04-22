const API_BASE = 'https://api.torn.com/v2';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promiseFactory, ms) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, ms);

  return {
    wrapped: promiseFactory(controller.signal).finally(() => clearTimeout(timeout))
  };
}

class RequestGate {
  constructor() {
    this.lastRequestAt = 0;
  }

  async wait(cooldownMs) {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    const remaining = cooldownMs - elapsed;

    if (remaining > 0) {
      await sleep(remaining);
    }

    this.lastRequestAt = Date.now();
  }
}

const gate = new RequestGate();

function applyCommonParams(url, settings) {
  url.searchParams.set('key', settings.apiKey);
  url.searchParams.set('timestamp', String(Date.now()));
  return url;
}

function parseServerDateHeaderToUnixMs(response) {
  const raw = response.headers.get('date');
  if (!raw) return null;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeSelections(selectionText, requiredSelections = []) {
  const selections = String(selectionText || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  const seen = new Set(selections.map(part => part.toLowerCase()));
  for (const required of requiredSelections) {
    const key = String(required || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    selections.push(required);
    seen.add(key);
  }

  return selections.join(',');
}

export function buildUserUrl(settings) {
  const url = new URL(`${API_BASE}${settings.endpointPath}`);
  applyCommonParams(url, settings);

  const selections = mergeSelections(settings.endpointSelections, ['battlestats', 'stocks']);
  if (selections) {
    url.searchParams.set('selections', selections);
  }

  return url.toString();
}


export function buildTornUrl(settings, selections = 'stocks') {
  const url = new URL(`${API_BASE}/torn`);
  applyCommonParams(url, settings);
  if (selections) {
    url.searchParams.set('selections', selections);
  }
  return url.toString();
}

export function buildFactionUrl(settings, selections = 'basic,rankedwars') {
  const factionId = String(settings.factionId || '').trim();
  const url = new URL(`${API_BASE}/faction`);
  applyCommonParams(url, settings);
  url.searchParams.set('selections', selections);

  if (factionId) {
    url.searchParams.set('id', factionId);
  }

  return url.toString();
}

export function buildFactionChainUrl(settings) {
  const factionId = String(settings.factionId || '').trim();
  const path = factionId ? `/faction/${factionId}/chain` : '/faction/chain';
  const url = new URL(`${API_BASE}${path}`);
  applyCommonParams(url, settings);
  return url.toString();
}

export function buildFactionMembersUrl(settings, factionId) {
  const cleanFactionId = String(factionId || settings.factionId || '').trim();
  if (!cleanFactionId) {
    throw new Error('Missing faction ID for faction members request.');
  }

  const url = new URL(`${API_BASE}/faction`);
  applyCommonParams(url, settings);
  url.searchParams.set('id', cleanFactionId);
  url.searchParams.set('selections', 'members');
  return url.toString();
}

export async function fetchJsonWithGate(url, timeoutMs, cooldownMs) {
  await gate.wait(cooldownMs);

  const requestStartedAtMs = Date.now();

  const request = withTimeout(
    signal =>
      fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal
      }),
    timeoutMs
  );

  const response = await request.wrapped;
  const responseReceivedAtMs = Date.now();
  const serverNowUnixMs = parseServerDateHeaderToUnixMs(response);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while calling Torn API`);
  }

  const data = await response.json();

  if (!data || typeof data !== 'object') {
    throw new Error('Torn API returned an invalid response payload.');
  }

  if (data?.error) {
    const code = Number(data.error.code ?? -1);
    const message = data.error.error || 'Torn API returned an error.';
  
    const err = new Error(`Torn API error ${code}: ${message}`);
    err.tornCode = code;
  
    throw err;
  }

  return {
    data,
    requestStartedAtMs,
    responseReceivedAtMs,
    serverNowUnixMs
  };
}
