import axios, { AxiosError } from 'axios';
import {
  API_ROUTES,
  type HistoryQuery,
  type MatchRecord,
  type Page,
  type RankingEntry,
  type RankingQuery,
  type SubmitMatchResponse,
} from './contracts';
import { isApiErrorBody, isMatchRecord, isPage, isSubmitMatchResponse } from './guards';

export const DEFAULT_TIMEOUT_MS = 8000;

export const http = axios.create({
  baseURL: '',
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

/** Runtime override used by the mock control panel and by e2e tests (short timeouts). */
export function setClientTimeout(ms: number): void {
  http.defaults.timeout = ms;
}

export function getClientTimeout(): number {
  return http.defaults.timeout ?? DEFAULT_TIMEOUT_MS;
}

export type ApiErrorKind = 'timeout' | 'network' | 'http';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(kind: ApiErrorKind, message: string, status?: number, retryable?: boolean) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryable =
      retryable ?? (kind !== 'http' || status === undefined || status >= 500 || status === 408 || status === 429);
  }
}

export function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && error.retryable;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) {
    return new ApiError('network', 'Request cancelled.', undefined, false);
  }
  if (error instanceof AxiosError) {
    if (error.response) {
      const { status, data } = error.response;
      const message = isApiErrorBody(data) ? data.message : `Server responded with HTTP ${status}.`;
      return new ApiError('http', message, status);
    }
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiError('timeout', 'The server took too long to respond.');
    }
    return new ApiError('network', 'Could not reach the server. Check your connection.');
  }
  return new ApiError('network', error instanceof Error ? error.message : 'Unexpected network failure.');
}

// A missing mock worker on a static host returns index.html with HTTP 200; never hand that to the UI.
function unexpectedBody(): ApiError {
  return new ApiError('http', 'The server returned an unexpected response.', 502, false);
}

async function request<T>(run: () => Promise<{ data: unknown }>, guard: (v: unknown) => v is T): Promise<T> {
  let data: unknown;
  try {
    ({ data } = await run());
  } catch (error) {
    throw toApiError(error);
  }
  if (!guard(data)) throw unexpectedBody();
  return data;
}

const isRankingEntry = (v: unknown): v is RankingEntry =>
  isMatchRecord(v) && Number.isInteger((v as Partial<RankingEntry>).rank);
const isRankingPage = (v: unknown): v is Page<RankingEntry> => isPage(v, isRankingEntry);
const isHistoryPage = (v: unknown): v is Page<MatchRecord> => isPage(v, isMatchRecord);

export function fetchRanking(query: RankingQuery, signal?: AbortSignal): Promise<Page<RankingEntry>> {
  return request(() => http.get(API_ROUTES.ranking, { params: query, signal }), isRankingPage);
}

export function fetchHistory(query: HistoryQuery, signal?: AbortSignal): Promise<Page<MatchRecord>> {
  return request(() => http.get(API_ROUTES.matches, { params: query, signal }), isHistoryPage);
}

export function submitMatch(record: MatchRecord): Promise<SubmitMatchResponse> {
  return request(() => http.post(API_ROUTES.matches, record), isSubmitMatchResponse);
}
