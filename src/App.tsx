import { useCallback, useState } from 'react';
import type { MatchRecord } from '@/api/contracts';
import { enqueueMatch } from '@/api/useMatchSubmission';
import { sound } from '@/game/audio/SoundManager';
import type { PlayerOptions } from '@/game/config';
import type { MatchOutcome } from '@/game/GameSession';
import { loadOptions, saveOptions } from '@/game/options';
import { loadLastResult, resultScreenWasOpen, saveLastResult, setResultScreenOpen } from '@/lib/lastResult';
import { generateId } from '@/net/uuid';
import { getPlayer, usePlayer } from '@/player/identity';
import { CaptainsLog, type LogTab } from './components/CaptainsLog';
import { NetworkDevPanel } from './components/dev/NetworkDevPanel';
import { GameScreen } from './components/game/GameScreen';
import { MainMenu } from './components/MainMenu';
import { OptionsDialog } from './components/OptionsDialog';
import { ResultPanel } from './components/ResultPanel';
import { Dialog } from './components/ui/Dialog';

type Screen = { name: 'menu' } | { name: 'log'; tab: LogTab } | { name: 'game'; key: number } | { name: 'result' };

export default function App() {
  const player = usePlayer();
  const [options, setOptions] = useState<PlayerOptions>(loadOptions);
  const [lastResult, setLastResult] = useState<MatchRecord | null>(loadLastResult);
  const [screen, setScreen] = useState<Screen>(() => (resultScreenWasOpen() && loadLastResult() ? { name: 'result' } : { name: 'menu' }));
  const [optionsOpen, setOptionsOpen] = useState(false);

  const updateOptions = useCallback((next: PlayerOptions) => {
    saveOptions(next);
    setOptions(next);
  }, []);

  const play = () => {
    sound.unlock();
    setResultScreenOpen(false);
    setScreen({ name: 'game', key: Date.now() });
  };

  const toMenu = () => {
    setResultScreenOpen(false);
    setScreen({ name: 'menu' });
  };

  /** A completed match: persist locally first, then queue its (idempotent) registration. */
  const handleMatchEnd = useCallback((outcome: MatchOutcome): MatchRecord => {
    const p = getPlayer();
    const record: MatchRecord = {
      matchId: generateId(),
      playerId: p.playerId,
      playerName: p.playerName,
      playedAt: new Date().toISOString(),
      score: outcome.score,
      durationMs: outcome.durationMs,
      endReason: outcome.endReason,
      config: { sessionDurationSec: outcome.config.sessionDurationSec, spawnIntervalSec: outcome.config.spawn.intervalSec },
    };
    saveLastResult(record);
    setLastResult(record);
    enqueueMatch(record);
    return record;
  }, []);

  return (
    <>
      {screen.name === 'menu' && (
        <>
          <MainMenu
            onPlay={play}
            onOptions={() => setOptionsOpen(true)}
            onOpenLog={(tab) => setScreen({ name: 'log', tab })}
            lastResult={lastResult}
            playerName={player.playerName}
          />
          <NetworkDevPanel />
        </>
      )}
      {screen.name === 'log' && (
        <>
          <CaptainsLog
            tab={screen.tab}
            onTabChange={(tab) => setScreen({ name: 'log', tab })}
            config={options}
            playerId={player.playerId}
            playerName={player.playerName}
            onBack={toMenu}
          />
          <NetworkDevPanel />
        </>
      )}
      {screen.name === 'game' && (
        <GameScreen key={screen.key} options={options} onSaveOptions={updateOptions} onMatchEnd={handleMatchEnd} onExit={toMenu} />
      )}
      {screen.name === 'result' && lastResult && (
        <Dialog labelledBy="result-title" className="max-w-[440px] px-4 py-4 short:max-w-[560px] short:py-1" testId="result-dialog">
          <ResultPanel record={lastResult} onPlayAgain={play} onMainMenu={toMenu} />
        </Dialog>
      )}
      {optionsOpen && <OptionsDialog options={options} onSave={updateOptions} onClose={() => setOptionsOpen(false)} />}
    </>
  );
}
