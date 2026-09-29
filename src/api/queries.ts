import { keepPreviousData, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { fetchHistory, fetchRanking, isRetryable, type ApiError } from './client';
import type { HistoryQuery, MatchRecord, Page, RankingEntry, RankingQuery } from './contracts';

export const queryKeys = {
  rankingAll: ['ranking'] as const,
  ranking: (query: RankingQuery) => ['ranking', query] as const,
  historyAll: ['history'] as const,
  history: (query: HistoryQuery) => ['history', query] as const,
};

const MAX_RETRIES = 2;

/** Retries only transient failures (timeout, network, 5xx, 408/429); a 4xx will not fix itself. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryable(error);
}

export function retryDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 4000);
}

/** Highest database revision this client knows exists (raised by every confirmed registration). */
let minRevision = 0;

export function noteRevision(revision: number): void {
  minRevision = Math.max(minRevision, revision);
}

/**
 * A response computed against an older database revision (e.g. a slow request that started
 * before a match was registered) must not replace newer data: it loses to a newer cached page,
 * and if it is older than a registration we already confirmed, it is fetched again.
 */
async function freshest<T>(client: QueryClient, key: QueryKey, load: () => Promise<Page<T>>): Promise<Page<T>> {
  let incoming = await load();
  if (incoming.revision < minRevision) incoming = await load();
  const cached = client.getQueryData<Page<T>>(key);
  return cached && cached.revision > incoming.revision ? cached : incoming;
}

const sharedOptions = {
  // The API is mocked in the page: a browser "offline" flag must not freeze the queries.
  networkMode: 'always',
  placeholderData: keepPreviousData,
  staleTime: 0,
  refetchOnMount: 'always',
  retry: shouldRetry,
  retryDelay,
} as const;

export function useRankingQuery(query: RankingQuery) {
  const client = useQueryClient();
  const queryKey = queryKeys.ranking(query);
  return useQuery<Page<RankingEntry>, ApiError>({
    ...sharedOptions,
    queryKey,
    queryFn: ({ signal }) => freshest(client, queryKey, () => fetchRanking(query, signal)),
  });
}

export function useHistoryQuery(query: HistoryQuery) {
  const client = useQueryClient();
  const queryKey = queryKeys.history(query);
  return useQuery<Page<MatchRecord>, ApiError>({
    ...sharedOptions,
    queryKey,
    queryFn: ({ signal }) => freshest(client, queryKey, () => fetchHistory(query, signal)),
  });
}

/**
 * Refreshes both tabs; active queries refetch now, inactive ones on their next mount.
 * In-flight reads are cancelled first: invalidating a query that is still on its first load
 * would otherwise just join that (now stale) request.
 */
export async function invalidateMatchQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.cancelQueries({ queryKey: queryKeys.rankingAll }),
    client.cancelQueries({ queryKey: queryKeys.historyAll }),
  ]);
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.rankingAll }),
    client.invalidateQueries({ queryKey: queryKeys.historyAll }),
  ]);
}
