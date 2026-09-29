// Mock server database, persisted so confirmed matches survive a page refresh.
import type { MatchRecord } from '@/api/contracts';
import { isMatchRecord } from '@/api/guards';
import { isRecord, readJson, removeKey, writeJson } from '@/net/storage';

export const DB_KEY = 'pb.mock.db.v1';

export interface DbState {
  /** Increments on every real insert; responses carry it so clients can discard stale data. */
  revision: number;
  records: readonly MatchRecord[];
}

function load(): DbState {
  const raw = readJson(DB_KEY);
  if (isRecord(raw) && Number.isInteger(raw.revision) && Array.isArray(raw.records)) {
    return { revision: raw.revision as number, records: raw.records.filter(isMatchRecord) };
  }
  return { revision: 0, records: [] };
}

let state: DbState = load();

export function readDb(): DbState {
  return state;
}

export function listRecords(): MatchRecord[] {
  return [...state.records];
}

/** Idempotent insert keyed by matchId: a replay returns the stored record untouched. */
export function upsertRecord(record: MatchRecord): { record: MatchRecord; created: boolean; revision: number } {
  const existing = state.records.find((r) => r.matchId === record.matchId);
  if (existing) return { record: existing, created: false, revision: state.revision };
  state = { revision: state.revision + 1, records: [...state.records, record] };
  writeJson(DB_KEY, state);
  return { record, created: true, revision: state.revision };
}

export function clearDb(): void {
  removeKey(DB_KEY);
  // Keep the revision monotonic within the session so cached pages never look newer than fresh ones.
  state = { revision: state.revision + 1, records: [] };
}
