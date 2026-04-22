import { state, saveTravelDrops } from "../../core/state.js";

function makeSnapshotId(prefix = "travel") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanCountry(value) {
  return String(value || "").trim();
}

function cleanItemName(value) {
  return String(value || "").trim();
}

function cleanNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeItem(item, index = 0) {
  return {
    id: item?.id || `item_${index}`,
    name: cleanItemName(item?.name),
    quantity: Math.max(0, cleanNumber(item?.quantity, 0)),
    cost: Math.max(0, cleanNumber(item?.cost, 0))
  };
}

function normalizeSnapshot(snapshot, index = 0) {
  const country = cleanCountry(snapshot?.country || snapshot?.location);
  const seenAt = cleanNumber(snapshot?.seenAt ?? snapshot?.timestamp, Date.now());
  const source = String(snapshot?.source || "manual").trim() || "manual";

  let items = [];

  if (Array.isArray(snapshot?.items)) {
    items = snapshot.items
      .map((item, itemIndex) => normalizeItem(item, itemIndex))
      .filter(item => item.name);
  } else {
    const legacyItemName = cleanItemName(snapshot?.item);
    if (legacyItemName) {
      items = [
        {
          id: `legacy_${index}`,
          name: legacyItemName,
          quantity: 1,
          cost: 0
        }
      ];
    }
  }

  return {
    id: snapshot?.id || makeSnapshotId("travel"),
    country,
    seenAt,
    source,
    items
  };
}

function sortSightingsInPlace() {
  state.travelDrops.sort((a, b) => Number(b.seenAt || 0) - Number(a.seenAt || 0));
}

export function normalizeTravelDrops() {
  if (!Array.isArray(state.travelDrops)) {
    state.travelDrops = [];
    saveTravelDrops();
    return;
  }

  state.travelDrops = state.travelDrops
    .map((entry, index) => normalizeSnapshot(entry, index))
    .filter(entry => entry.country);

  sortSightingsInPlace();
  saveTravelDrops();
}

function snapshotsMatch(a, b) {
  if (!a || !b) return false;
  if (String(a.country || "") !== String(b.country || "")) return false;
  if (Number(a.seenAt || 0) !== Number(b.seenAt || 0)) return false;

  const itemsA = Array.isArray(a.items) ? a.items : [];
  const itemsB = Array.isArray(b.items) ? b.items : [];
  if (itemsA.length !== itemsB.length) return false;

  const keyOf = item => `${item.name}::${item.quantity}::${item.cost}`;
  const sortedA = itemsA.map(keyOf).sort();
  const sortedB = itemsB.map(keyOf).sort();

  return sortedA.every((value, index) => value === sortedB[index]);
}

function itemsAreEqual(a = [], b = []) {
  if (a.length !== b.length) return false;

  const mapA = Object.fromEntries(a.map(i => [i.name, `${i.quantity}-${i.cost}`]));
  const mapB = Object.fromEntries(b.map(i => [i.name, `${i.quantity}-${i.cost}`]));

  const keysA = Object.keys(mapA);
  const keysB = Object.keys(mapB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (mapA[key] !== mapB[key]) return false;
  }

  return true;
}

export function addTravelSighting({
  country,
  items = [],
  seenAt = Date.now(),
  source = "manual"
}) {
  const snapshot = normalizeSnapshot({
    id: makeSnapshotId("travel"),
    country,
    seenAt,
    source,
    items
  });

  if (!snapshot.country) return null;

  const last = getLatestCountryState(snapshot.country);

  if (last && itemsAreEqual(last.items, snapshot.items)) {
    return null;
  }

  state.travelDrops.push(snapshot);
  sortSightingsInPlace();
  saveTravelDrops();

  return snapshot;
}

export function addTravelSightingsBatch(sightings = []) {
  if (!Array.isArray(sightings) || !sightings.length) {
    return { added: 0, skipped: 0, total: 0 };
  }

  let added = 0;
  let skipped = 0;

  for (const sighting of sightings) {
    const result = addTravelSighting(sighting);
    if (result) {
      added += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    added,
    skipped,
    total: sightings.length
  };
}

export function addTravelDrop(country, item = "", extra = {}) {
  const itemName = cleanItemName(item);

  const items = itemName
    ? [
        {
          id: extra.itemId || `manual_${itemName.toLowerCase().replace(/\s+/g, "_")}`,
          name: itemName,
          quantity: Math.max(0, cleanNumber(extra.quantity, 0)),
          cost: Math.max(0, cleanNumber(extra.cost, 0))
        }
      ]
    : [];

  return addTravelSighting({
    country,
    items,
    seenAt: extra.seenAt ?? Date.now(),
    source: extra.source || "manual"
  });
}

export function getSightings(country = null) {
  const all = Array.isArray(state.travelDrops) ? state.travelDrops : [];
  if (!country) return all.slice();
  return all.filter(entry => entry.country === country);
}

export function getLatestCountryState(country) {
  const sightings = getSightings(country).sort((a, b) => Number(b.seenAt || 0) - Number(a.seenAt || 0));
  if (!sightings.length) return null;

  const latest = sightings[0];
  const itemMap = new Map();

  for (const sighting of sightings) {
    for (const item of sighting.items || []) {
      if (!itemMap.has(item.name)) {
        itemMap.set(item.name, {
          ...item,
          lastSeenAt: sighting.seenAt,
          source: sighting.source
        });
      }
    }
  }

  return {
    country,
    seenAt: latest.seenAt,
    source: latest.source,
    items: Array.from(itemMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  };
}

export function getAllLatestStates() {
  const countries = Array.from(
    new Set(
      getSightings()
        .map(entry => entry.country)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const result = {};
  for (const country of countries) {
    const latest = getLatestCountryState(country);
    if (latest) result[country] = latest;
  }
  return result;
}


export function clearTravelSightings() {
  state.travelDrops = [];
  saveTravelDrops();
}

/**
 * Kept only for compatibility with old imports in core/events.js.
 * This UI no longer uses edit/delete, so these are safe no-ops / limited support.
 */
export function updateTravelDrop(id, updates = {}) {
  const entry = state.travelDrops.find(drop => drop.id === id);
  if (!entry) return false;

  const nextCountry = cleanCountry(updates.location ?? updates.country ?? entry.country);
  const nextTimestamp = cleanNumber(updates.timestamp ?? updates.seenAt, entry.seenAt);

  if (!nextCountry || !Number.isFinite(nextTimestamp)) {
    return false;
  }

  entry.country = nextCountry;
  entry.seenAt = nextTimestamp;

  if (typeof updates.source === "string" && updates.source.trim()) {
    entry.source = updates.source.trim();
  }

  if (typeof updates.item === "string") {
    const itemName = cleanItemName(updates.item);
    if (itemName) {
      const firstItem = entry.items?.[0];
      if (firstItem) {
        firstItem.name = itemName;
      } else {
        entry.items = [
          {
            id: `manual_${itemName.toLowerCase().replace(/\s+/g, "_")}`,
            name: itemName,
            quantity: 0,
            cost: 0
          }
        ];
      }
    }
  }

  sortSightingsInPlace();
  saveTravelDrops();
  return true;
}

export function deleteTravelDrop(id) {
  const initialLength = state.travelDrops.length;
  state.travelDrops = state.travelDrops.filter(drop => drop.id !== id);

  if (state.travelDrops.length === initialLength) {
    return false;
  }

  saveTravelDrops();
  return true;
}