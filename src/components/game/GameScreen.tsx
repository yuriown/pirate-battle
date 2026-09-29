import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchRecord } from '@/api/contracts';
import { buildMatchConfig, DEFAULT_GAMEPLAY, type GameplayConfig, type PlayerOptions } from '@/game/config';
import { GameSession, type HudState, type MatchOutcome } from '@/game/GameSession';
import { loadGameTextures, type GameTextures } from '@/game/render/assets';
import { createStore, useStore, type Store } from '@/lib/store';
import { setResultScreenOpen } from '@/lib/lastResult';
import { testFlags, publishTestApi } from '@/lib/testFlags';
import { OptionsDialog } from '../OptionsDialog';
import { ResultPanel } from '../ResultPanel';
import { Dialog } from '../ui/Dialog';
import { Hud } from './Hud';
import { PauseDialog } from './PauseDialog';
import { TouchControls } from './TouchControls';

interface GameScreenProps {
  options: PlayerOptions;
  onSaveOptions: (o: PlayerOptions) => void;
  /** Receives the finished match; returns the record created for it (already persisted/queued). */
  onMatchEnd: (outcome: MatchOutcome) => MatchRecord;
  onExit: () => void;
}

type LoadState = { phase: 'loading'; progress: number } | { phase: 'error'; message: string } | { phase: 'ready'; textures: GameTextures };

const TEST_NO_SPAWN_BASE: GameplayConfig = { ...DEFAULT_GAMEPLAY, spawn: { ...DEFAULT_GAMEPLAY.spawn, maxAlive: 0 } };

const IDLE_HUD: Store<HudState> = createStore<HudState>({
  status: 'running', pauseReason: null, score: 0, timeRemainingSec: 0, health: 0, maxHealth: 0, endReason: null, matchIndex: 0,
});

export function GameScreen({ options, onSaveOptions, onMatchEnd, onExit }: GameScreenProps) {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading', progress: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoad({ phase: 'loading', progress: 0 });
    loadGameTextures((progress) => active && setLoad({ phase: 'loading', progress })).then(
      (textures) => active && setLoad({ phase: 'ready', textures }),
      (err: unknown) => active && setLoad({ phase: 'error', message: err instanceof Error ? err.message : 'Unknown error' }),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  if (load.phase === 'ready') {
    return <Combat textures={load.textures} options={options} onSaveOptions={onSaveOptions} onMatchEnd={onMatchEnd} onExit={onExit} />;
  }

  return (
    <main className="pb-backdrop" aria-labelledby="loading-title">
      <div className="pb-panel w-full max-w-[420px] px-4 py-4 text-center">
        <h1 id="loading-title" className="pb-heading text-2xl">
          {load.phase === 'error' ? 'Could not load the fleet' : 'Preparing the fleet…'}
        </h1>
        {load.phase === 'loading' ? (
          <div className="mt-4">
            <div
              role="progressbar"
              aria-label="Loading game assets"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(load.progress * 100)}
              className="h-4 w-full overflow-hidden rounded-full border-2 border-amber-700 bg-black/50"
            >
              <div className="h-full bg-amber-400 transition-[width]" style={{ width: `${Math.round(load.progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm font-bold">{Math.round(load.progress * 100)}%</p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col items-center gap-3">
            <p role="alert" className="text-sm text-red-200">
              The game assets failed to load ({load.message}). Check your connection and try again.
            </p>
            <button type="button" className="pb-btn w-60" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </button>
            <button type="button" className="pb-btn w-60" onClick={onExit}>
              Main Menu
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

interface CombatProps extends Omit<GameScreenProps, never> {
  textures: GameTextures;
}

function Combat({ textures, options, onSaveOptions, onMatchEnd, onExit }: CombatProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [result, setResult] = useState<MatchRecord | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const portrait = usePortraitTouch();

  // Latest values for the session callbacks without recreating the session.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onMatchEndRef = useRef(onMatchEnd);
  onMatchEndRef.current = onMatchEnd;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const s = new GameSession(textures, {
      getConfig: () => buildMatchConfig(optionsRef.current, testFlags.noSpawns ? TEST_NO_SPAWN_BASE : DEFAULT_GAMEPLAY),
      seed: testFlags.seed,
      manualClock: testFlags.manualClock,
      collectFrameStats: testFlags.enabled,
      onEnd: (outcome) => setResult(onMatchEndRef.current(outcome)),
    });
    let disposed = false;
    s.mount(host).then(
      () => {
        if (disposed) return;
        setSession(s);
        publishTestApi(s.createTestApi());
      },
      (err: unknown) => {
        if (!disposed) setMountError(err instanceof Error ? err.message : 'Unknown error');
      },
    );
    return () => {
      disposed = true;
      publishTestApi(null);
      s.destroy();
      setSession(null);
    };
  }, [textures]);

  const hud = useStore(session?.hud ?? IDLE_HUD);

  // Portrait on a touch device keeps the match paused (also right after a restart).
  useEffect(() => {
    if (portrait && session && hud.status === 'running') session.pause('orientation');
  }, [portrait, session, hud.status]);

  // Esc/P must not resume the match behind the Options dialog or while the device is in portrait.
  useEffect(() => {
    if (session) session.input.pauseKeysLocked = optionsOpen || portrait;
  }, [session, optionsOpen, portrait]);

  const restart = useCallback(() => {
    setResult(null);
    setOptionsOpen(false);
    // A refresh during the new match must not bring back the previous result screen.
    setResultScreenOpen(false);
    session?.restart();
  }, [session]);

  const showPause = hud.status === 'paused' && !optionsOpen;

  return (
    <main className="fixed inset-0 bg-[#0d2233]" aria-label="Combat">
      <h1 className="sr-only">Pirate Battle — combat</h1>
      <div ref={hostRef} className="absolute inset-0 touch-none select-none" />
      {mountError && (
        <Dialog labelledBy="mount-error-title" className="max-w-[420px] px-4 py-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 id="mount-error-title" className="pb-heading text-2xl">
              Could not start the battle
            </h2>
            <p role="alert" className="text-sm text-red-200">
              The game renderer failed to start ({mountError}). Your browser may not support WebGL.
            </p>
            <button type="button" className="pb-btn w-60" onClick={onExit}>
              Main Menu
            </button>
          </div>
        </Dialog>
      )}
      {session && (
        <>
          <Hud hud={hud} onPause={() => session.pause('manual')} />
          <TouchControls input={session.input} disabled={hud.status !== 'running'} />
        </>
      )}
      {session && showPause && hud.pauseReason && (
        <PauseDialog
          reason={hud.pauseReason}
          canResume={!(portrait && hud.pauseReason === 'orientation')}
          onResume={() => session.resume()}
          onRestart={restart}
          onOptions={() => setOptionsOpen(true)}
          onMainMenu={onExit}
        />
      )}
      {optionsOpen && (
        <OptionsDialog options={options} inMatch onSave={onSaveOptions} onClose={() => setOptionsOpen(false)} />
      )}
      {result && hud.status === 'ended' && (
        <Dialog labelledBy="result-title" className="max-w-[440px] px-4 py-4 short:max-w-[560px] short:py-1" testId="result-dialog">
          <ResultPanel record={result} onPlayAgain={restart} onMainMenu={onExit} />
        </Dialog>
      )}
    </main>
  );
}

/** Mobile gameplay is landscape-only; portrait on a touch device pauses the match. */
function usePortraitTouch(): boolean {
  const query = '(orientation: portrait) and (pointer: coarse)';
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return match;
}
