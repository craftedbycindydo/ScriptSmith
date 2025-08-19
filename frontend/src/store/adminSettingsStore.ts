import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '../services/api';
import { io, Socket } from 'socket.io-client';
import { config } from '../config/env';

export interface AdminSettings {
  copy_paste_enabled: boolean;
  updated_by?: string;
  updated_at?: string;
  notes?: string;
}

interface AdminSettingsState {
  settings: AdminSettings;
  isLoading: boolean;
  error: string | null;
  socket: Socket | null;
  
  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AdminSettings>) => Promise<boolean>;
  clearError: () => void;
  initializeWebSocket: () => void;
  disconnectWebSocket: () => void;
}

const WEBSOCKET_URL = config.websocketUrl;

export const useAdminSettingsStore = create<AdminSettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        copy_paste_enabled: true, // Default value
      },
      isLoading: false,
      error: null,
      socket: null,

      loadSettings: async () => {
        set({ isLoading: true, error: null });
        
        try {
          // Try to get from public endpoint (no auth required)
          const publicSettings = await apiService.getPublicAdminSettings();
          
          set({
            settings: {
              copy_paste_enabled: publicSettings.copy_paste_enabled,
            },
            isLoading: false,
          });
        } catch (error: any) {
          console.error('Failed to load admin settings:', error);
          set({
            error: error.response?.data?.detail || error.message || 'Failed to load settings',
            isLoading: false,
            // Keep default settings on error
            settings: { copy_paste_enabled: true }
          });
        }
      },

      updateSettings: async (settingsUpdate: Partial<AdminSettings>) => {
        set({ isLoading: true, error: null });
        
        try {
          // This requires admin authentication
          const response = await apiService.updateAdminSettings(settingsUpdate);
          
          set({
            settings: {
              ...get().settings,
              ...response.settings,
            },
            isLoading: false,
          });
          
          return true;
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || error.message || 'Failed to update settings',
            isLoading: false,
          });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      initializeWebSocket: () => {
        const { socket } = get();
        
        // Don't create multiple connections
        if (socket?.connected) {
          return;
        }
        
        try {
          const newSocket = io(WEBSOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 5000,
          });

          // Listen for admin settings changes
          newSocket.on('admin_settings_changed', (data) => {
            console.log('📡 Received admin settings update:', data);
            
            set((state) => ({
              settings: {
                ...state.settings,
                copy_paste_enabled: data.copy_paste_enabled,
                updated_by: data.updated_by,
              },
            }));
          });

          newSocket.on('connect', () => {
            console.log('🔌 Connected to admin settings websocket');
          });

          newSocket.on('disconnect', () => {
            console.log('🔌 Disconnected from admin settings websocket');
          });

          newSocket.on('connect_error', (error) => {
            console.error('❌ Admin settings websocket connection error:', error);
          });

          set({ socket: newSocket });
          
        } catch (error) {
          console.error('Failed to initialize admin settings websocket:', error);
        }
      },

      disconnectWebSocket: () => {
        const { socket } = get();
        
        if (socket) {
          socket.disconnect();
          set({ socket: null });
        }
      },
    }),
    {
      name: 'admin-settings-storage',
      partialize: (state) => ({ 
        settings: state.settings,
      }),
    }
  )
);
