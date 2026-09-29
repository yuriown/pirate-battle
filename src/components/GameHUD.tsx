import React from 'react';
import { GameSnapshot } from '@/types/game.types';
import { Pause, Flame, Heart, Clock, Crosshair, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { PirateEngine } from '@/game/PirateEngine';

interface GameHUDProps {
  snapshot: GameSnapshot;
  onPause: () => void;
  engine: PirateEngine | null;
}

export const GameHUD: React.FC<GameHUDProps> = ({ snapshot, onPause, engine }) => {
  const hpPct = Math.max(0, Math.min(100, (snapshot.playerHealth / snapshot.playerMaxHealth) * 100));

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-5 z-20 select-none">
      {/* Top HUD Banner */}
      <div className="flex items-center justify-between w-full">
        {/* Player Health */}
        <div className="pointer-events-auto bg-slate-900/85 backdrop-blur border border-slate-700/80 rounded-xl p-2.5 sm:p-3 flex items-center gap-3 shadow-lg">
          <Heart className={`w-6 h-6 ${hpPct < 30 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`} />
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-semibold text-slate-200">
              <span>Hull Integrity</span>
              <span className="font-mono">{Math.ceil(snapshot.playerHealth)} / {snapshot.playerMaxHealth}</span>
            </div>
            <div className="w-32 sm:w-44 h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div
                className={`h-full transition-all duration-200 ${
                  hpPct > 50 ? 'bg-gradient-to-r from-emerald-500 to-green-400' : hpPct > 25 ? 'bg-amber-400' : 'bg-red-500'
                }`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Center Clock & Score */}
        <div className="flex items-center gap-3">
          {/* Score */}
          <div className="pointer-events-auto bg-slate-900/85 backdrop-blur border border-amber-500/40 rounded-xl px-4 py-2 flex items-center gap-2 shadow-lg shadow-amber-500/10">
            <Flame className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block leading-none">Score</span>
              <span className="font-pirate font-black text-xl text-amber-300 font-mono">{snapshot.score}</span>
            </div>
          </div>

          {/* Time Remaining */}
          <div className="pointer-events-auto bg-slate-900/85 backdrop-blur border border-slate-700/80 rounded-xl px-4 py-2 flex items-center gap-2 shadow-lg">
            <Clock className="w-5 h-5 text-sky-400" />
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block leading-none">Time</span>
              <span className="font-mono font-bold text-lg text-slate-100">{Math.ceil(snapshot.timeRemaining)}s</span>
            </div>
          </div>
        </div>

        {/* Pause Button */}
        <button
          onClick={onPause}
          className="pointer-events-auto p-3 rounded-xl bg-slate-900/85 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow-lg active:scale-95 transition"
          title="Pause Battle (ESC or P)"
        >
          <Pause className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Controls: Mobile Virtual Controls */}
      <div className="flex items-end justify-between w-full pb-2 md:hidden">
        {/* D-Pad Steering */}
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <button
            onPointerDown={() => engine?.setInput(true, false, false)}
            onPointerUp={() => engine?.setInput(false, false, false)}
            className="touch-btn w-14 h-14 rounded-full bg-slate-900/80 border-2 border-amber-500/60 active:bg-amber-500/40 flex items-center justify-center text-white"
          >
            <ArrowUp className="w-7 h-7" />
          </button>
          <div className="flex gap-2">
            <button
              onPointerDown={() => engine?.setInput(false, true, false)}
              onPointerUp={() => engine?.setInput(false, false, false)}
              className="touch-btn w-12 h-12 rounded-full bg-slate-900/80 border border-slate-700 active:bg-slate-700 flex items-center justify-center text-white"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onPointerDown={() => engine?.setInput(false, false, true)}
              onPointerUp={() => engine?.setInput(false, false, false)}
              className="touch-btn w-12 h-12 rounded-full bg-slate-900/80 border border-slate-700 active:bg-slate-700 flex items-center justify-center text-white"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Cannon Triggers */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <button
            onClick={() => engine?.playerFireFront()}
            className="touch-btn px-5 py-3 rounded-xl btn-pirate-gold font-bold text-xs shadow-lg flex items-center gap-1.5"
          >
            <Crosshair className="w-4 h-4" />
            <span>Front Cannon</span>
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => engine?.playerFireBroadside('LEFT')}
              className="touch-btn px-3.5 py-2.5 rounded-lg bg-sky-800/90 text-sky-100 font-bold text-xs border border-sky-600"
            >
              Port Salvo
            </button>
            <button
              onClick={() => engine?.playerFireBroadside('RIGHT')}
              className="touch-btn px-3.5 py-2.5 rounded-lg bg-sky-800/90 text-sky-100 font-bold text-xs border border-sky-600"
            >
              Starboard Salvo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
