import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';

// Query keys for consistent caching
export const settingsQueryKeys = {
  codeHistory: ['settings', 'code-history'] as const,
  userSubmissions: ['settings', 'user-submissions'] as const,
  submissionStats: ['settings', 'submission-stats'] as const,
  userTemplates: ['settings', 'user-templates'] as const,
};

// Code History Hook
export function useCodeHistory() {
  return useQuery({
    queryKey: settingsQueryKeys.codeHistory,
    queryFn: () => apiService.getCodeHistory(1, 100),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// User Submissions Hook
export function useUserSubmissions() {
  return useQuery({
    queryKey: settingsQueryKeys.userSubmissions,
    queryFn: () => apiService.getUserSubmissions(),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
  });
}

// User Submission Stats Hook
export function useUserSubmissionStats() {
  return useQuery({
    queryKey: settingsQueryKeys.submissionStats,
    queryFn: () => apiService.getUserSubmissionsStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// User Templates Hook
export function useUserTemplates() {
  return useQuery({
    queryKey: settingsQueryKeys.userTemplates,
    queryFn: () => apiService.getUserTemplatesList(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}
