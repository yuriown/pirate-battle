// MSW handlers shared by dev, Playwright and the published build.
// Every response body is computed when the request ARRIVES and only then delayed, so a slow
// response faithfully carries the older database revision it was computed against.
import { delay, http, HttpResponse } from 'msw';
import { API_ROUTES, type ApiErrorBody, type MatchRecord, type Page, type RankingEntry } from '@/api/contracts';
import { isMatchRecord } from '@/api/guards';
import { listRecords, readDb, upsertRecord } from './db';
import { manyPagesFixtures, standardFixtures } from './fixtures';
import { mulberry32 } from './rng';
import { getControl, subscribeControl, type MockControl } from './scenarios';

const MAX_PAGE_SIZE = 50;

// Per-session counters; restarted whenever the control state changes so a scenario replays identically.
let requestCount = 0;
let readCount = 0;
const flakyAttempts = new Map<string, number>();

export function resetHandlerState(): void {
  requestCount = 0;
  readCount = 0;
  flakyAttempts.clear();
}
subscribeControl(resetHandlerState);

function seededBetween(control: MockControl, min: number, max: number): number {
  const rnd = mulberry32((control.seed ^ Math.imul(requestCount, 0x9e3779b1)) >>> 0);
  return Math.round(min + rnd() * (max - min));
}

type Kind = 'read' | 'write';

function latencyFor(control: MockControl, kind: Kind): number {
  const instant = control.latencyMode === 'instant';
  const pastTimeout = control.clientTimeoutMs + 1500;
  switch (control.scenario) {
    case 'timeout':
      return pastTimeout;
    case 'out-of-order':
      if (kind === 'read') {
        const slow = readCount % 2 === 1;
        if (instant) return slow ? 600 : 50;
        return slow ? 2500 : 200;
      }
      break;
    case 'slow':
      return instant ? 0 : 2500;
    case 'jitter':
      return instant ? 0 : seededBetween(control, 100, 3000);
  }
  return instant ? 0 : seededBetween(control, 150, 450);
}

function errorJson(status: number, error: string, message: string) {
  return HttpResponse.json<ApiErrorBody>({ error, message }, { status });
}

type Endpoint = 'ranking' | 'history' | 'submit';

/** Scenario-wide failures that apply before any work is done. */
function injectedFailure(control: MockControl, endpoint: Endpoint): Response | null {
  switch (control.scenario) {
    case 'network-error':
      return HttpResponse.error();
    case 'http-400':
      return errorJson(400, 'bad_request', 'The server rejected the request (simulated 400).');
    case 'http-500':
      return errorJson(500, 'internal_error', 'The server hit an internal error (simulated 500).');
    case 'unavailable':
      return errorJson(503, 'unavailable', 'The server is temporarily unavailable (simulated 503).');
    case 'ranking-fails':
      return endpoint === 'ranking'
        ? errorJson(500, 'internal_error', 'The ranking service failed (simulated 500).')
        : null;
    case 'history-fails':
      return endpoint === 'history'
        ? errorJson(503, 'unavailable', 'The history service is unavailable (simulated 503).')
        : null;
    default:
      return null;
  }
}

function parsePositiveInt(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parsePositiveNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readPagination(url: URL): { page: number; pageSize: number } | null {
  const page = parsePositiveInt(url.searchParams.get('page'), 1);
  const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 10);
  if (page === null || pageSize === null || pageSize > MAX_PAGE_SIZE) return null;
  return { page, pageSize };
}

function paginate<T>(items: T[], page: number, pageSize: number, revision: number): Page<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    revision,
  };
}

function fixturesFor(control: MockControl): MatchRecord[] {
  if (control.scenario === 'empty') return [];
  return control.scenario === 'many-pages' ? manyPagesFixtures() : standardFixtures();
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Score DESC, survived longer, achieved first, then matchId: a total, stable order. */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  return (
    b.score - a.score ||
    b.durationMs - a.durationMs ||
    Date.parse(a.playedAt) - Date.parse(b.playedAt) ||
    compareIds(a.matchId, b.matchId)
  );
}

