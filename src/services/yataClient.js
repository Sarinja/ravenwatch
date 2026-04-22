import { getDashboardSettings } from "./dashboardConfig.js";

const DEFAULT_YATA_TRAVEL_EXPORT_URL = "https://yata.yt/api/v1/travel/export/";

const COUNTRY_CODE_TO_NAME = {
  mex: "Mexico",
  cay: "Cayman Islands",
  can: "Canada",
  haw: "Hawaii",
  uni: "United Kingdom",
  arg: "Argentina",
  swi: "Switzerland",
  jap: "Japan",
  chi: "China",
  uae: "UAE",
  sou: "South Africa"
};

function cleanNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toUnixMs(value) {
  const num = cleanNumber(value, Date.now());
  return num < 1e12 ? num * 1000 : num;
}

function normalizeYataItem(item, index = 0) {
  return {
    id: item?.id || `yata_${index}`,
    name: String(item?.name || "").trim(),
    quantity: Math.max(0, cleanNumber(item?.quantity, 0)),
    cost: Math.max(0, cleanNumber(item?.cost, 0))
  };
}

export function mapYataStocksToSightings(payload) {
  const stocks = payload?.stocks;
  if (!stocks || typeof stocks !== "object") {
    return [];
  }

  return Object.entries(stocks)
    .map(([countryCode, countryData]) => {
      const country = COUNTRY_CODE_TO_NAME[countryCode] || String(countryCode || "").toUpperCase();
      const items = Array.isArray(countryData?.stocks)
        ? countryData.stocks.map((item, index) => normalizeYataItem(item, index)).filter(item => item.name)
        : [];

      return {
        country,
        items,
        seenAt: toUnixMs(countryData?.update),
        source: "yata"
      };
    })
    .filter(sighting => sighting.country);
}

function buildYataTravelExportUrl() {
  const settings = getDashboardSettings();
  const rawUrl = String(settings?.yataTravelExportUrl || "").trim() || DEFAULT_YATA_TRAVEL_EXPORT_URL;
  return new URL(rawUrl).toString();
}

export async function fetchYataTravelExport() {
  const url = buildYataTravelExportUrl();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`YATA HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    raw: data,
    sightings: mapYataStocksToSightings(data)
  };
}