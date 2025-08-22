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
  classroom_id?: number;
}

interface AdminSettingsState {
  settings: AdminSettings;
  isLoading: boolean;
  error: string | null;
  socket: Socket | null;
  currentClassroomId: number | null;
  
  // Actions
  loadSettings: (isAuthenticated?: boolean) => Promise<void>;
  updateSettings: (settings: Partial<AdminSettings>) => Promise<boolean>;
  updateClassroomSettings: (classroomId: number, settings: Partial<AdminSettings>) => Promise<boolean>;
  clearError: () => void;
  initializeWebSocket: (userId?: number, classroomIds?: number[]) => void;
  disconnectWebSocket: () => void;
  setCurrentClassroom: (classroomId: number | null) => void;
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
      currentClassroomId: null,

      loadSettings: async (isAuthenticated: boolean = false) => {
        set({ isLoading: true, error: null });
        
        try {
          // Use user-specific endpoint for authenticated users, public for non-authenticated
          const settings = isAuthenticated 
            ? await apiService.getUserAdminSettings()
            : await apiService.getPublicAdminSettings();
          
          set({
            settings: {
              copy_paste_enabled: settings.copy_paste_enabled,
              classroom_id: settings.classroom_id,
            },
            isLoading: false,
            // Set current classroom if provided
            currentClassroomId: settings.classroom_id || null,
          });
        } catch (error: any) {
          console.error('Failed to load admin settings:', error);
          
          // If user-specific call failed for authenticated user, try public endpoint as fallback
          if (isAuthenticated && error.response?.status === 401) {
            try {
              const fallbackSettings = await apiService.getPublicAdminSettings();
              set({
                settings: {
                  copy_paste_enabled: fallbackSettings.copy_paste_enabled,
                },
                isLoading: false,
              });
              return;
            } catch (fallbackError) {
              // Continue to error handling below
            }
          }
          
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

      updateClassroomSettings: async (classroomId: number, settingsUpdate: Partial<AdminSettings>) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await apiService.updateClassroomAdminSettings(classroomId, settingsUpdate);
          
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
            error: error.response?.data?.detail || error.message || 'Failed to update classroom settings',
            isLoading: false,
          });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      initializeWebSocket: (userId?: number, classroomIds?: number[]) => {
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

          // Listen for admin settings changes (classroom-specific)
          newSocket.on('admin_settings_changed', (data) => {
            console.log('📡 Received admin settings update:', data);
            
            // Only update if the change is for current classroom or no classroom filter
            const { currentClassroomId } = get();
            if (!data.classroom_id || !currentClassroomId || data.classroom_id === currentClassroomId) {
              set((state) => ({
                settings: {
                  ...state.settings,
                  copy_paste_enabled: data.copy_paste_enabled,
                  updated_by: data.updated_by,
                  classroom_id: data.classroom_id,
                },
              }));
            }
          });

          newSocket.on('connect', () => {
            console.log('🔌 Connected to admin settings websocket');
            
            // Join classroom rooms if user and classrooms are provided
            if (userId && classroomIds && classroomIds.length > 0) {
              console.log(`🏫 Joining ${classroomIds.length} classroom rooms for user ${userId}`);
              classroomIds.forEach(classroomId => {
                newSocket.emit('join_classroom', {
                  classroom_id: classroomId,
                  user_id: userId
                });
                console.log(`🏫 Joining classroom room: ${classroomId}`);
              });
            } else {
              console.log('⚠️ No user ID or classroom IDs provided for WebSocket');
            }
          });

          newSocket.on('classroom_joined', (data) => {
            console.log(`🏫 Joined classroom room: ${data.room} for classroom ${data.classroom_id}`);
          });

          newSocket.on('classroom_left', (data) => {
            console.log(`🏫 Left classroom room: ${data.room} for classroom ${data.classroom_id}`);
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

      setCurrentClassroom: (classroomId: number | null) => {
        set({ currentClassroomId: classroomId });
      },
    }),
    {
      name: 'admin-settings-storage',
      partialize: (state) => ({ 
        settings: state.settings,
        currentClassroomId: state.currentClassroomId,
      }),
    }
  )
);
