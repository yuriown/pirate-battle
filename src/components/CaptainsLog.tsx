import { useEffect, useRef } from 'react';
import type { MatchConfig } from '@/api/contracts';
import { MatchHistoryTab } from './menu/MatchHistoryTab';
import { RankingTab } from './menu/RankingTab';

export type LogTab = 'ranking' | 'history';

interface CaptainsLogProps {
  tab: LogTab;
  onTabChange: (tab: LogTab) => void;
  config: MatchConfig;
  playerId: string;
  playerName: string;
  onBack: () => void;
}

const TABS: { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

/** Ranking / Match History tabs (WAI-ARIA tabs pattern). Only the active panel is mounted, so
 * showing a tab again remounts it and triggers a background refetch. */
export function CaptainsLog({ tab, onTabChange, config, playerId, playerName, onBack }: CaptainsLogProps) {
  const tabRefs = useRef<Record<LogTab, HTMLButtonElement | null>>({ ranking: null, history: null });
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to the new screen so keyboard and screen-reader users are not left on <body>.
  useEffect(() => headingRef.current?.focus(), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (idx + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    onTabChange(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  return (
    <main className="pb-backdrop" aria-labelledby="log-title">
      <div className="pb-panel flex w-full max-w-[900px] flex-col px-2 py-1 sm:px-4">
        <h1 id="log-title" ref={headingRef} tabIndex={-1} className="pb-heading pb-focus-target text-3xl sm:text-4xl short:text-2xl">
          Captain&apos;s Log
        </h1>
        <div role="tablist" aria-label="Captain's log" className="mt-3 flex justify-center gap-3" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={tab === t.id ? `panel-${t.id}` : undefined}
              tabIndex={tab === t.id ? 0 : -1}
              className="pb-btn pb-btn--secondary w-40 sm:w-48"
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-3 shrink-0">
          {tab === 'ranking' ? <RankingTab config={config} playerId={playerId} /> : <MatchHistoryTab playerId={playerId} playerName={playerName} />}
        </div>
        <div className="mt-2 flex justify-center">
          <button type="button" className="pb-btn w-60" onClick={onBack}>
            Main Menu
          </button>
        </div>
      </div>
    </main>
  );
}
