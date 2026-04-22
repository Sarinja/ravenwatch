import { state, setChainGuardEnabled, pushAlert } from '../../core/state.js';
import { getHeaderControls } from '../../core/dom.js';
import {
  createAbsoluteUnixMsFromRelativeSeconds,
  getCorrectedNowMs,
  getRemainingSecondsFromAbsolute
} from '../../core/timeSync.js';
const leaderImg = new URL('../../assets/images/sadleader.jpg', import.meta.url).href;
const sadLeaderImg = new URL('../../assets/images/leader.jpg', import.meta.url).href;
const chainAudioSrc = new URL('../../assets/images/Chain.m4a', import.meta.url).href;
const batsyAudioSrc = new URL('../../assets/images/Batsy.m4a', import.meta.url).href;
import { isSavedLicenseValid } from '../../services/license.js';

let lastChainTimeout = 0;
let chainSound60Played = false;
let chainSound10Played = false;

function getCustomAsset(key, fallback) {
  const asset = state.customAssets?.[key];
  if (!asset) return fallback;
  if (typeof asset === 'string') return asset;
  return asset.dataUrl || asset.src || fallback;
}

function playSound(file) {
  if (!state.soundEnabled) return;

  try {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = file;
    audio.volume = 1.0;
    audio.load();
    audio.play().catch(err => {
      console.warn(`Sound failed for ${file}:`, err);
    });
  } catch (err) {
    console.warn(`Sound setup failed for ${file}:`, err);
  }
}

function normalizeLiveDashboardShape(dashboard) {
  const d = dashboard || {};

  d.energy = d.energy || { current: 0, maximum: 0 };
  d.nerve = d.nerve || { current: 0, maximum: 0 };
  d.happy = d.happy || { current: 0, maximum: 0 };
  d.life = d.life || { current: 0, maximum: 0 };

  d.cooldowns = d.cooldowns || { drug: 0, booster: 0, medical: 0 };

  d.travel = d.travel || {
    destination: '',
    time_left: 0,
    status: '',
    arrivalAt: 0
  };

  d.money = d.money || {
    wallet: 0,
    vault: 0,
    company: 0,
    cayman: 0,
    points: 0,
    cityBankAmount: 0,
    cityBankProfit: 0,
    cityBankDuration: 0,
    cityBankRate: 0,
    cityBankUntil: 0,
    factionMoney: 0,
    factionPoints: 0,
    dailyNetworth: 0,
    stocks: 0,
    liquid: 0
  };

  d.factionData = d.factionData || {};
  d.factionData.faction = d.factionData.faction || {
    id: null,
    name: 'Unknown Faction',
    tag: '',
    respect: 0
  };

  d.factionData.chain = d.factionData.chain || {
    active: false,
    count: 0,
    timeout: 0,
    timeoutAt: 0,
    text: 'No chain going'
  };

  d.factionData.war = d.factionData.war || {
    id: null,
    name: '',
    state: 'none',
    active: false,
    scheduled: false,
    startAt: 0,
    endAt: 0,
    factions: [],
    winnerId: null
  };

  return d;
}

function hydrateWarState(war = {}) {
  const nowMs = getCorrectedNowMs();
  const startAtMs = Number(war.startAt || 0) * 1000;
  const endAtMs = Number(war.endAt || 0) * 1000;

  const active = !!(war.active || (startAtMs && startAtMs <= nowMs && (!endAtMs || endAtMs > nowMs)));
  const scheduled = !!(!active && (war.scheduled || (startAtMs && startAtMs > nowMs)));

  return {
    ...war,
    active,
    scheduled,
    startsIn: scheduled ? getRemainingSecondsFromAbsolute(startAtMs) : 0,
    endsIn: active && endAtMs ? getRemainingSecondsFromAbsolute(endAtMs) : 0
  };
}

