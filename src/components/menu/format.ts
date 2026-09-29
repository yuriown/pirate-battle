import type { EndReason, MatchConfig } from '@/api/contracts';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatRank(rank: number): string {
  return pad2(rank);
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(totalSec / 60))}:${pad2(totalSec % 60)}`;
}

/** Local time, e.g. "08 SEP · 21:42"; built by hand so output does not depend on the browser locale. */
export function formatPlayedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatEndReason(reason: EndReason): string {
  return reason === 'time_up' ? 'TIME UP' : 'DEFEATED';
}

export function formatConfig(config: MatchConfig): string {
  return `${config.sessionDurationSec} second battles · ${config.spawnIntervalSec} second spawn interval`;
}
