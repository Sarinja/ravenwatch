import { state } from '../../core/state.js';
import {
  escapeHtml,
  formatChainTimeout,
  formatSeconds,
  formatUnixCountdown,
  getStatusClass,
  money
} from '../../core/format.js';
import {
  getLiveDashboard,
  getChainRemainingSeconds,
  getChainAlertLevel,
  getWarClock
} from '../chainguard/chainguard.js';

let factionSectionOpen = true;
let enemyFactionSectionOpen = true;
let warTargetsSectionOpen = true;

function statPill(label, value, extraClass = '', tooltip = '') {
  return `
    <div class="stat-pill ${extraClass}" title="${escapeHtml(tooltip)}">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

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

function formatPercent(value, total) {
  const safeTotal = Number(total || 0);
  if (!safeTotal || !Number.isFinite(safeTotal)) return '0.0%';
  return `${((Number(value || 0) / safeTotal) * 100).toFixed(1)}%`;
}

function formatDelta(value) {
  const numeric = Number(value || 0);
  if (!numeric) return 'No change';
  const abs = Math.abs(numeric).toLocaleString();
  return numeric > 0 ? `+${abs}` : `-${abs}`;
}

function getReadiness(bsTotal) {
  const total = Number(bsTotal || 0);
  if (total >= 1000000000) return { label: 'Beast Mode', note: 'You are not arriving politely.' };
  if (total >= 250000000) return { label: 'War Ready', note: 'Strong enough to matter every round.' };
  if (total >= 50000000) return { label: 'Solid', note: 'Plenty usable, still room to grow.' };
  if (total > 0) return { label: 'Building', note: 'Functional, but still in the forge.' };
  return { label: 'Unknown', note: 'No battle stat data parsed yet.' };
}

function formatWarScore(value) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString();
}

function getWarLeaderClasses(warScore) {
  const us = Number(warScore?.usScore || 0);
  const them = Number(warScore?.themScore || 0);

  if (us > them) {
    return {
      usClass: 'war-score-leading',
      themClass: 'war-score-trailing'
    };
  }

  if (them > us) {
    return {
      usClass: 'war-score-trailing',
      themClass: 'war-score-leading'
    };
  }

  return {
    usClass: 'war-score-tied',
    themClass: 'war-score-tied'
  };
}

function getWarScoreSummary(factionData) {
  const war = factionData?.war;
  const ownFactionId = Number(factionData?.faction?.id || 0);
  const factions = Array.isArray(war?.factions) ? war.factions : [];

  if (!ownFactionId || factions.length < 2) return null;

  const us = factions.find(entry => Number(entry?.id || 0) === ownFactionId) || null;
  const them = factions.find(entry => Number(entry?.id || 0) !== ownFactionId) || null;

  if (!us || !them) return null;

  return {
    usLabel: 'US',
    themLabel: 'THEM',
    usScore: Number(us?.score || 0),
    themScore: Number(them?.score || 0)
  };
}

function getWarSummary(war) {
  if (!war) {
    return {
      pillValue: 'No war',
      timerLabel: 'War Timer',
      timerValue: 'No war scheduled',
      pillClass: '',
      stateText: 'None',
      bannerClass: '',
      bannerTitle: '',
      bannerDetail: '',
      showBanner: false
    };
  }

  if (war.active) {
    const timer = war.endsIn > 0 ? formatSeconds(war.endsIn) : 'Live';
    return {
      pillValue: war.endsIn > 0 ? `ACTIVE • ${timer}` : 'ACTIVE',
      timerLabel: 'War Ends In',
      timerValue: timer,
      pillClass: 'pill-danger',
      stateText: 'Active',
      bannerClass: 'war-banner-active',
      bannerTitle: 'WAR ACTIVE',
      bannerDetail: 'Fight!',
      showBanner: true
    };
  }

  if (war.scheduled) {
    const timer = formatSeconds(war.startsIn);
    const imminent = Number(war.startsIn || 0) <= 900;
    return {
      pillValue: `STARTS • ${timer}`,
      timerLabel: 'War Starts In',
      timerValue: timer,
      pillClass: 'pill-warning',
      stateText: 'Scheduled',
      bannerClass: imminent ? 'war-banner-imminent' : 'war-banner-scheduled',
      bannerTitle: imminent ? 'WAR IMMINENT' : 'WAR SCHEDULED',
      bannerDetail: imminent ? 'Get ready' : 'Stack for war',
      showBanner: true
    };
  }

  return {
    pillValue: 'No war',
    timerLabel: 'War Timer',
    timerValue: 'No war scheduled',
    pillClass: '',
    stateText: war.state || 'None',
    bannerClass: '',
    bannerTitle: '',
    bannerDetail: '',
    showBanner: false
  };
}

function formatLastAction(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return 'Unknown';
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m`;
  return `${Math.floor(value / 3600)}h`;
}