export function getLiveDashboard() {
  if (!state.dashboard.data) return null;

  const d = normalizeLiveDashboardShape(structuredClone(state.dashboard.data));
  const elapsed = state.dashboard.timestamp
    ? Math.floor((getCorrectedNowMs() - state.dashboard.timestamp) / 1000)
    : 0;

  d.cooldowns.drug = Math.max(0, Number(d.cooldowns.drug || 0) - elapsed);
  d.cooldowns.booster = Math.max(0, Number(d.cooldowns.booster || 0) - elapsed);
  d.cooldowns.medical = Math.max(0, Number(d.cooldowns.medical || 0) - elapsed);

  const arrivalAt = Number(d.travel.arrivalAt || 0);
  d.travel.time_left = arrivalAt
    ? getRemainingSecondsFromAbsolute(arrivalAt)
    : Math.max(0, Number(d.travel.time_left || 0) - elapsed);

  if (d.factionData?.chain) {
    const timeoutAt = Number(d.factionData.chain.timeoutAt || 0);

    d.factionData.chain.timeout = timeoutAt
      ? getRemainingSecondsFromAbsolute(timeoutAt)
      : Math.max(0, Number(d.factionData.chain.timeout || 0) - elapsed);

    if (!timeoutAt && Number(d.factionData.chain.timeout || 0) > 0) {
      d.factionData.chain.timeoutAt = createAbsoluteUnixMsFromRelativeSeconds(
        d.factionData.chain.timeout,
        state.dashboard.timestamp || getCorrectedNowMs()
      );
    }

    d.factionData.chain.active =
      d.factionData.chain.timeout > 0 && Number(d.factionData.chain.count || 0) > 0;

    d.factionData.chain.text = d.factionData.chain.active
      ? `Chain ${d.factionData.chain.count}`
      : 'No chain going';
  }

  if (d.factionData?.war) {
    d.factionData.war = hydrateWarState(d.factionData.war);
  }

  return d;
}

export function getChainRemainingSeconds() {
  const d = getLiveDashboard();
  if (!d?.factionData?.chain?.active) return 0;
  return Number(d.factionData.chain.timeout || 0);
}

export function getWarClock() {
  const d = getLiveDashboard();
  return d?.factionData?.war || null;
}

export function getChainAlertLevel() {
  const remaining = getChainRemainingSeconds();

  if (!state.chainGuardEnabled || remaining <= 0) return 'none';
  if (remaining <= 30) return 'critical';
  if (remaining <= 60) return 'danger60';
  if (remaining <= 90) return 'danger90';
  if (remaining <= 180) return 'warning';
  return 'none';
}


function getWarAlertLevel() {
  const war = getWarClock();
  if (!war) return 'none';
  if (war.active) return 'active';
  if (war.scheduled) {
    const startsIn = Number(war.startsIn || 0);
    if (startsIn <= 900) return 'imminent';
    if (startsIn <= 3600) return 'soon';
  }
  return 'none';
}

function updateChainOverlay() {
  let overlay = document.getElementById('chainOverlay');

  const d = getLiveDashboard();
  const chain = d?.factionData?.chain;

  const remaining = Number(chain?.timeout || 0);
  const count = Number(chain?.count || 0);

  const chainWasRefreshed = remaining > lastChainTimeout;
  lastChainTimeout = remaining;

  const isActive = count > 0 && remaining > 0;

  const shouldShow =
    state.chainGuardEnabled &&
    isActive &&
    remaining <= 60 &&
    !chainWasRefreshed;

  if (!shouldShow) {
    if (overlay) overlay.remove();
    return;
  }

  const image = remaining <= 30
      ? getCustomAsset("criticalImage", sadLeaderImg)
      : getCustomAsset("chainImage", leaderImg);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'chainOverlay';

    overlay.innerHTML = `
      <div class="chain-overlay-inner">
        <img id="chainFace" src="${image}" class="chain-face" />
        <div class="chain-text">CHAIN!!!</div>
      </div>
    `;

    document.body.appendChild(overlay);
  } else {
    const img = document.getElementById('chainFace');
    if (img && img.src !== image) {
      img.src = image;
    }
  }

  overlay.classList.remove('overlay-60', 'overlay-30', 'overlay-10');

  if (remaining <= 10) {
    overlay.classList.add('overlay-10');
  } else if (remaining <= 30) {
    overlay.classList.add('overlay-30');
  } else {
    overlay.classList.add('overlay-60');
  }
}

