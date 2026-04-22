import { getDashboardSettings, saveDashboardSettings } from './services/dashboardConfig.js';
import {
  getCachedDashboard,
  saveCachedDashboard,
  isCacheFresh
} from './services/dashboardCache.js';
import {
  buildUserUrl,
  buildFactionUrl,
  buildFactionChainUrl,
  buildFactionMembersUrl,
  buildTornUrl,
  fetchJsonWithGate
} from './services/tornClient.js';
import {
  mapApiResponseToDashboard,
  mapFactionData
} from './features/dashboard/dashboardMapper.js';
import { getCorrectedNowMs, recordServerSync } from './core/timeSync.js';
import { fetchFFScouterStats } from './services/ffscouterClient.js';
import { pushAlert } from './core/state.js';

function deriveOpponentFactionId(war, ownFactionId) {
  const ownId = Number(ownFactionId || 0);
  const factions = Array.isArray(war?.factions) ? war.factions : [];
  const other = factions.find(entry => Number(entry?.id || 0) > 0 && Number(entry?.id || 0) !== ownId);
  return Number(other?.id || 0) || null;
}

function normalizeLastActionSeconds(raw) {
  if (Number.isFinite(Number(raw?.seconds))) return Number(raw.seconds);
  if (Number.isFinite(Number(raw?.timestamp))) {
    const delta = Math.floor(Date.now() / 1000) - Number(raw.timestamp);
    return delta >= 0 ? delta : 0;
  }
  const relative = String(raw?.relative || raw || '').toLowerCase();
  const match = relative.match(/(\d+)\s*(second|sec|minute|min|hour|hr)/);
  if (!match) return Number.POSITIVE_INFINITY;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit.startsWith('hour') || unit === 'hr') return value * 3600;
  if (unit.startsWith('minute') || unit === 'min') return value * 60;
  return value;
}

function normalizeMemberStatus(member) {
  return String(
    member?.status?.description ||
    member?.status?.details ||
    member?.status?.state ||
    member?.status ||
    ''
  ).trim();
}

function isUnavailableForAttack(member) {
  const status = normalizeMemberStatus(member).toLowerCase().trim();

  if (!status) return false;

  // hard blocked states
  if (
    status.includes('hospital') ||
    status.includes('jail') ||
    status.includes('federal')
  ) {
    return true;
  }

  // obvious travel wording
  if (
    status.includes('travel') ||
    status.includes('travelling') ||
    status.includes('traveling') ||
    status.includes('abroad') ||
    status.includes('returning to torn') ||
    status.includes('returning from') ||
    status.includes('travelling to') ||
    status.includes('traveling to') ||
    status.includes('flying to') ||
    status.includes('landing in')
  ) {
    return true;
  }

  // common overseas location phrases shown in statuses
  const travelCountryHints = [
    'argentina',
    'canada',
    'cayman',
    'china',
    'hawaii',
    'japan',
    'mexico',
    'south africa',
    'switzerland',
    'uae',
    'united arab emirates',
    'united kingdom',
    'uk'
  ];

  if (
    status.startsWith('in ') ||
    status.startsWith('returning ') ||
    status.startsWith('traveling ') ||
    status.startsWith('travelling ')
  ) {
    for (const hint of travelCountryHints) {
      if (status.includes(hint)) {
        return true;
      }
    }
  }

  return false;
}

function isAttackableMember(member) {
  return !isUnavailableForAttack(member);
}

function normalizeFactionMembers(raw) {
  const source = raw?.members || raw?.faction?.members || raw || {};
  const entries = Array.isArray(source) ? source : Object.entries(source).map(([id, value]) => ({ id, ...value }));

  return entries
    .map(entry => ({
      id: Number(entry?.id ?? entry?.player_id ?? entry?.user_id ?? 0),
      name: String(entry?.name || entry?.player_name || 'Unknown').trim(),
      level: Number(entry?.level ?? 0),
      statusText: normalizeMemberStatus(entry),
      lastActionSeconds: normalizeLastActionSeconds(entry?.last_action),
      raw: entry
    }))
    .filter(entry => Number.isFinite(entry.id) && entry.id > 0);
}


