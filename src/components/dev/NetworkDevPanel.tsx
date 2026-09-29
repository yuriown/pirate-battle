import { useId, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateMatchQueries } from '@/api/queries';
import { useMatchSubmissions } from '@/api/useMatchSubmission';
import { clearLastResult } from '@/lib/lastResult';
import { resetMockState } from '@/mocks/control';
import { getControl, isScenarioId, SCENARIOS, setControl, subscribeControl, type MockControl } from '@/mocks/scenarios';

interface NumberFieldProps {
  value: number;
  min: number;
  step: number;
  onCommit: (value: number) => void;
}

/** Commits on blur or Enter, so intermediate keystrokes (e.g. "1" on the way to "1500") are not applied. */
function NumberField({ value, min, step, onCommit }: NumberFieldProps) {
  const commit = (raw: string) => {
    const next = Number(raw);
    if (raw.trim() !== '' && Number.isInteger(next) && next !== value) onCommit(next);
  };
  return (
    <input
      key={value}
      type="number"
      min={min}
      step={step}
      className="w-24 text-black"
      defaultValue={value}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
      }}
    />
  );
}

export function NetworkDevPanel() {
  const [open, setOpen] = useState(false);
  const control = useSyncExternalStore(subscribeControl, getControl, getControl);
  const queryClient = useQueryClient();
  const { pending, retryAll } = useMatchSubmissions();
  const id = useId();
  const active = SCENARIOS.find((s) => s.id === control.scenario) ?? SCENARIOS[0];

  const apply = (patch: Partial<MockControl>) => {
    setControl(patch);
    void invalidateMatchQueries(queryClient);
  };

  // Back to the initial state: mock DB, pending submissions, scenario and the local last result.
  // A reload guarantees every in-memory copy (queries, menu summary) starts clean too.
  const reset = () => {
    resetMockState();
    clearLastResult();
    queryClient.clear();
    window.location.reload();
  };

  return (
    <div className="fixed bottom-3 left-3 z-40 max-w-xs text-xs text-amber-50">
      <button
        type="button"
        className="pb-btn pb-btn--secondary"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
      >
        Network: {active.label}
        {pending.length > 0 && ` · ${pending.length} pending`}
      </button>

      {open && (
        <div
          id={`${id}-panel`}
          role="region"
          aria-label="Network scenarios"
          className="mt-2 flex flex-col gap-2 rounded bg-black/80 p-3"
        >
          <label className="flex flex-col gap-1">
            Scenario
            <select
              className="text-black"
              value={control.scenario}
              aria-describedby={`${id}-desc`}
              onChange={(e) => {
                if (isScenarioId(e.target.value)) apply({ scenario: e.target.value });
              }}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <p id={`${id}-desc`} className="opacity-80">
            {active.description}
          </p>

          <label className="flex items-center justify-between gap-2">
            Seed
            <NumberField value={control.seed} min={0} step={1} onCommit={(seed) => apply({ seed })} />
          </label>

          <label className="flex items-center justify-between gap-2">
            Instant latency
            <input
              type="checkbox"
              checked={control.latencyMode === 'instant'}
              onChange={(e) => apply({ latencyMode: e.target.checked ? 'instant' : 'realistic' })}
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            Client timeout (ms)
            <NumberField
              value={control.clientTimeoutMs}
              min={100}
              step={100}
              onCommit={(clientTimeoutMs) => apply({ clientTimeoutMs })}
            />
          </label>

          <p aria-live="polite">Pending submissions: {pending.length}</p>

          <div className="flex gap-2">
            <button type="button" className="pb-btn pb-btn--secondary" onClick={retryAll} disabled={pending.length === 0}>
              Retry pending
            </button>
            <button type="button" className="pb-btn pb-btn--secondary" onClick={reset}>
              Reset mock data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
