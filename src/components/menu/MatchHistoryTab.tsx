import { useState } from 'react';
import { useHistoryQuery } from '@/api/queries';
import { useMatchSubmissions } from '@/api/useMatchSubmission';
import { formatDuration, formatEndReason, formatPlayedAt } from './format';
import { EmptyState, ErrorState, LoadingState, Pager, UpdatingIndicator } from './TableStates';

const PAGE_SIZE = 8;

interface MatchHistoryTabProps {
  playerId: string;
  playerName: string;
}

export function MatchHistoryTab({ playerId, playerName }: MatchHistoryTabProps) {
  const [page, setPage] = useState(1);
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useHistoryQuery({
    playerId,
    page,
    pageSize: PAGE_SIZE,
  });
  const { pending, retry, retryAll } = useMatchSubmissions();

  if (data && !isPlaceholderData && page > data.totalPages) setPage(data.totalPages);

  // A record the server already holds (e.g. saved just before a client timeout) is shown only once, as confirmed.
  const confirmedIds = new Set(data?.items.map((r) => r.matchId));
  const unsaved = pending.filter((e) => e.record.playerId === playerId && !confirmedIds.has(e.record.matchId));
  const failedCount = unsaved.filter((e) => e.status.state === 'failed').length;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="history-heading">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="history-heading" className="text-amber-50">
          {playerName}&apos;s battles
        </h2>
        <UpdatingIndicator active={isFetching && !isPending} />
      </header>

      {unsaved.length > 0 && (
        <div className="flex flex-col gap-2">
          <table className="pb-table">
            <caption>Not saved yet — kept on this device until the server confirms them</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {unsaved.map(({ record, status }) => (
                <tr key={record.matchId} className="pb-table-row">
                  <th scope="row">{formatPlayedAt(record.playedAt)}</th>
                  <td className="text-amber-300">{record.score}</td>
                  <td>{formatDuration(record.durationMs)}</td>
                  <td>
                    <span className="pb-badge" title={status.lastError}>
                      PENDING
                    </span>{' '}
                    {status.state === 'failed' ? (
                      <button
                        type="button"
                        className="pb-btn pb-btn--secondary"
                        onClick={() => retry(record.matchId)}
                        aria-label={`Retry saving the match from ${formatPlayedAt(record.playedAt)}`}
                      >
                        Retry
                      </button>
                    ) : (
                      <span className="pb-status">Saving…</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {failedCount > 1 && (
            <button type="button" className="pb-btn pb-btn--secondary self-end" onClick={retryAll}>
              Retry all
            </button>
          )}
        </div>
      )}

      {isPending && <LoadingState label="Loading match history…" />}

      {error && (
        <ErrorState
          message={data ? `Could not refresh your history. ${error.message}` : `Could not load your history. ${error.message}`}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}

      {data && data.total === 0 && unsaved.length === 0 && (
        <EmptyState>No battles yet. Your finished matches will appear here.</EmptyState>
      )}

      {data && data.total > 0 && (
        <>
          <table className="pb-table" aria-busy={isFetching}>
            <caption>Saved matches, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((record) => (
                <tr key={record.matchId} className="pb-table-row">
                  <th scope="row">{formatPlayedAt(record.playedAt)}</th>
                  <td className="text-amber-300">{record.score}</td>
                  <td>{formatDuration(record.durationMs)}</td>
                  <td>{formatEndReason(record.endReason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} totalPages={data.totalPages} onChange={setPage} label="History" />
        </>
      )}
    </section>
  );
}