function getFactionMemberCapacity(basic = {}) {
  const candidates = [
    basic?.capacity?.maximum,
    basic?.capacity?.max,
    basic?.capacity?.total,
    basic?.capacity?.limit,
    basic?.capacity?.current,
    basic?.member_capacity,
    basic?.memberCapacity,
    basic?.capacity
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return 0;
}

function getFactionCurrentMembers(basic = {}, normalizedMembers = []) {
  const directCandidates = [
    basic?.members,
    basic?.member_count,
    basic?.memberCount
  ];

  for (const value of directCandidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return Array.isArray(normalizedMembers) ? normalizedMembers.length : 0;
}

function getMyBattleStatsTotal(existingDashboard) {
  const total = Number(existingDashboard?.battleStats?.total || 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function getEstimatedBsRatio(ffEntry, myBattleStatsTotal) {
  const mine = Number(myBattleStatsTotal || 0);
  const theirs = Number(ffEntry?.bsEstimate || 0);

  if (!Number.isFinite(mine) || mine <= 0) return null;
  if (!Number.isFinite(theirs) || theirs <= 0) return null;

  const ratio = theirs / mine;

  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (ratio > 5) return null; // absurd data guard

  return ratio;
}
function getFfConfidence(ffEntry, myBattleStatsTotal) {
  let confidenceScore = 100;

  const ff = Number(ffEntry?.fairFight);
  const ratio = getEstimatedBsRatio(ffEntry, myBattleStatsTotal);
  const source = String(ffEntry?.source || '').toLowerCase().trim();

  if (!Number.isFinite(ff)) confidenceScore -= 30;
  if (!Number.isFinite(ratio)) confidenceScore -= 35;

  if (Number.isFinite(ff) && ff > 5) confidenceScore -= 80;
  if (Number.isFinite(ratio) && ratio > 2) confidenceScore -= 60;

  if (ffEntry?.fromCache) confidenceScore -= 10;
  if (ffEntry?.stale) confidenceScore -= 35;

  if (source === 'premium') confidenceScore += 10;
  else if (source === 'bss') confidenceScore -= 10;

  if (Number.isFinite(ff) && Number.isFinite(ratio)) {
    if (ff >= 2.5 && ratio < 0.60) confidenceScore -= 45;
    else if (ff >= 2.0 && ratio < 0.50) confidenceScore -= 35;
    else if (ff >= 1.5 && ratio < 0.35) confidenceScore -= 20;
    else if (ff < 1.2 && ratio >= 0.60) confidenceScore -= 15;
  }

  if (confidenceScore >= 80) return 'High';
  if (confidenceScore >= 55) return 'Medium';
  return 'Low';
}

function getFfMismatchReason(ffEntry, myBattleStatsTotal) {
  const ff = Number(ffEntry?.fairFight);
  const ratio = getEstimatedBsRatio(ffEntry, myBattleStatsTotal);

  if (!Number.isFinite(ff) || !Number.isFinite(ratio)) return '';

  if (ff >= 2.5 && ratio < 0.60) {
    return 'FF looks inflated vs est BS';
  }

  if (ff >= 2.0 && ratio < 0.50) {
    return 'FF is high for est stat ratio';
  }

  if (ff >= 1.5 && ratio < 0.35) {
    return 'Est stats suggests this target is probably weak FF';
  }

  return '';
}

function scoreChainTarget(member, ffEntry, myLevel, myBattleStatsTotal) {
  let score = 0;

  if (!isAttackableMember(member.raw)) return -9999;

  const ff = Number(ffEntry?.fairFight);
  const ratio = getEstimatedBsRatio(ffEntry, myBattleStatsTotal);
  const source = String(ffEntry?.source || '').toLowerCase().trim();
  const confidence = getFfConfidence(ffEntry, myBattleStatsTotal);

  // First priority: real FF data near a useful chaining band.
  // The website addon defaults chain targeting around max FF 2.5,
  // so we aim near ~2.2 and punish targets that are far too low.
  if (Number.isFinite(ff)) {
    const idealFf = 2.2;
    const diff = Math.abs(ff - idealFf);
    score += Math.max(0, 90 - diff * 55);

    if (ff >= 1.8 && ff <= 2.7) score += 35;
    else if (ff >= 1.5 && ff < 1.8) score += 8;
    else if (ff > 2.7 && ff <= 3.2) score += 6;
    else if (ff > 3.2 && ff <= 4.0) score -= 20;
    else if (ff > 4.0) score -= 80;

    if (ff > 0 && ff < 1.5) score -= 70;
    if (ff > 0 && ff < 1.2) score -= 60;
    if (ff > 0 && ff < 1.0) score -= 80;
  } else {
    // Rows without FF should lose to any real FF target.
    score -= 140;
  }

  // Secondary ranking: estimated battle stat ratio against you.
  if (Number.isFinite(ratio)) {
    if (ratio >= 0.50 && ratio <= 0.78) score += 42;
    else if (ratio >= 0.40 && ratio < 0.50) score += 18;
    else if (ratio > 0.78 && ratio <= 0.92) score -= 18;
    else if (ratio > 0.92) score -= 55;
    else if (ratio > 0 && ratio < 0.40) score -= 18;
  } else {
    score -= 12;
  }

  // Hard sanity penalties when FF and BS estimate disagree.
  if (Number.isFinite(ff) && Number.isFinite(ratio)) {
    if (ff >= 2.5 && ratio < 0.60) score -= 85;
    else if (ff >= 2.0 && ratio < 0.50) score -= 65;
    else if (ff >= 1.5 && ratio < 0.35) score -= 35;
    else if (ff < 1.2 && ratio >= 0.60) score -= 20;
  }

  // Freshness / source trust.
  if (source === 'premium') score += 10;
  else if (source === 'bss') score -= 8;

  if (ffEntry?.fromCache) score -= 10;
  if (ffEntry?.stale) score -= 40;

  // Recent activity still matters, but less than FF fit.
  const lastActionSeconds = Number(member.lastActionSeconds);
  if (Number.isFinite(lastActionSeconds)) {
    if (lastActionSeconds <= 300) score += 10;
    else if (lastActionSeconds <= 900) score += 5;
    else if (lastActionSeconds <= 1800) score += 2;
  }

  // Level is just seasoning, not the meal.
  const memberLevel = Number(member.level || 0);
  const yourLevel = Number(myLevel || 0);
  if (memberLevel > 0 && yourLevel > 0) {
    if (memberLevel <= yourLevel + 5) score += 4;
    else if (memberLevel <= yourLevel + 20) score += 2;
    else if (memberLevel > yourLevel + 40) score -= 4;
  }

  if (confidence === 'High') score += 8;
  else if (confidence === 'Medium') score += 2;
  else score -= 12;

  return score;
}

function emitFFScouterAlert(ffMap) {
  if (!(ffMap instanceof Map) || ffMap.size === 0) return;

  let fresh = 0;
  let cached = 0;
  let stale = 0;

  for (const entry of ffMap.values()) {
    if (!entry) continue;
    if (!entry.fromCache && !entry.stale) fresh += 1;
    else if (entry.stale) stale += 1;
    else cached += 1;
  }

  if (fresh && !cached && !stale) {
    pushAlert(`FFScouter refreshed (${fresh} fresh)`);
    return;
  }

  if (fresh || cached || stale) {
    const parts = [];
    if (fresh) parts.push(`${fresh} fresh`);
    if (cached) parts.push(`${cached} cached`);
    if (stale) parts.push(`${stale} stale`);
    pushAlert(`FFScouter result mix: ${parts.join(' • ')}`);
  }
}


async function buildChainSaveTargets(settings, existingDashboard, factionDataMapped, options = {}) {
  const forceFfRefresh = !!options.forceFfRefresh;
  const chain = factionDataMapped?.chain;
  const war = factionDataMapped?.war;

  const warLive = !!war?.active;
  const warScheduled = !!war?.scheduled;
  const chainCritical = !!chain?.active && Number(chain.timeout || 0) > 0 && Number(chain.timeout || 0) <= 90;

  if (!warLive && !warScheduled && !chainCritical) {
    return [];
  }

  const ownFactionId = Number(factionDataMapped?.faction?.id || settings.factionId || 0);
  const opponentFactionId = deriveOpponentFactionId(war, ownFactionId);
  if (!opponentFactionId) return [];

  const membersUrl = buildFactionMembersUrl(settings, opponentFactionId);
  const membersResponse = await fetchJsonWithGate(
    membersUrl,
    Math.min(Number(settings.timeoutMs || 12000), 5000),
    settings.cooldownMs
  );
  applySync(membersResponse);

  const members = normalizeFactionMembers(membersResponse.data)
    .filter(member => isAttackableMember(member.raw));

  if (!members.length) return [];

  let ffMap = new Map();  
    
  if (settings.ffscouterApiKey) {    
    try {    
      const targetIds = members.map(m => m.id);  
    
      const ffOptions = {    
        forceRefresh: forceFfRefresh,    
        maxDailyCalls: 480    
      };    
    
      if (chainCritical) {    
        ffOptions.ttlMs = 2 * 60 * 1000; // 2 minutes  
      } else if (warLive) {    
        ffOptions.ttlMs = 5 * 60 * 1000; // 5 minutes  
      } else if (warScheduled) {    
        ffOptions.ttlMs = 10 * 60 * 1000; // 10 minutes  
      } else {    
        ffOptions.ttlMs = 10 * 60 * 1000; // 10 minutes  
      }    
    
      ffMap = await fetchFFScouterStats(    
        targetIds,    
        settings.ffscouterApiKey,    
        3500,    
        ffOptions    
      );  
    
      emitFFScouterAlert(ffMap);  
    } catch (error) {    
        pushAlert(`FFScouter failed: ${error?.message || error}`);
    }    
  }

  const myLevel = Number(existingDashboard?.level || 0);  
  const myBattleStatsTotal = getMyBattleStatsTotal(existingDashboard);  
    
  return members
    .map(member => {
      const ffEntry = ffMap.get(member.id) || null;
      const ffRatio = getEstimatedBsRatio(ffEntry, myBattleStatsTotal);
      const ffConfidence = getFfConfidence(ffEntry, myBattleStatsTotal);
      const ffMismatchReason = getFfMismatchReason(ffEntry, myBattleStatsTotal);

      return {
        id: member.id,
        name: member.name,
        level: member.level,
        status: member.statusText || 'Okay',
        lastActionSeconds: Number.isFinite(member.lastActionSeconds)
          ? member.lastActionSeconds
          : null,

        score: scoreChainTarget(member, ffEntry, myLevel, myBattleStatsTotal),

        ff: Number.isFinite(ffEntry?.fairFight) ? Number(ffEntry.fairFight) : null,
        ffBsEstimate: Number.isFinite(Number(ffEntry?.bsEstimate))
          ? Number(ffEntry.bsEstimate)
          : null,
        ffBsRatio: Number.isFinite(ffRatio) ? ffRatio : null,
        ffConfidence,
        ffMismatchReason,

        ffSource: ffEntry?.source || '',
        ffFromCache: !!ffEntry?.fromCache,
        ffStale: !!ffEntry?.stale,
        ffLastError: String(ffEntry?.lastError || ''),
        ffLastUpdated: Number(ffEntry?.lastUpdated || 0),
        ffFetchedAt: Number(ffEntry?.fetchedAt || 0),

        attackUrl: `https://www.torn.com/loader.php?sid=attack&user2ID=${member.id}`,
        profileUrl: `https://www.torn.com/profiles.php?XID=${member.id}`
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(settings.maxFfTargets || 5));
}

function calculateFactionActivity(members = []) {
  let recent = 0;
  let attackable = 0;

  for (const member of members) {
    const last = Number(member.lastActionSeconds);
    const status = String(member.statusText || '').toLowerCase();

    const isAttackable = !isUnavailableForAttack(member);

    if (isAttackable) {
      attackable++;

      if (Number.isFinite(last) && last <= 120) {
        recent++;
      }
    }
  }

  let level = 'Low';
  if (recent >= 12) level = 'Very High';
  else if (recent >= 6) level = 'High';
  else if (recent >= 3) level = 'Medium';

  return {
    level,
    recent,
    attackable
  };
}

async function buildOpponentFactionSummary(settings, factionDataMapped) {
  const war = factionDataMapped?.war;
  const warLive = !!war?.active;
  const warScheduled = !!war?.scheduled;

  if (!warLive && !warScheduled) {
    return null;
  }

  const ownFactionId = Number(factionDataMapped?.faction?.id || settings.factionId || 0);
  const opponentFactionId = deriveOpponentFactionId(war, ownFactionId);
  if (!opponentFactionId) return null;

  const factionEntry = Array.isArray(war?.factions)
    ? war.factions.find(entry => Number(entry?.id || 0) === opponentFactionId) || null
    : null;

  try {
    const opponentUrl = buildFactionUrl({ ...settings, factionId: opponentFactionId }, 'basic');
    const opponentResponse = await fetchJsonWithGate(
      opponentUrl,
      Math.min(Number(settings.timeoutMs || 12000), 5000),
      settings.cooldownMs
    );
    applySync(opponentResponse);

    const basic = opponentResponse.data?.basic || opponentResponse.data?.faction || opponentResponse.data || {};
    const rank = basic?.rank || {};

    let activity = null;
    let normalizedMembers = [];

    try {
      const membersUrl = buildFactionMembersUrl(settings, opponentFactionId);
      const membersResponse = await fetchJsonWithGate(
        membersUrl,
        Math.min(Number(settings.timeoutMs || 12000), 5000),
        settings.cooldownMs
      );
      applySync(membersResponse);

      normalizedMembers = normalizeFactionMembers(membersResponse.data);
      activity = calculateFactionActivity(normalizedMembers);
    } catch (err) {
      activity = null;
      normalizedMembers = [];
    }

    const members = getFactionCurrentMembers(basic, normalizedMembers);
    const memberCapacity = getFactionMemberCapacity(basic);

    return {
      id: opponentFactionId,
      name: String(basic?.name || factionEntry?.name || 'Unknown Faction').trim(),
      tag: String(basic?.tag || '').trim(),
      respect: Number(basic?.respect ?? factionEntry?.score ?? 0),
      members,
      memberCapacity,
      rankName: String(rank?.name || basic?.rank_name || basic?.rank || '').trim(),
      rankDivision: Number(rank?.division ?? basic?.rank_division ?? 0),
      rankPosition: Number(rank?.position ?? basic?.rank_position ?? 0),
      activity
    };
  } catch (error) {
    return {
      id: opponentFactionId,
      name: String(factionEntry?.name || 'Unknown Faction').trim(),
      tag: '',
      respect: Number(factionEntry?.score ?? 0),
      members: 0,
      memberCapacity: 0,
      rankName: '',
      rankDivision: 0,
      rankPosition: 0,
      error: error.message
    };
  }
}

export { getDashboardSettings, saveDashboardSettings, getCachedDashboard };

function applySync(meta) {
  recordServerSync({
    requestStartedAtMs: meta.requestStartedAtMs,
    responseReceivedAtMs: meta.responseReceivedAtMs,
    serverNowUnixMs: meta.serverNowUnixMs,
    source: meta.serverNowUnixMs ? 'torn-date-header' : 'request-midpoint'
  });
}

function getMissingUserSections(data, settings) {
  const requested = String(settings.endpointSelections || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  const missing = [];

  for (const section of requested) {
    if (section === 'battlestats' || section === 'stocks') continue;
    if (data?.[section] == null) {
      missing.push(section);
    }
  }

  return missing;
}

export async function runDashboardFetch(options = {}) {
  const settings = getDashboardSettings();
  const forceFfRefresh = !!options.forceFfRefresh;

  if (!settings.apiKey) {
    throw new Error('Missing Torn API key.');
  }

  const priorCache = getCachedDashboard();
  const previousBattleStats =
    priorCache?.dashboard?.battleStats ??
    priorCache?.dashboard?.money?.battleStats ??
    null;

  const userUrl = buildUserUrl(settings);
  const userResponse = await fetchJsonWithGate(userUrl, settings.timeoutMs, settings.cooldownMs);
  applySync(userResponse);

  const missingUserSections = getMissingUserSections(userResponse.data, settings);
  const warnings = [];

  if (missingUserSections.length) {
    warnings.push(`Torn response missing: ${missingUserSections.join(', ')}`);
  }

  let stockBundle = {
    portfolio: userResponse.data?.stocks || null,
    market: null
  };

  try {
    const tornStocksUrl = buildTornUrl(settings, 'stocks');
    const tornStocksResponse = await fetchJsonWithGate(
      tornStocksUrl,
      settings.timeoutMs,
      settings.cooldownMs
    );
    applySync(tornStocksResponse);
    stockBundle.market = tornStocksResponse.data?.stocks || tornStocksResponse.data || null;
  } catch (error) {
    stockBundle.error = error.message;
  }

  const dashboard = mapApiResponseToDashboard(userResponse.data, {
    anchorMs: getCorrectedNowMs(),
    stockBundle
  });

  if (dashboard?.battleStats) {
    const current = dashboard.battleStats;
    dashboard.battleStats = {
      ...current,
      previous: previousBattleStats,
      deltaTotal: current.total - Number(previousBattleStats?.total ?? 0),
      deltaStrength: current.strength - Number(previousBattleStats?.strength ?? 0),
      deltaDefense: current.defense - Number(previousBattleStats?.defense ?? 0),
      deltaSpeed: current.speed - Number(previousBattleStats?.speed ?? 0),
      deltaDexterity: current.dexterity - Number(previousBattleStats?.dexterity ?? 0)
    };
  }

  let factionDataMapped = {
    faction: {
      id: null,
      name: 'Unknown Faction',
      tag: '',
      respect: 0
    },
    chain: {
      active: false,
      count: 0,
      timeout: 0,
      timeoutAt: 0,
      text: 'No chain going'
    },
    war: {
      id: null,
      name: '',
      state: 'none',
      active: false,
      scheduled: false,
      startAt: 0,
      endAt: 0,
      factions: [],
      winnerId: null
    },
    opponent: null
  };

  if (settings.enableFactionData) {
    try {
      const factionUrl = buildFactionUrl(settings);
      const chainUrl = buildFactionChainUrl(settings);

      const factionResponse = await fetchJsonWithGate(
        factionUrl,
        settings.timeoutMs,
        settings.cooldownMs
      );
      applySync(factionResponse);

      const chainResponse = await fetchJsonWithGate(
        chainUrl,
        settings.timeoutMs,
        settings.cooldownMs
      );
      applySync(chainResponse);

      factionDataMapped = mapFactionData(factionResponse.data, chainResponse.data, {
        anchorMs: getCorrectedNowMs()
      });

      try {
        const ownFactionId = Number(factionDataMapped?.faction?.id || settings.factionId || 0);
        if (ownFactionId) {
          const ownMembersUrl = buildFactionMembersUrl(settings, ownFactionId);
          const ownMembersResponse = await fetchJsonWithGate(
            ownMembersUrl,
            Math.min(Number(settings.timeoutMs || 12000), 5000),
            settings.cooldownMs
          );
          applySync(ownMembersResponse);

          const normalizedOwnMembers = normalizeFactionMembers(ownMembersResponse.data);
          const ownBasic = factionResponse.data?.basic || factionResponse.data?.faction || factionResponse.data || {};
          factionDataMapped.faction = {
            ...factionDataMapped.faction,
            members: getFactionCurrentMembers(ownBasic, normalizedOwnMembers),
            memberCapacity: getFactionMemberCapacity(ownBasic),
            activity: calculateFactionActivity(normalizedOwnMembers)
          };
        }
      } catch (error) {
        warnings.push(`Faction members unavailable: ${error.message}`);
      }

      try {
        factionDataMapped.opponent = await buildOpponentFactionSummary(settings, factionDataMapped);
      } catch (error) {
        factionDataMapped.opponent = null;
        warnings.push(`Opponent faction unavailable: ${error.message}`);
      }
    } catch (error) {
      warnings.push(`Faction data failed: ${error.message}`);

      factionDataMapped = {
        faction: {
          id: null,
          name: 'Faction error',
          tag: '',
          respect: 0
        },
        chain: {
          active: false,
          count: 0,
          timeout: 0,
          timeoutAt: 0,
          text: 'No chain going'
        },
        war: {
          id: null,
          name: '',
          state: 'error',
          active: false,
          scheduled: false,
          startAt: 0,
          endAt: 0,
          factions: [],
          winnerId: null
        },
        error: error.message
      };
    }
  }

  let chainTargets = [];
  if (settings.enableFactionData) {
    try {
      chainTargets = await buildChainSaveTargets(    
        settings,    
        dashboard,    
        factionDataMapped,    
        options    
      );    
    } catch (error) {
      warnings.push(`Chain targets unavailable: ${error.message}`);
    }
  }

  const payload = {
    timestamp: getCorrectedNowMs(),
    source: 'network',
    dashboard: {
      ...dashboard,
      factionData: {
        ...factionDataMapped,
        chainTargets
      }
    },
    raw: userResponse.data,
    moneyRaw: userResponse.data?.money ?? null,
    stockRaw: stockBundle,
    warning: warnings.length ? warnings.join(' | ') : null
  };

  saveCachedDashboard(payload);
  return payload;
}

export async function runDashboardFetchWithCacheFallback(options = {}) {
  const settings = getDashboardSettings();
  const cache = getCachedDashboard();

  if (!options.forceNetwork && cache && isCacheFresh(cache, settings.cacheTtlMs)) {
    return {
      ...cache,
      source: 'cache',
      fromCache: true
    };
  }

  try {
    return await runDashboardFetch(options);
  } catch (error) {
    if (cache) {
      return {
        ...cache,
        source: 'stale-cache',
        fromCache: true,
        stale: true,
        warning: error.message
      };
    }

    throw error;
  }
}

export async function runChainRefresh() {
  const settings = getDashboardSettings();

  if (!settings.apiKey || !settings.enableFactionData) {
    throw new Error('Missing Torn API key or faction data disabled.');
  }

  const chainUrl = buildFactionChainUrl(settings);
  const chainResponse = await fetchJsonWithGate(
    chainUrl,
    settings.timeoutMs,
    settings.cooldownMs
  );
  applySync(chainResponse);

  const cache = getCachedDashboard();
  const existingDashboard = cache?.dashboard || null;
  const existingFactionData = existingDashboard?.factionData || null;

  if (!existingDashboard || !existingFactionData) {
    throw new Error('No existing dashboard data to merge chain refresh into.');
  }

  const chain = chainResponse.data?.chain || chainResponse.data || {};
  const chainCount = Number(chain.current ?? chain.chain ?? chain.count ?? chain.chain_count ?? 0);
  const chainTimeout = Number(chain.timeout ?? chain.cooldown ?? chain.time_left ?? chain.remaining ?? 0);
  const chainActive = chainCount > 0 && chainTimeout > 0;

  const nextFactionData = {
    ...existingFactionData,
    chain: {
      active: chainActive,
      count: chainCount,
      timeout: chainTimeout,
      timeoutAt: chainActive
        ? getCorrectedNowMs() + chainTimeout * 1000
        : 0,
      text: chainActive ? `Chain ${chainCount}` : 'No chain going'
    }
  };

  try {
    nextFactionData.chainTargets = await buildChainSaveTargets(  
      settings,  
      existingDashboard,  
      nextFactionData,  
      {} // no forced refresh during chain tick  
    );  
  } catch (error) {
    nextFactionData.chainTargets = existingFactionData?.chainTargets || [];
  }

  try {
    nextFactionData.opponent = await buildOpponentFactionSummary(settings, nextFactionData);
  } catch (error) {
    nextFactionData.opponent = existingFactionData?.opponent || null;
  }

  const payload = {
    ...(cache || {}),
    timestamp: getCorrectedNowMs(),
    source: 'network-chain',
    dashboard: {
      ...existingDashboard,
      factionData: nextFactionData
    }
  };

  saveCachedDashboard(payload);
  return payload;
}