async function respondAfter(control: MockControl, kind: Kind, response: Response): Promise<Response> {
  const ms = latencyFor(control, kind);
  if (ms > 0) await delay(ms);
  return response;
}

function beginRequest(kind: Kind): MockControl {
  requestCount += 1;
  if (kind === 'read') readCount += 1;
  return getControl();
}

export const handlers = [
  http.get(API_ROUTES.ranking, ({ request }) => {
    const control = beginRequest('read');
    const failure = injectedFailure(control, 'ranking');
    if (failure) return respondAfter(control, 'read', failure);

    const url = new URL(request.url);
    const pagination = readPagination(url);
    const sessionDurationSec = parsePositiveNumber(url.searchParams.get('sessionDurationSec'));
    const spawnIntervalSec = parsePositiveNumber(url.searchParams.get('spawnIntervalSec'));
    if (!pagination || sessionDurationSec === null || spawnIntervalSec === null) {
      return respondAfter(
        control,
        'read',
        errorJson(400, 'invalid_query', 'Invalid configuration or pagination parameters.'),
      );
    }

    const { revision } = readDb();
    const records = control.scenario === 'empty' ? [] : listRecords();
    const ranked: RankingEntry[] = [...fixturesFor(control), ...records]
      .filter(
        (r) => r.config.sessionDurationSec === sessionDurationSec && r.config.spawnIntervalSec === spawnIntervalSec,
      )
      .sort(compareRanking)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return respondAfter(
      control,
      'read',
      HttpResponse.json(paginate(ranked, pagination.page, pagination.pageSize, revision)),
    );
  }),

  http.get(API_ROUTES.matches, ({ request }) => {
    const control = beginRequest('read');
    const failure = injectedFailure(control, 'history');
    if (failure) return respondAfter(control, 'read', failure);

    const url = new URL(request.url);
    const pagination = readPagination(url);
    const playerId = url.searchParams.get('playerId');
    if (!pagination || !playerId) {
      return respondAfter(control, 'read', errorJson(400, 'invalid_query', 'Invalid player or pagination parameters.'));
    }

    const { revision } = readDb();
    const mine = (control.scenario === 'empty' ? [] : listRecords())
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || compareIds(a.matchId, b.matchId));
    return respondAfter(
      control,
      'read',
      HttpResponse.json(paginate(mine, pagination.page, pagination.pageSize, revision)),
    );
  }),

  http.post(API_ROUTES.matches, async ({ request }) => {
    const control = beginRequest('write');
    if (control.scenario === 'timeout') {
      // Hangs WITHOUT committing, unlike post-timeout-after-commit.
      return respondAfter(control, 'write', errorJson(504, 'timeout', 'Gateway timeout (simulated).'));
    }
    const failure = injectedFailure(control, 'submit');
    if (failure) return respondAfter(control, 'write', failure);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    if (!isMatchRecord(body)) {
      return respondAfter(control, 'write', errorJson(422, 'invalid_match', 'The match record is malformed.'));
    }

    if (control.scenario === 'flaky-post') {
      const attempt = (flakyAttempts.get(body.matchId) ?? 0) + 1;
      flakyAttempts.set(body.matchId, attempt);
      if (attempt <= 2) {
        return respondAfter(
          control,
          'write',
          errorJson(503, 'unavailable', `Registration failed (simulated, attempt ${attempt}).`),
        );
      }
    }

    // Store only contract fields so extra client properties never leak into records.
    const { matchId, playerId, playerName, playedAt, score, durationMs, endReason, config } = body;
    const result = upsertRecord({
      matchId,
      playerId,
      playerName,
      playedAt,
      score,
      durationMs,
      endReason,
      config: { sessionDurationSec: config.sessionDurationSec, spawnIntervalSec: config.spawnIntervalSec },
    });
    const response = HttpResponse.json(result, { status: result.created ? 201 : 200 });
    if (control.scenario === 'post-timeout-after-commit' && result.created) {
      // Committed, but the answer arrives after the client gave up; the retry then finds the record.
      await delay(control.clientTimeoutMs + 1500);
      return response;
    }
    return respondAfter(control, 'write', response);
  }),
];
