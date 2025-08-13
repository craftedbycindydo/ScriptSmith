import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '../services/api';

export interface User {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface AuthState {
  user: User | null;
  token: AuthToken | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, password: string, fullName?: string) => Promise<boolean>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
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
          set({ token: tokenResponse });
          
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

      register: async (email: string, username: string, password: string, fullName?: string) => {
        set({ isLoading: true, error: null });
        
        try {
          await apiService.register({
            email,
            username,
            password,
            full_name: fullName
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

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null
        });
      },

      refreshToken: async () => {
        const { token } = get();
        if (!token?.refresh_token) return false;
        
        try {
          const newToken = await apiService.refreshToken(token.refresh_token);
          set({ token: newToken });
          return true;
        } catch (error) {
          // If refresh fails, logout
          get().logout();
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
              get().logout();
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
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);
