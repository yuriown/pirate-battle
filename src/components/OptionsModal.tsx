import React, { useState } from 'react';
import { GameConfig } from '@/types/game.types';
import { saveConfig } from '@/game/config';
import { Settings, X, Save, Clock, Crosshair, Check } from 'lucide-react';

interface OptionsModalProps {
  config: GameConfig;
  onClose: () => void;
  onSave: (newConfig: GameConfig) => void;
}

export const OptionsModal: React.FC<OptionsModalProps> = ({ config, onClose, onSave }) => {
  const [duration, setDuration] = useState(config.sessionDuration);
  const [spawnInterval, setSpawnInterval] = useState(config.enemySpawnInterval);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    const updated: GameConfig = {
      ...config,
      sessionDuration: Math.min(180, Math.max(60, Number(duration))),
      enemySpawnInterval: Math.min(10, Math.max(2, Number(spawnInterval))),
    };

    saveConfig(updated);
    onSave(updated);
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="wood-panel gold-border w-full max-w-md rounded-2xl p-6 relative shadow-2xl animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 text-amber-400 mb-6">
          <Settings className="w-6 h-6 animate-spin-slow" />
          <h2 className="font-pirate text-2xl font-bold tracking-wide">Battle Options</h2>
        </div>

        <div className="space-y-6">
          {/* Game Session Time (60s - 180s) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Clock className="w-4 h-4 text-amber-400" />
                Game Session Duration:
              </label>
              <span className="font-mono font-bold text-amber-400 text-base">{duration}s</span>
            </div>
            <input
              type="range"
              min="60"
              max="180"
              step="10"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>60s (Quick)</span>
              <span>120s (Standard)</span>
              <span>180s (Long)</span>
            </div>
          </div>

          {/* Enemy Spawn Interval (2s - 10s) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Crosshair className="w-4 h-4 text-sky-400" />
                Enemy Spawn Interval:
              </label>
              <span className="font-mono font-bold text-sky-400 text-base">{spawnInterval.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="2.0"
              max="10.0"
              step="0.5"
              value={spawnInterval}
              onChange={(e) => setSpawnInterval(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>2.0s (Intense)</span>
              <span>4.5s (Balanced)</span>
              <span>10.0s (Calm)</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-slate-700/60 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-pirate-gold px-5 py-2.5 rounded-lg text-sm flex items-center gap-2"
          >
            {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{savedSuccess ? 'Saved!' : 'Save Options'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
