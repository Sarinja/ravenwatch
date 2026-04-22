import { createAbsoluteUnixMsFromRelativeSeconds } from '../../core/timeSync.js';

function pickNumber(source, keys = []) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function pickString(source, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function getPathValue(source, path) {
  if (!source || !path) return undefined;
  const parts = String(path).split('.');
  let current = source;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current?.[part];
  }
  return current;
}

function pickPathNumber(source, paths = []) {
  for (const path of paths) {
    const value = Number(getPathValue(source, path));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
}

function normalizeWarCollection(rawWars) {
  if (!rawWars) return [];
  if (Array.isArray(rawWars)) return rawWars;
  if (typeof rawWars === 'object') return Object.values(rawWars);
  return [];
}

function mapWar(rawWar) {
  const factions = rawWar?.factions || rawWar?.participants || [];
  const teams = Array.isArray(factions) ? factions : Object.values(factions || {});

  const startAt = pickNumber(rawWar, [
    'start',
    'start_time',
    'start_timestamp',
    'war_start',
    'begins',
    'begins_at'
  ]);

  const endAt = pickNumber(rawWar, [
    'end',
    'end_time',
    'end_timestamp',
    'war_end',
    'ends',
    'ends_at'
  ]);

  const stateText = pickString(rawWar, ['state', 'status', 'result']) || 'unknown';

  return {
    id: rawWar?.id ?? rawWar?.war_id ?? null,
    name: pickString(rawWar, ['name', 'title']),
    state: stateText,
    startAt,
    endAt,
    winnerId: rawWar?.winner ?? rawWar?.winner_id ?? null,
    factions: teams.map(team => ({
      id: team?.id ?? team?.faction_id ?? null,
      name: pickString(team, ['name']) || 'Unknown Faction',
      score: Number(team?.score ?? team?.points ?? team?.respect ?? 0)
    }))
  };
}

function selectRelevantWar(rawWars, anchorMs = Date.now()) {
  const wars = normalizeWarCollection(rawWars)
    .map(mapWar)
    .filter(war => war.startAt || war.endAt || war.state !== 'unknown');

  if (!wars.length) return null;

  const nowUnix = Math.floor(anchorMs / 1000);

  const active = wars.find(war => {
    const state = war.state.toLowerCase();
    if (state.includes('active') || state.includes('war')) return true;
    return war.startAt > 0 && war.startAt <= nowUnix && (!war.endAt || war.endAt > nowUnix);
  });

  if (active) {
    return {
      ...active,
      active: true,
      scheduled: false
    };
  }

  const upcoming = wars
    .filter(war => war.startAt > nowUnix)
    .sort((a, b) => a.startAt - b.startAt)[0];

  if (upcoming) {
    return {
      ...upcoming,
      active: false,
      scheduled: true
    };
  }

  const recent = wars
    .filter(war => war.endAt > 0)
    .sort((a, b) => b.endAt - a.endAt)[0];

  return recent
    ? {
        ...recent,
        active: false,
        scheduled: false
      }
    : null;
}

function normalizePortfolioStocks(rawPortfolio) {
  if (!rawPortfolio) return [];

  if (Array.isArray(rawPortfolio)) {
    return rawPortfolio.filter(entry => entry && typeof entry === 'object');
  }

  if (Array.isArray(rawPortfolio?.stocks)) {
    return rawPortfolio.stocks.filter(entry => entry && typeof entry === 'object');
  }

  if (typeof rawPortfolio === 'object') {
    return Object.values(rawPortfolio)
      .flatMap(entry => {
        if (!entry) return [];
        if (Array.isArray(entry)) return entry;
        if (Array.isArray(entry?.stocks)) return entry.stocks;
        return [entry];
      })
      .filter(entry => entry && typeof entry === 'object');
  }

  return [];
}

function normalizeMarketStocks(rawMarket) {
  if (!rawMarket) return [];

  if (Array.isArray(rawMarket)) {
    return rawMarket.filter(entry => entry && typeof entry === 'object');
  }

  if (Array.isArray(rawMarket?.stocks)) {
    return rawMarket.stocks.filter(entry => entry && typeof entry === 'object');
  }

  if (typeof rawMarket === 'object') {
    return Object.values(rawMarket)
      .flatMap(entry => {
        if (!entry) return [];
        if (Array.isArray(entry)) return entry;
        if (Array.isArray(entry?.stocks)) return entry.stocks;
        return [entry];
      })
      .filter(entry => entry && typeof entry === 'object');
  }

  return [];
}

function sumStockValue(rawStocks, stockBundle = null) {
  const portfolioEntries = normalizePortfolioStocks(stockBundle?.portfolio || rawStocks);
  const marketEntries = normalizeMarketStocks(stockBundle?.market || null);

  if (portfolioEntries.length && marketEntries.length) {
    const marketById = new Map();
    for (const entry of marketEntries) {
      const id = Number(entry?.id ?? entry?.stock_id ?? entry?.stockId);
      if (!Number.isFinite(id) || id <= 0) continue;
      const price = pickNumber(entry?.market || entry, ['price', 'current_price', 'market_price', 'value']);
      if (price > 0) {
        marketById.set(id, price);
      }
    }

    let total = 0;
    for (const entry of portfolioEntries) {
      const shares = pickNumber(entry, ['shares', 'amount', 'quantity', 'owned']);
      const id = Number(entry?.id ?? entry?.stock_id ?? entry?.stockId);
      const price = marketById.get(id) || pickNumber(entry, ['price', 'current_price', 'market_price', 'value']);
      if (shares > 0 && price > 0) {
        total += shares * price;
      }
    }

    if (total > 0) return total;
  }

  if (!rawStocks) return 0;

  const direct = pickNumber(rawStocks, [
    'total',
    'value',
    'current',
    'market_value',
    'total_value',
    'worth'
  ]);
  if (direct > 0) return direct;

  const entries = normalizePortfolioStocks(rawStocks);

  let total = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const explicit = pickNumber(entry, ['value', 'total_value', 'market_value', 'worth']);
    if (explicit > 0) {
      total += explicit;
      continue;
    }

    const shares = pickNumber(entry, ['shares', 'amount', 'quantity', 'owned']);
    const price = pickNumber(entry, ['price', 'current_price', 'market_price']);
    if (shares > 0 && price > 0) {
      total += shares * price;
    }
  }

  return total;
}

