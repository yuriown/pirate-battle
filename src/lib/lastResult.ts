import type { MatchRecord } from '@/api/contracts';
import { isMatchRecord } from '@/api/guards';

const RESULT_KEY = 'pb.lastResult.v1';
const SCREEN_KEY = 'pb.showResult.v1';

/** Last completed match, kept locally so the result survives a refresh. */
export function loadLastResult(): MatchRecord | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // Old or corrupted data must never crash the result screen.
    return isMatchRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastResult(record: MatchRecord): void {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(record));
    localStorage.setItem(SCREEN_KEY, '1');
  } catch {
    // Storage unavailable: the result is still shown for this session.
  }
}

/** Whether the result screen was open when the page was last closed/refreshed. */
export function resultScreenWasOpen(): boolean {
  try {
    return localStorage.getItem(SCREEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearLastResult(): void {
  try {
    localStorage.removeItem(RESULT_KEY);
    localStorage.removeItem(SCREEN_KEY);
  } catch {
    // ignore
  }
}

export function setResultScreenOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(SCREEN_KEY, '1');
    else localStorage.removeItem(SCREEN_KEY);
  } catch {
    // ignore
  }
}