function formatOpponentRank(opponent) {
  if (!opponent) return '-';
  const rankName = String(opponent.rankName || '').trim();
  const division = Number(opponent.rankDivision || 0);
  if (!rankName) return '-';
  return division > 0 ? `${rankName} ${division}` : rankName;
}

function formatFactionInfo(entity) {
  if (!entity) return '-';
  const respect = Number(entity.respect || 0).toLocaleString();
  const rankText = escapeHtml(formatOpponentRank(entity));
  const positionText = Number(entity.rankPosition || 0) > 0
    ? ` (#${Number(entity.rankPosition).toLocaleString()})`
    : '';
  return `${respect} • ${rankText}${positionText}`;
}

function formatMembersDisplay(entity) {
  if (!entity) return '0';
  const current = Number(entity.members || 0);
  const capacity = Number(entity.memberCapacity || 0);
  return capacity > 0
    ? `${current.toLocaleString()}/${capacity.toLocaleString()}`
    : current.toLocaleString();
}

function formatActivityDisplay(activity) {
  if (!activity) return '';
  return `${escapeHtml(activity.level)} (${Number(activity.recent || 0)} in last few mins / ${Number(activity.attackable || 0)} ready)`;
}

function renderCollapsibleSection(title, key, isOpen, body, summary = '') {
  return `
    <section class="panel-section">
      <div class="card compact-card settings-collapsible-card">
        <button
          class="settings-section-toggle"
          type="button"
          data-dashboard-toggle="${escapeHtml(key)}"
          aria-expanded="${isOpen ? 'true' : 'false'}"
        >
          <div class="settings-section-toggle-main">
            <span class="travel-location-caret">${isOpen ? '▾' : '▸'}</span>
            <span class="section-title settings-section-title-inline">${escapeHtml(title)}</span>
          </div>
          ${summary ? `<div class="travel-location-summary">${escapeHtml(summary)}</div>` : ''}
        </button>
        ${isOpen ? `<div class="settings-section-body">${body}</div>` : ''}
      </div>
    </section>
  `;
}

function renderOpponentFactionCard(opponent, war) {
  const warLive = !!war?.active;
  const warScheduled = !!war?.scheduled;
  if ((!warLive && !warScheduled) || !opponent) return '';

  const body = `
    <div class="card compact-card">
      ${metricRow(
        'Faction',
        `${escapeHtml(opponent.name || 'Unknown Faction')}${
          opponent.tag ? ` (${escapeHtml(opponent.tag)})` : ''
        }`
      )}
      ${metricRow('Faction Info', formatFactionInfo(opponent))}
      ${metricRow('Members', formatMembersDisplay(opponent))}
      ${opponent?.activity ? metricRow('Activity', formatActivityDisplay(opponent.activity)) : ''}
      ${opponent?.error ? metricRow('Intel Debug', escapeHtml(opponent.error)) : ''}
    </div>
  `;

  return renderCollapsibleSection(
    'Enemy Faction',
    'enemy-faction',
    enemyFactionSectionOpen,
    body,
    opponent?.name || ''
  );
}

function renderChainSaveInfoCard(mode = 'live') {
  const text = mode === 'prewar'
    ? 'Pre-War Targets shows the top 5 likely enemy targets before the fight begins. RavenWatch uses Fair Fight values when available so players can scout names, open profiles, and line up clean hits before war starts.'
    : mode === 'critical'
      ? 'Save the Chain shows the top 5 live enemy targets RavenWatch thinks are most useful right now. Fair Fight values are used when available so you can jump straight to Attack or open Profile fast when the chain gets spicy.'
      : 'War Targets shows the top 5 live enemy players you can hit right now. RavenWatch uses Fair Fight values when available and falls back to its own scoring when not, so you can jump straight to Attack or open Profile before engaging.';

  return `
    <section class="panel-section">
      <div class="card compact-card">
        <div class="muted" style="padding: 8px 10px;">
          ${escapeHtml(text)}
        </div>
      </div>
    </section>
  `;
}

