import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { queryKeys, invalidateQueries } from '../lib/react-query';

// Template-related React Query hooks with performance optimizations

export function useTemplates(filters?: Record<string, any>) {
  return useQuery({
    queryKey: queryKeys.templates.list(filters),
    queryFn: () => apiService.getUserTemplatesList(),
    staleTime: 10 * 60 * 1000, // 10 minutes - templates don't change often
    gcTime: 30 * 60 * 1000, // 30 minutes cache time
    select: (data) => {
      // Data transformation and filtering on client side for performance
      let templates = data || [];
      
      if (filters?.language) {
        templates = templates.filter((t: any) => t.language === filters.language);
      }
      
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        templates = templates.filter((t: any) => 
          t.title?.toLowerCase().includes(searchTerm) ||
          t.description?.toLowerCase().includes(searchTerm)
        );
      }
      
      return templates;
    },
    // Enable background refetching for real-time updates
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    refetchIntervalInBackground: false,
  });
}

export function useTemplate(id: number) {
  return useQuery({
    queryKey: queryKeys.templates.detail(id),
    queryFn: () => apiService.getTemplate(id),
    staleTime: 15 * 60 * 1000, // 15 minutes for individual templates
    enabled: !!id, // Only fetch if id is provided
  });
}

export function useUserTemplates() {
  return useQuery({
    queryKey: queryKeys.templates.userTemplates,
    queryFn: () => apiService.getUserTemplatesList(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Optimistic updates - show cached data while revalidating
    refetchOnMount: 'always',
  });
}

// Mutations with optimistic updates and cache invalidation
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (templateData: any) => apiService.createTemplate(templateData),
    onMutate: async (newTemplate) => {
      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.templates.all });
      
      // Snapshot previous value
      const previousTemplates = queryClient.getQueryData(queryKeys.templates.userTemplates);
      
      // Optimistically update to new value
      queryClient.setQueryData(queryKeys.templates.userTemplates, (old: any) => {
        if (!old) return [newTemplate];
        return [...old, { ...newTemplate, id: Date.now() }]; // Temp ID
      });
      
      return { previousTemplates };
    },
    onError: (_err, _newTemplate, context) => {
      // Rollback on error
      if (context?.previousTemplates) {
        queryClient.setQueryData(queryKeys.templates.userTemplates, context.previousTemplates);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      invalidateQueries.templates();
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      apiService.updateTemplate(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.templates.detail(id) });
      
      const previousTemplate = queryClient.getQueryData(queryKeys.templates.detail(id));
      
      // Optimistic update
      queryClient.setQueryData(queryKeys.templates.detail(id), (old: any) => ({
        ...old,
        ...data,
      }));
      
      return { previousTemplate, id };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousTemplate) {
        queryClient.setQueryData(
          queryKeys.templates.detail(context.id), 
          context.previousTemplate
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.userTemplates });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => apiService.deleteTemplate(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache immediately
      queryClient.removeQueries({ queryKey: queryKeys.templates.detail(deletedId) });
      
      // Update templates list by removing deleted item
      queryClient.setQueryData(queryKeys.templates.userTemplates, (old: any) => {
        if (!old) return old;
        return old.filter((template: any) => template.id !== deletedId);
      });
    },
    onSettled: () => {
      invalidateQueries.templates();
    },
  });
}

// Prefetch helpers for performance
export function usePrefetchTemplate() {
  const queryClient = useQueryClient();
  
  return (id: number) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.templates.detail(id),
      queryFn: () => apiService.getTemplate(id),
      staleTime: 10 * 60 * 1000,
    });
  };
}

// Infinite query for paginated templates (if needed)
// Note: Uncomment when getTemplatesPaginated is implemented in apiService
/*
export function useInfiniteTemplates(pageSize = 20) {
  return useInfiniteQuery({
    queryKey: ['templates', 'infinite', pageSize],
    queryFn: ({ pageParam = 0 }) => 
      apiService.getTemplatesPaginated({ page: pageParam, limit: pageSize }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length : undefined;
    },
  });
}
*/
