import { state } from "../../core/state.js";
import { escapeHtml } from "../../core/format.js";

export function renderAlerts() {
  const items = state.alerts.length
    ? state.alerts.map(alert => `
        <div class="card compact-card alert-row">
          <div class="alert-time">${escapeHtml(alert.time)}</div>
          <div class="alert-text">${escapeHtml(alert.text)}</div>
        </div>
      `).join("")
    : `<div class="card compact-card"><div class="muted">No alerts yet.</div></div>`;

  return `
    <section class="panel-section">
      <div class="section-title">Alerts</div>
      ${items}
    </section>
  `;
}