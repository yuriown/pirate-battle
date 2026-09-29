import { DEFAULT_GAMEPLAY, OPTION_LIMITS, type PlayerOptions } from './config';

const STORAGE_KEY = 'pb.options.v1';

export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionDurationSec: DEFAULT_GAMEPLAY.sessionDurationSec,
  spawnIntervalSec: DEFAULT_GAMEPLAY.spawn.intervalSec,
};

export type OptionErrors = Partial<Record<keyof PlayerOptions, string>>;

export function validateOptions(input: { sessionDurationSec: number; spawnIntervalSec: number }): OptionErrors {
  const errors: OptionErrors = {};
  const d = OPTION_LIMITS.sessionDurationSec;
  const s = OPTION_LIMITS.spawnIntervalSec;
  if (!Number.isFinite(input.sessionDurationSec) || !Number.isInteger(input.sessionDurationSec)) {
    errors.sessionDurationSec = 'Session time must be a whole number of seconds.';
  } else if (input.sessionDurationSec < d.min || input.sessionDurationSec > d.max) {
    errors.sessionDurationSec = `Session time must be between ${d.min} and ${d.max} seconds.`;
  }
  if (!Number.isFinite(input.spawnIntervalSec)) {
    errors.spawnIntervalSec = 'Spawn time must be a number.';
  } else if (input.spawnIntervalSec < s.min || input.spawnIntervalSec > s.max) {
    errors.spawnIntervalSec = `Spawn time must be between ${s.min} and ${s.max} seconds.`;
  } else if (Math.round(input.spawnIntervalSec / s.step) * s.step !== input.spawnIntervalSec) {
    errors.spawnIntervalSec = `Spawn time must be a multiple of ${s.step} seconds.`;
  }
  return errors;
}

export function loadOptions(): PlayerOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const candidate = {
        sessionDurationSec: Number((parsed as Record<string, unknown>).sessionDurationSec),
        spawnIntervalSec: Number((parsed as Record<string, unknown>).spawnIntervalSec),
      };
      if (Object.keys(validateOptions(candidate)).length === 0) return candidate;
    }
  } catch {
    // Corrupted or unavailable storage falls back to defaults.
  }
  return { ...DEFAULT_OPTIONS };
}

export function saveOptions(options: PlayerOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Storage may be unavailable (private mode); options still apply for this session.
  }
}
