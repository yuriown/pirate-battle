// Scenario registry and the persisted control state that drives the MSW handlers.
import { DEFAULT_TIMEOUT_MS } from '@/api/client';
import { isRecord, readJson, removeKey, writeJson } from '@/net/storage';

export const CONTROL_KEY = 'pb.mock.control.v1';

export const SCENARIOS = [
  { id: 'normal', label: 'Normal', description: 'Everything works with realistic latency (150-450 ms).' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history return no rows. Registering still works.' },
  { id: 'many-pages', label: 'Many pages', description: 'About 120 ranking entries for every configuration.' },
  { id: 'slow', label: 'Slow network', description: 'Every request takes 2.5 s.' },
  { id: 'jitter', label: 'Variable latency', description: 'Seeded latency between 100 ms and 3 s per request.' },
  {
    id: 'out-of-order',
    label: 'Out-of-order responses',
    description: 'Reads alternate between slow and fast, so older responses arrive after newer ones.',
  },
  { id: 'timeout', label: 'Timeout', description: 'Every request hangs past the client timeout.' },
  { id: 'network-error', label: 'Connection failure', description: 'Every request fails at the network level.' },
  { id: 'http-400', label: 'HTTP 400', description: 'Every request is rejected as a bad request (not retried).' },
  { id: 'http-500', label: 'HTTP 500', description: 'Every request fails with an internal server error.' },
  { id: 'ranking-fails', label: 'Ranking fails', description: 'Ranking returns 500; history and registration work.' },
  { id: 'history-fails', label: 'History fails', description: 'History returns 503; ranking and registration work.' },
  {
    id: 'post-timeout-after-commit',
    label: 'Timeout after saving',
    description: 'The server saves the match but answers after the client timeout. Retries recover it without a duplicate.',
  },
  {
    id: 'unavailable',
    label: 'Server unavailable',
    description: 'Every endpoint returns 503. Switch back to Normal to recover and send pending matches.',
  },
  { id: 'flaky-post', label: 'Flaky registration', description: 'The first two attempts to register each match fail with 503.' },
] as const satisfies readonly { id: string; label: string; description: string }[];

export type ScenarioId = (typeof SCENARIOS)[number]['id'];
export type LatencyMode = 'realistic' | 'instant';

export interface MockControl {
  scenario: ScenarioId;
  seed: number;
  latencyMode: LatencyMode;
  clientTimeoutMs: number;
}

export const DEFAULT_CONTROL: MockControl = {
  scenario: 'normal',
  seed: 1,
  latencyMode: 'realistic',
  clientTimeoutMs: DEFAULT_TIMEOUT_MS,
};

export function isScenarioId(value: unknown): value is ScenarioId {
  return SCENARIOS.some((s) => s.id === value);
}

const isSeed = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffffff;
const isTimeout = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 100 && (v as number) <= 120_000;

function sanitize(value: unknown, base: MockControl): MockControl {
  if (!isRecord(value)) return base;
  return {
    scenario: isScenarioId(value.scenario) ? value.scenario : base.scenario,
    seed: isSeed(value.seed) ? value.seed : base.seed,
    latencyMode: value.latencyMode === 'instant' || value.latencyMode === 'realistic' ? value.latencyMode : base.latencyMode,
    clientTimeoutMs: isTimeout(value.clientTimeoutMs) ? value.clientTimeoutMs : base.clientTimeoutMs,
  };
}

let control: MockControl = sanitize(readJson(CONTROL_KEY), DEFAULT_CONTROL);
const listeners = new Set<(control: MockControl) => void>();

export function getControl(): MockControl {
  return control;
}

/** Invalid fields in the patch are ignored rather than applied. */
export function setControl(patch: Partial<MockControl>): MockControl {
  control = sanitize({ ...control, ...patch }, control);
  writeJson(CONTROL_KEY, control);
  listeners.forEach((listener) => listener(control));
  return control;
}

export function resetControl(): MockControl {
  removeKey(CONTROL_KEY);
  control = DEFAULT_CONTROL;
  listeners.forEach((listener) => listener(control));
  return control;
}

export function subscribeControl(listener: (control: MockControl) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reads `?scenario=<id>&seed=<n>&latency=instant|realistic&timeout=<ms>` once at startup. */
export function applyUrlOverrides(search: string): void {
  const params = new URLSearchParams(search);
  const patch: Record<string, unknown> = {};
  if (params.has('scenario')) patch.scenario = params.get('scenario');
  if (params.has('seed')) patch.seed = Number(params.get('seed'));
  if (params.has('latency')) patch.latencyMode = params.get('latency');
  if (params.has('timeout')) patch.clientTimeoutMs = Number(params.get('timeout'));
  if (Object.keys(patch).length > 0) setControl(sanitize(patch, control));
}
