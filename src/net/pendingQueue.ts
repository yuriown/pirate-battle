// Persistent outbox of finished matches that the server has not confirmed yet.
// Records are written here BEFORE any request is made, so a failure, a timeout or a page refresh
// never loses a match; the matchId doubles as the server-side idempotency key.
import type { MatchRecord } from '@/api/contracts';
import { isMatchRecord } from '@/api/guards';
import { isRecord, readJson, removeKey, writeJson } from './storage';

export const OUTBOX_KEY = 'pb.pending.v1';
export const CONFIRMED_KEY = 'pb.confirmed.v1';
const CONFIRMED_LIMIT = 50;

export type OutboxState = 'pending' | 'sending' | 'failed';

export interface OutboxStatus {
  state: OutboxState;
  attempts: number;
  lastError?: string;
}

export interface OutboxEntry {
  record: MatchRecord;
  status: OutboxStatus;
}

export interface OutboxSnapshot {
  /** Oldest first. */
  entries: readonly OutboxEntry[];
  /** Most recent last; bounded to the last CONFIRMED_LIMIT ids. */
  confirmed: readonly string[];
}

function isOutboxEntry(value: unknown): value is OutboxEntry {
  if (!isRecord(value) || !isMatchRecord(value.record) || !isRecord(value.status)) return false;
  const { state, attempts } = value.status;
  return (state === 'pending' || state === 'sending' || state === 'failed') && Number.isInteger(attempts);
}

function load(): OutboxSnapshot {
  const rawEntries = readJson(OUTBOX_KEY);
  const rawConfirmed = readJson(CONFIRMED_KEY);
  const entries = Array.isArray(rawEntries)
    ? rawEntries.filter(isOutboxEntry).map((entry) =>
        // A 'sending' entry on load means the tab died mid-request; it is simply pending again.
        entry.status.state === 'sending' ? { ...entry, status: { ...entry.status, state: 'pending' as const } } : entry,
      )
    : [];
  const confirmed = Array.isArray(rawConfirmed)
    ? rawConfirmed.filter((id): id is string => typeof id === 'string').slice(-CONFIRMED_LIMIT)
    : [];
  return { entries, confirmed };
}

let snapshot: OutboxSnapshot = load();
const listeners = new Set<() => void>();

function commit(next: OutboxSnapshot, persist = true): void {
  snapshot = next;
  if (persist) {
    writeJson(OUTBOX_KEY, next.entries);
    writeJson(CONFIRMED_KEY, next.confirmed);
  }
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  // Keep several open tabs in agreement about what is still pending.
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === OUTBOX_KEY || event.key === CONFIRMED_KEY) commit(load(), false);
  });
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOutboxSnapshot(): OutboxSnapshot {
  return snapshot;
}

export function getEntry(matchId: string): OutboxEntry | undefined {
  return snapshot.entries.find((entry) => entry.record.matchId === matchId);
}

/** Adds a record unless it is already queued or confirmed. Returns false for a duplicate. */
export function putRecord(record: MatchRecord): boolean {
  if (getEntry(record.matchId) || snapshot.confirmed.includes(record.matchId)) return false;
  commit({ ...snapshot, entries: [...snapshot.entries, { record, status: { state: 'pending', attempts: 0 } }] });
  return true;
}

export function updateStatus(matchId: string, update: (status: OutboxStatus) => OutboxStatus): void {
  if (!getEntry(matchId)) return;
  commit({
    ...snapshot,
    entries: snapshot.entries.map((entry) =>
      entry.record.matchId === matchId ? { ...entry, status: update(entry.status) } : entry,
    ),
  });
}

export function markConfirmed(matchId: string): void {
  commit({
    entries: snapshot.entries.filter((entry) => entry.record.matchId !== matchId),
    confirmed: [...snapshot.confirmed.filter((id) => id !== matchId), matchId].slice(-CONFIRMED_LIMIT),
  });
}

export function clearOutbox(): void {
  removeKey(OUTBOX_KEY);
  removeKey(CONFIRMED_KEY);
  commit({ entries: [], confirmed: [] }, false);
}
