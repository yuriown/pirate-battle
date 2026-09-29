import React, { useState } from 'react';
import { X, ShieldAlert, RotateCcw, Check, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { NetworkScenario } from '@/types/game.types';
import { getCurrentScenario, setNetworkScenario, resetMockData } from '@/mocks/handlers';

interface NetworkDevPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onScenarioChange: (scenario: NetworkScenario) => void;
}

export const NetworkDevPanel: React.FC<NetworkDevPanelProps> = ({
  isOpen,
  onClose,
  onScenarioChange,
}) => {
  const [selectedScenario, setSelected] = useState<NetworkScenario>(getCurrentScenario());

  if (!isOpen) return null;

  const handleSelect = (scenario: NetworkScenario) => {
    setSelected(scenario);
    setNetworkScenario(scenario);
    onScenarioChange(scenario);
  };

  const handleResetData = () => {
    resetMockData();
    window.location.reload();
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 p-5 flex flex-col justify-between select-none">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <ShieldAlert className="w-4 h-4" />
            <span>MSW Network Dev Panel</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Simulate real-world network latency, HTTP 500 errors, timeouts, and offline recovery for Ranking and Match History APIs.
        </p>

        {/* Scenario Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">Select Network Scenario:</label>

          {[
            { id: 'DEFAULT', name: 'Default (Fast 100ms)', icon: Wifi, color: 'text-emerald-400' },
            { id: 'SLOW_NETWORK', name: 'Slow 3G (1.2s - 1.6s)', icon: Wifi, color: 'text-amber-400' },
            { id: 'HIGH_LATENCY', name: 'High Latency / Jitter (2.5s+)', icon: Wifi, color: 'text-orange-400' },
            { id: 'ERROR_500', name: 'HTTP 500 Internal Error', icon: AlertTriangle, color: 'text-red-400' },
            { id: 'TIMEOUT', name: 'Network Timeout (>5s)', icon: AlertTriangle, color: 'text-red-500' },
            { id: 'OFFLINE', name: 'Offline / Disconnected', icon: WifiOff, color: 'text-slate-400' },
            { id: 'EMPTY_LIST', name: 'Empty Data Response', icon: ShieldAlert, color: 'text-blue-400' },
          ].map((sc) => {
            const Icon = sc.icon;
            const isSelected = selectedScenario === sc.id;

            return (
              <button
                key={sc.id}
                onClick={() => handleSelect(sc.id as NetworkScenario)}
                className={`w-full text-left p-2.5 rounded-lg text-xs flex items-center justify-between border transition ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-200 font-semibold'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${sc.color}`} />
                  <span>{sc.name}</span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-amber-400" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-2">
        <button
          onClick={handleResetData}
          className="w-full py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Fixtures & Stored Data</span>
        </button>
      </div>
    </div>
  );
};
