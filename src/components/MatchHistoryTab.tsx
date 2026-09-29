import React, { useState } from 'react';
import { useMatchHistory } from '@/hooks/useGameQueries';
import { History, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle, Skull, Hourglass } from 'lucide-react';
import { EndReason } from '@/types/game.types';

export const MatchHistoryTab: React.FC = () => {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const { data, isLoading, isError, error, refetch, isFetching } = useMatchHistory(page, pageSize);

  const getReasonBadge = (reason: EndReason) => {
    switch (reason) {
      case 'TIME_EXPIRED':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded">
            <Hourglass className="w-3 h-3" /> Time Expired
          </span>
        );
      case 'SHIP_DESTROYED':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded">
            <Skull className="w-3 h-3" /> Ship Sunk
          </span>
        );
      case 'PLAYER_SURRENDERED':
        return (
          <span className="flex items-center gap-1 text-[10px] bg-slate-500/20 text-slate-300 border border-slate-500/40 px-1.5 py-0.5 rounded">
            Surrendered
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
        <div className="flex items-center gap-2 text-sky-400 font-pirate font-bold text-lg">
          <History className="w-5 h-5 text-sky-400" />
          <span>Captain's Log (Personal History)</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded transition disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-sky-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
          <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Loading combat records...</span>
        </div>
      )}

      {isError && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
          <p className="text-xs text-red-300">{(error as Error)?.message || 'Failed to load match history'}</p>
          <button
            onClick={() => refetch()}
            className="text-xs bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded font-semibold transition"
          >
            Try Again
          </button>
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {data.data.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No battle history yet. Set sail and destroy enemy ships!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700/80 text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Score</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {data.data.map((match) => (
                    <tr key={match.id} className="hover:bg-slate-800/50 transition">
                      <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">
                        {new Date(match.date).toLocaleDateString()} {new Date(match.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400 text-sm">
                        {match.score} pts
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">
                        {match.durationSeconds}s
                      </td>
                      <td className="py-2.5 px-3">
                        {getReasonBadge(match.endReason)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
            <span>
              Page <strong className="text-slate-200">{data.page}</strong> of <strong className="text-slate-200">{data.totalPages || 1}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={data.page <= 1 || isFetching}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages || isFetching}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
