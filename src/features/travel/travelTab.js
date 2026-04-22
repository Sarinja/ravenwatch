import { escapeHtml, formatDurationShort } from "../../core/format.js";
import { fetchYataTravelExport } from "../../services/yataClient.js";
import {
  addTravelSightingsBatch,
  getAllLatestStates
} from "./travelStore.js";

const openCountries = new Set();

function countryKey(value) {
  return String(value || "").trim();
}

function formatAge(timestamp) {
  const diffSeconds = Math.max(0, Math.round((Date.now() - Number(timestamp || 0)) / 1000));
  return formatDurationShort(diffSeconds);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString()}`;
}

function renderTravelControls() {
  return `
    <section class="panel-section">
      <div class="section-title">Travel</div>
      <div class="card compact-card">
        <div class="travel-controls">
          <button id="pullYataBtn">Pull YATA</button>
          <button id="clearTravelDataBtn">Clear Travel</button>
        </div>
      </div>
    </section>
  `;
}

function renderCountryItems(items = []) {
  if (!items.length) {
    return `<div class="muted">No items recorded yet for this country.</div>`;
  }

  return `
    <div class="travel-drop-list">
      ${items
        .map(item => {
          const inStock = Number(item.quantity || 0) > 0;
          return `
            <div class="travel-drop-row">
              <div class="travel-drop-row-main">
                <div class="travel-drop-primary">
                  ${escapeHtml(item.name)}
                  ${inStock ? "✅" : "❌"}
                </div>
                <div class="travel-drop-secondary">
                  Qty: ${escapeHtml(String(item.quantity ?? 0))}
                  &nbsp;·&nbsp;
                  Cost: ${escapeHtml(formatMoney(item.cost))}
                  &nbsp;·&nbsp;
                  Seen: ${escapeHtml(new Date(item.lastSeenAt || 0).toLocaleString())}
                </div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCountrySection(country, data) {
  const isOpen = openCountries.has(country);
  const caret = isOpen ? "▾" : "▸";
  const totalItems = data.items.length;
  const itemsInStock = data.items.filter(item => Number(item.quantity || 0) > 0).length;
  const summary = `${itemsInStock}/${totalItems} in stock · seen ${formatAge(data.seenAt)} ago`;

  return `
    <section class="panel-section">
      <div class="card compact-card travel-location-card">
        <button
          class="travel-location-toggle"
          type="button"
          data-travel-location-toggle="${escapeHtml(country)}"
        >
          <div class="travel-location-toggle-main">
            <span class="travel-location-caret">${caret}</span>
            <span class="travel-location-name">${escapeHtml(country)}</span>
          </div>

          <div class="travel-location-summary">
            ${escapeHtml(summary)}
          </div>
        </button>

        ${
          isOpen
            ? `
              <div class="travel-location-body">
                <div class="metric-row">
                  <span>Last Seen</span>
                  <strong>${escapeHtml(new Date(data.seenAt).toLocaleString())}</strong>
                </div>
                <div class="metric-row">
                  <span>Source</span>
                  <strong>${escapeHtml(data.source || "manual")}</strong>
                </div>
                <div class="metric-row">
                  <span>Items In Stock</span>
                  <strong>${itemsInStock}</strong>
                </div>
                <div class="metric-row">
                  <span>Total Known Items</span>
                  <strong>${totalItems}</strong>
                </div>

                ${renderCountryItems(data.items)}
              </div>
            `
            : ""
        }
      </div>
    </section>
  `;
}

export function renderTravel() {
  const latestStates = getAllLatestStates();
  const countries = Object.keys(latestStates).sort((a, b) => a.localeCompare(b));

  const currentStateSection = countries.length
    ? countries.map(country => renderCountrySection(country, latestStates[country])).join("")
    : `
      <section class="panel-section">
        <div class="section-title">Current Country States</div>
        <div class="card compact-card">
          <div class="muted">No country state recorded yet.</div>
        </div>
      </section>
    `;

  return `
    ${renderTravelControls()}
    ${currentStateSection}
  `;
}

export function clearTravelUiState() {
  openCountries.clear();
}

export async function importYataTravelData() {
  const { sightings } = await fetchYataTravelExport();
  const result = addTravelSightingsBatch(sightings);

  return {
    ok: true,
    ...result,
    message: result.added
      ? `YATA import complete: ${result.added} added, ${result.skipped} skipped.`
      : `YATA import complete: no new snapshots found (${result.skipped} skipped).`
  };
}

export function toggleTravelLocation(location) {
  const key = countryKey(location);
  if (!key) return;

  if (openCountries.has(key)) {
    openCountries.delete(key);
  } else {
    openCountries.add(key);
  }
}

export function toggleTravelItem() {
  // kept for compatibility
}

export function openTravelEditor() {
  // kept for compatibility
}

export function closeTravelEditor() {
  // kept for compatibility
}
