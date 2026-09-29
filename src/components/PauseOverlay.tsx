import React from 'react';
import { Play, RotateCcw, Home } from 'lucide-react';

interface PauseOverlayProps {
  onResume: () => void;
  onRestart: () => void;
  onSurrender: () => void;
}

export const PauseOverlay: React.FC<PauseOverlayProps> = ({
  onResume,
  onRestart,
  onSurrender,
}) => {
  return (
    <div className="absolute inset-0 bg-black/75 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div className="wood-panel gold-border w-full max-w-sm rounded-2xl p-6 text-center space-y-6 shadow-2xl">
        <h2 className="font-pirate text-3xl font-black gold-gradient-text tracking-wider">
          BATTLE PAUSED
        </h2>
        <p className="text-xs text-slate-300">
          Cannons cooled and sea paused. Resume command when ready!
        </p>

        <div className="space-y-3">
          <button
            onClick={onResume}
            className="w-full btn-pirate-gold py-3 px-5 rounded-xl font-pirate text-base font-bold flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>RESUME BATTLE</span>
          </button>

          <button
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restart Match</span>
          </button>

          <button
            onClick={onSurrender}
            className="w-full py-2.5 px-4 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-800/60 text-red-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
          >
            <Home className="w-4 h-4" />
            <span>Abandon & Return to Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
