import type { User } from '@/store/authStore';

export type Classroom = NonNullable<User['classroom_context']>['classrooms'][number];

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login?: string;
  code_executions: number;
  collaboration_sessions: number;
}

export interface TemplateExecution {
  id: number;
  user_id?: number;
  username?: string;
  email?: string;
  full_name?: string;
  template_id?: number;
  template_name?: string;
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

export interface ResetUsernameDialogState {
  open: boolean;
  userId: number | null;
  newUsername: string;
  currentUsername: string;
}

export interface TempPasswordConfirmState {
  open: boolean;
  userId: number | null;
  username: string;
}

export interface TempPasswordResult {
  userId: number;
  password: string;
  createdAt: number;
}

export interface AdminActivity {
  id: number;
  user_id?: number;
  username?: string;
  email?: string;
  activity_type: string;
  activity_data: Record<string, any>;
  timestamp: string;
  status?: string;
  error_message?: string;
}
