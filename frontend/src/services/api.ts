import axios from 'axios';
import { config } from '../config/env';
// Circular by design: authStore imports apiService. Safe because both are only
// dereferenced inside functions at runtime, never at module evaluation.
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: config.apiTimeout,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  template_id?: number;
  is_submission?: boolean;
}

export interface ComplexityAnalysis {
  time_complexity: string;
  space_complexity: string;
  explanation: string;
  available: boolean;
}

export interface CodeExecutionResponse {
  output: string;
  error: string;
  execution_time: number;
  status: string;
  complexity?: ComplexityAnalysis;
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
  is_admin: boolean;
  created_at: string;
}

// Classroom interfaces
export interface ClassroomInfo {
  id: number;
  name: string;
  classroom_key: string;
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
  classrooms: ClassroomInfo[];
  created_at: string;
  updated_at: string;
  submission_deadline?: string;
  exclusions?: Array<{ user_id: number; deadline: string }>;
  can_submit?: boolean;
  user_submission?: { id: number; submitted_at: string };
}

export interface TemplateListItem {
  id: number;
  name: string;
  description?: string;
  language: string;
  created_by: number;
  creator_username: string;
  classrooms: ClassroomInfo[];
  created_at: string;
  updated_at: string;
  can_submit?: boolean;
  deadline_info?: string;
}

export interface TemplateCreate {
  name: string;
  description?: string;
  language: string;
  code_content: string;
  classroom_ids?: number[];
  submission_deadline?: string;
  exclusions?: Array<{ user_id: number; deadline: string }>;
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  code_content?: string;
  classroom_ids?: number[];
  submission_deadline?: string;
  exclusions?: Array<{ user_id: number; deadline: string }>;
}

export interface TemplateStats {
  total_templates: number;
  recent_templates: number;
  templates_by_language: Array<{ language: string; count: number }>;
}

export interface TemplateSubmissionRequest {
  code_content: string;
  execution_output?: string;
  execution_status?: string;
  execution_time?: number;
  memory_used?: number;
  error_message?: string;
}

export interface TemplateSubmission {
  id: number;
  template_id: number;
  user_id: number;
  submitted_code: string;
  submitted_at: string;
  output?: string;
  status: string;
  language?: string;
  execution_time?: number;
  memory_used?: number;
  error_message?: string;
  submitted_by_username?: string;
  template_name?: string;
}

export interface UserInfo {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
}

// Template Draft interfaces
export interface TemplateDraftSaveRequest {
  code_content: string;
  is_auto_save?: boolean;
}

export interface TemplateDraft {
  id: number;
  template_id: number;
  user_id: number;
  code_content: string;
  is_auto_save: boolean;
  created_at: string;
  updated_at: string;
  template_name?: string;
}

// Resume interfaces
export interface ResumeData {
  fullName: string;
  contactFields: Array<{ label: string; value: string }>;
  education: Array<{ school: string; degree: string; date: string }>;
  skillCategories: Array<{ label: string; skills: string }>;
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    subtitle: string;
    link: string;
    date: string;
    bullets: string[];
  }>;
}

export interface ResumeSaveRequest {
  title?: string;
  resume_data: ResumeData;
  section_order?: string[];
  section_titles?: Record<string, string>;
  font_family?: string;
  font_size?: number;
  margin?: number;
}

export interface ResumeResponse {
  id: number;
  title: string | null;
  resume_data: ResumeData;
  section_order: string[] | null;
  section_titles: Record<string, string> | null;
  font_family: string | null;
  font_size: number | null;
  margin: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuthToken {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  full_name?: string;
  classroom_key: string; // Required for students to join classroom
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
  role: string;
  status: string;
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

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
  },

  async changeUsername(newUsername: string): Promise<void> {
    await api.post('/auth/change-username', {
      new_username: newUsername,
    });
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

  async getAdminActivities(
    page: number = 1, 
    pageSize: number = 20, 
    activityType?: string, 
    status?: string,
    userEmail?: string,
    userName?: string
  ): Promise<any> {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });
    
