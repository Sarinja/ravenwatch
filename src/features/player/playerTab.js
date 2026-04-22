import { state } from '../../core/state.js';
import { escapeHtml, formatUnixCountdown, money } from '../../core/format.js';
import { getLiveDashboard } from '../chainguard/chainguard.js';
import { renderBattleStatsCard, renderCharacterCard, renderFullStatusStrip } from '../dashboard/dashboardTab.js';

function metricRow(label, value) {
  return `
    <div class="metric-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function metricRowIf(label, value, isMoney = true) {
  if (!value || Number(value) === 0) return '';
  return metricRow(label, isMoney ? money(value) : value);
}

function renderMoneyCard(d) {
  return `
    <section class="panel-section">
      <div class="section-title">Money</div>
      <div class="card compact-card">
        ${metricRowIf('Wallet', d.money.wallet)}
        ${metricRowIf('Vault', d.money.vault)}
        ${metricRowIf('Company', d.money.company)}
        ${metricRowIf('Cayman', d.money.cayman)}
        ${metricRowIf('Liquid', d.money.liquid)}
        ${metricRowIf('City Bank', d.money.cityBankAmount)}
        ${metricRowIf('City Profit', d.money.cityBankProfit)}
        ${metricRowIf('City Bank Timer', formatUnixCountdown(d.money.cityBankUntil), false)}
        ${metricRowIf('Faction Money', d.money.factionMoney)}
        ${metricRowIf('Faction Points', d.money.factionPoints, false)}
        ${metricRowIf('Stocks', d.money.stocks)}
        ${metricRowIf('Daily Networth', d.money.dailyNetworth)}
        ${metricRowIf('Points', d.money.points, false)}
      </div>
    </section>
  `;
}

function renderStocksCard(d) {
  const rows = Array.isArray(d?.stocksOwned) ? d.stocksOwned : [];
  const totalStocks = Number(d?.money?.stocks || 0);

  return `
    <section class="panel-section">
      <div class="section-title">Stocks Owned</div>
      <div class="card compact-card">
        ${
          rows.length
            ? `
              <div class="battle-stats-list">
                ${rows.map(stock => `
                  <div class="battle-stats-line">
                    <div class="battle-stats-line-label">
                      ${escapeHtml(stock.symbol || stock.name)}
                    </div>
                    <div class="battle-stats-line-value">
                      (${Number(stock.shares || 0).toLocaleString()} shares)
                    </div>
                    <div class="battle-stats-line-percent">
                      ${money(stock.totalValue || 0)}
                    </div>
                  </div>
                `).join('')}
              </div>
            `
            : `
              <div class="muted">No owned stocks found.</div>
            `
        }

        <div class="battle-stats-topline">
          <div class="battle-stats-total-block">
            <span class="battle-stats-kicker">Total Value</span>
            <strong>${money(totalStocks)}</strong>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderPlayerTab() {
  const d = getLiveDashboard();

  if (!d) {
    return `
      <section class="panel-section">
        <div class="card compact-card">
          <div class="muted">No player data loaded yet. Hit Refresh or use Settings.</div>
        </div>
      </section>
    `;
  }

  const warning = state.dashboard.warning
    ? `<div class="card warning-card">${escapeHtml(state.dashboard.warning)}</div>`
    : '';

  return `
    ${warning}
    ${renderCharacterCard(d, state.dashboard.source, state.dashboard.timestamp)}
    ${renderFullStatusStrip(d)}
    ${renderBattleStatsCard(d.battleStats)}
    ${renderMoneyCard(d)}
    ${renderStocksCard(d)}
  `;
}