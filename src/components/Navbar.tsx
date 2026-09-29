import React, { useState } from 'react';
import { Volume2, VolumeX, Maximize, ShieldAlert, Compass } from 'lucide-react';
import { soundService } from '@/services/soundService';

interface NavbarProps {
  onOpenDevPanel: () => void;
  networkScenario: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenDevPanel, networkScenario }) => {
  const [isMuted, setIsMuted] = useState(soundService.getIsMuted());

  const handleToggleMute = () => {
    const muted = soundService.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header className="h-14 bg-ocean-900/90 backdrop-blur border-b border-ocean-700/60 px-4 flex items-center justify-between z-30 shrink-0 select-none">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-ocean-900 shadow-md">
          <Compass className="w-5 h-5 animate-spin-slow" />
        </div>
        <div>
          <span className="font-pirate font-black text-lg tracking-wider gold-gradient-text">
            PIRATE BATTLE
          </span>
          <span className="hidden sm:inline-block ml-2 text-[10px] bg-ocean-700/60 text-ocean-300 px-1.5 py-0.5 rounded border border-ocean-600/40">
            PixiJS v8 60FPS
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Network Scenario Badge */}
        <button
          onClick={onOpenDevPanel}
          className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-md transition"
          title="Network Dev Panel (MSW Simulation)"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline">MSW:</span>
          <span className="font-mono font-semibold text-amber-300">{networkScenario}</span>
        </button>

        {/* Audio Toggle */}
        <button
          onClick={handleToggleMute}
          className="p-1.5 rounded-lg bg-ocean-800 hover:bg-ocean-700 text-ocean-200 border border-ocean-700/50 transition"
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={handleToggleFullscreen}
          className="p-1.5 rounded-lg bg-ocean-800 hover:bg-ocean-700 text-ocean-200 border border-ocean-700/50 transition hidden sm:flex"
          title="Toggle Fullscreen"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
