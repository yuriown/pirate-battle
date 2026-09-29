// Typed REST contracts shared by the Axios client, TanStack Query hooks and MSW handlers.

export type EndReason = 'time_up' | 'destroyed';

/** The part of the gameplay configuration that defines a comparable ranking bracket. */
export interface MatchConfig {
  sessionDurationSec: number;
  spawnIntervalSec: number;
}

export interface MatchRecord {
  /** Client-generated UUID; the idempotency key of POST /api/matches. */
  matchId: string;
  playerId: string;
  playerName: string;
  /** ISO-8601 timestamp of when the match ended. */
  playedAt: string;
  score: number;
  /** Effective active play time (pauses excluded), in milliseconds. */
  durationMs: number;
  endReason: EndReason;
  config: MatchConfig;
}

export interface RankingEntry extends MatchRecord {
  rank: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Monotonic data revision of the mock database when the response was computed. */
  revision: number;
}

export interface RankingQuery {
  sessionDurationSec: number;
  spawnIntervalSec: number;
  page: number;
  pageSize: number;
}

export interface HistoryQuery {
  playerId: string;
  page: number;
  pageSize: number;
}

export interface SubmitMatchResponse {
  record: MatchRecord;
  /** false when the matchId already existed (idempotent replay). */
  created: boolean;
  revision: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export const API_ROUTES = {
  ranking: '/api/ranking',
  matches: '/api/matches',
} as const;
