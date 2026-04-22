import { getCorrectedNowMs } from './timeSync.js';

export function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function money(v) {
  return `$${Number(v || 0).toLocaleString()}`;
}

export function pct(current, maximum) {
  if (!maximum) return 0;
  return Math.max(0, Math.min(100, (current / maximum) * 100));
}

export function formatSeconds(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  if (s <= 0) return 'Ready';

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatUnixCountdown(untilUnix) {
  const until = Number(untilUnix || 0);
  if (!until) return '';

  const now = Math.floor(getCorrectedNowMs() / 1000);
  const remaining = until - now;

  if (remaining <= 0) return 'Ready';

  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;

  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatChainTimeout(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  if (s <= 0) return 'No chain going';

  const m = Math.floor(s / 60);
  const sec = s % 60;

  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttr(value = '') {
  return escapeHtml(value);
}

export function getStatusClass(text) {
  const value = String(text || '').toLowerCase();

  if (value.includes('returning')) return 'status-travel';
  if (value.includes('travel')) return 'status-travel';
  if (value.includes('hospital')) return 'status-bad';
  if (value.includes('jail')) return 'status-bad';
  if (value.includes('okay')) return 'status-good';
  return '';
}

export function formatDurationShort(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
