// Deterministic "other players" for the ranking. Same seed in, same rows out: no Date.now, no Math.random.
import type { MatchConfig, MatchRecord } from '@/api/contracts';
import { mulberry32 } from './rng';

export const DEFAULT_MATCH_CONFIG: MatchConfig = { sessionDurationSec: 90, spawnIntervalSec: 3 };

const CAPTAINS = [
  'Captain Flint', 'Red Sparrow', 'Storm Rider', 'Sea Wolf', 'Iron Anne', 'Black Mary', 'Salty Pete',
  'One-Eyed Jack', 'Grace Tide', 'Long Silver', 'Mad Morgan', 'Coral Kate', 'Rum Runner', 'Silent Finn',
  'Blue Beard', 'Ghost Galleon', 'Lady Kraken', 'Old Barnacle', 'Swift Nell', 'Captain Hook',
];

/** Fixed origin for fixture dates so screenshots and tests never drift with the clock. */
const EPOCH_MS = Date.UTC(2025, 5, 1, 12, 0, 0);
const DAY_MS = 86_400_000;

const STANDARD_SETS: readonly { config: MatchConfig; count: number }[] = [
  { config: DEFAULT_MATCH_CONFIG, count: 18 },
  { config: { sessionDurationSec: 120, spawnIntervalSec: 3 }, count: 10 },
  { config: { sessionDurationSec: 60, spawnIntervalSec: 2 }, count: 9 },
  { config: { sessionDurationSec: 180, spawnIntervalSec: 5 }, count: 7 },
];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function generateSet(config: MatchConfig, count: number, seed: number): MatchRecord[] {
  const rnd = mulberry32(seed);
  const sessionMs = config.sessionDurationSec * 1000;
  const records: MatchRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = CAPTAINS[i % CAPTAINS.length];
    const survived = rnd() < 0.55;
    const durationMs = survived ? sessionMs : Math.round(sessionMs * (0.25 + rnd() * 0.7));
    const pace = 3 + rnd() * 5; // points per active second
    records.push({
      matchId: `fx-${config.sessionDurationSec}-${config.spawnIntervalSec}-${String(i + 1).padStart(3, '0')}`,
      playerId: `fixture-${slug(name)}`,
      playerName: name,
      playedAt: new Date(EPOCH_MS + Math.floor(rnd() * 90 * DAY_MS)).toISOString(),
      score: Math.round((durationMs / 1000) * pace / 10) * 10,
      durationMs,
      endReason: survived ? 'time_up' : 'destroyed',
      config: { ...config },
    });
  }
  // Deliberate ties so every tie-break level is exercised: same score (duration decides),
  // same score and duration (date decides), and fully identical except matchId (id decides).
  if (records.length >= 6) {
    const [a, b, c, d, e, f] = records;
    b.score = a.score;
    b.durationMs = Math.max(0, a.durationMs - 5_000);
    b.endReason = 'destroyed';
    d.score = c.score;
    d.durationMs = c.durationMs;
    d.endReason = c.endReason;
    f.score = e.score;
    f.durationMs = e.durationMs;
    f.endReason = e.endReason;
    f.playedAt = e.playedAt;
  }
  return records;
}

let standardCache: MatchRecord[] | undefined;
let manyCache: MatchRecord[] | undefined;

export function standardFixtures(): MatchRecord[] {
  standardCache ??= STANDARD_SETS.flatMap(({ config, count }, i) => generateSet(config, count, 1000 + i));
  return standardCache;
}

export function manyPagesFixtures(): MatchRecord[] {
  manyCache ??= STANDARD_SETS.flatMap(({ config }, i) => generateSet(config, 120, 2000 + i));
  return manyCache;
}