function renderChainSaveCard(targets = [], { mode = 'live' } = {}) {
  if (!Array.isArray(targets) || !targets.length) return '';

  const title = mode === 'critical'
    ? 'Save the Chain'
    : mode === 'prewar'
      ? 'Pre-War Targets'
      : 'War Targets';

  const subtitle = mode === 'prewar'
    ? 'Top 5 likely targets'
    : 'Top 5 live targets';

  const rows = targets.map((target, index) => {
    const ffValue = Number.isFinite(target.ff) ? target.ff.toFixed(2) : '—';

    let ffSuffix = '';
    if (target.ffStale) ffSuffix = 'stale';
    else if (target.ffFromCache) ffSuffix = 'cached';

    const ffText = `FF ${ffValue}${ffSuffix ? ` • ${ffSuffix}` : ''}`;
    const bsRatioText = Number.isFinite(target.ffBsRatio)
      ? `Est ${(target.ffBsRatio * 100).toFixed(0)}% of you`
      : 'Est BS —';

    const confidenceText = target.ffConfidence
      ? `${target.ffConfidence} • ${target.ffSource ? String(target.ffSource).toLowerCase() : 'unknown'}`
      : 'Confidence —';

    const noteParts = [];
    if (target.ffMismatchReason) noteParts.push(target.ffMismatchReason);
    if (target.ffLastError) noteParts.push(target.ffLastError);

    const ffNote = noteParts.length
      ? `<div class="chain-save-note">${escapeHtml(noteParts.join(' • '))}</div>`
      : '';

    let actionText = '—';
    if (Number.isFinite(target.lastActionSeconds)) {
      const seconds = Number(target.lastActionSeconds);
      if (seconds < 60) actionText = `${seconds}s`;
      else if (seconds < 3600) actionText = `${Math.floor(seconds / 60)}m`;
      else actionText = `${Math.floor(seconds / 3600)}h`;
    }

    return `
      <div class="chain-save-row">
        <div class="chain-save-rank">${index + 1}</div>
        <div class="chain-save-main">
          <div class="chain-save-name-row">
            <strong class="chain-save-name">${escapeHtml(target.name)}</strong>
            <span class="chain-save-side">Lvl ${target.level || '—'} • ${escapeHtml(target.status || 'Okay')} • ${actionText}</span>
          </div>
          <div class="chain-save-detail-row">
            <span>${ffText}</span>
            <span>${bsRatioText}</span>
          </div>
          <div class="chain-save-detail-row">
            <span>${confidenceText}</span>
            <span>${target.inTargetRange ? 'In range' : ''}</span>
          </div>
          ${ffNote}
        </div>
        <div class="chain-save-actions">
          <a class="button-link" href="${target.attackUrl}" target="_blank" rel="noreferrer">Attack</a>
          <a class="button-link secondary" href="${target.profileUrl}" target="_blank" rel="noreferrer">Profile</a>
        </div>
      </div>
    `;
  }).join('');

  const body = `
    <div class="card compact-card chain-save-card">
      <div class="chain-save-header">
        <span class="chain-save-subtle">${subtitle}</span>
        <span class="chain-save-subtle">FF + BS estimate sanity check</span>
      </div>
      <div class="chain-save-list">
        ${rows}
      </div>
    </div>
  `;

  return renderCollapsibleSection(
    title,
    'war-targets',
    warTargetsSectionOpen,
    body,
    subtitle
  );
}

export function toggleFactionSection() {
  factionSectionOpen = !factionSectionOpen;
}

export function toggleEnemyFactionSection() {
  enemyFactionSectionOpen = !enemyFactionSectionOpen;
}

export function toggleWarTargetsSection() {
  warTargetsSectionOpen = !warTargetsSectionOpen;
}

