// Mock server database, persisted so confirmed matches survive a page refresh.
import type { MatchRecord } from '@/api/contracts';
import { isMatchRecord } from '@/api/guards';
import { isRecord, readJson, writeJson } from '@/net/storage';

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

// The MSW handlers run inside each page, so every open tab has its own copy of this module.
// Storage is therefore the source of truth: it is re-read before every read and write, so two
// tabs registering matches never overwrite each other's records.

export function readDb(): DbState {
  return load();
}

export function listRecords(): MatchRecord[] {
  return [...load().records];
}

/** Idempotent insert keyed by matchId: a replay returns the stored record untouched. */
export function upsertRecord(record: MatchRecord): { record: MatchRecord; created: boolean; revision: number } {
  const state = load();
  const existing = state.records.find((r) => r.matchId === record.matchId);
  if (existing) return { record: existing, created: false, revision: state.revision };
  const next = { revision: state.revision + 1, records: [...state.records, record] };
  writeJson(DB_KEY, next);
  return { record, created: true, revision: next.revision };
}

export function clearDb(): void {
  // Empty, but keep the revision monotonic so cached pages never look newer than fresh ones.
  writeJson(DB_KEY, { revision: load().revision + 1, records: [] });
}
