import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';
import { RankingEntry, MatchResult, PaginatedResponse } from '@/types/game.types';

export const QUERY_KEYS = {
  ranking: (page: number, pageSize: number) => ['ranking', page, pageSize] as const,
  matchHistory: (page: number, pageSize: number) => ['matchHistory', page, pageSize] as const,
};

export function useRanking(page: number = 1, pageSize: number = 5) {
  return useQuery<PaginatedResponse<RankingEntry>>({
    queryKey: QUERY_KEYS.ranking(page, pageSize),
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<RankingEntry>>('/ranking', {
        params: { page, pageSize },
      });
      return res.data;
    },
    staleTime: 30_000,
    retry: 2,
  });
}

export function useMatchHistory(page: number = 1, pageSize: number = 5) {
  return useQuery<PaginatedResponse<MatchResult>>({
    queryKey: QUERY_KEYS.matchHistory(page, pageSize),
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<MatchResult>>('/matches', {
        params: { page, pageSize },
      });
      return res.data;
    },
    staleTime: 30_000,
    retry: 2,
  });
}

export function useSubmitMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (result: MatchResult) => {
      const res = await apiClient.post<MatchResult>('/matches', result);
      return res.data;
    },
    onSuccess: () => {
      // Invalidate both Ranking and Match History queries immediately
      queryClient.invalidateQueries({ queryKey: ['ranking'] });
      queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
    },
  });
}