export function updateChainGuardAlarm() {
  const app = document.querySelector('.app');
  if (!app) return;

  const remaining = getChainRemainingSeconds();
  const previousRemaining = lastChainTimeout;
  const warLevel = getWarAlertLevel();

  app.classList.remove(
    'chain-alert-180',
    'chain-alert-90',
    'chain-alert-60',
    'chain-alert-30',
    'war-alert-soon',
    'war-alert-imminent',
    'war-alert-active'
  );

  if (!isSavedLicenseValid() || !state.chainGuardEnabled || remaining <= 0) {
    chainSound60Played = false;
    chainSound10Played = false;

    if (warLevel === 'active') {
      app.classList.add('war-alert-active');
    } else if (warLevel === 'imminent') {
      app.classList.add('war-alert-imminent');
    } else if (warLevel === 'soon') {
      app.classList.add('war-alert-soon');
    }

    updateChainOverlay();
    lastChainTimeout = remaining;
    return;
  }

  const chainWasRefreshed = remaining > previousRemaining;

  if (chainWasRefreshed) {
    chainSound60Played = false;
    chainSound10Played = false;
  }

  const crossedInto60 = previousRemaining > 60 && remaining <= 60;
  const crossedInto10 = previousRemaining > 10 && remaining <= 10;

  if (crossedInto60 && !chainSound60Played) {
    playSound(getCustomAsset("sound60", chainAudioSrc));
    chainSound60Played = true;
  }

  if (crossedInto10 && !chainSound10Played) {
    playSound(getCustomAsset("sound10", batsyAudioSrc));
    chainSound10Played = true;
  }

  if (remaining <= 30) {
    app.classList.add('chain-alert-30');
  } else if (remaining <= 60) {
    app.classList.add('chain-alert-60');
  } else if (remaining <= 90) {
    app.classList.add('chain-alert-90');
  } else if (remaining <= 180) {
    app.classList.add('chain-alert-180');
  }

  if (warLevel === 'active') {
    app.classList.add('war-alert-active');
  } else if (warLevel === 'imminent') {
    app.classList.add('war-alert-imminent');
  } else if (warLevel === 'soon') {
    app.classList.add('war-alert-soon');
  }

  updateChainOverlay();
  lastChainTimeout = remaining;
}

export function ensureChainGuardButton(onToggle) {
  if (document.getElementById('toggleChainGuard')) return;

  const headerControls = getHeaderControls();
  if (!headerControls) {
    console.warn('RavenWatch: .controls not found; ChainGuard button not mounted.');
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'toggleChainGuard';
  btn.type = 'button';
  btn.textContent = 'ChainGuard';
  btn.classList.toggle('active-guard', state.chainGuardEnabled);

  btn.addEventListener('click', () => {
    if (!isSavedLicenseValid()) {
      pushAlert('Blocked: enter a valid license key in Settings.');
      return;
    }

    setChainGuardEnabled(!state.chainGuardEnabled);
    btn.classList.toggle('active-guard', state.chainGuardEnabled);
    updateChainGuardAlarm();

    if (typeof onToggle === 'function') {
      onToggle();
    }
  });

  headerControls.appendChild(btn);
}

export function syncChainGuardButtonVisuals() {
  const guardBtn = document.getElementById('toggleChainGuard');
  if (!guardBtn) return;

  guardBtn.classList.toggle('active-guard', state.chainGuardEnabled);

  const level = getChainAlertLevel();
  guardBtn.classList.toggle('guard-warning', level === 'warning');
  guardBtn.classList.toggle(
    'guard-alarm',
    level === 'danger90' || level === 'danger60' || level === 'critical'
  );
}
