import { useState, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameScreen, GameConfig, GameSnapshot, EndReason, MatchResult, NetworkScenario } from '@/types/game.types';
import { loadSavedConfig } from '@/game/config';
import { PirateEngine } from '@/game/PirateEngine';
import { useSubmitMatch } from '@/hooks/useGameQueries';
import { getCurrentScenario } from '@/mocks/handlers';

import { Navbar } from '@/components/Navbar';
import { MainMenu } from '@/components/MainMenu';
import { OptionsModal } from '@/components/OptionsModal';
import { GameCanvas } from '@/components/GameCanvas';
import { GameHUD } from '@/components/GameHUD';
import { PauseOverlay } from '@/components/PauseOverlay';
import { GameOverModal } from '@/components/GameOverModal';
import { NetworkDevPanel } from '@/components/NetworkDevPanel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function PirateBattleApp() {
  const [screen, setScreen] = useState<GameScreen>('MENU');
  const [config, setConfig] = useState<GameConfig>(loadSavedConfig());
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [networkScenario, setNetworkScenario] = useState<NetworkScenario>(getCurrentScenario());

  // Game Engine & Snapshot
  const engineRef = useRef<PirateEngine | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    score: 0,
    timeRemaining: config.sessionDuration,
    sessionDuration: config.sessionDuration,
    playerHealth: config.playerMaxHealth,
    playerMaxHealth: config.playerMaxHealth,
    isPaused: false,
    isGameOver: false,
    endReason: null,
    chaserCount: 0,
    shooterCount: 0,
  });

  // End of game record
  const [lastMatch, setLastMatch] = useState<MatchResult | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<'IDLE' | 'PENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const submitMutation = useSubmitMatch();

  const handleStartGame = () => {
    setScreen('PLAYING');
    setSubmissionStatus('IDLE');
  };

  const handleGameOver = (score: number, durationSeconds: number, reason: EndReason) => {
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const result: MatchResult = {
      id: matchId,
      playerId: 'local_player',
      playerName: 'Captain Yuri',
      score,
      durationSeconds,
      date: new Date().toISOString(),
      endReason: reason,
      configSnapshot: {
        sessionDuration: config.sessionDuration,
        enemySpawnInterval: config.enemySpawnInterval,
      },
    };

    setLastMatch(result);
    setScreen('GAME_OVER');

    // Auto submit to Ranking and Match History API
    setSubmissionStatus('PENDING');
    submitMutation.mutate(result, {
      onSuccess: () => setSubmissionStatus('SUCCESS'),
      onError: () => setSubmissionStatus('ERROR'),
    });
  };

  const handleRetrySubmit = () => {
    if (!lastMatch) return;
    setSubmissionStatus('PENDING');
    submitMutation.mutate(lastMatch, {
      onSuccess: () => setSubmissionStatus('SUCCESS'),
      onError: () => setSubmissionStatus('ERROR'),
    });
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-ocean-900 text-slate-100 overflow-hidden font-sans select-none">
      <Navbar
        onOpenDevPanel={() => setIsDevPanelOpen(true)}
        networkScenario={networkScenario}
      />

      <main className="flex-1 relative flex overflow-hidden">
        {screen === 'MENU' && (
          <MainMenu
            onStartGame={handleStartGame}
            onOpenOptions={() => setIsOptionsOpen(true)}
          />
        )}

        {screen === 'PLAYING' && (
          <div className="relative w-full h-full">
            <GameCanvas
              config={config}
              onSnapshotUpdate={setSnapshot}
              onGameOver={handleGameOver}
              engineRef={engineRef}
            />
            <GameHUD
              snapshot={snapshot}
              onPause={() => engineRef.current?.setPaused(true)}
              engine={engineRef.current}
            />
            {snapshot.isPaused && (
              <PauseOverlay
                onResume={() => engineRef.current?.setPaused(false)}
                onRestart={() => engineRef.current?.resetGame()}
                onSurrender={() => {
                  engineRef.current?.destroy();
                  setScreen('MENU');
                }}
              />
            )}
          </div>
        )}

        {screen === 'GAME_OVER' && lastMatch && (
          <GameOverModal
            score={lastMatch.score}
            durationSeconds={lastMatch.durationSeconds}
            reason={lastMatch.endReason}
            submissionStatus={submissionStatus}
            onPlayAgain={handleStartGame}
            onMainMenu={() => setScreen('MENU')}
            onRetrySubmit={handleRetrySubmit}
          />
        )}
      </main>

      {/* Options Modal */}
      {isOptionsOpen && (
        <OptionsModal
          config={config}
          onClose={() => setIsOptionsOpen(false)}
          onSave={(newCfg) => setConfig(newCfg)}
        />
      )}

      {/* Network Dev Panel */}
      <NetworkDevPanel
        isOpen={isDevPanelOpen}
        onClose={() => setIsDevPanelOpen(false)}
        onScenarioChange={(sc) => setNetworkScenario(sc)}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PirateBattleApp />
    </QueryClientProvider>
  );
}
