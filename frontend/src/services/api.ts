import axios from 'axios';
import { config } from '../config/env';

const api = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: config.apiTimeout,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add any auth tokens in the future
api.interceptors.request.use(
  (config) => {
    // Add auth token here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export interface Language {
  id: string;
  name: string;
  version: string;
  extension: string;
}

export interface CodeExecutionRequest {
  code: string;
  language: string;
  input_data?: string;
}

export interface CodeExecutionResponse {
  output: string;
  error: string;
  execution_time: number;
  status: string;
}

export interface CodeValidationRequest {
  code: string;
  language: string;
}

export interface CodeValidationResponse {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CodeHistoryItem {
  id: number;
  code: string;
  language: string;
  input_data?: string;
  output?: string;
  error_message?: string;
  execution_time?: number;
  status?: string;
  created_at: string;
  executed_at?: string;
}

export interface CodeHistoryResponse {
  history: CodeHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

// Auth interfaces
export interface User {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

// Template interfaces
export interface Template {
  id: number;
  name: string;
  description?: string;
  language: string;
  code_content: string;
  created_by: number;
  creator_username: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateListItem {
  id: number;
  name: string;
  description?: string;
  language: string;
  created_by: number;
  creator_username: string;
  created_at: string;
}

export interface TemplateCreate {
  name: string;
  description?: string;
  language: string;
  code_content: string;
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  code_content?: string;
}

export interface TemplateStats {
  total_templates: number;
  recent_templates: number;
  templates_by_language: Array<{ language: string; count: number }>;
}

export interface AuthToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}

// Collaboration interfaces
export interface CreateSessionRequest {
  title?: string;
  description?: string;
  language: string;
  is_public: boolean;
  max_collaborators: number;
  initial_code?: string;
}

export interface SessionResponse {
  id: number;
  share_id: string;
  title?: string;
  description?: string;
  language: string;
  is_active: boolean;
  is_public: boolean;
  max_collaborators: number;
  code_content?: string;
  owner_username: string;
  participant_count: number;
  created_at: string;
  updated_at?: string;
}

export interface ParticipantResponse {
  id: number;
  username: string;
  is_connected: boolean;
  cursor_color?: string;
  is_owner: boolean;
  joined_at: string;
}

export interface SessionDetailsResponse {
  session: SessionResponse;
  participants: ParticipantResponse[];
  is_participant: boolean;
  user_participant_id?: number;
}

export interface JoinSessionRequest {
  username: string;
}

// API functions
export const apiService = {
  // Health check
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
  },

  // Get supported languages
  async getLanguages(): Promise<{ languages: Language[]; total: number }> {
    const response = await api.get('/languages');
    return response.data;
  },

  // Get language template
  async getLanguageTemplate(languageId: string): Promise<{ language: string; template: string; extension: string }> {
    const response = await api.get(`/languages/${languageId}/template`);
    return response.data;
  },

  // Execute code
  async executeCode(request: CodeExecutionRequest): Promise<CodeExecutionResponse> {
    const response = await api.post('/code/execute', request);
    return response.data;
  },

  // Validate code
  async validateCode(request: CodeValidationRequest): Promise<CodeValidationResponse> {
    const response = await api.post('/code/validate', request);
    return response.data;
  },

  // Get code execution history
  async getCodeHistory(page: number = 1, pageSize: number = 20): Promise<CodeHistoryResponse> {
    const response = await api.get(`/code/history?page=${page}&page_size=${pageSize}`);
    return response.data;
  },

  // Authentication endpoints
  async login(formData: FormData): Promise<AuthToken> {
    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  async register(userData: RegisterRequest): Promise<User> {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get('/auth/me');
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<AuthToken> {
    const response = await api.post('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  // Collaboration endpoints
  async createSession(request: CreateSessionRequest): Promise<SessionResponse> {
    const response = await api.post('/collaboration/sessions', request);
    return response.data;
  },

  async getSessionDetails(shareId: string): Promise<SessionDetailsResponse> {
    const response = await api.get(`/collaboration/sessions/${shareId}`);
    return response.data;
  },

  async joinSession(shareId: string, request: JoinSessionRequest): Promise<{participant_id: number; message: string; session_id: number; username: string}> {
    const response = await api.post(`/collaboration/sessions/${shareId}/join`, request);
    return response.data;
  },

  async listSessions(page: number = 1, pageSize: number = 20, publicOnly: boolean = false): Promise<SessionResponse[]> {
    const response = await api.get(`/collaboration/sessions?page=${page}&page_size=${pageSize}&public_only=${publicOnly}`);
    return response.data;
  },

  async deleteSession(shareId: string): Promise<void> {
    await api.delete(`/collaboration/sessions/${shareId}`);
  },

  // Admin endpoints
  async getAdminStats(): Promise<any> {
    const response = await api.get('/admin/stats');
    return response.data;
  },

  async getAdminActivities(page: number = 1, pageSize: number = 20, activityType?: string, status?: string): Promise<any> {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });
    
    if (activityType) params.append('activity_type', activityType);
    if (status) params.append('status', status);
    
    const response = await api.get(`/admin/activities?${params}`);
    return response.data;
  },

  async getAdminUsers(page: number = 1, pageSize: number = 20, search?: string): Promise<any> {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });
    
    if (search) params.append('search', search);
    
    const response = await api.get(`/admin/users?${params}`);
    return response.data;
  },

  async getUserDetails(userId: number): Promise<any> {
    const response = await api.get(`/admin/users/${userId}`);
    return response.data;
  },

  async deactivateUser(userId: number): Promise<void> {
    await api.delete(`/admin/users/${userId}`);
  },

  async activateUser(userId: number): Promise<void> {
    await api.post(`/admin/users/${userId}/activate`);
  },

  // Template endpoints
  async getTemplates(language?: string): Promise<TemplateListItem[]> {
    const params = language ? `?language=${encodeURIComponent(language)}` : '';
    const response = await api.get(`/templates${params}`);
    return response.data;
  },

  async getTemplate(templateId: number): Promise<Template> {
    const response = await api.get(`/templates/${templateId}`);
    return response.data;
  },

  // Admin template endpoints
  async createTemplate(template: TemplateCreate): Promise<Template> {
    const response = await api.post('/admin/templates', template);
    return response.data;
  },

  async getAllTemplatesAdmin(skip: number = 0, limit: number = 100): Promise<TemplateListItem[]> {
    const response = await api.get(`/admin/templates?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  async getTemplateAdmin(templateId: number): Promise<Template> {
    const response = await api.get(`/admin/templates/${templateId}`);
    return response.data;
  },

  async updateTemplate(templateId: number, template: TemplateUpdate): Promise<Template> {
    const response = await api.put(`/admin/templates/${templateId}`, template);
    return response.data;
  },

  async deleteTemplate(templateId: number): Promise<void> {
    await api.delete(`/admin/templates/${templateId}`);
  },

  async getTemplateStats(): Promise<TemplateStats> {
    const response = await api.get('/admin/templates/stats');
    return response.data;
  },

  // Note: Direct file upload endpoint available but not used in current flow
  // Templates are now created through the regular create endpoint after file content is loaded in UI
  async uploadTemplateFile(file: File, name?: string, description?: string, language?: string): Promise<Template> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (description) formData.append('description', description);
    if (language) formData.append('language', language);

    const response = await api.post('/admin/templates/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Assignment endpoints
  async createAssignment(formData: FormData): Promise<any> {
    const response = await api.post('/assignments', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async getAssignments(skip: number = 0, limit: number = 50): Promise<any[]> {
    const response = await api.get(`/assignments?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  async getAssignment(assignmentId: number): Promise<any> {
    const response = await api.get(`/assignments/${assignmentId}`);
    return response.data;
  },

  async getAssignmentReport(assignmentId: number): Promise<any> {
    const response = await api.get(`/assignments/${assignmentId}/report`);
    return response.data;
  },

  async getAssignmentSubmissions(assignmentId: number): Promise<any[]> {
    const response = await api.get(`/assignments/${assignmentId}/submissions`);
    return response.data;
  },

  async getSubmissionDetails(assignmentId: number, submissionId: number): Promise<any> {
    const response = await api.get(`/assignments/${assignmentId}/submissions/${submissionId}/details`);
    return response.data;
  },

  async reprocessAssignment(assignmentId: number): Promise<void> {
    await api.post(`/assignments/${assignmentId}/reprocess`);
  },

  async deleteAssignment(assignmentId: number): Promise<void> {
    await api.delete(`/assignments/${assignmentId}`);
  },
};

// Axios interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    // Get token from auth store
    const authData = localStorage.getItem('auth-storage');
    if (authData) {
      try {
        const { state } = JSON.parse(authData);
        if (state?.token?.access_token) {
          config.headers.Authorization = `Bearer ${state.token.access_token}`;
        }
      } catch (error) {
        console.error('Error parsing auth data:', error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Try to refresh token
      const authData = localStorage.getItem('auth-storage');
      if (authData) {
        try {
          const { state } = JSON.parse(authData);
          if (state?.token?.refresh_token) {
            const newToken = await apiService.refreshToken(state.token.refresh_token);
            
            // Update stored token
            const updatedState = {
              ...state,
              token: newToken
            };
            localStorage.setItem('auth-storage', JSON.stringify({ state: updatedState }));
            
            // Retry original request with new token
            originalRequest.headers.Authorization = `Bearer ${newToken.access_token}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed, clear auth data
          localStorage.removeItem('auth-storage');
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiService;
