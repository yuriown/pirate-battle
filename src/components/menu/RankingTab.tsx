import { useState } from 'react';
import type { MatchConfig } from '@/api/contracts';
import { useRankingQuery } from '@/api/queries';
import { formatConfig, formatDuration, formatPlayedAt, formatRank } from './format';
import { EmptyState, ErrorState, LoadingState, Pager, UpdatingIndicator } from './TableStates';

// Matches the reference layout and keeps the whole log on a 720 px tall screen.
const PAGE_SIZE = 6;

interface RankingTabProps {
  config: MatchConfig;
  playerId: string;
}

export function RankingTab({ config, playerId }: RankingTabProps) {
  const { sessionDurationSec, spawnIntervalSec } = config;
  const bracket = `${sessionDurationSec}/${spawnIntervalSec}`;
  // Page state is tied to the configuration bracket, so changing options starts again at page 1.
  const [paging, setPaging] = useState({ bracket, page: 1 });
  const page = paging.bracket === bracket ? paging.page : 1;
  const setPage = (next: number) => setPaging({ bracket, page: next });

  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useRankingQuery({
    sessionDurationSec,
    spawnIntervalSec,
    page,
    pageSize: PAGE_SIZE,
  });

  // The list can shrink (e.g. after a mock reset); fall back to the last existing page.
  if (data && !isPlaceholderData && page > data.totalPages) setPage(data.totalPages);

  const caption = formatConfig(config);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="ranking-heading">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="ranking-heading" className="sr-only">
          Ranking
        </h2>
        <UpdatingIndicator active={isFetching && !isPending} />
      </header>

      {isPending && <LoadingState label="Loading ranking…" />}

      {error && (
        <ErrorState
          message={data ? `Could not refresh the ranking. ${error.message}` : `Could not load the ranking. ${error.message}`}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}

      {data && data.total === 0 && (
        <EmptyState>
          No battles recorded yet for {caption.toLowerCase()}. Finish a match to claim the first place.
        </EmptyState>
      )}

      {data && data.total > 0 && (
        <>
          <table className="pb-table" aria-busy={isFetching}>
            <caption>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Captain</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Played</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => {
                const isMine = entry.playerId === playerId;
                return (
                  <tr key={entry.matchId} className={isMine ? 'pb-table-row pb-row-highlight' : 'pb-table-row'}>
                    <td className="text-amber-300">{formatRank(entry.rank)}</td>
                    <th scope="row" className="text-amber-50">
                      {entry.playerName}
                      {isMine && <span className="pb-badge ml-2">YOU</span>}
                    </th>
                    <td className="text-amber-300">{entry.score}</td>
                    <td>{formatDuration(entry.durationMs)}</td>
                    <td>{formatPlayedAt(entry.playedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={page} totalPages={data.totalPages} onChange={setPage} label="Ranking" />
        </>
      )}
    </section>
  );
}
