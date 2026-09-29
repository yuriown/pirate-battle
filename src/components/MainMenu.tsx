import React, { useState } from 'react';
import { Play, Settings, Trophy, History, Flame, Crosshair } from 'lucide-react';
import { ActiveMenuTab } from '@/types/game.types';
import { RankingTab } from './RankingTab';
import { MatchHistoryTab } from './MatchHistoryTab';

interface MainMenuProps {
  onStartGame: () => void;
  onOpenOptions: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartGame, onOpenOptions }) => {
  const [activeTab, setActiveTab] = useState<ActiveMenuTab>('PLAY');

  return (
    <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-4 sm:p-6 gap-6 max-w-6xl mx-auto w-full">
      {/* Left: Hero & Play Panel */}
      <div className="w-full lg:w-5/12 flex flex-col items-center text-center space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>2D Naval Combat Simulator</span>
          </div>
          <h1 className="font-pirate text-4xl sm:text-5xl font-black tracking-wider gold-gradient-text drop-shadow-md">
            PIRATE BATTLE
          </h1>
          <p className="text-sm text-slate-300 max-w-sm">
            Command your galleon, outmaneuver island obstacles, and sink Chasers and Shooters to top the global leaderboard!
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-xs space-y-3">
          <button
            onClick={onStartGame}
            className="w-full btn-pirate-gold py-4 px-6 rounded-xl font-pirate text-xl font-bold flex items-center justify-center gap-3 shadow-xl hover:scale-105 active:scale-95 transition"
          >
            <Play className="w-6 h-6 fill-current" />
            <span>SET SAIL (PLAY)</span>
          </button>

          <button
            onClick={onOpenOptions}
            className="w-full py-3 px-5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 transition"
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span>Battle Options</span>
          </button>
        </div>

        {/* Controls Guide Banner */}
        <div className="w-full max-w-sm bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 text-left text-xs space-y-2">
          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Crosshair className="w-4 h-4 text-sky-400" />
            <span>Combat Controls:</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
            <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-400">W / ↑</kbd> Sail Forward</div>
            <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-400">A / D</kbd> Steer Ship</div>
            <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-400">Space / J</kbd> Front Cannon</div>
            <div><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-400">K / L</kbd> Broadsides</div>
          </div>
        </div>
      </div>

      {/* Right: Ranking & Match History Tabs Card */}
      <div className="w-full lg:w-7/12 wood-panel rounded-2xl p-5 sm:p-6 shadow-2xl min-h-[460px] flex flex-col">
        {/* Tab Headers */}
        <div className="flex border-b border-slate-700/80 mb-4 gap-2">
          <button
            onClick={() => setActiveTab('RANKING')}
            className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'RANKING'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Leaderboard</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'HISTORY'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Match History</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 flex flex-col justify-between">
          {activeTab === 'RANKING' && <RankingTab />}
          {activeTab === 'HISTORY' && <MatchHistoryTab />}
        </div>
      </div>
    </div>
  );
};
