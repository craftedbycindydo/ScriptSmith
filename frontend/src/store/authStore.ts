import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '../services/api';
import { endSessionUrl, refreshTokens as refreshOidcTokens } from '../lib/oidc';

export interface User {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  is_active: boolean;
  is_verified: boolean;
  is_admin: boolean;
  created_at: string;
  classroom_context?: {
    has_classroom: boolean;
    classrooms: Array<{
      id: number;
      name: string;
      key: string;
      role: string;
      is_teacher: boolean;
      member_count: number;
      created_by_id: number;
      is_creator: boolean;
    }>;
    current_classroom?: {
      id: number;
      name: string;
      key: string;
      role: string;
      is_teacher: boolean;
      member_count: number;
      created_by_id: number;
      is_creator: boolean;
    };
    roles: string[];
    is_teacher: boolean;
    is_student: boolean;
  };
}

export interface AuthToken {
  access_token: string;
  // Optional: an OIDC provider only returns one when offline_access is granted.
  refresh_token?: string;
  // Only present for OIDC sessions; required as id_token_hint on logout.
  id_token?: string;
  token_type: string;
  expires_in: number;
}

/** Which issuer minted the current token - decides where refresh and logout go. */
export type AuthMethod = 'password' | 'oidc';

interface AuthState {
  user: User | null;
  token: AuthToken | null;
  authMethod: AuthMethod | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, password: string, fullName?: string, classroomKey?: string) => Promise<boolean>;
  refreshUser: () => Promise<boolean>;
  /** endProviderSession: only for user-initiated logout - see the action. */
  logout: (options?: { endProviderSession?: boolean }) => void;
  refreshToken: () => Promise<boolean>;
  adoptOidcSession: (tokens: AuthToken) => Promise<boolean>;
  clearError: () => void;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (token: string, newPassword: string) => Promise<boolean>;
  getCurrentUser: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      authMethod: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const formData = new FormData();
          formData.append('username', email);
          formData.append('password', password);
          
          const tokenResponse = await apiService.login(formData);
          
          // Set token
          set({ token: tokenResponse, authMethod: 'password' });
          
          // Get user info
          const userResponse = await apiService.getCurrentUser();
          
          set({
            user: userResponse,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
          
          return true;
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || error.message || 'Login failed',
            isLoading: false
          });
          return false;
        }
      },

      register: async (email: string, username: string, password: string, fullName?: string, classroomKey?: string) => {
        set({ isLoading: true, error: null });
        
        try {
          await apiService.register({
            email,
            username,
            password,
            full_name: fullName,
            classroom_key: classroomKey || ''
          });
          
          set({
            isLoading: false,
            error: null
          });
          
          return true;
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || error.message || 'Registration failed',
            isLoading: false
          });
          return false;
        }
      },

      refreshUser: async () => {
        const { token } = get();
        if (!token) return false;
        
        try {
          const userResponse = await apiService.getCurrentUser();
          
          set({
            user: userResponse,
            error: null
          });
          
          return true;
        } catch (error: any) {
          console.error('Failed to refresh user data:', error);
          set({
            error: error.response?.data?.detail || error.message || 'Failed to refresh user data'
          });
          return false;
        }
      },

      logout: ({ endProviderSession = true } = {}) => {
        const { token, authMethod } = get();

        set({
          user: null,
          token: null,
          authMethod: null,
          isAuthenticated: false,
          error: null
        });

        // Only on an explicit sign-out. Clearing local state alone would leave
        // the Zitadel session alive, so the next sign-in would silently
        // re-authenticate. Expiry-driven logouts must NOT redirect - that would
        // yank the user out of the app on any background 401.
        if (endProviderSession && authMethod === 'oidc') {
          window.location.assign(endSessionUrl(token?.id_token));
        }
      },

      refreshToken: async () => {
        const { token, authMethod } = get();
        if (!token?.refresh_token) return false;

        try {
          // A Zitadel refresh token is only valid at Zitadel; the backend's
          // /auth/refresh would reject it.
          const newToken = authMethod === 'oidc'
            ? await refreshOidcTokens(token.refresh_token)
            : await apiService.refreshToken(token.refresh_token);

          set({ token: { ...token, ...newToken } });
          return true;
        } catch (error) {
          get().logout({ endProviderSession: false });
          return false;
        }
      },

      // Adopt tokens obtained from Zitadel via the OIDC redirect. The backend
      // accepts them alongside its own, resolving the user by zitadel_user_id,
      // so from here on everything behaves exactly like a password login.
      adoptOidcSession: async (tokens: AuthToken) => {
        set({ token: tokens, authMethod: 'oidc', isLoading: true, error: null });
        try {
          const user = await apiService.getCurrentUser();
          set({ user, isAuthenticated: true, isLoading: false, error: null });
          return true;
        } catch (error: any) {
          set({ token: null, authMethod: null, user: null, isAuthenticated: false, isLoading: false });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      forgotPassword: async (email: string) => {
        set({ isLoading: true, error: null });
        
        try {
          await apiService.forgotPassword(email);
          set({ isLoading: false });
          return true;
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || error.message || 'Failed to send reset email',
            isLoading: false
          });
          return false;
        }
      },

      resetPassword: async (token: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        
        try {
          await apiService.resetPassword(token, newPassword);
          set({ isLoading: false });
          return true;
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || error.message || 'Failed to reset password',
            isLoading: false
          });
          return false;
        }
      },

      getCurrentUser: async () => {
        const { token } = get();
        if (!token?.access_token) return false;
        
        try {
          const user = await apiService.getCurrentUser();
          set({ user, isAuthenticated: true });
          return true;
        } catch (error) {
          // If getting user fails, try to refresh token
          const refreshSuccess = await get().refreshToken();
          if (refreshSuccess) {
            try {
              const user = await apiService.getCurrentUser();
              set({ user, isAuthenticated: true });
              return true;
            } catch {
              get().logout({ endProviderSession: false });
              return false;
            }
          }
          return false;
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        authMethod: state.authMethod,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);
