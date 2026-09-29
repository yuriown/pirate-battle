import type { MatchRecord } from '@/api/contracts';
import { useMatchSubmissions } from '@/api/useMatchSubmission';
import { formatClock } from './ui/icons';

interface ResultPanelProps {
  record: MatchRecord;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

/** Body of the result dialog (used over the arena and, after a refresh, on its own). */
export function ResultPanel({ record, onPlayAgain, onMainMenu }: ResultPanelProps) {
  const { statusOf, retry, enqueue } = useMatchSubmissions();
  const status = statusOf(record.matchId);
  const destroyed = record.endReason === 'destroyed';

  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="result-panel">
      <h2 id="result-title" className="pb-heading text-3xl">
        {destroyed ? 'Ship Destroyed' : 'Battle Complete'}
      </h2>
      <p className="text-7xl font-extrabold leading-none text-amber-300 [text-shadow:0_3px_0_rgba(0,0,0,0.45)]" data-testid="result-score">
        {record.score}
      </p>
      <p className="pb-caption" data-testid="result-summary">
        {record.score === 1 ? 'Point' : 'Points'} · <span aria-label={`${Math.round(record.durationMs / 1000)} seconds played`}>{formatClock(record.durationMs / 1000)}</span> ·{' '}
        {destroyed ? 'Defeated' : 'Time up'}
      </p>
      <p className="text-xs text-amber-50/70">
        {record.config.sessionDurationSec} s battle · {record.config.spawnIntervalSec} s spawn interval
      </p>

      <div className="min-h-[2.5rem]" role="status" aria-live="polite" data-testid="submission-status" data-status={status}>
        {status === 'saving' && <p className="text-sm font-bold text-sky-200">Recording your match…</p>}
        {status === 'saved' && <p className="text-sm font-bold text-emerald-300">Match recorded in the ranking and history.</p>}
        {(status === 'failed' || status === 'unknown') && (
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-bold text-red-200">
              {status === 'failed' ? 'Could not record the match. It is kept on this device.' : 'Match pending.'}
            </p>
            <button type="button" className="pb-btn pb-btn--secondary" onClick={() => (status === 'failed' ? retry(record.matchId) : enqueue(record))}>
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="flex w-60 flex-col gap-3">
        <button type="button" className="pb-btn" onClick={onPlayAgain}>
          Play Again
        </button>
        <button type="button" className="pb-btn" onClick={onMainMenu}>
          Main Menu
        </button>
      </div>
    </div>
  );
}
