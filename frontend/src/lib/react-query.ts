import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

// Create optimized QueryClient with performance-focused defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Caching optimizations - Reduced for fresh data on refresh
      staleTime: 30 * 1000, // 30 seconds - data stays fresh for 30 seconds only
      gcTime: 5 * 60 * 1000, // 5 minutes - garbage collection time (formerly cacheTime)
      
      // Performance optimizations 
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
      refetchOnReconnect: 'always', // Always refetch when reconnecting
      retry: (failureCount, error: any) => {
        // Smart retry logic - don't retry 4xx errors
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Structural sharing enabled by default for render optimizations
      structuralSharing: true,
      
      // Network mode - for better offline support
      networkMode: 'online',
    },
    mutations: {
      // Mutation defaults
      retry: 1,
      networkMode: 'online',
    },
  },
  
  // Query cache configuration for performance monitoring
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error('Query error:', error, 'Query key:', query.queryKey);
    },
    onSuccess: (data, query) => {
      // Optional: Log successful queries for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('Query success:', query.queryKey, 'Data:', data);
      }
    },
  }),
  
  // Mutation cache configuration
  mutationCache: new MutationCache({
    onError: (error, variables) => {
      console.error('Mutation error:', error, 'Variables:', variables);
    },
  }),
});

// Query keys factory for consistent key management
export const queryKeys = {
  // User-related queries
  user: {
    current: ['user', 'current'] as const,
    profile: (id: number) => ['user', 'profile', id] as const,
    submissions: (userId: number) => ['user', 'submissions', userId] as const,
  },
  
  // Template-related queries
  templates: {
    all: ['templates'] as const,
    list: (filters?: Record<string, any>) => ['templates', 'list', filters] as const,
    detail: (id: number) => ['templates', 'detail', id] as const,
    userTemplates: ['templates', 'user'] as const,
  },
  
  // Classroom-related queries
  classrooms: {
    all: ['classrooms'] as const,
    list: (filters?: Record<string, any>) => ['classrooms', 'list', filters] as const,
    detail: (id: number) => ['classrooms', 'detail', id] as const,
    members: (id: number) => ['classrooms', 'members', id] as const,
    templates: (id: number) => ['classrooms', 'templates', id] as const,
  },
  
  // Collaboration-related queries
  collaboration: {
    sessions: ['collaboration', 'sessions'] as const,
    session: (shareId: string) => ['collaboration', 'session', shareId] as const,
    participants: (sessionId: number) => ['collaboration', 'participants', sessionId] as const,
    state: (sessionId: number) => ['collaboration', 'state', sessionId] as const,
  },
  
  // Admin-related queries  
  admin: {
    submissions: ['admin', 'submissions'] as const,
    stats: ['admin', 'stats'] as const,
    users: ['admin', 'users'] as const,
    classrooms: ['admin', 'classrooms'] as const,
  },
  
  // Code execution queries
  code: {
    execution: (code: string, language: string, input?: string) => 
      ['code', 'execution', { code, language, input }] as const,
    validation: (code: string, language: string) => 
      ['code', 'validation', { code, language }] as const,
  },
} as const;

// Cache invalidation helpers
export const invalidateQueries = {
  user: () => queryClient.invalidateQueries({ queryKey: queryKeys.user.current }),
  templates: () => queryClient.invalidateQueries({ queryKey: queryKeys.templates.all }),
  classrooms: () => queryClient.invalidateQueries({ queryKey: queryKeys.classrooms.all }),
  collaboration: () => queryClient.invalidateQueries({ queryKey: queryKeys.collaboration.sessions }),
  admin: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
};

// Prefetch helpers for performance optimization
export const prefetchQueries = {
  userTemplates: () => 
    queryClient.prefetchQuery({
      queryKey: queryKeys.templates.userTemplates,
      staleTime: 10 * 60 * 1000, // 10 minutes
    }),
  
  classrooms: () =>
    queryClient.prefetchQuery({
      queryKey: queryKeys.classrooms.all,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }),
};

// Performance optimization utilities
export const optimizeQueryData = {
  // Remove old submissions to prevent memory bloat
  cleanupOldSubmissions: () => {
    queryClient.removeQueries({
      queryKey: ['user', 'submissions'],
      exact: false,
      type: 'inactive',
    });
  },
  
  // Preload critical data
  preloadCriticalData: async () => {
    await Promise.all([
      prefetchQueries.userTemplates(),
      prefetchQueries.classrooms(),
    ]);
  },
};
