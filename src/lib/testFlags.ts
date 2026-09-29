import type { GameTestApi } from '@/game/GameSession';

// Test instrumentation is opt-in through the URL (`?e2e`), so it never changes normal play.
// `?seed=N` fixes the simulation RNG, `?clock=manual` hands the clock to the test runner and
// `?spawns=off` disables automatic spawning so a test can arrange enemies itself.
const params = new URLSearchParams(globalThis.location?.search ?? '');

export const testFlags = {
  enabled: params.has('e2e'),
  seed: params.has('e2e') && params.has('seed') ? Number(params.get('seed')) >>> 0 : undefined,
  manualClock: params.has('e2e') && params.get('clock') === 'manual',
  noSpawns: params.has('e2e') && params.get('spawns') === 'off',
};

declare global {
  interface Window {
    __PB__?: { game: GameTestApi | null };
  }
}

export function publishTestApi(api: GameTestApi | null): void {
  if (!testFlags.enabled) return;
  window.__PB__ = { game: api };
}
