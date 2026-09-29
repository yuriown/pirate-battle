import { useEffect, useRef } from 'react';
import type { MatchRecord } from '@/api/contracts';
import { ControlsLegend } from './ControlsLegend';
import { formatDuration, formatEndReason } from './menu/format';
import { icon } from './ui/icons';

interface MainMenuProps {
  onPlay: () => void;
  onOptions: () => void;
  onOpenLog: (tab: 'ranking' | 'history') => void;
  lastResult: MatchRecord | null;
  playerName: string;
}

export function MainMenu({ onPlay, onOptions, onOpenLog, lastResult, playerName }: MainMenuProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Returning from another screen puts focus back at the top of the menu, not on <body>.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <main className="pb-backdrop" aria-labelledby="menu-title">
      {/* Short screens (phones in landscape) get two columns so nothing needs scrolling. */}
      <div className="pb-panel w-full max-w-[560px] px-3 py-1 text-center short:grid short:max-w-[800px] short:grid-cols-2 short:items-center short:gap-4">
        <div>
          <h1 id="menu-title" ref={headingRef} tabIndex={-1} className="pb-focus-target m-0">
            <img src={icon.title} alt="Pirate Battle" className="mx-auto w-full max-w-[300px] short:max-w-[200px]" width={384} height={128} />
          </h1>
          <p className="pb-caption mt-1">Set sail. Take command.</p>

          <div className="mx-auto mt-3 flex w-60 flex-col gap-2 short:mt-2">
            <button type="button" className="pb-btn" onClick={onPlay}>
              Play
            </button>
            <button type="button" className="pb-btn" onClick={onOptions}>
              Options
            </button>
          </div>
        </div>

        <div>
          <p className="mt-3 text-sm text-amber-50/90 short:hidden">
            Sailing as <strong>{playerName}</strong>. Navigate the islands. Survive the battle.
          </p>
          {lastResult && (
            <p className="mt-1 text-xs text-amber-50/70" data-testid="last-result">
              Last battle: {lastResult.score} pts · {formatDuration(lastResult.durationMs)} · {formatEndReason(lastResult.endReason)}
            </p>
          )}

          <div className="mt-3 rounded-xl bg-black/25 p-3 text-left short:mt-2 short:p-2">
            <ControlsLegend />
          </div>

          <nav aria-label="Captain's log" className="mt-3 flex justify-center gap-3 short:mt-2">
            <button type="button" className="pb-btn pb-btn--secondary w-44" onClick={() => onOpenLog('ranking')}>
              Ranking
            </button>
            <button type="button" className="pb-btn pb-btn--secondary w-44" onClick={() => onOpenLog('history')}>
              Match History
            </button>
          </nav>
        </div>
      </div>
      <img src={icon.logo} alt="Jungle Gaming" className="pointer-events-none fixed bottom-3 right-4 hidden w-28 opacity-90 sm:block short:hidden" />
    </main>
  );
}
