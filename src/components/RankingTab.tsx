import React, { useState } from 'react';
import { useRanking } from '@/hooks/useGameQueries';
import { Trophy, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle } from 'lucide-react';

export const RankingTab: React.FC = () => {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const { data, isLoading, isError, error, refetch, isFetching } = useRanking(page, pageSize);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="w-6 h-6 rounded-full bg-amber-400 text-ocean-900 font-bold text-xs flex items-center justify-center shadow-lg shadow-amber-500/30">1</span>;
    if (rank === 2) return <span className="w-6 h-6 rounded-full bg-slate-300 text-ocean-900 font-bold text-xs flex items-center justify-center">2</span>;
    if (rank === 3) return <span className="w-6 h-6 rounded-full bg-amber-700 text-white font-bold text-xs flex items-center justify-center">3</span>;
    return <span className="text-slate-400 font-mono text-xs w-6 text-center">#{rank}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
        <div className="flex items-center gap-2 text-amber-400 font-pirate font-bold text-lg">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span>Global Pirate Leaderboard</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded transition disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Fetching ranking records...</span>
        </div>
      )}

      {isError && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
          <p className="text-xs text-red-300">{(error as Error)?.message || 'Failed to load ranking data'}</p>
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
              No ranking records found in this scenario.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700/80 text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Captain</th>
                    <th className="py-2.5 px-3 text-right">Score</th>
                    <th className="py-2.5 px-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {data.data.map((entry) => (
                    <tr key={entry.matchId} className="hover:bg-slate-800/50 transition">
                      <td className="py-2.5 px-3">{getRankBadge(entry.rank)}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-200 flex items-center gap-1.5">
                        <span>{entry.playerName}</span>
                        {entry.playerId === 'local_player' && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded">YOU</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400 text-sm">
                        {entry.score} pts
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400 font-mono">
                        {entry.durationSeconds}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
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
