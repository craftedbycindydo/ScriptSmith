import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  submissions: ['admin', 'submissions'] as const,
  submissionStats: ['admin', 'submission-stats'] as const,
};

// Admin Stats Hook - Always enabled for instant overview load
export function useAdminStats(enabled: boolean = true) {
  return useQuery({
    queryKey: adminQueryKeys.stats,
    queryFn: () => apiService.getAdminStats(),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Admin Activities Hook - server-side filtered and paginated
export function useAdminActivities(
  enabled: boolean = true,
  page: number = 1,
  pageSize: number = 20,
  activityType?: string,
  status?: string,
  userName?: string
) {
  return useQuery({
    queryKey: [...adminQueryKeys.activities, { page, pageSize, activityType, status, userName }],
    queryFn: () => apiService.getAdminActivities(page, pageSize, activityType, status, undefined, userName),
    enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}

// Admin Users Hook - Load for overview and users tab only
export function useAdminUsers(enabled: boolean = true) {
  return useQuery({
    queryKey: adminQueryKeys.users,
    queryFn: () => apiService.getAdminUsers(1, 100, undefined),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

// Template Executions Hook - server-side filtered and paginated
export function useTemplateExecutions(
  enabled: boolean = true,
  page: number = 1,
  pageSize: number = 20,
  templateName?: string,
  userName?: string,
  language?: string,
  status?: string
) {
  return useQuery({
    queryKey: [...adminQueryKeys.templateExecutions, { page, pageSize, templateName, userName, language, status }],
    queryFn: () => apiService.getTemplateExecutions(
      page, pageSize, undefined, templateName, undefined, userName, language, status
    ),
    enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}

// Dropdown Options Hooks (lightweight, cached longer)
export function useTemplatesOptions(enabled: boolean = true) {
  return useQuery({
    queryKey: adminQueryKeys.templatesOptions,
    queryFn: () => apiService.getTemplatesList(),
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
}

export function useUsersOptions(enabled: boolean = true) {
  return useQuery({
    queryKey: adminQueryKeys.usersOptions,
    queryFn: () => apiService.getUsersList(),
    enabled,
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

// Password Management Mutation Hooks
export function useGenerateTempPassword() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: number) => apiService.generateTempPassword(userId),
    onSuccess: () => {
      // Invalidate users data to reflect any changes
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });
}

export function useAdminResetUsername() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, newUsername }: { userId: number; newUsername: string }) => 
      apiService.adminResetUsername(userId, newUsername),
    onSuccess: () => {
      // Invalidate users data to reflect any changes
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });
}

export function useAdminForceLogoutUser() {
  return useMutation({
    mutationFn: (userId: number) => apiService.adminForceLogoutUser(userId),
  });
}
