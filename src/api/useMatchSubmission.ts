import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { MutationObserver, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { submitMatch, toApiError, type ApiError } from './client';
import type { MatchRecord, SubmitMatchResponse } from './contracts';
import { invalidateMatchQueries, retryDelay, shouldRetry } from './queries';
import {
  getEntry,
  getOutboxSnapshot,
  markConfirmed,
  putRecord,
  subscribeOutbox,
  updateStatus,
  type OutboxEntry,
  type OutboxSnapshot,
} from '@/net/pendingQueue';

export const SUBMIT_MUTATION_KEY = ['submitMatch'] as const;

export type SubmissionStatus = 'saving' | 'saved' | 'failed' | 'unknown';

let boundClient: QueryClient | null = null;
/** One request chain per matchId: repeated clicks or resumes join it instead of racing it. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Sends a queued record. A module-level MutationObserver is used instead of `useMutation` so a
 * submission keeps running (and its success/failure is still recorded) after the component that
 * triggered it unmounts, e.g. when the player leaves the result screen to start a new match.
 */
export function sendMatch(matchId: string): Promise<void> {
  const running = inFlight.get(matchId);
  if (running) return running;
  const entry = getEntry(matchId);
  const client = boundClient;
  if (!entry || !client) return Promise.resolve();

  updateStatus(matchId, (s) => ({ ...s, state: 'sending', lastError: undefined }));
  const observer = new MutationObserver<SubmitMatchResponse, ApiError, MatchRecord>(client, {
    mutationKey: SUBMIT_MUTATION_KEY,
    mutationFn: (record) => {
      updateStatus(record.matchId, (s) => ({ ...s, attempts: s.attempts + 1 }));
      return submitMatch(record);
    },
    retry: shouldRetry,
    retryDelay,
  });

  const chain = observer
    .mutate(entry.record)
    .then(
      (response) => {
        markConfirmed(response.record.matchId);
        void invalidateMatchQueries(client);
      },
      (error: unknown) => {
        updateStatus(matchId, (s) => ({ ...s, state: 'failed', lastError: toApiError(error).message }));
      },
    )
    .finally(() => {
      inFlight.delete(matchId);
      observer.reset();
    });
  inFlight.set(matchId, chain);
  return chain;
}

/** Persists the finished match first, then tries to send it. Safe to call repeatedly. */
export function enqueueMatch(record: MatchRecord): void {
  putRecord(record);
  void sendMatch(record.matchId);
}

export function retryAllSubmissions(): void {
  getOutboxSnapshot().entries.forEach((entry) => void sendMatch(entry.record.matchId));
}

/** Binds the QueryClient and re-sends everything left over from a previous session. */
export function resumePendingSubmissions(client: QueryClient): void {
  if (!boundClient && typeof window !== 'undefined') window.addEventListener('online', retryAllSubmissions);
  boundClient = client;
  retryAllSubmissions();
}

function statusFrom(snapshot: OutboxSnapshot, matchId: string): SubmissionStatus {
  const entry = snapshot.entries.find((e) => e.record.matchId === matchId);
  if (entry) return entry.status.state === 'failed' ? 'failed' : 'saving';
  return snapshot.confirmed.includes(matchId) ? 'saved' : 'unknown';
}

export function getSubmissionStatus(matchId: string): SubmissionStatus {
  return statusFrom(getOutboxSnapshot(), matchId);
}

export interface MatchSubmissions {
  pending: readonly OutboxEntry[];
  statusOf: (matchId: string) => SubmissionStatus;
  retry: (matchId: string) => void;
  retryAll: () => void;
  enqueue: (record: MatchRecord) => void;
}

const retry = (matchId: string) => void sendMatch(matchId);

export function useMatchSubmissions(): MatchSubmissions {
  const client = useQueryClient();
  const snapshot = useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getOutboxSnapshot);

  useEffect(() => {
    if (!boundClient) resumePendingSubmissions(client);
  }, [client]);

  return useMemo(
    () => ({
      pending: snapshot.entries,
      statusOf: (matchId: string) => statusFrom(snapshot, matchId),
      retry,
      retryAll: retryAllSubmissions,
      enqueue: enqueueMatch,
    }),
    [snapshot],
  );
}