export function renderBattleStatsCard(battleStats) {
  if (!battleStats) return '';

  const readiness = getReadiness(battleStats.total);
  const rows = [
    ['Strength', battleStats.strength],
    ['Defense', battleStats.defense],
    ['Speed', battleStats.speed],
    ['Dexterity', battleStats.dexterity]
  ];

  return `
    <section class="panel-section">
      <div class="section-title">Battle Stats</div>
      <div class="card compact-card battle-stats-card">
        <div class="battle-stats-list">
          ${rows.map(([label, value]) => `
            <div class="battle-stats-line">
              <div class="battle-stats-line-label">${escapeHtml(label)}</div>
              <div class="battle-stats-line-value">${Number(value || 0).toLocaleString()}</div>
              <div class="battle-stats-line-percent">(${formatPercent(value, battleStats.total)})</div>
            </div>
          `).join('')}
        </div>
        <div class="battle-stats-topline">
          <div class="battle-stats-total-block">
            <span class="battle-stats-kicker">Total</span>
            <strong>${Number(battleStats.total || 0).toLocaleString()}</strong>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderFullStatusStrip(d) {
  const chainRemaining = getChainRemainingSeconds();
  const chainLevel = getChainAlertLevel();

  return `
    <section class="panel-section">
      <div class="top-strip">
        ${statPill('Energy', `${d.energy.current}/${d.energy.maximum}`, '', 'Energy')}
        ${statPill('Nerve', `${d.nerve.current}/${d.nerve.maximum}`, '', 'Nerve')}
        ${statPill('Health', `${d.life.current}/${d.life.maximum}`, '', 'Health')}
        ${statPill('Happy', `${d.happy.current.toLocaleString()}/${d.happy.maximum.toLocaleString()}`, '', 'Happy')}

        ${statPill(
          'Drug CD',
          formatSeconds(d.cooldowns.drug),
          d.cooldowns.drug > 0 ? 'pill-warn' : 'pill-good',
          'Drug CD'
        )}

        ${statPill(
          'Booster CD',
          formatSeconds(d.cooldowns.booster),
          d.cooldowns.booster > 0 ? 'pill-warn' : 'pill-good',
          'Booster CD'
        )}

        ${statPill(
          'Medical CD',
          formatSeconds(d.cooldowns.medical),
          d.cooldowns.medical > 0 ? 'pill-warn' : 'pill-good',
          'Medical CD'
        )}

        ${d.factionData?.chain?.active
          ? statPill(
              'Chain',
              `${d.factionData.chain.count} • ${formatChainTimeout(chainRemaining)}`,
              chainLevel === 'critical' || chainLevel === 'danger60' || chainLevel === 'danger90'
                ? 'pill-danger'
                : chainLevel === 'warning'
                  ? 'pill-warning'
                  : 'pill-good',
              'Active Chain'
            )
          : statPill(
              'Status',
              escapeHtml(d.status || 'Unknown'),
              getStatusClass(d.status),
              'Character status'
            )}
      </div>
    </section>
  `;
}

export function renderQuickStatusStrip(d) {
  return `
    <section class="panel-section">
      <div class="top-strip">
        ${statPill('Energy', `${d.energy.current}/${d.energy.maximum}`, '', 'Energy')}
        ${statPill('Health', `${d.life.current}/${d.life.maximum}`, '', 'Health')}

        ${statPill(
          'Drug CD',
          formatSeconds(d.cooldowns.drug),
          d.cooldowns.drug > 0 ? 'pill-warn' : 'pill-good',
          'Drug CD'
        )}

        ${statPill(
          'Medical CD',
          formatSeconds(d.cooldowns.medical),
          d.cooldowns.medical > 0 ? 'pill-warn' : 'pill-good',
          'Medical CD'
        )}
      </div>
    </section>
  `;
}

export function renderCharacterCard(d, dashboardSource = state.dashboard.source, dashboardTimestamp = state.dashboard.timestamp) {
  const lastSeen = dashboardTimestamp
    ? new Date(dashboardTimestamp).toLocaleTimeString()
    : 'Never';

  return `
    <section class="panel-section">
      <div class="section-title">Character</div>
      <div class="card compact-card">
        ${metricRow('Name', escapeHtml(d.name))}
        ${metricRow('Level', d.level ?? '-')}
        <div class="metric-row">
          <span>Status</span>
          <strong class="${getStatusClass(d.status)}">${escapeHtml(d.status)}</strong>
        </div>
        ${metricRow('Source', dashboardSource)}
        ${metricRow('Last Pull', lastSeen)}
      </div>
    </section>
  `;
}

export function renderDashboard() {
  const d = getLiveDashboard();

  const warning = state.dashboard.warning
    ? `<div class="card warning-card">${escapeHtml(state.dashboard.warning)}</div>`
    : '';

  if (!d) {
    return `
      <section class="panel-section">
        <div class="section-title">Dashboard</div>
        <div class="card compact-card">
          <div class="muted">No character data loaded yet. Hit Refresh or use Settings.</div>
        </div>
      </section>
    `;
  }

  const chainRemaining = getChainRemainingSeconds();
  const chainLevel = getChainAlertLevel();
  const war = getWarClock();
  const warSummary = getWarSummary(war);
  const warScore = getWarScoreSummary(d.factionData);
  const warLeaderClasses = getWarLeaderClasses(warScore);

  const warBanner = warSummary.showBanner
    ? `
      <section class="panel-section">
        <div class="card compact-card war-banner ${warSummary.bannerClass}">
          <div class="war-banner-top">
            <span class="war-banner-title">⚔ ${escapeHtml(warSummary.bannerTitle)}</span>
            <strong class="war-banner-timer">${escapeHtml(warSummary.timerValue)}</strong>
          </div>
          <div class="war-banner-detail ${warScore ? 'war-banner-detail-split' : ''}">
            <span class="war-banner-status">${escapeHtml(warSummary.bannerDetail)}</span>
            ${
              warScore
                ? `<span class="war-banner-scoreline">
                     <span class="war-score-us ${warLeaderClasses.usClass}">US ${formatWarScore(warScore.usScore)}</span>
                     <span class="war-score-v">v</span>
                     <span class="war-score-them ${warLeaderClasses.themClass}">THEM ${formatWarScore(warScore.themScore)}</span>
                  </span>`
                : ''
            }
          </div>
        </div>
      </section>
    `
    : '';

  const warActive = !!d.factionData?.war?.active;
  const warScheduled = !!d.factionData?.war?.scheduled;
  const chainCritical = !!d.factionData?.chain?.active && chainRemaining <= 90;
  const targetMode = chainCritical ? 'critical' : warScheduled ? 'prewar' : 'live';

  const chainSaveCard = (warActive || warScheduled)
    ? `${renderChainSaveCard(d.factionData?.chainTargets || [], { mode: targetMode })}
       ${renderChainSaveInfoCard(targetMode)}`
    : '';

  const opponentFactionCard = renderOpponentFactionCard(d.factionData?.opponent, war);
  const topStrip = renderQuickStatusStrip(d);

  const factionBody = `
    <div class="card compact-card">
      ${metricRow(
        'Faction',
        `${escapeHtml(d.factionData?.faction?.name || 'Unknown Faction')}${
          d.factionData?.faction?.tag
            ? ` (${escapeHtml(d.factionData.faction.tag)})`
            : ''
        }`
      )}
      ${metricRow('Faction Info', formatFactionInfo(d.factionData?.faction))}
      ${metricRow('Members', formatMembersDisplay(d.factionData?.faction))}
      ${d.factionData?.faction?.activity ? metricRow('Activity', formatActivityDisplay(d.factionData.faction.activity)) : ''}
      ${metricRow('Chain', escapeHtml(d.factionData?.chain?.text || 'No chain going'))}
      ${d.factionData?.chain?.active
        ? `
            <div class="metric-row">
              <span>Chain Timer</span>
              <strong class="${
                chainLevel === 'critical' || chainLevel === 'danger60' || chainLevel === 'danger90'
                  ? 'chain-danger-text'
                  : chainLevel === 'warning'
                    ? 'chain-warning-text'
                    : ''
              }">${formatChainTimeout(chainRemaining)}</strong>
            </div>
            <div class="chain-timer-note">Chain Timer can be off by +/-5s. Plan accordingly.</div>
          `
        : ''}
      ${war?.scheduled && war?.startAt
        ? metricRow('War Start', escapeHtml(new Date(war.startAt * 1000).toLocaleString()))
        : ''}
      ${war?.active && war?.endAt
        ? metricRow('War End', escapeHtml(new Date(war.endAt * 1000).toLocaleString()))
        : ''}
      ${d.factionData?.error
        ? metricRow('Faction Debug', escapeHtml(d.factionData.error))
        : ''}
    </div>
  `;

  const factionCard = renderCollapsibleSection(
    'Faction',
    'faction',
    factionSectionOpen,
    factionBody,
    d.factionData?.faction?.name || ''
  );

  return `
    ${warBanner}
    ${topStrip}
    ${warning}
    ${factionCard}
    ${opponentFactionCard}
    ${chainSaveCard}
  `;
}