function mapStocksOwned(rawStocks, stockBundle = null) {
  const portfolioEntries = normalizePortfolioStocks(stockBundle?.portfolio || rawStocks);
  const marketEntries = normalizeMarketStocks(stockBundle?.market || null);

  const marketById = new Map();
  const marketByAcronym = new Map();

  for (const entry of marketEntries) {
    const id = Number(entry?.id ?? entry?.stock_id ?? entry?.stockId);
    const acronym = String(entry?.acronym ?? entry?.symbol ?? entry?.ticker ?? '').trim().toUpperCase();
    const name = pickString(entry, ['name', 'company', 'title']) || acronym || 'Unknown Stock';
    const price = pickNumber(entry?.market || entry, ['price', 'current_price', 'market_price', 'value']);

    const normalized = { id, acronym, name, price };

    if (Number.isFinite(id) && id > 0) {
      marketById.set(id, normalized);
    }
    if (acronym) {
      marketByAcronym.set(acronym, normalized);
    }
  }

  const rows = portfolioEntries
    .map(entry => {
      const shares = pickNumber(entry, ['shares', 'amount', 'quantity', 'owned']);
      if (shares <= 0) return null;

      const id = Number(entry?.id ?? entry?.stock_id ?? entry?.stockId);
      const acronym = String(
        entry?.acronym ?? entry?.symbol ?? entry?.ticker ?? ''
      ).trim().toUpperCase();

      const marketMatch =
        (Number.isFinite(id) && id > 0 ? marketById.get(id) : null) ||
        (acronym ? marketByAcronym.get(acronym) : null) ||
        null;

      const name =
        pickString(entry, ['name', 'company', 'title']) ||
        marketMatch?.name ||
        acronym ||
        'Unknown Stock';

      const symbol = acronym || marketMatch?.acronym || '';
      const price =
        pickNumber(entry, ['price', 'current_price', 'market_price', 'value']) ||
        Number(marketMatch?.price || 0);

      const totalValue =
        pickNumber(entry, ['total_value', 'market_value', 'worth']) ||
        (shares > 0 && price > 0 ? shares * price : 0);

      return {
        id: Number.isFinite(id) && id > 0 ? id : null,
        symbol,
        name,
        shares,
        price,
        totalValue
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalValue - a.totalValue);

  return rows;
}

function mapBattleStats(rawBattleStats) {
  const source = rawBattleStats?.battlestats || rawBattleStats?.battleStats || rawBattleStats || {};

  const strength = pickPathNumber(source, [
    'strength',
    'strength.value',
    'strength.amount',
    'strength.total',
    'strength.current',
    'strength_info.value',
    'battle_stats.strength',
    'battleStats.strength'
  ]);

  const defense = pickPathNumber(source, [
    'defense',
    'defence',
    'defense.value',
    'defence.value',
    'defense.amount',
    'defence.amount',
    'defense.total',
    'defence.total',
    'defense.current',
    'defence.current',
    'defense_info.value',
    'defence_info.value',
    'battle_stats.defense',
    'battleStats.defense'
  ]);

  const speed = pickPathNumber(source, [
    'speed',
    'speed.value',
    'speed.amount',
    'speed.total',
    'speed.current',
    'speed_info.value',
    'battle_stats.speed',
    'battleStats.speed'
  ]);

  const dexterity = pickPathNumber(source, [
    'dexterity',
    'dexterity.value',
    'dexterity.amount',
    'dexterity.total',
    'dexterity.current',
    'dexterity_info.value',
    'battle_stats.dexterity',
    'battleStats.dexterity'
  ]);

  const computedTotal = strength + defense + speed + dexterity;
  const total = pickPathNumber(source, [
    'total',
    'total.value',
    'total.amount',
    'total.current',
    'battle_stats.total',
    'battleStats.total'
  ]) || computedTotal;

  const sourcedFromTorn = !!rawBattleStats?.battlestats || !!rawBattleStats?.battleStats;

  return {
    strength,
    defense,
    speed,
    dexterity,
    total,
    sourcedFromTorn,
    hasBreakdown: strength > 0 || defense > 0 || speed > 0 || dexterity > 0
  };
}

export function mapFactionData(factionData, chainData, { anchorMs = Date.now() } = {}) {
  const faction = factionData?.basic || factionData?.faction || factionData || {};
  const chain = chainData?.chain || chainData || {};

  const chainCount = Number(chain.current ?? chain.chain ?? chain.count ?? chain.chain_count ?? 0);
  const chainTimeout = Number(chain.timeout ?? chain.cooldown ?? chain.time_left ?? chain.remaining ?? 0);
  const chainActive = chainCount > 0 && chainTimeout > 0;
  const rankedWar = selectRelevantWar(
    factionData?.rankedwars || factionData?.wars || factionData?.war,
    anchorMs
  );
  const rank = faction?.rank || {};
  const membersCurrent = pickPathNumber(faction, [
    'members',
    'member_count',
    'memberCount'
  ]);
  const membersCapacity = pickPathNumber(faction, [
    'capacity.maximum',
    'capacity.max',
    'capacity.total',
    'capacity.limit',
    'capacity.current'
  ]);

  return {
    faction: {
      id: faction.id ?? faction.faction_id ?? null,
      name: faction.name || 'Unknown Faction',
      tag: faction.tag || '',
      respect: Number(faction.respect ?? 0),
      members: membersCurrent,
      memberCapacity: membersCapacity,
      rankName: String(rank?.name || faction?.rank_name || faction?.rank || '').trim(),
      rankDivision: Number(rank?.division ?? faction?.rank_division ?? 0),
      rankPosition: Number(rank?.position ?? faction?.rank_position ?? 0)
    },
    chain: {
      active: chainActive,
      count: chainCount,
      timeout: chainTimeout,
      timeoutAt: chainActive ? createAbsoluteUnixMsFromRelativeSeconds(chainTimeout, anchorMs) : 0,
      text: chainActive ? `Chain ${chainCount}` : 'No chain going'
    },
    war: rankedWar
      ? {
          id: rankedWar.id,
          name: rankedWar.name,
          state: rankedWar.state,
          active: !!rankedWar.active,
          scheduled: !!rankedWar.scheduled,
          startAt: Number(rankedWar.startAt || 0),
          endAt: Number(rankedWar.endAt || 0),
          factions: rankedWar.factions,
          winnerId: rankedWar.winnerId
        }
      : {
          id: null,
          name: '',
          state: 'none',
          active: false,
          scheduled: false,
          startAt: 0,
          endAt: 0,
          factions: [],
          winnerId: null
        }
  };
}

export function mapApiResponseToDashboard(data, { anchorMs = Date.now(), stockBundle = null } = {}) {
  const bars = data?.bars || {};
  const cooldowns = data?.cooldowns || {};
  const money = data?.money || {};
  const travel = data?.travel || {};
  const stocks = data?.stocks || {};
  const profile = data?.profile || data || {};
  const battleStats = mapBattleStats(data);

  const energy = bars.energy || data?.energy || {};
  const nerve = bars.nerve || data?.nerve || {};
  const happy = bars.happy || data?.happy || {};
  const life = bars.life || data?.life || {};

  const wallet = Number(money.wallet ?? 0);
  const vault = Number(money.vault ?? 0);
  const company = Number(money.company ?? 0);
  const cayman = Number(money.cayman_bank ?? 0);
  const points = Number(money.points ?? 0);
  const dailyNetworth = Number(money.daily_networth ?? 0);
  const stocksValue = sumStockValue(stocks, stockBundle);
  const stocksOwned = mapStocksOwned(stocks, stockBundle);

  const cityBank = money.city_bank || {};
  const cityBankAmount = Number(cityBank.amount ?? 0);
  const cityBankProfit = Number(cityBank.profit ?? 0);
  const cityBankDuration = Number(cityBank.duration ?? 0);
  const cityBankRate = Number(cityBank.interest_rate ?? 0);
  const cityBankUntil = Number(cityBank.until ?? 0);

  const faction = money.faction || {};
  const factionMoney = Number(faction.money ?? 0);
  const factionPoints = Number(faction.points ?? 0);

  const liquid = wallet + vault + company + cayman;
  const travelTimeLeft = Number(travel.time_left ?? 0);

  return {
    name: profile.name || 'Unknown',
    level: profile.level ?? null,
    playerId: profile.player_id ?? profile.id ?? null,
    status: profile.status?.description || profile.status?.state || profile.state || 'Unknown',

    energy: {
      current: energy.current ?? 0,
      maximum: energy.maximum ?? 0
    },
    nerve: {
      current: nerve.current ?? 0,
      maximum: nerve.maximum ?? 0
    },
    happy: {
      current: happy.current ?? 0,
      maximum: happy.maximum ?? 0
    },
    life: {
      current: life.current ?? 0,
      maximum: life.maximum ?? 0
    },

    money: {
      wallet,
      vault,
      company,
      cayman,
      points,
      cityBankAmount,
      cityBankProfit,
      cityBankDuration,
      cityBankRate,
      cityBankUntil,
      factionMoney,
      factionPoints,
      dailyNetworth,
      stocks: stocksValue,
      liquid
    },

    battleStats,
    stocksOwned,

    cooldowns: {
      drug: Number(cooldowns.drug ?? 0),
      booster: Number(cooldowns.booster ?? 0),
      medical: Number(cooldowns.medical ?? 0)
    },

    travel: {
      destination: travel.destination || '',
      time_left: travelTimeLeft,
      status: travel.status || '',
      arrivalAt: travelTimeLeft > 0 ? createAbsoluteUnixMsFromRelativeSeconds(travelTimeLeft, anchorMs) : 0
    },

    raw: data
  };
}
