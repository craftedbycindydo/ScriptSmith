import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api';

// Query keys for consistent caching
export const adminQueryKeys = {
  stats: ['admin', 'stats'] as const,
  activities: ['admin', 'activities'] as const,
  users: ['admin', 'users'] as const,
  templateExecutions: ['admin', 'template-executions'] as const,
  templatesOptions: ['admin', 'templates-options'] as const,
  usersOptions: ['admin', 'users-options'] as const,
  classrooms: ['admin', 'classrooms'] as const,
  classroomMembers: (id: number) => ['admin', 'classroom-members', id] as const,
  classroomSettings: (id: number) => ['admin', 'classroom-settings', id] as const,
  templates: ['admin', 'templates'] as const,
  templateStats: ['admin', 'template-stats'] as const,
  assignments: ['admin', 'assignments'] as const,
  submissions: ['admin', 'submissions'] as const,
  submissionStats: ['admin', 'submission-stats'] as const,
};

// Admin Stats Hook
export function useAdminStats() {
  return useQuery({
    queryKey: adminQueryKeys.stats,
    queryFn: () => apiService.getAdminStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Admin Activities Hook
export function useAdminActivities() {
  return useQuery({
    queryKey: adminQueryKeys.activities,
    queryFn: () => apiService.getAdminActivities(1, 200, undefined, undefined, undefined, undefined),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
  });
}

// Admin Users Hook
export function useAdminUsers() {
  return useQuery({
    queryKey: adminQueryKeys.users,
    queryFn: () => apiService.getAdminUsers(1, 100, undefined),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Template Executions Hook
export function useTemplateExecutions() {
  return useQuery({
    queryKey: adminQueryKeys.templateExecutions,
    queryFn: () => apiService.getTemplateExecutions(1, 200, undefined, undefined, undefined, undefined, undefined, undefined),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
  });
}

// Dropdown Options Hooks (lightweight, cached longer)
export function useTemplatesOptions() {
  return useQuery({
    queryKey: adminQueryKeys.templatesOptions,
    queryFn: () => apiService.getTemplatesList(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
}

export function useUsersOptions() {
  return useQuery({
    queryKey: adminQueryKeys.usersOptions,
    queryFn: () => apiService.getUsersList(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
}

// Classroom Hooks
export function useClassrooms() {
  return useQuery({
    queryKey: adminQueryKeys.classrooms,
    queryFn: () => apiService.getMyClassrooms(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}

export function useClassroomMembers(classroomId: number, enabled: boolean = true) {
  return useQuery({
    queryKey: adminQueryKeys.classroomMembers(classroomId),
    queryFn: () => apiService.getClassroomMembers(classroomId),
    enabled: enabled && !!classroomId,
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useClassroomSettings(classroomId: number, enabled: boolean = true) {
  return useQuery({
    queryKey: adminQueryKeys.classroomSettings(classroomId),
    queryFn: () => apiService.getClassroomAdminSettings(classroomId),
    enabled: enabled && !!classroomId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}

// Template Management Hooks
export function useAdminTemplates() {
  return useQuery({
    queryKey: adminQueryKeys.templates,
    queryFn: () => apiService.getTemplates(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}

export function useTemplateStats() {
  return useQuery({
    queryKey: adminQueryKeys.templateStats,
    queryFn: () => apiService.getTemplateStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Assignment Hooks
export function useAssignments() {
  return useQuery({
    queryKey: adminQueryKeys.assignments,
    queryFn: () => apiService.getAssignments(0, 50),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Submission Hooks
export function useAdminSubmissions() {
  return useQuery({
    queryKey: adminQueryKeys.submissions,
    queryFn: () => apiService.getAllSubmissions('0', '100'),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
  });
}

export function useSubmissionStats() {
  return useQuery({
    queryKey: adminQueryKeys.submissionStats,
    queryFn: () => apiService.getSubmissionsStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Mutation Hooks for actions
export function useToggleUserActivation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, activate }: { userId: number; activate: boolean }) => 
      activate ? apiService.activateUser(userId) : apiService.deactivateUser(userId),
    onSuccess: () => {
      // Invalidate and refetch users data
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });
}

export function useCreateClassroom() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (classroomData: any) => apiService.createClassroom(classroomData),
    onSuccess: () => {
      // Invalidate classrooms data
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.classrooms });
    },
  });
}

export function useDeleteClassroom() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (classroomId: number) => apiService.deleteClassroom(classroomId),
    onSuccess: () => {
      // Invalidate classrooms data
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.classrooms });
    },
  });
}

export function useAddStudentToClassroom() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ classroomId, email }: { classroomId: number; email: string }) =>
      apiService.addStudentToClassroom(classroomId, email),
    onSuccess: (_, { classroomId }) => {
      // Invalidate classroom members data
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.classroomMembers(classroomId) });
    },
  });
}

export function useRemoveClassroomMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ classroomId, memberId }: { classroomId: number; memberId: number }) =>
      apiService.removeClassroomMember(classroomId, memberId),
    onSuccess: (_, { classroomId }) => {
      // Invalidate classroom members data
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.classroomMembers(classroomId) });
    },
  });
}

export function useUpdateClassroomSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ classroomId, settings }: { classroomId: number; settings: any }) =>
      apiService.updateClassroomAdminSettings(classroomId, settings),
    onSuccess: (_, { classroomId }) => {
      // Invalidate classroom settings data
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.classroomSettings(classroomId) });
    },
  });
}
