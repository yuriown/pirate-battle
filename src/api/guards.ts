// Runtime shape checks for data crossing a trust boundary (network bodies, localStorage).
import type { ApiErrorBody, MatchConfig, MatchRecord, Page, SubmitMatchResponse } from './contracts';
import { isRecord } from '@/net/storage';

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNonNegativeInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isPositiveNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function isMatchConfig(value: unknown): value is MatchConfig {
  return isRecord(value) && isPositiveNumber(value.sessionDurationSec) && isPositiveNumber(value.spawnIntervalSec);
}

export function isMatchRecord(value: unknown): value is MatchRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value.matchId) &&
    value.matchId.length <= 64 &&
    isNonEmptyString(value.playerId) &&
    isNonEmptyString(value.playerName) &&
    typeof value.playedAt === 'string' &&
    !Number.isNaN(Date.parse(value.playedAt)) &&
    isNonNegativeInt(value.score) &&
    isNonNegativeInt(value.durationMs) &&
    (value.endReason === 'time_up' || value.endReason === 'destroyed') &&
    isMatchConfig(value.config)
  );
}

export function isPage<T>(value: unknown, isItem: (item: unknown) => item is T): value is Page<T> {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    isNonNegativeInt(value.page) &&
    isNonNegativeInt(value.pageSize) &&
    isNonNegativeInt(value.total) &&
    isNonNegativeInt(value.totalPages) &&
    isNonNegativeInt(value.revision)
  );
}

export function isSubmitMatchResponse(value: unknown): value is SubmitMatchResponse {
  return (
    isRecord(value) && isMatchRecord(value.record) && typeof value.created === 'boolean' && isNonNegativeInt(value.revision)
  );
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return isRecord(value) && typeof value.error === 'string' && typeof value.message === 'string';
}
