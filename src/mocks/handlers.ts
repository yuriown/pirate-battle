import { http, HttpResponse, delay } from 'msw';
import { MatchResult, RankingEntry, NetworkScenario } from '@/types/game.types';
import { INITIAL_RANKING_FIXTURES } from './fixtures';

const STORAGE_KEY_MATCHES = 'pirate_battle_matches_v1';
const STORAGE_KEY_SCENARIO = 'pirate_battle_network_scenario_v1';

// Load stored matches or initialize
function getStoredMatches(): MatchResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MATCHES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load matches from storage', e);
  }
  return [];
}

function saveStoredMatches(matches: MatchResult[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(matches));
  } catch (e) {
    console.error('Failed to save matches', e);
  }
}

export function getCurrentScenario(): NetworkScenario {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SCENARIO);
    if (saved) return saved as NetworkScenario;
  } catch {}
  return 'DEFAULT';
}

export function setNetworkScenario(scenario: NetworkScenario): void {
  try {
    localStorage.setItem(STORAGE_KEY_SCENARIO, scenario);
  } catch {}
}

export function resetMockData(): void {
  localStorage.removeItem(STORAGE_KEY_MATCHES);
  localStorage.removeItem(STORAGE_KEY_SCENARIO);
}

// Network simulation helper
async function applyNetworkConditions() {
  const scenario = getCurrentScenario();

  switch (scenario) {
    case 'SLOW_NETWORK':
      await delay(1200 + Math.random() * 400);
      break;
    case 'HIGH_LATENCY':
      await delay(2500 + Math.random() * 1000);
      break;
    case 'TIMEOUT':
      await delay(6000); // Exceeds axios timeout (5000ms)
      break;
    case 'DEFAULT':
    default:
      await delay(100 + Math.random() * 100);
      break;
  }

  if (scenario === 'ERROR_500') {
    throw new HttpResponse(JSON.stringify({ error: 'Internal Server Error (Simulated 500)' }), { status: 500 });
  }

  if (scenario === 'OFFLINE') {
    throw HttpResponse.error();
  }
}

export const handlers = [
  // 1. GET /api/ranking
  http.get('/api/ranking', async ({ request }) => {
    await applyNetworkConditions();

    const scenario = getCurrentScenario();
    if (scenario === 'EMPTY_LIST') {
      return HttpResponse.json({
        data: [],
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
      });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '5', 10);

    // Merge fixtures with recorded player matches
    const playerMatches = getStoredMatches();
    const allEntries: RankingEntry[] = [
      ...INITIAL_RANKING_FIXTURES,
      ...playerMatches.map(m => ({
        rank: 0,
        matchId: m.id,
        playerId: m.playerId,
        playerName: m.playerName,
        score: m.score,
        durationSeconds: m.durationSeconds,
        date: m.date,
        config: m.configSnapshot,
      })),
    ];

    // Sort by score desc -> duration desc -> date desc (deterministic tiebreaker)
    allEntries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.durationSeconds !== a.durationSeconds) return b.durationSeconds - a.durationSeconds;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // Assign rank
    allEntries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    const totalItems = allEntries.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = allEntries.slice(startIndex, startIndex + pageSize);

    return HttpResponse.json({
      data: paginatedData,
      page,
      pageSize,
      totalItems,
      totalPages,
    });
  }),

  // 2. GET /api/matches (Player History)
  http.get('/api/matches', async ({ request }) => {
    await applyNetworkConditions();

    const scenario = getCurrentScenario();
    if (scenario === 'EMPTY_LIST') {
      return HttpResponse.json({
        data: [],
        page: 1,
        pageSize: 5,
        totalItems: 0,
        totalPages: 0,
      });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '5', 10);

    const matches = getStoredMatches();
    // Sort newest first
    matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalItems = matches.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = matches.slice(startIndex, startIndex + pageSize);

    return HttpResponse.json({
      data: paginatedData,
      page,
      pageSize,
      totalItems,
      totalPages,
    });
  }),

  // 3. POST /api/matches (Record Match Result)
  http.post('/api/matches', async ({ request }) => {
    await applyNetworkConditions();

    const body = (await request.json()) as MatchResult;
    if (!body || !body.id) {
      return HttpResponse.json({ error: 'Invalid match payload' }, { status: 400 });
    }

    const matches = getStoredMatches();

    // Idempotency check: If match already exists, return existing without duplicating
    const existingIndex = matches.findIndex(m => m.id === body.id);
    if (existingIndex >= 0) {
      return HttpResponse.json(matches[existingIndex], { status: 200 });
    }

    const newMatch: MatchResult = {
      ...body,
      submittedAt: new Date().toISOString(),
      status: 'SUCCESS',
    };

    matches.unshift(newMatch);
    saveStoredMatches(matches);

    return HttpResponse.json(newMatch, { status: 201 });
  }),
];
