import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Skull, RotateCcw, Home, AlertCircle, CheckCircle2 } from 'lucide-react';
import { EndReason } from '@/types/game.types';

interface GameOverModalProps {
  score: number;
  durationSeconds: number;
  reason: EndReason;
  submissionStatus: 'IDLE' | 'PENDING' | 'SUCCESS' | 'ERROR';
  onPlayAgain: () => void;
  onMainMenu: () => void;
  onRetrySubmit: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  durationSeconds,
  reason,
  submissionStatus,
  onPlayAgain,
  onMainMenu,
  onRetrySubmit,
}) => {
  const isVictory = reason === 'TIME_EXPIRED' && score > 0;

  useEffect(() => {
    if (isVictory) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isVictory]);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="wood-panel gold-border w-full max-w-md rounded-2xl p-6 sm:p-8 text-center space-y-6 shadow-2xl animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-full bg-slate-900 border-2 border-amber-400 flex items-center justify-center shadow-lg">
          {reason === 'SHIP_DESTROYED' ? (
            <Skull className="w-8 h-8 text-red-400" />
          ) : (
            <Trophy className="w-8 h-8 text-amber-400" />
          )}
        </div>

        <div>
          <h2 className="font-pirate text-3xl sm:text-4xl font-black gold-gradient-text tracking-wider">
            {reason === 'SHIP_DESTROYED' ? 'SHIP SUNK!' : 'BATTLE COMPLETED!'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {reason === 'SHIP_DESTROYED'
              ? 'Your galleon took critical damage and sank into Davy Jones locker.'
              : 'You survived the waves of pirate raiders with flying colors!'}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Score</span>
            <span className="font-pirate font-black text-2xl text-amber-300">{score} pts</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Combat Time</span>
            <span className="font-mono font-bold text-xl text-slate-200">{durationSeconds}s</span>
          </div>
        </div>

        {/* Match Submission Status */}
        <div className="text-xs flex items-center justify-center gap-2">
          {submissionStatus === 'PENDING' && (
            <span className="text-sky-400 flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              Recording match to server ranking...
            </span>
          )}
          {submissionStatus === 'SUCCESS' && (
            <span className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Match verified on Leaderboard!
            </span>
          )}
          {submissionStatus === 'ERROR' && (
            <div className="flex items-center gap-2">
              <span className="text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> Network failed (Saved offline)
              </span>
              <button
                onClick={onRetrySubmit}
                className="text-[11px] bg-red-900/80 hover:bg-red-800 text-white px-2 py-0.5 rounded font-semibold transition"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <button
            onClick={onPlayAgain}
            className="w-full btn-pirate-gold py-3 px-5 rounded-xl font-pirate text-base font-bold flex items-center justify-center gap-2 shadow-lg"
          >
            <RotateCcw className="w-5 h-5" />
            <span>PLAY AGAIN</span>
          </button>

          <button
            onClick={onMainMenu}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
