import { useId, useState } from 'react';
import { OPTION_LIMITS, type PlayerOptions } from '@/game/config';
import { validateOptions, type OptionErrors } from '@/game/options';
import { sound } from '@/game/audio/SoundManager';
import { getPlayer, setPlayerName, validatePlayerName } from '@/player/identity';
import { Dialog } from './ui/Dialog';
import { icon } from './ui/icons';

interface OptionsDialogProps {
  options: PlayerOptions;
  onSave: (options: PlayerOptions) => void;
  onClose: () => void;
  /** Shown when opened from the pause menu: changes apply to the next match only. */
  inMatch?: boolean;
}

export function OptionsDialog({ options, onSave, onClose, inMatch = false }: OptionsDialogProps) {
  const [duration, setDuration] = useState(String(options.sessionDurationSec));
  const [spawn, setSpawn] = useState(String(options.spawnIntervalSec));
  const [muted, setMuted] = useState(sound.muted);
  const [name, setName] = useState(getPlayer().playerName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [errors, setErrors] = useState<OptionErrors>({});
  const nameId = useId();
  const [saved, setSaved] = useState(false);

  const parsed = { sessionDurationSec: Number(duration), spawnIntervalSec: Number(spawn) };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateOptions(parsed);
    const badName = validatePlayerName(name);
    setErrors(next);
    setNameError(badName);
    setSaved(false);
    if (Object.keys(next).length > 0 || badName) return;
    onSave(parsed);
    setPlayerName(name);
    sound.setMuted(muted);
    setSaved(true);
  };

  const d = OPTION_LIMITS.sessionDurationSec;
  const s = OPTION_LIMITS.spawnIntervalSec;
  const bump = (value: string, step: number, min: number, max: number) => {
    const n = Number(value);
    const base = Number.isFinite(n) ? n : min;
    return String(Math.min(max, Math.max(min, Math.round((base + step) / Math.abs(step)) * Math.abs(step))));
  };

  return (
    <Dialog labelledBy="options-title" onEscape={onClose} className="max-w-[440px] px-4 py-3 short:max-w-[760px] short:py-1" testId="options-dialog">
      {/* Two columns on short screens (phones in landscape) so the whole form fits without scrolling. */}
      <form onSubmit={save} noValidate className="flex flex-col items-center gap-4 text-center short:grid short:grid-cols-2 short:items-start short:gap-x-6 short:gap-y-1">
        <h2 id="options-title" className="pb-heading text-3xl short:col-span-2 short:text-xl">
          Options
        </h2>
        {inMatch && <p className="text-xs text-amber-50/80 short:col-span-2">Changes apply to the next match.</p>}

        <div className="flex flex-col items-center gap-4 short:gap-1.5">
        <Stepper
          label="Game session time"
          unit="s"
          value={duration}
          onChange={(v) => { setDuration(v); setSaved(false); }}
          onMinus={() => { setDuration(bump(duration, -d.step, d.min, d.max)); setSaved(false); }}
          onPlus={() => { setDuration(bump(duration, d.step, d.min, d.max)); setSaved(false); }}
          hint={`${d.min}–${d.max} seconds of active play`}
          error={errors.sessionDurationSec}
          min={d.min}
          max={d.max}
          step={d.step}
        />
        <Stepper
          label="Enemy spawn time"
          unit="s"
          value={spawn}
          onChange={(v) => { setSpawn(v); setSaved(false); }}
          onMinus={() => { setSpawn(bump(spawn, -s.step, s.min, s.max)); setSaved(false); }}
          onPlus={() => { setSpawn(bump(spawn, s.step, s.min, s.max)); setSaved(false); }}
          hint={`${s.min}–${s.max} seconds between spawns, in ${s.step} s steps`}
          error={errors.spawnIntervalSec}
          min={s.min}
          max={s.max}
          step={s.step}
        />
        </div>

        <div className="flex flex-col items-center gap-4 short:gap-1.5">
        <div className="flex flex-col items-center gap-1">
          <label htmlFor={nameId} className="text-sm font-bold">
            Captain name
          </label>
          <input
            id={nameId}
            className="pb-input w-48"
            type="text"
            maxLength={16}
            autoComplete="nickname"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={`${nameId}-hint${nameError ? ` ${nameId}-error` : ''}`}
          />
          <p id={`${nameId}-hint`} className="text-xs text-amber-50/70 short:sr-only">
            Shown in the ranking (2–16 characters)
          </p>
          {nameError && (
            <p id={`${nameId}-error`} role="alert" className="text-xs font-bold text-red-300">
              {nameError}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={muted} onChange={(e) => { setMuted(e.target.checked); setSaved(false); }} className="h-5 w-5 accent-amber-400" />
          Mute sound
        </label>

        <p role="status" className="min-h-[1.25rem] text-sm font-bold text-emerald-300 short:min-h-0">
          {saved ? 'Options saved.' : ''}
        </p>

        <div className="flex w-full flex-col items-center gap-3 short:flex-row short:justify-center short:gap-2">
          <button type="submit" className="pb-btn w-60 short:w-36">
            Save
          </button>
          <button type="button" className="pb-btn w-60 short:w-36" onClick={onClose}>
            {inMatch ? 'Back' : 'Main Menu'}
          </button>
        </div>
        </div>
      </form>
    </Dialog>
  );
}

interface StepperProps {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  hint: string;
  error?: string;
  min: number;
  max: number;
  step: number;
}

function Stepper({ label, unit, value, onChange, onMinus, onPlus, hint, error, min, max, step }: StepperProps) {
  const id = useId();
  return (
    <div className="flex flex-col items-center gap-2 short:gap-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="flex items-center gap-4">
        <button type="button" className="pb-round-btn" onClick={onMinus} aria-label={`Decrease ${label.toLowerCase()}`}>
          <img src={icon.minus} alt="" />
        </button>
        <span className="flex items-center gap-1">
          <input
            id={id}
            className="pb-input"
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          />
          <span aria-hidden="true" className="font-extrabold">{unit}</span>
        </span>
        <button type="button" className="pb-round-btn" onClick={onPlus} aria-label={`Increase ${label.toLowerCase()}`}>
          <img src={icon.plus} alt="" />
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-amber-50/70 short:sr-only">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-bold text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