    if (activityType) params.append('activity_type', activityType);
    if (status) params.append('status', status);
    if (userEmail) params.append('user_email', userEmail);
    if (userName) params.append('user_name', userName);
    
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

  // Admin Password Management
  async generateTempPassword(userId: number): Promise<{ message: string; temp_password: string; expires_in_hours: number }> {
    const response = await api.post(`/admin/users/${userId}/generate-temp-password`);
    return response.data;
  },

  async adminResetUsername(userId: number, newUsername: string): Promise<void> {
    await api.post(`/admin/users/${userId}/reset-username`, {
      user_id: userId,
      new_username: newUsername,
    });
  },
  
  async adminForceLogoutUser(userId: number): Promise<void> {
    await api.post(`/admin/users/${userId}/force-logout`);
  },

  // AI Grading endpoint
  async gradeSubmissionsBatch(request: {
    template_info: any;
    submissions: any[];
    grade_scale: number;
    leniency: number;
  }): Promise<any> {
    const response = await api.post('/admin/grade-submissions-batch', request);
    return response.data;
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

  async getAvailableClassrooms(): Promise<ClassroomInfo[]> {
    const response = await api.get('/admin/classrooms');
    return response.data;
  },

  // Template submission endpoints
  async submitTemplate(templateId: number, request: TemplateSubmissionRequest): Promise<TemplateSubmission> {
    const response = await api.post(`/templates/${templateId}/submit`, request);
    return response.data;
  },

  async canSubmitTemplate(templateId: number): Promise<{ can_submit: boolean; deadline_info?: string }> {
    const response = await api.get(`/templates/${templateId}/can-submit`);
    return response.data;
  },

  // Template draft endpoints
  async saveTemplateDraft(templateId: number, request: TemplateDraftSaveRequest): Promise<TemplateDraft> {
    const response = await api.post(`/templates/${templateId}/save-draft`, request);
    return response.data;
  },

  async getTemplateDraft(templateId: number): Promise<TemplateDraft | null> {
    try {
      const response = await api.get(`/templates/${templateId}/draft`);
      return response.data;
    } catch (error: any) {
      // Return null if no draft found
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async deleteTemplateDraft(templateId: number): Promise<{ message: string }> {
    const response = await api.delete(`/templates/${templateId}/draft`);
    return response.data;
  },

  async getUserDrafts(skip: number = 0, limit: number = 100): Promise<TemplateDraft[]> {
    const response = await api.get(`/my-drafts?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  async getClassroomUsers(classroomId: number): Promise<UserInfo[]> {
    const response = await api.get(`/admin/classrooms/${classroomId}/users`);
    return response.data;
  },

  async getTemplateSubmissions(
    templateId: number, 
    skip: number = 0, 
    limit: number = 100
  ): Promise<TemplateSubmission[]> {
    const response = await api.get(`/admin/templates/${templateId}/submissions?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  async getAllSubmissions(
    templateName?: string,
    user?: string, 
    language?: string,
    status?: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<TemplateSubmission[]> {
    const params = new URLSearchParams();
    if (templateName) params.append('template_name', templateName);
    if (user) params.append('user', user);
    if (language) params.append('language', language);
    if (status) params.append('status', status);
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    
    const response = await api.get(`/admin/submissions?${params.toString()}`);
    return response.data;
  },

  async getSubmissionsStats(templateId?: number): Promise<{
    total_submissions: number;
    success_submissions: number;
    error_submissions: number;
    success_rate: number;
    submissions_by_language: Array<{ language: string; count: number }>;
  }> {
    const params = templateId ? `?template_id=${templateId}` : '';
    const response = await api.get(`/admin/submissions/stats${params}`);
    return response.data;
  },

  async rerunSubmission(submissionId: number): Promise<any> {
    const response = await api.post(`/admin/submissions/${submissionId}/rerun`);
    return response.data;
  },

  // User submissions endpoints (for regular users to see their own submissions)
  async getUserSubmissions(
    templateName?: string,
    language?: string,
    status?: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<TemplateSubmission[]> {
    const params = new URLSearchParams();
    if (templateName) params.append('template_name', templateName);
    if (language) params.append('language', language);
    if (status) params.append('status', status);
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    
    const response = await api.get(`/my-submissions?${params.toString()}`);
    return response.data;
  },

  async getUserSubmissionsStats(): Promise<{
    total_submissions: number;
    success_submissions: number;
    error_submissions: number;
    success_rate: number;
    submissions_by_language: Array<{ language: string; count: number }>;
  }> {
    const response = await api.get('/my-submissions/stats');
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

  async getAssignments(skip: number = 0, limit: number = 50, cacheParams: any = {}): Promise<any[]> {
    const params = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      ...cacheParams
    });
    
    // Add no-cache headers when force refreshing
    const headers = cacheParams._t ? {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    } : {};
    
    const response = await api.get(`/assignments?${params.toString()}`, { headers });
    return response.data;
  },

  async getAssignment(assignmentId: number): Promise<any> {
    const response = await api.get(`/assignments/${assignmentId}`);
    return response.data;
  },

  async getAssignmentReport(assignmentId: number, cacheParam: string = ''): Promise<any> {
    // Add no-cache headers when force refreshing
    const headers = cacheParam ? {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    } : {};
    
    const response = await api.get(`/assignments/${assignmentId}/report${cacheParam}`, { headers });
    return response.data;
  },

  async getAssignmentSubmissions(assignmentId: number, cacheParam: string = ''): Promise<any[]> {
    // Add no-cache headers when force refreshing  
    const headers = cacheParam ? {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache', 
      'Expires': '0'
    } : {};
    
    const response = await api.get(`/assignments/${assignmentId}/submissions${cacheParam}`, { headers });
    return response.data;
  },

  async getSubmissionDetails(assignmentId: number, submissionId: number): Promise<any> {
    const response = await api.get(`/assignments/${assignmentId}/submissions/${submissionId}/details`);
    return response.data;
  },

  async exportAssignmentCSV(assignmentId: number): Promise<void> {
    const response = await api.get(`/assignments/${assignmentId}/export-csv`, {
      responseType: 'blob'
    });
    
    // Create download link
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Extract filename from Content-Disposition header if available
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'assignment_report.csv';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  async reprocessAssignment(assignmentId: number, gradingConfig?: { gradeOutOf?: number, leniency?: number }): Promise<void> {
    const body = gradingConfig ? {
      grade_out_of: gradingConfig.gradeOutOf,
      leniency: gradingConfig.leniency
    } : {};
    
    await api.post(`/assignments/${assignmentId}/reprocess`, body);
  },

  async deleteAssignment(assignmentId: number): Promise<void> {
    await api.delete(`/assignments/${assignmentId}`);
  },

  // Template execution endpoints
  async getTemplateExecutions(
    page: number = 1, 
    pageSize: number = 50, 
    templateId?: number,
    templateName?: string,
    userEmail?: string,
    userName?: string,
    language?: string,
    status?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<any> {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    
    if (templateId) params.append('template_id', templateId.toString());
    if (templateName) params.append('template_name', templateName);
    if (userEmail) params.append('user_email', userEmail);
    if (userName) params.append('user_name', userName);
    if (language) params.append('language', language);
    if (status) params.append('status', status);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);

    const response = await api.get(`/admin/template-executions?${params.toString()}`);
    return response.data;
  },

  // Get templates for dropdown filter (ADMIN ONLY)
  // ⚠️  SECURITY: This calls /admin/templates-list - only use in admin components!
  async getTemplatesList(): Promise<any> {
    const response = await api.get('/admin/templates-list');
    return response.data;
  },

  // Get templates for regular users (safe for all authenticated users)
  // ✅ SECURITY: This calls /templates - use this for non-admin components
  async getUserTemplatesList(): Promise<any> {
    const response = await api.get('/templates');
    return response.data;
  },

  // Get users for dropdown filters (ADMIN ONLY)
  // ⚠️  SECURITY: This calls /admin/users-list - only use in admin components!
  async getUsersList(): Promise<any> {
    const response = await api.get('/admin/users-list');
    return response.data;
  },

  // Admin Settings Management
  async getAdminSettings(): Promise<any> {
    const response = await api.get('/admin/settings');
    return response.data;
  },

  async updateAdminSettings(settings: any): Promise<any> {
    const response = await api.put('/admin/settings', settings);
    return response.data;
  },

  // Per-classroom admin settings
  async getClassroomAdminSettings(classroomId: number): Promise<any> {
    const response = await api.get(`/admin/classrooms/${classroomId}/settings`);
    return response.data;
  },

  async updateClassroomAdminSettings(classroomId: number, settings: any): Promise<any> {
    const response = await api.put(`/admin/classrooms/${classroomId}/settings`, settings);
    return response.data;
  },

  async getPublicAdminSettings(): Promise<any> {
    const response = await api.get('/admin/settings/public');
    return response.data;
  },

  async getUserAdminSettings(): Promise<any> {
    const response = await api.get('/admin/settings/user');
    return response.data;
  },

  // User Templates (Personal Templates)
  async createUserTemplate(templateData: {
    name: string;
    description?: string;
    language: string;
    code_content: string;
  }): Promise<any> {
    const response = await api.post('/user-templates', templateData);
    return response.data;
  },

  async getUserTemplates(language?: string): Promise<any[]> {
    const params = language ? { language } : {};
    const response = await api.get('/user-templates', { params });
    return response.data;
  },

  async getUserTemplate(templateId: number): Promise<any> {
    const response = await api.get(`/user-templates/${templateId}`);
    return response.data;
  },

  async updateUserTemplate(templateId: number, updateData: {
    name?: string;
    description?: string;
    code_content?: string;
  }): Promise<any> {
    const response = await api.put(`/user-templates/${templateId}`, updateData);
    return response.data;
  },

  async deleteUserTemplate(templateId: number): Promise<void> {
    await api.delete(`/user-templates/${templateId}`);
  },

  // Classroom endpoints
  async getMyClassrooms(): Promise<any[]> {
    const response = await api.get('/classrooms/my');
    return response.data;
  },

  async createClassroom(classroomData: {
    name: string;
    description?: string;
    classroom_key?: string;
    max_members?: number;
    allow_collaboration?: boolean;
  }): Promise<any> {
    const response = await api.post('/classrooms', classroomData);
    return response.data;
  },

  async getClassroom(classroomId: number): Promise<any> {
    const response = await api.get(`/classrooms/${classroomId}`);
    return response.data;
  },

  async updateClassroom(classroomId: number, updateData: {
    name?: string;
    description?: string;
    max_members?: number;
    allow_collaboration?: boolean;
  }): Promise<any> {
    const response = await api.put(`/classrooms/${classroomId}`, updateData);
    return response.data;
  },

  async joinClassroom(classroomKey: string): Promise<any> {
    const response = await api.post('/classrooms/join', { classroom_key: classroomKey });
    return response.data;
  },

  async getClassroomMembers(classroomId: number): Promise<any[]> {
    const response = await api.get(`/classrooms/${classroomId}/members`);
    return response.data;
  },

  async leaveClassroom(classroomId: number): Promise<void> {
    await api.delete(`/classrooms/${classroomId}/leave`);
  },

  async getClassroomStats(classroomId: number): Promise<any> {
    const response = await api.get(`/classrooms/${classroomId}/stats`);
    return response.data;
  },

  async removeClassroomMember(classroomId: number, memberId: number): Promise<void> {
    await api.delete(`/classrooms/${classroomId}/members/${memberId}`);
  },

  async inviteToClassroom(classroomId: number, email: string): Promise<any> {
    const response = await api.post(`/classrooms/${classroomId}/invite`, { email });
    return response.data;
  },

  async addStudentToClassroom(classroomId: number, email: string): Promise<any> {
    const response = await api.post(`/classrooms/${classroomId}/add-student`, { email });
    return response.data;
  },

  async deleteClassroom(classroomId: number): Promise<any> {
    const response = await api.delete(`/classrooms/${classroomId}`);
    return response.data;
  },

  // RBAC Management
  async manageParticipant(shareId: string, participantId: number, action: {
    action: string;
    role?: string;
  }): Promise<any> {
    const response = await api.post(`/collaboration/sessions/${shareId}/manage-participant/${participantId}`, action);
    return response.data;
  },

  async getPendingParticipants(shareId: string): Promise<ParticipantResponse[]> {
    const response = await api.get(`/collaboration/sessions/${shareId}/pending-participants`);
    return response.data;
  },

  async batchManageAdmissions(shareId: string, requests: Array<{
    participant_id: number;
    action: string;
  }>): Promise<any> {
    const response = await api.post(`/collaboration/sessions/${shareId}/batch-admission`, requests);
    return response.data;
  },

  // Analytics endpoints
  async getPersonalAnalytics(): Promise<any> {
    const response = await api.get('/analytics/user/personal');
    return response.data;
  },

  // Admin analytics endpoints
  async getAdminAnalyticsOverview(): Promise<any> {
    const response = await api.get('/analytics/admin/overview');
    return response.data;
  },

  async getStudentAnalyticsForAdmin(studentId: number): Promise<any> {
    const response = await api.get(`/analytics/admin/student/${studentId}`);
    return response.data;
  },

  async getClassroomAnalytics(classroomId: number): Promise<any> {
    const response = await api.get(`/analytics/admin/classroom/${classroomId}`);
    return response.data;
  },

  async getFilteredStudentAnalytics(params: {
    classroom_id?: number;
    risk_level?: string;
    min_success_rate?: number;
    max_success_rate?: number;
  }): Promise<any> {
    const response = await api.get('/analytics/admin/students', { params });
    return response.data;
  },

  // Resume endpoints
  async saveResume(data: ResumeSaveRequest): Promise<ResumeResponse> {
    const response = await api.post('/resumes/', data);
    return response.data;
  },

  async getResumes(): Promise<ResumeResponse[]> {
    const response = await api.get('/resumes/');
    return response.data;
  },

  async getResume(resumeId: number): Promise<ResumeResponse> {
    const response = await api.get(`/resumes/${resumeId}`);
    return response.data;
  },

  async updateResume(resumeId: number, data: ResumeSaveRequest): Promise<ResumeResponse> {
    const response = await api.put(`/resumes/${resumeId}`, data);
    return response.data;
  },

  async deleteResume(resumeId: number): Promise<void> {
    await api.delete(`/resumes/${resumeId}`);
  },
};

// The auth store is the single source of truth for tokens. Imported for its
// getState()/actions only - never read or written through localStorage here,
// which would desync zustand's in-memory copy from its persisted one.
api.interceptors.request.use(
  (config) => {
    const accessToken = useAuthStore.getState().token?.access_token;
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: refresh once on 401, then retry the original request.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Never recurse through the refresh call itself.
    const isRefreshRequest = originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest?._retry && !isRefreshRequest) {
      originalRequest._retry = true;

      const { token, refreshToken, logout } = useAuthStore.getState();

      if (token?.refresh_token) {
        // The store decides whether to refresh against this backend or Zitadel.
        const refreshed = await refreshToken();
        if (refreshed) {
          const newAccess = useAuthStore.getState().token?.access_token;
          if (newAccess) {
            originalRequest.headers.Authorization = `Bearer ${newAccess}`;
            return api(originalRequest);
          }
        }
      } else {
        // 401 with nothing to refresh - drop the stale session.
        logout();
      }
    }

    if (error.response?.status !== 401) {
      console.error('API Error:', error);
    }

    return Promise.reject(error);
  }
);

export default apiService;
