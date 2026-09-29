import type { MatchRecord } from '@/api/contracts';
import { ControlsLegend } from './ControlsLegend';
import { formatClock, icon } from './ui/icons';

interface MainMenuProps {
  onPlay: () => void;
  onOptions: () => void;
  onOpenLog: (tab: 'ranking' | 'history') => void;
  lastResult: MatchRecord | null;
  playerName: string;
}

export function MainMenu({ onPlay, onOptions, onOpenLog, lastResult, playerName }: MainMenuProps) {
  return (
    <main className="pb-backdrop" aria-labelledby="menu-title">
      <div className="pb-panel w-full max-w-[560px] px-3 py-1 text-center">
        <h1 id="menu-title" className="m-0">
          <img src={icon.title} alt="Pirate Battle" className="mx-auto w-full max-w-[300px]" width={384} height={128} />
        </h1>
        <p className="pb-caption mt-1">Set sail. Take command.</p>

        <div className="mx-auto mt-3 flex w-60 flex-col gap-2">
          <button type="button" className="pb-btn" onClick={onPlay}>
            Play
          </button>
          <button type="button" className="pb-btn" onClick={onOptions}>
            Options
          </button>
        </div>

        <p className="mt-3 text-sm text-amber-50/90">
          Sailing as <strong>{playerName}</strong>. Navigate the islands. Survive the battle.
        </p>
        {lastResult && (
          <p className="mt-1 text-xs text-amber-50/70" data-testid="last-result">
            Last battle: {lastResult.score} pts · {formatClock(lastResult.durationMs / 1000)} ·{' '}
            {lastResult.endReason === 'time_up' ? 'time up' : 'defeated'}
          </p>
        )}

        <div className="mt-3 rounded-xl bg-black/25 p-3 text-left">
          <ControlsLegend compact />
        </div>

        <nav aria-label="Captain's log" className="mt-3 flex justify-center gap-3">
          <button type="button" className="pb-btn pb-btn--secondary w-40" onClick={() => onOpenLog('ranking')}>
            Ranking
          </button>
          <button type="button" className="pb-btn pb-btn--secondary w-40" onClick={() => onOpenLog('history')}>
            Match History
          </button>
        </nav>
      </div>
      <img src={icon.logo} alt="Jungle Gaming" className="pointer-events-none fixed bottom-3 right-4 hidden w-28 opacity-90 sm:block" />
    </main>
  );
}
