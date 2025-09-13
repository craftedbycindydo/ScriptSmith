import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';


import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/authStore';
import { useAdminSettingsStore } from '@/store/adminSettingsStore';
import { 
  useAdminStats, 
  useAdminActivities, 
  useAdminUsers, 
  useTemplateExecutions,
  useTemplatesOptions,
  useUsersOptions,
  useClassroomMembers,
  useClassroomSettings,
  useToggleUserActivation,
  useCreateClassroom,
  useDeleteClassroom,
  useAddStudentToClassroom,
  useRemoveClassroomMember,
  useUpdateClassroomSettings,
  useGenerateTempPassword,
  useAdminResetUsername,
  useAdminForceLogoutUser
} from '@/hooks/useAdminData';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/dateUtils';
import AssignmentUpload from './AssignmentUpload';
import AssignmentReports from './AssignmentReports';
import TemplateManager from './TemplateManager';
import CodeEditor from './CodeEditor';
import OutputConsole from './OutputConsole';
import TemplateSubmissions from './TemplateSubmissions';
import AdminAnalytics from './AdminAnalytics';
import { 
  Users, 
  Activity, 
  Code, 
  Share2, 
  AlertTriangle, 
  TrendingUp,
  Send,
  Search,
  Eye,
  EyeOff,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
  ChevronDown,
  Menu,
  BarChart3,
  Play,
  RefreshCw,
  UserMinus,
  UserPlus,
  Plus,
  Copy,
  Check,
  PanelLeft,
  PanelLeftOpen,
  X,
  Trash2,
  Key,
  RefreshCcw
} from 'lucide-react';

// Classroom Members List Component
interface ClassroomMembersListProps {
  classroomId: number;
  members: any[];
  isLoading: boolean;
  handleRemoveMemberClick: (classroomId: number, memberId: number, memberName: string) => void;
  handleAddStudentByEmail: (classroomId: number) => void;
  studentEmails: {[key: number]: string};
  setStudentEmails: any;
  addingStudent: {[key: number]: boolean};
  userSearchError: string | null;
  setUserSearchError: any;
  classroom: any;
}

function ClassroomMembersList({
  classroomId,
  members,
  isLoading,
  handleRemoveMemberClick,
  handleAddStudentByEmail,
  studentEmails,
  setStudentEmails,
  addingStudent,
  userSearchError,
  setUserSearchError,
  classroom
}: ClassroomMembersListProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span className="text-sm text-muted-foreground">Loading members...</span>
        </div>
      </div>
    );
  }
  
  if (members && members.length > 0) {
    return (
      <div className="divide-y">
        {members.map((member: any) => (
          <div key={member.id} className="p-4 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <div className="font-medium">{member.username}</div>
                <Badge variant={member.role === 'TEACHER' ? 'default' : 'secondary'} className="text-xs">
                  {member.role}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {member.email}
              </div>
              <div className="text-xs text-muted-foreground">
                Joined: {formatDate(member.joined_at)}
              </div>
            </div>
            {member.role !== 'TEACHER' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemoveMemberClick(classroomId, member.id, member.username)}
                className="text-red-600 hover:text-red-700 hover:border-red-300"
              >
                <UserMinus className="w-3 h-3 mr-1" />
                Remove
              </Button>
            )}
          </div>
        ))}
        
        {/* Add student by email */}
        <div className="p-4 border-t bg-muted/10">
          <div className="space-y-3">
            <div className="font-medium text-sm">Add Student by Email</div>
            <div className="flex space-x-2">
              <Input
                placeholder="student@example.com"
                type="email"
                value={studentEmails[classroomId] || ''}
                onChange={(e) => {
                  setStudentEmails((prev: any) => ({ 
                    ...prev, 
                    [classroomId]: e.target.value 
                  }));
                  if (userSearchError) setUserSearchError(null);
                }}
                className={`flex-1 ${userSearchError ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                disabled={addingStudent[classroomId]}
              />
              <Button
                onClick={() => handleAddStudentByEmail(classroomId)}
                disabled={addingStudent[classroomId] || !studentEmails[classroomId]?.trim()}
                size="sm"
              >
                {addingStudent[classroomId] ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3 h-3 mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>
            
            {userSearchError && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {userSearchError}
              </div>
            )}
            
            <div className="text-xs text-muted-foreground">
              Add existing users to this classroom by their registered email address.
            </div>
          </div>
        </div>

        {/* Registration instructions */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border-t">
          <div className="text-sm">
            <div className="font-medium text-blue-900 dark:text-blue-100 mb-2">
              For New Students
            </div>
            <div className="text-blue-700 dark:text-blue-200">
              Share the classroom key <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">{classroom.key}</code> so new students can register for this classroom.
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4 text-center text-muted-foreground">
      <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p>No members found</p>
    </div>
  );
}

interface AdminUser {
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

interface TemplateExecution {
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

export default function AdminDashboard() {
  const { user, isAuthenticated, refreshUser } = useAuthStore();
  const { 
    loadSettings: loadAdminSettings,
    initializeWebSocket,
    disconnectWebSocket,
    setCurrentClassroom
  } = useAdminSettingsStore();
  const navigate = useNavigate();
  
  // Tab state - must be declared before React Query hooks
  const [activeTab, setActiveTab] = useState('overview');
  
  // SMART LAZY LOADING - Critical data loads immediately, heavy data loads on demand
  const [heavyDataLoadTrigger, setHeavyDataLoadTrigger] = useState(false);
  
  // Trigger heavy data loading after page is interactive
  useEffect(() => {
    const timer = setTimeout(() => {
      setHeavyDataLoadTrigger(true);
    }, 100); // Shorter delay to ensure heavy queries load too
    return () => clearTimeout(timer);
  }, []);
  
  // React Query hooks - Stats load immediately for instant data, others lazy load
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useAdminStats(
    activeTab === 'overview' // Stats load immediately when on overview tab
  );
  
  // Only load data when the specific tab is active AND data loading is triggered
  const { data: adminUsers = [], isLoading: usersLoading, refetch: refetchUsers } = useAdminUsers(
    activeTab === 'overview' || activeTab === 'users' // Users load immediately for overview and users tab
  );
  const { data: activities = [], isLoading: activitiesLoading } = useAdminActivities(
    activeTab === 'overview' // Activities load immediately on overview tab for better UX
  );
  const { data: templateExecutions = [] } = useTemplateExecutions(
    heavyDataLoadTrigger && activeTab === 'template-executions'
  );
  const { data: templatesOptions = [] } = useTemplatesOptions(
    heavyDataLoadTrigger && (activeTab === 'templates' || activeTab === 'template-executions' || activeTab === 'template-submissions')
  );
  const { data: usersOptions = [] } = useUsersOptions(
    heavyDataLoadTrigger && (activeTab === 'template-executions' || activeTab === 'template-submissions')
  );
  
  // Mutations for user actions
  const toggleUserMutation = useToggleUserActivation();
  const createClassroomMutation = useCreateClassroom();
  const deleteClassroomMutation = useDeleteClassroom();
  const addStudentMutation = useAddStudentToClassroom();
  const removeStudentMutation = useRemoveClassroomMember();
  const updateSettingsMutation = useUpdateClassroomSettings();
  
  // Password management mutations
  const generateTempPasswordMutation = useGenerateTempPassword();
  const adminResetUsernameMutation = useAdminResetUsername();
  const adminForceLogoutMutation = useAdminForceLogoutUser();
  
  // INSTANT LOADING - Never block page render, show skeleton instead
  const loading = false; // Always render page immediately
  
  // User search error state
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  
  // Get admin status from user data (server-side validated)
  const isAdmin = user?.is_admin || false;
  
  // Filters
  const [activityType, setActivityType] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  
  // Password management state
  const [tempPasswordResult, setTempPasswordResult] = useState<{ userId: number; password: string; createdAt: number } | null>(null);
  const [tempPasswordUpdateTrigger, setTempPasswordUpdateTrigger] = useState(0);
  const [resetUsernameDialog, setResetUsernameDialog] = useState<{ open: boolean; userId: number | null; newUsername: string; currentUsername: string }>({
    open: false,
    userId: null,
    newUsername: '',
    currentUsername: ''
  });
  const [tempPasswordConfirmDialog, setTempPasswordConfirmDialog] = useState<{ open: boolean; userId: number | null; username: string }>({
    open: false,
    userId: null,
    username: ''
  });
  const [userActivationDialog, setUserActivationDialog] = useState<{ 
    open: boolean; 
    userId: number | null; 
    username: string;
    currentStatus: boolean;
    action: 'activate' | 'deactivate';
  }>({
    open: false,
    userId: null,
    username: '',
    currentStatus: false,
    action: 'activate'
  });
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [tempPasswordVisibility, setTempPasswordVisibility] = useState<{ [userId: number]: boolean }>({});
  
  // Activity filters
  const [activityUserFilter, setActivityUserFilter] = useState('all');
  
  // Use React Query data directly for client-side filtering (2025 best practice)
  const allActivities = activities?.activities || [];
  const allTemplateExecutions = templateExecutions?.executions || [];
  
  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Template execution states
  const [templateExecutionsPage, setTemplateExecutionsPage] = useState(1);
  const [expandedExecution, setExpandedExecution] = useState<number | null>(null);
  
  // Member management states
  const [expandedClassroom, setExpandedClassroom] = useState<number | null>(null);
  
  // Classroom creation states
  const [isCreatingClassroom, setIsCreatingClassroom] = useState(false);
  const [newClassroom, setNewClassroom] = useState({
    name: '',
    description: '',
    maxMembers: ''
  });
  const [classroomCreationError, setClassroomCreationError] = useState<string>('');
  const [classroomCreationSuccess, setClassroomCreationSuccess] = useState<string>('');
  const [creatingClassroom, setCreatingClassroom] = useState(false);
  
  // Remove member modal states
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{classroomId: number, memberId: number, memberName: string} | null>(null);
  
  // Delete classroom modal states
  const [deleteClassroomModalOpen, setDeleteClassroomModalOpen] = useState(false);
  const [classroomToDelete, setClassroomToDelete] = useState<{id: number, name: string, memberCount: number} | null>(null);
  const [deletingClassroom, setDeletingClassroom] = useState(false);
  
  // Add student states
  const [addingStudent, setAddingStudent] = useState<{[key: number]: boolean}>({});
  const [studentEmails, setStudentEmails] = useState<{[key: number]: string}>({});
  
  // Copy key feedback state
  const [copiedClassroomKey, setCopiedClassroomKey] = useState<number | null>(null);
  
  // Template execution filters
  const [templateNameFilter, setTemplateNameFilter] = useState('all');
  const [templateUserFilter, setTemplateUserFilter] = useState('all');
  const [templateLanguageFilter, setTemplateLanguageFilter] = useState('all');
  const [templateStatusFilter, setTemplateStatusFilter] = useState('all');
  
  // Dropdown options from React Query
  const templates = templatesOptions?.templates || [];
  const combinedUsers = usersOptions?.users || [];
  
  // Client-side filtering functions (2025 best practice - no more API calls per filter)
  const getFilteredActivities = useCallback(() => {
    let filtered = [...allActivities];
    
    if (activityType !== 'all') {
      filtered = filtered.filter(activity => activity.activity_type === activityType);
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(activity => activity.status === statusFilter);
    }
    
    if (activityUserFilter !== 'all') {
      const filterValue = activityUserFilter.toLowerCase();
      filtered = filtered.filter(activity => 
        activity.username?.toLowerCase().includes(filterValue) ||
        activity.email?.toLowerCase().includes(filterValue)
      );
    }
    
    return filtered;
  }, [allActivities, activityType, statusFilter, activityUserFilter]);
  
  const getFilteredUsers = useCallback(() => {
    if (!userSearch) return adminUsers;
    
    const searchTerm = userSearch.toLowerCase();
    return adminUsers.filter((user: AdminUser) =>
      user.username?.toLowerCase().includes(searchTerm) ||
      user.email?.toLowerCase().includes(searchTerm) ||
      user.full_name?.toLowerCase().includes(searchTerm)
    );
  }, [adminUsers, userSearch]);
  
  const getFilteredTemplateExecutions = useCallback(() => {
    let filtered = [...allTemplateExecutions];
    
    if (templateNameFilter !== 'all') {
      filtered = filtered.filter(exec => exec.template_name === templateNameFilter);
    }
    
    if (templateLanguageFilter !== 'all') {
      filtered = filtered.filter(exec => exec.language === templateLanguageFilter);
    }
    
    if (templateStatusFilter !== 'all') {
      filtered = filtered.filter(exec => exec.status === templateStatusFilter);
    }
    
    if (templateUserFilter && templateUserFilter !== 'all') {
      const filterValue = templateUserFilter.toLowerCase();
      filtered = filtered.filter(exec => 
        exec.username?.toLowerCase().includes(filterValue) ||
        exec.email?.toLowerCase().includes(filterValue)
      );
    }
    
    return filtered;
  }, [allTemplateExecutions, templateNameFilter, templateLanguageFilter, templateStatusFilter, templateUserFilter]);
  const [classroomNotifications, setClassroomNotifications] = useState<{[key: number]: {message: string, type: 'success' | 'error'} | null}>({});

  
  const pageSize = 20;

  // Request user activation/deactivation with confirmation
  const requestUserActivationToggle = (userId: number, username: string, currentStatus: boolean) => {
    setUserActivationDialog({
      open: true,
      userId,
      username,
      currentStatus,
      action: currentStatus ? 'deactivate' : 'activate'
    });
  };

  // Confirm user activation/deactivation
  const handleConfirmUserActivation = async () => {
    const { userId, action } = userActivationDialog;
    if (!userId) return;

    try {
      await toggleUserMutation.mutateAsync({ 
        userId, 
        activate: action === 'activate' 
      });
      console.log(`User ${action}d successfully`);
    } catch (err: any) {
      console.error(`Failed to ${action} user:`, err);
      // Could add toast notification for error handling
    } finally {
      setUserActivationDialog({
        open: false,
        userId: null,
        username: '',
        currentStatus: false,
        action: 'activate'
      });
    }
  };

  // Cancel user activation/deactivation
  const handleCancelUserActivation = () => {
    setUserActivationDialog({
      open: false,
      userId: null,
      username: '',
      currentStatus: false,
      action: 'activate'
    });
  };

  // Password management handlers
  const handleGenerateTempPasswordRequest = (userId: number, username: string) => {
    setTempPasswordConfirmDialog({ open: true, userId, username });
  };
  
  const handleConfirmGenerateTempPassword = async () => {
    const { userId } = tempPasswordConfirmDialog;
    if (!userId) return;
    
    try {
      const result = await generateTempPasswordMutation.mutateAsync(userId);
      const tempPasswordData = { 
        userId, 
        password: result.temp_password, 
        createdAt: Date.now() 
      };
      
      // Save to state and localStorage
      setTempPasswordResult(tempPasswordData);
      localStorage.setItem('admin_temp_password', JSON.stringify(tempPasswordData));
      
      // Automatically expand the user row to show success
      setExpandedUser(userId);
      
      // Force logout the user after generating temp password
      try {
        await adminForceLogoutMutation.mutateAsync(userId);
        console.log(`User ${userId} has been logged out after temp password generation`);
      } catch (logoutErr) {
        console.error('Failed to logout user after temp password generation:', logoutErr);
        // Don't show error to admin as temp password was generated successfully
      }
    } catch (err: any) {
      console.error('Failed to generate temporary password:', err);
      // Could add a toast notification here if needed
    } finally {
      setTempPasswordConfirmDialog({ open: false, userId: null, username: '' });
    }
  };
  
  const handleCancelTempPasswordGeneration = () => {
    setTempPasswordConfirmDialog({ open: false, userId: null, username: '' });
  };

  const handleResetUsernameRequest = (userId: number, currentUsername: string) => {
    setResetUsernameDialog({ open: true, userId, newUsername: '', currentUsername });
  };
  
  const handleConfirmResetUsername = async () => {
    const { userId, newUsername } = resetUsernameDialog;
    if (!userId || !newUsername.trim()) return;
    
    try {
      await adminResetUsernameMutation.mutateAsync({ userId, newUsername: newUsername.trim() });
      
      setResetUsernameDialog({ open: false, userId: null, newUsername: '', currentUsername: '' });
    } catch (err: any) {
      console.error('Failed to reset username:', err);
      // Could add a toast notification here if needed
    }
  };
  
  const handleCancelUsernameReset = () => {
    setResetUsernameDialog({ open: false, userId: null, newUsername: '', currentUsername: '' });
  };

  // Helper function to get remaining time for temp password
  const getRemainingTime = useMemo(() => {
    if (!tempPasswordResult) return () => 'Expired';
    
    return (createdAt: number) => {
      // tempPasswordUpdateTrigger ensures re-calculation when time updates
      const now = Date.now();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      const timeLeft = TWENTY_FOUR_HOURS - (now - createdAt);
      
      if (timeLeft <= 0) return 'Expired';
      
      const hours = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      
      if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
      } else {
        return `${minutes}m remaining`;
      }
    };
  }, [tempPasswordResult, tempPasswordUpdateTrigger]);

  // Pre-load classroom settings for all classrooms to avoid calling hooks in loops
  const allClassroomIds = user?.classroom_context?.classrooms?.map((c) => c.id) || [];
  
  // Call classroom settings hooks at top level for each classroom - Load immediately when classrooms tab is active
  const classroomSettings1 = useClassroomSettings(allClassroomIds[0], activeTab === 'classrooms' && allClassroomIds.length > 0);
  const classroomSettings2 = useClassroomSettings(allClassroomIds[1], activeTab === 'classrooms' && allClassroomIds.length > 1);
  const classroomSettings3 = useClassroomSettings(allClassroomIds[2], activeTab === 'classrooms' && allClassroomIds.length > 2);
  const classroomSettings4 = useClassroomSettings(allClassroomIds[3], activeTab === 'classrooms' && allClassroomIds.length > 3);
  const classroomSettings5 = useClassroomSettings(allClassroomIds[4], activeTab === 'classrooms' && allClassroomIds.length > 4);
  
  // Create a map of classroom settings queries manually
  const classroomSettingsQueries: any = {};
  if (allClassroomIds[0]) classroomSettingsQueries[allClassroomIds[0]] = classroomSettings1;
  if (allClassroomIds[1]) classroomSettingsQueries[allClassroomIds[1]] = classroomSettings2;
  if (allClassroomIds[2]) classroomSettingsQueries[allClassroomIds[2]] = classroomSettings3;
  if (allClassroomIds[3]) classroomSettingsQueries[allClassroomIds[3]] = classroomSettings4;
  if (allClassroomIds[4]) classroomSettingsQueries[allClassroomIds[4]] = classroomSettings5;
  
  // Helper function to get classroom settings data
  const getClassroomSettings = (classroomId: number) => {
    const query = classroomSettingsQueries[classroomId];
    return {
      copy_paste_enabled: query?.data?.copy_paste_enabled ?? true,
      isLoading: query?.isLoading ?? false
    };
  };

  // Handle classroom-specific copy-paste toggle using React Query
  const handleClassroomCopyPasteToggle = async (classroomId: number, enabled: boolean) => {
    // Clear any existing notification
    setClassroomNotifications(prev => ({ ...prev, [classroomId]: null }));

    try {
      await updateSettingsMutation.mutateAsync({
        classroomId,
        settings: {
        copy_paste_enabled: enabled,
        notes: `Copy-paste ${enabled ? 'enabled' : 'disabled'} by ${user?.username} for classroom ${classroomId}`
        }
      });
        
        // Set inline success notification
        setClassroomNotifications(prev => ({
          ...prev,
          [classroomId]: {
            message: `Copy-paste ${enabled ? 'enabled' : 'disabled'} successfully`,
            type: 'success'
          }
        }));
        
        // Clear notification after 3 seconds
        setTimeout(() => {
          setClassroomNotifications(prev => ({ ...prev, [classroomId]: null }));
        }, 3000);
    } catch (error: any) {
      console.error(`Failed to update classroom ${classroomId} copy-paste setting:`, error);
      
      // Set inline error notification
      setClassroomNotifications(prev => ({
        ...prev,
        [classroomId]: {
          message: `Failed to update copy-paste setting: ${error.response?.data?.detail || error.message}`,
          type: 'error'
        }
      }));
      
      // Clear error notification after 5 seconds
      setTimeout(() => {
        setClassroomNotifications(prev => ({ ...prev, [classroomId]: null }));
      }, 5000);
    }
  };

  // Refresh all data using React Query refetch
  const loadAllData = async () => {
    try {
      await Promise.all([
        refetchStats(),
        refetchUsers(),
        // Other data is automatically refetched by React Query as needed
      ]);
    } catch (err: any) {
      console.error('Error refreshing admin data:', err);
    }
  };

  // Handle classroom creation using React Query mutation
  const handleCreateClassroom = async () => {
    // Clear previous messages
    setClassroomCreationError('');
    setClassroomCreationSuccess('');
    
    const name = newClassroom.name.trim();
    if (!name) {
      setClassroomCreationError('Classroom name is required');
      return;
    }

    const description = newClassroom.description.trim() || undefined;
    const maxMembers = newClassroom.maxMembers ? parseInt(newClassroom.maxMembers) : undefined;

    // Validate max members if provided
    if (maxMembers !== undefined && (maxMembers < 1 || maxMembers > 1000)) {
      setClassroomCreationError('Max students must be between 1 and 1000');
      return;
    }

    setCreatingClassroom(true);
    try {
      await createClassroomMutation.mutateAsync({
        name,
        description,
        max_members: maxMembers,
        allow_collaboration: true
      });

      // Show success message
      setClassroomCreationSuccess(`Classroom "${name}" created successfully!`);
      
      // Clear the form and hide it after a delay
      setTimeout(() => {
        setNewClassroom({
          name: '',
          description: '',
          maxMembers: ''
        });
        setIsCreatingClassroom(false);
        setClassroomCreationSuccess('');
      }, 2000);

      // Refresh user data to get updated classroom context
      const success = await refreshUser();
      if (!success) {
        window.location.reload(); // Fallback
      }

      console.log('Classroom created successfully');
    } catch (err: any) {
      console.error('Failed to create classroom:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error occurred';
      setClassroomCreationError(`Failed to create classroom: ${errorMessage}`);
    } finally {
      setCreatingClassroom(false);
    }
  };

  // Handle canceling classroom creation
  const handleCancelClassroomCreation = () => {
    setNewClassroom({
      name: '',
      description: '',
      maxMembers: ''
    });
    setClassroomCreationError('');
    setClassroomCreationSuccess('');
    setIsCreatingClassroom(false);
  };

  // Call classroom members hooks at top level for each classroom - Load when classroom is expanded and tab is active
  const classroomMembers1 = useClassroomMembers(allClassroomIds[0], activeTab === 'classrooms' && expandedClassroom === allClassroomIds[0]);
  const classroomMembers2 = useClassroomMembers(allClassroomIds[1], activeTab === 'classrooms' && expandedClassroom === allClassroomIds[1]);
  const classroomMembers3 = useClassroomMembers(allClassroomIds[2], activeTab === 'classrooms' && expandedClassroom === allClassroomIds[2]);
  const classroomMembers4 = useClassroomMembers(allClassroomIds[3], activeTab === 'classrooms' && expandedClassroom === allClassroomIds[3]);
  const classroomMembers5 = useClassroomMembers(allClassroomIds[4], activeTab === 'classrooms' && expandedClassroom === allClassroomIds[4]);
  
  // Create a map of classroom members queries manually
  const classroomMembersQueries: any = {};
  if (allClassroomIds[0]) classroomMembersQueries[allClassroomIds[0]] = classroomMembers1;
  if (allClassroomIds[1]) classroomMembersQueries[allClassroomIds[1]] = classroomMembers2;
  if (allClassroomIds[2]) classroomMembersQueries[allClassroomIds[2]] = classroomMembers3;
  if (allClassroomIds[3]) classroomMembersQueries[allClassroomIds[3]] = classroomMembers4;
  if (allClassroomIds[4]) classroomMembersQueries[allClassroomIds[4]] = classroomMembers5;
  
  // Helper function to get classroom members data
  const getClassroomMembers = (classroomId: number) => {
    const query = classroomMembersQueries[classroomId];
    return { 
      members: query?.data || [], 
      isLoading: query?.isLoading ?? false 
    };
  };

  const handleClassroomClick = (classroomId: number) => {
    if (expandedClassroom === classroomId) {
      setExpandedClassroom(null);
    } else {
      setExpandedClassroom(classroomId);
      setCurrentClassroom(classroomId); // Set current classroom for WebSocket filtering
      // React Query will automatically load classroom members when expanded
    }
  };

  const handleRemoveMemberClick = (classroomId: number, memberId: number, memberName: string) => {
    setMemberToRemove({ classroomId, memberId, memberName });
    setRemoveModalOpen(true);
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;

    const { classroomId, memberId } = memberToRemove;

    try {
      await removeStudentMutation.mutateAsync({ classroomId, memberId });
      // React Query will automatically refresh the member list
    } catch (err: any) {
      console.error('Remove member error:', err);
    } finally {
      setRemoveModalOpen(false);
      setMemberToRemove(null);
    }
  };

  const cancelRemoveMember = () => {
    setRemoveModalOpen(false);
    setMemberToRemove(null);
  };

  const handleAddStudentByEmail = async (classroomId: number) => {
    const email = studentEmails[classroomId]?.trim();
    if (!email) {
      setUserSearchError('Please enter a student email address');
      return;
    }

    setAddingStudent(prev => ({ ...prev, [classroomId]: true }));
    setUserSearchError(null); // Clear any previous errors
    try {
      await addStudentMutation.mutateAsync({ classroomId, email });
      
      // Clear the email input
      setStudentEmails(prev => ({ ...prev, [classroomId]: '' }));
      // React Query will automatically refresh the member list
    } catch (err: any) {
      console.error('Add student error:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to add student';
      setUserSearchError(errorMessage);
    } finally {
      setAddingStudent(prev => ({ ...prev, [classroomId]: false }));
    }
  };

  const copyClassroomKey = (key: string, classroomId: number) => {
    navigator.clipboard.writeText(key);
    setCopiedClassroomKey(classroomId);
    // Clear the feedback after 2 seconds
    setTimeout(() => {
      setCopiedClassroomKey(null);
    }, 2000);
  };

  // Delete classroom functions
  const handleDeleteClassroomClick = (classroomId: number, classroomName: string, memberCount: number) => {
    setClassroomToDelete({ id: classroomId, name: classroomName, memberCount });
    setDeleteClassroomModalOpen(true);
  };

  const confirmDeleteClassroom = async () => {
    if (!classroomToDelete) return;

    setDeletingClassroom(true);
    try {
      await deleteClassroomMutation.mutateAsync(classroomToDelete.id);
      
      // Show success message - classroom will be removed from user context on refresh
      console.log('Classroom deleted successfully');
      
      // Refresh user data to update classroom context
      const success = await refreshUser();
      if (!success) {
        window.location.reload(); // Fallback if refresh fails
      }
      
    } catch (err: any) {
      console.error('Delete classroom error:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete classroom';
      // For now, we'll log the error. In production, you might want to show a toast notification
      alert(`Error: ${errorMessage}`);
    } finally {
      setDeletingClassroom(false);
      setDeleteClassroomModalOpen(false);
      setClassroomToDelete(null);
    }
  };

  const cancelDeleteClassroom = () => {
    setDeleteClassroomModalOpen(false);
    setClassroomToDelete(null);
  };

  // Load temp password from localStorage and clean up expired ones
  useEffect(() => {
    const loadTempPassword = () => {
      try {
        const stored = localStorage.getItem('admin_temp_password');
        if (stored) {
          const parsed = JSON.parse(stored);
          const now = Date.now();
          const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
          
          // Check if temp password has expired (24 hours)
          if (now - parsed.createdAt < TWENTY_FOUR_HOURS) {
            setTempPasswordResult(parsed);
          } else {
            // Expired, remove from localStorage
            localStorage.removeItem('admin_temp_password');
          }
        }
      } catch (err) {
        console.error('Failed to load temp password from localStorage:', err);
        localStorage.removeItem('admin_temp_password');
      }
    };

    loadTempPassword();
  }, []);

  // Check for expired temp password and update remaining time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (tempPasswordResult) {
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        
        if (now - tempPasswordResult.createdAt >= TWENTY_FOUR_HOURS) {
          setTempPasswordResult(null);
          localStorage.removeItem('admin_temp_password');
        } else {
          // Trigger update to refresh remaining time display
          setTempPasswordUpdateTrigger(prev => prev + 1);
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [tempPasswordResult]);

  // SINGLE useEffect for WebSocket and settings only - React Query handles data loading
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadAdminSettings(isAuthenticated);
      
      // Initialize WebSocket with user and classroom context
      const classroomIds = user?.classroom_context?.classrooms?.map((c) => c.id) || [];
      initializeWebSocket(user?.id, classroomIds);
      
      // Debug: Log user data to understand classroom context
      console.log('🔍 Current user data:', user);
      console.log('🔍 Classroom context:', user?.classroom_context);
      
      // Force refresh user data to get latest classroom context
      const refreshUserData = async () => {
        try {
          const success = await refreshUser();
          console.log('🔄 User data refresh success:', success);
          console.log('🔄 Updated user:', user);
        } catch (err) {
          console.error('Failed to refresh user data:', err);
        }
      };
      
      refreshUserData();
    }
    
    // Cleanup websocket on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [isAuthenticated, isAdmin]); // Only trigger on auth/admin change, NOT filter changes
  
  // REMOVED: No more useEffect hooks for filter changes - all filtering is now client-side!

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'code_execution':
        return <Code className="w-4 h-4" />;
      case 'session_creation':
      case 'session_join':
        return <Share2 className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'success':
        return <Badge className="badge-success">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'active':
        return <Badge className="badge-info">Active</Badge>;
      case 'connected':
        return <Badge className="badge-success">Connected</Badge>;
      case 'disconnected':
        return <Badge className="badge-disconnected">Disconnected</Badge>;
      default:
        return status ? <Badge variant="secondary">{status}</Badge> : null;
    }
  };

  // Client-side pagination based on filtered data
  const filteredActivities = getFilteredActivities();
  const totalPages = Math.ceil(filteredActivities.length / pageSize);

  // Authentication check
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">Please sign in to access the admin dashboard</p>
              <Button onClick={() => navigate('/login')}>Sign In</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while user data is being loaded
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground">Loading user information...</p>
        </div>
      </div>
    );
  }

  // Admin permission check
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-destructive mb-2">Access Denied</h2>
              <p className="text-muted-foreground mb-4">You don't have permission to access the admin dashboard</p>
              <div className="space-x-2">
                <Button onClick={() => navigate('/')} variant="outline">
                  Go to IDE
                </Button>
                <Button onClick={() => navigate('/settings')} variant="default">
                  Go to Settings
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  // Check if user has no classrooms (but allow admins to access dashboard to create classrooms)
  if (user?.classroom_context && !user.classroom_context.has_classroom && !isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">No Classroom Access</h2>
              <p className="text-muted-foreground mb-4">
                You don't have access to any classrooms yet.<br/>
                Contact your system administrator to get added to a classroom.
              </p>
              <div className="space-x-2">
                <Button onClick={() => navigate('/')} variant="outline">
                  Go to IDE
                </Button>
                <Button 
                  onClick={loadAllData} 
                  variant="default"
                  disabled={statsLoading || activitiesLoading || usersLoading}
                >
                  {(statsLoading || activitiesLoading || usersLoading) ? 'Loading' : 'Refresh'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Note: Removed full-page error display, errors now shown inline

  return (
    <div className="min-h-screen bg-background p-4 lg:p-6">
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-3xl font-bold flex items-center">
              <Shield className="w-6 lg:w-8 h-6 lg:h-8 mr-2 lg:mr-3 shrink-0" />
              <span className="truncate">Admin Dashboard</span>
            </h1>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm lg:text-base">Monitor system activity and manage users</p>
              {user?.classroom_context?.classrooms && user.classroom_context.classrooms.length > 0 && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <span className="font-medium text-foreground mr-1">Classrooms:</span>
                  <span>{user.classroom_context.classrooms.map(classroom => classroom.name).join(', ')}</span>
                </div>
              )}
              {user?.classroom_context && !user.classroom_context.has_classroom && (
                <div className="text-sm text-amber-600 dark:text-amber-400">
                  ⚠️ No classroom assigned. Contact system administrator.
                </div>
              )}


            </div>
          </div>
          <Button 
            onClick={loadAllData} 
            variant="outline" 
            className="shrink-0"
            disabled={statsLoading || activitiesLoading || usersLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${(statsLoading || activitiesLoading || usersLoading) ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {(statsLoading || activitiesLoading || usersLoading) ? 'Loading' : 'Refresh'}
            </span>
          </Button>
        </div>



        {/* Main Content with Left Panel/Right Panel Layout */}
        <div className="w-full">
          {/* Mobile Dropdown */}
          <div className="block lg:hidden mb-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center">
                    <Menu className="w-4 h-4 mr-2" />
                    {activeTab === 'overview' && 'System Overview'}
                    {activeTab === 'classrooms' && 'Classrooms'}
                    {activeTab === 'templates' && 'Professor Templates'}
                    {activeTab === 'assignments' && 'Assignments'}
                    {activeTab === 'template-executions' && 'Executions'}
                    {activeTab === 'template-submissions' && 'Submissions'}
                    {activeTab === 'analytics' && 'Analytics'}
                    {activeTab === 'users' && 'Users'}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                className="w-[calc(100vw-2rem)] max-w-none" 
                align="start" 
                sideOffset={4}
              >
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('overview')}>
                  <BarChart3 className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">System Overview</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('classrooms')}>
                  <Shield className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Classrooms</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('templates')}>
                  <FileText className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Professor Templates</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('assignments')}>
                  <Code className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Assignments</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('template-executions')}>
                  <Play className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Executions</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('template-submissions')}>
                  <Send className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Submissions</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('analytics')}>
                  <TrendingUp className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Analytics</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('users')}>
                  <Users className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Users</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop Layout: Left Panel + Right Panel */}
          <div className={`hidden lg:grid lg:gap-6 lg:h-[calc(100vh-200px)] ${
            sidebarCollapsed ? 'lg:grid-cols-[80px_1fr]' : 'lg:grid-cols-[280px_1fr]'
          }`}>
            {/* Left Navigation Panel */}
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  {!sidebarCollapsed && (
                    <CardTitle className="text-lg">Dashboard Menu</CardTitle>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="h-8 w-8 p-0"
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {sidebarCollapsed ? (
                      <PanelLeftOpen className="w-4 h-4" />
                    ) : (
                      <PanelLeft className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                <nav className="space-y-1 p-4 h-full">
                  <Button
                    variant={activeTab === 'overview' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('overview')}
                    title={sidebarCollapsed ? 'System Overview' : ''}
                  >
                    <BarChart3 className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">System Overview</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'classrooms' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('classrooms')}
                    title={sidebarCollapsed ? 'Classrooms' : ''}
                  >
                    <Shield className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Classrooms</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'templates' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('templates')}
                    title={sidebarCollapsed ? 'Professor Templates' : ''}
                  >
                    <FileText className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Professor Templates</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'assignments' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('assignments')}
                    title={sidebarCollapsed ? 'Assignments' : ''}
                  >
                    <Code className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Assignments</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'template-executions' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('template-executions')}
                    title={sidebarCollapsed ? 'Executions' : ''}
                  >
                    <Play className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Executions</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'template-submissions' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('template-submissions')}
                    title={sidebarCollapsed ? 'Submissions' : ''}
                  >
            <Send className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Submissions</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'analytics' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('analytics')}
                    title={sidebarCollapsed ? 'Analytics' : ''}
                  >
            <TrendingUp className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Analytics</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'users' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('users')}
                    title={sidebarCollapsed ? 'Users' : ''}
                  >
            <Users className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Users</span>}
                  </Button>
                </nav>
              </CardContent>
            </Card>

            {/* Right Content Panel */}
            <Card className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">


        {/* Stats Cards - Always show, with skeleton loading */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.total_users}</div>
                  <p className="text-xs text-muted-foreground">
                    +{stats.new_users_today} today
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-16 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-20 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Code className="w-4 h-4 mr-2" />
                Code Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.total_code_executions}</div>
                  <p className="text-xs text-muted-foreground">
                    +{stats.executions_today} today
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-20 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-24 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Share2 className="w-4 h-4 mr-2" />
                Collaboration Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.total_collaboration_sessions}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.active_sessions} active
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-16 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-20 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Error Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.error_rate_percentage}%</div>
                  <p className="text-xs text-muted-foreground">
                    of executions
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-12 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-24 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Popular Languages */}
        {stats && stats.popular_languages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Popular Languages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {stats.popular_languages.map((lang: { language: string; count: number }) => (
                  <div key={lang.language} className="text-center">
                    <div className="text-2xl font-bold">{lang.count}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {lang.language}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

            {/* Activities and Users in tabs or side by side */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* User Activities */}
              <div className="xl:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <Activity className="w-5 h-5 mr-2" />
                        User Activities
                      </span>
                      {activities.length > 0 ? (
                        <Badge variant="outline">{filteredActivities.length} shown</Badge>
                      ) : (
                        <div className="bg-muted rounded h-6 w-16 animate-pulse"></div>
                      )}
                    </CardTitle>
                
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <Select value={activityType} onValueChange={setActivityType}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Activity type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All activities</SelectItem>
                      <SelectItem value="code_execution">Code Execution</SelectItem>
                      <SelectItem value="session_creation">Session Creation</SelectItem>
                      <SelectItem value="session_join">Session Join</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="connected">Connected</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={activityUserFilter} onValueChange={setActivityUserFilter}>
                    <SelectTrigger className="w-full sm:w-[250px]">
                      <SelectValue placeholder="User" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      {combinedUsers.map((user: any) => (
                        <SelectItem key={user.display} value={user.display}>
                          {user.display}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activities.length === 0 && activitiesLoading ? (
                    // Skeleton loading for activities
                    [...Array(5)].map((_, i) => (
                      <div key={i} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <div className="bg-muted rounded h-4 w-24 animate-pulse"></div>
                                <div className="bg-muted rounded h-5 w-20 animate-pulse"></div>
                                <div className="bg-muted rounded h-5 w-16 animate-pulse"></div>
                              </div>
                              <div className="bg-muted rounded h-3 w-32 animate-pulse"></div>
                              <div className="bg-muted rounded h-3 w-40 animate-pulse mt-1"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : activities.length === 0 ? (
                    // Empty state when no activities and not loading
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium text-foreground mb-2">No activities yet</p>
                      <p className="text-sm">Activity data will appear here once users start interacting with the platform</p>
                    </div>
                  ) : (
                    // Actual activities
                    getFilteredActivities().slice((currentPage - 1) * pageSize, currentPage * pageSize).map((activity) => (
                    <div key={`${activity.activity_type}-${activity.id}`} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          {getActivityIcon(activity.activity_type)}
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium">
                                {activity.username || 'Anonymous'}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {activity.activity_type.replace('_', ' ')}
                              </Badge>
                              {getStatusBadge(activity.status)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatDate(activity.timestamp)}
                            </div>
                            
                            {/* Activity details */}
                            {activity.activity_type === 'code_execution' && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Language: {activity.activity_data.language} • 
                                Code size: {activity.activity_data.code_size} chars
                                {activity.activity_data.execution_time && (
                                  <> • {activity.activity_data.execution_time.toFixed(3)}s</>
                                )}
                              </div>
                            )}
                            
                            {activity.activity_type === 'session_creation' && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {activity.activity_data.title} ({activity.activity_data.language})
                                {activity.activity_data.is_public && ' • Public'}
                              </div>
                            )}
                            
                            {activity.error_message && (
                              <div className="text-xs text-destructive mt-1 bg-destructive/10 p-1 rounded">
                                {activity.error_message.slice(0, 100)}
                                {activity.error_message.length > 100 && '...'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    ))
                  )}
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredActivities.length)} of {filteredActivities.length} activities
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Users */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Users
                </CardTitle>
                <div className="flex items-center space-x-2 mt-4">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      if (userSearchError) setUserSearchError(null); // Clear error when typing
                    }}
                    className={`flex-1 ${userSearchError ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                  />
                </div>
                
                {/* Inline User Search Error */}
                {userSearchError && (
                  <div className="mt-2 flex items-start space-x-2 p-2 border border-red-200 rounded bg-red-50 dark:bg-red-950/20 dark:border-red-900/30">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-red-700 dark:text-red-400">{userSearchError}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setUserSearchError(null)}
                      className="h-6 w-6 p-0 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      ×
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getFilteredUsers().map((user: AdminUser) => (
                    <div key={user.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium">{user.username}</span>
                            {!user.is_active && (
                              <Badge variant="destructive" className="text-xs">Inactive</Badge>
                            )}
                            {!user.is_verified && (
                              <Badge variant="outline" className="text-xs">Unverified</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {user.email}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {user.code_executions} executions • {user.collaboration_sessions} sessions
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Joined: {formatDate(user.created_at)}
                          </div>
                        </div>
                        
                        <div className="flex space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => requestUserActivationToggle(user.id, user.username, user.is_active)}
                            disabled={toggleUserMutation.isPending}
                          >
                            {user.is_active ? (
                              <UserX className="w-3 h-3" />
                            ) : (
                              <UserCheck className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
                </div>
              </div>
                </div>
              )}
              
              {activeTab === 'classrooms' && (
                <div className="space-y-6">
                  {/* Classroom Management */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center">
                            <Shield className="w-5 h-5 mr-2" />
                            Classroom Management
                          </CardTitle>
                          <p className="text-muted-foreground text-sm mt-1">
                            Manage all classrooms you're a member of. Shows both created classrooms and joined classrooms.
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          className="shrink-0"
                          onClick={() => setIsCreatingClassroom(!isCreatingClassroom)}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          {isCreatingClassroom ? 'Cancel' : 'Create Classroom'}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">

                        {/* Create classroom form - collapsible */}
                        {isCreatingClassroom && (
                          <Card>
                            <CardHeader>
                              <div className="flex items-center justify-between">
                                <CardTitle>Create New Classroom</CardTitle>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleCancelClassroomCreation}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <Label htmlFor="classroom-name">Name *</Label>
                                  <Input
                                    id="classroom-name"
                                    value={newClassroom.name}
                                    onChange={(e) => setNewClassroom(prev => ({...prev, name: e.target.value}))}
                                    placeholder="e.g., CS101 Spring 2024"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="classroom-description">Description</Label>
                                  <Input
                                    id="classroom-description"
                                    value={newClassroom.description}
                                    onChange={(e) => setNewClassroom(prev => ({...prev, description: e.target.value}))}
                                    placeholder="Brief description (optional)"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="max-members">Max Students</Label>
                                  <Input
                                    id="max-members"
                                    type="number"
                                    value={newClassroom.maxMembers}
                                    onChange={(e) => setNewClassroom(prev => ({...prev, maxMembers: e.target.value}))}
                                    placeholder="100"
                                    min="1"
                                    max="1000"
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                              
                              {/* Error and Success Messages */}
                              {classroomCreationError && (
                                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                  <div className="flex items-center space-x-2">
                                    <AlertTriangle className="h-4 w-4 text-destructive" />
                                    <span className="text-sm text-destructive font-medium">
                                      {classroomCreationError}
                                    </span>
                                  </div>
                                </div>
                              )}
                              
                              {classroomCreationSuccess && (
                                <div className="p-3 rounded-md bg-green-50 border border-green-200">
                                  <div className="flex items-center space-x-2">
                                    <Check className="h-4 w-4 text-green-600" />
                                    <span className="text-sm text-green-700 font-medium">
                                      {classroomCreationSuccess}
                                    </span>
                                  </div>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-3 pt-4">
                                <Button 
                                  onClick={handleCreateClassroom}
                                  disabled={creatingClassroom || !newClassroom.name.trim()}
                                  className="px-6"
                                >
                                  {creatingClassroom ? 'Creating...' : 'Create Classroom'}
                                </Button>
                                <Button 
                                  variant="outline"
                                  onClick={handleCancelClassroomCreation}
                                  disabled={creatingClassroom}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {user?.classroom_context?.classrooms && user.classroom_context.classrooms.length > 0 ? (
                          <div className="space-y-4">
                            {/* Classroom Summary */}
                            <div className="bg-muted/50 rounded-lg p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-medium text-sm">Your Classroom Access</h4>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    {user.classroom_context.classrooms.filter(c => c.is_creator).length} created • {user.classroom_context.classrooms.filter(c => !c.is_creator).length} joined • {user.classroom_context.classrooms.length} total
                                  </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                    Creator
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                                    Member
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            
                            {user.classroom_context.classrooms.map((classroom) => (
                            <div key={classroom.id} className="border rounded-lg">
                              <div 
                                className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => handleClassroomClick(classroom.id)}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center space-x-2">
                                        <h3 className="font-semibold">{classroom.name}</h3>
                                        <Badge variant="outline" className="text-xs">
                                          {classroom.role}
                                        </Badge>
                                        {classroom.is_creator && (
                                          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                            Creator
                                          </Badge>
                                        )}
                                        {!classroom.is_creator && (
                                          <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                                            Member
                                          </Badge>
                                        )}
                                        {expandedClassroom === classroom.id ? (
                                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteClassroomClick(classroom.id, classroom.name, classroom.member_count);
                                        }}
                                        title="Delete classroom"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                      <div className="flex items-center">
                                        <span className="font-medium">Classroom Key:</span> 
                                        <code className="ml-1 px-2 py-1 bg-muted rounded text-xs font-mono">
                                          {classroom.key}
                                        </code>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="ml-2 h-6 w-6 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyClassroomKey(classroom.key, classroom.id);
                                          }}
                                          title={copiedClassroomKey === classroom.id ? "Copied!" : "Copy classroom key"}
                                        >
                                          {copiedClassroomKey === classroom.id ? (
                                            <Check className="w-3 h-3 text-green-600" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                        </Button>
                                      </div>
                                      <div>
                                        <span className="font-medium">Members:</span> {classroom.member_count}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Copy-Paste Toggle Section - Independent of row click */}
                              <div className="px-4 py-3 bg-muted/10 border-t border-muted/50">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium">Copy-Paste:</span>
                                    <span className="text-sm text-muted-foreground">
                                      {(() => {
                                        const { copy_paste_enabled, isLoading } = getClassroomSettings(classroom.id);
                                        return isLoading ? 'Loading...' : (copy_paste_enabled ? 'Enabled' : 'Disabled');
                                      })()}
                                    </span>
                                  </div>
                                  <Switch
                                    checked={getClassroomSettings(classroom.id).copy_paste_enabled}
                                    onCheckedChange={(checked) => handleClassroomCopyPasteToggle(classroom.id, checked)}
                                    disabled={getClassroomSettings(classroom.id).isLoading}
                                    className="scale-90"
                                  />
                                </div>
                                
                                {/* Inline Notification for this classroom */}
                                {classroomNotifications[classroom.id] && (
                                  <div className={`mt-2 p-2 rounded text-sm ${
                                    classroomNotifications[classroom.id]?.type === 'success' 
                                      ? 'bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                                      : 'bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                                  }`}>
                                    <div className="flex items-center">
                                      {classroomNotifications[classroom.id]?.type === 'success' ? (
                                        <Check className="w-4 h-4 mr-2" />
                                      ) : (
                                        <AlertTriangle className="w-4 h-4 mr-2" />
                                      )}
                                      {classroomNotifications[classroom.id]?.message}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Expanded Member List */}
                              {expandedClassroom === classroom.id && (
                                <div className="border-t bg-muted/20">
                                  <ClassroomMembersList 
                                    classroomId={classroom.id}
                                    members={getClassroomMembers(classroom.id).members}
                                    isLoading={getClassroomMembers(classroom.id).isLoading}
                                    handleRemoveMemberClick={handleRemoveMemberClick}
                                    handleAddStudentByEmail={handleAddStudentByEmail}
                                    studentEmails={studentEmails}
                                    setStudentEmails={setStudentEmails}
                                    addingStudent={addingStudent}
                                    userSearchError={userSearchError}
                                    setUserSearchError={setUserSearchError}
                                    classroom={classroom}
                                  />
                                </div>
                              )}
                            </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            {isAdmin ? (
                              <>
                                <p className="text-lg font-medium text-foreground mb-2">Welcome, Admin!</p>
                                <p className="mb-4">You haven't created any classrooms yet.</p>
                                <p className="text-sm mb-4">Create your first classroom to start organizing students and managing content.</p>
                                <Button 
                                  onClick={() => setIsCreatingClassroom(true)}
                                  size="sm" 
                                  variant="default"
                                  className="mr-2"
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Create First Classroom
                                </Button>
                              </>
                            ) : (
                              <>
                                <p>No classrooms found in user context</p>
                                <p className="text-sm mb-4">This might be a data loading issue</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Remove Member Confirmation Modal */}
                  <Dialog open={removeModalOpen} onOpenChange={setRemoveModalOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="flex items-center text-red-600">
                          <UserMinus className="w-5 h-5 mr-2" />
                          Remove Student
                        </DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                          Are you sure you want to remove <strong>{memberToRemove?.memberName}</strong> from the classroom?
                        </p>
                        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                          <div className="text-sm text-yellow-800 dark:text-yellow-200">
                            <strong>Warning:</strong> This action cannot be undone. The student will lose access to all classroom content and will need to re-register using the classroom key to rejoin.
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={cancelRemoveMember}>
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={confirmRemoveMember}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          <UserMinus className="w-3 h-3 mr-1" />
                          Remove Student
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  {/* Delete Classroom Confirmation Modal */}
                  <Dialog open={deleteClassroomModalOpen} onOpenChange={setDeleteClassroomModalOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="flex items-center text-red-600">
                          <Trash2 className="w-5 h-5 mr-2" />
                          Delete Classroom
                        </DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                          Are you sure you want to delete the classroom <strong>"{classroomToDelete?.name}"</strong>?
                        </p>
                        
                        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                          <div className="text-sm text-red-800 dark:text-red-200 space-y-2">
                            <div className="flex items-center">
                              <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                              <strong>Permanent Action - Cannot be undone!</strong>
                            </div>
                            <ul className="ml-6 space-y-1 text-xs">
                              <li>• All {classroomToDelete?.memberCount || 0} members will lose access to this classroom</li>
                              <li>• Students will no longer be able to join using the classroom key</li>
                              <li>• All classroom-specific settings and data will be permanently deleted</li>
                              <li>• Members will need to join a new classroom to continue using the platform</li>
                            </ul>
                          </div>
                        </div>
                        
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                          <div className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>Alternative:</strong> Consider deactivating the classroom temporarily instead of permanent deletion, or moving students to another classroom first.
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={cancelDeleteClassroom} disabled={deletingClassroom}>
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={confirmDeleteClassroom}
                          disabled={deletingClassroom}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deletingClassroom ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete Classroom
                            </>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                </div>
              )}
              
              {activeTab === 'assignments' && (
                <div className="space-y-6">
            {/* Assignment Upload Section */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center">
                      <FileText className="w-5 h-5 mr-2 shrink-0" />
                      <span className="truncate">Assignment Management</span>
                    </CardTitle>
                    <p className="text-muted-foreground text-sm mt-2">
                      Upload student submissions for automated grading and plagiarism detection
                    </p>
                  </div>
                  <div className="shrink-0 w-full sm:w-auto sm:max-w-[200px]">
                    <AssignmentUpload onAssignmentCreated={loadAllData} />
                  </div>
                </div>
              </CardHeader>
            </Card>
            
            {/* Assignment Reports */}
            <AssignmentReports />
                </div>
              )}
              
              {activeTab === 'templates' && (
                <div className="space-y-6">
                  <TemplateManager />
                </div>
              )}

              {activeTab === 'template-executions' && (
                <div className="space-y-6">

                  
                  {/* Template Executions Section */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center">
                          <Play className="w-5 h-5 mr-2" />
                          Template Executions
                        </span>
                        <Badge variant="outline">{getFilteredTemplateExecutions().length} shown</Badge>
                      </CardTitle>
                      
                      {/* Filters */}
                      <div className="flex flex-col sm:flex-row gap-2 mt-4">
                        <Select value={templateNameFilter} onValueChange={setTemplateNameFilter}>
                          <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder="Template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All templates</SelectItem>
                            {templates.map((template: any) => (
                              <SelectItem key={template.id} value={template.name}>
                                {template.name} ({template.language})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Select value={templateUserFilter} onValueChange={setTemplateUserFilter}>
                          <SelectTrigger className="w-full sm:w-[250px]">
                            <SelectValue placeholder="User" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All users</SelectItem>
                            {combinedUsers.map((user: any) => (
                              <SelectItem key={user.display} value={user.display}>
                                {user.display}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Select value={templateLanguageFilter} onValueChange={setTemplateLanguageFilter}>
                          <SelectTrigger className="w-full sm:w-[150px]">
                            <SelectValue placeholder="Language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All languages</SelectItem>
                            <SelectItem value="python">Python</SelectItem>
                            <SelectItem value="javascript">JavaScript</SelectItem>
                            <SelectItem value="java">Java</SelectItem>
                            <SelectItem value="cpp">C++</SelectItem>
                            <SelectItem value="go">Go</SelectItem>
                            <SelectItem value="rust">Rust</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <Select value={templateStatusFilter} onValueChange={setTemplateStatusFilter}>
                          <SelectTrigger className="w-full sm:w-[120px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="success">Success</SelectItem>
                            <SelectItem value="error">Error</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {getFilteredTemplateExecutions().slice((templateExecutionsPage - 1) * pageSize, templateExecutionsPage * pageSize).map((execution: TemplateExecution) => (
                          <div key={execution.id} className="border rounded-lg overflow-hidden">
                            {/* Clickable Row */}
                            <div 
                              className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setExpandedExecution(
                                expandedExecution === execution.id ? null : execution.id
                              )}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <span className="font-medium">
                                      {execution.username || 'Anonymous'}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                      ({execution.email})
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {execution.language}
                                    </Badge>
                                    {getStatusBadge(execution.status)}
                                  </div>
                                  {execution.template_name && (
                                    <div className="text-sm text-muted-foreground mb-1">
                                      Template: {execution.template_name}
                                    </div>
                                  )}
                                  <div className="text-xs text-muted-foreground">
                                    {formatDate(execution.created_at)}
                                    {execution.execution_time && (
                                      <> • {execution.execution_time.toFixed(3)}s</>
                                    )}
                                  </div>
                                  {execution.error_message && (
                                    <div className="text-xs text-destructive mt-1 bg-destructive/10 p-1 rounded">
                                      {execution.error_message.slice(0, 100)}
                                      {execution.error_message.length > 100 && '...'}
                                    </div>
                                  )}
                                </div>
                                <div className="flex space-x-1">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedExecution(
                                        expandedExecution === execution.id ? null : execution.id
                                      );
                                    }}
                                    className="hover:bg-primary/10"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Expanded IDE View */}
                            {expandedExecution === execution.id && (
                              <div className="border-t bg-muted/20 p-4">
                                <div className="space-y-4">
                                  {/* Execution Details Header */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <label className="font-medium text-muted-foreground">User</label>
                                      <div>{execution.username} ({execution.email})</div>
                                    </div>
                                    <div>
                                      <label className="font-medium text-muted-foreground">Language</label>
                                      <div className="capitalize">{execution.language}</div>
                                    </div>
                                    <div>
                                      <label className="font-medium text-muted-foreground">Template</label>
                                      <div>{execution.template_name || 'None'}</div>
                                    </div>
                                    <div>
                                      <label className="font-medium text-muted-foreground">Status</label>
                                      <div>{getStatusBadge(execution.status)}</div>
                                    </div>
                                  </div>

                                  {/* IDE-like Layout */}
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-96">
                                    {/* Code Editor Panel */}
                                    <div className="flex flex-col bg-background border rounded-lg shadow-sm">
                                      <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                                        <h4 className="text-sm font-medium">Code</h4>
                                      </div>
                                      <div className="flex-1 overflow-hidden rounded-b-lg">
                                        <CodeEditor
                                          language={execution.language}
                                          value={execution.code}
                                          onChange={() => {}} // Read-only
                                          readOnly={true}
                                        />
                                      </div>
                                    </div>

                                    {/* Output Panel */}
                                    <div className="flex flex-col bg-background border rounded-lg shadow-sm">
                                      <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                                        <h4 className="text-sm font-medium">Output</h4>
                                      </div>
                                      <div className="flex-1 overflow-hidden rounded-b-lg">
                                        <OutputConsole
                                          output={execution.output || ''}
                                          error={execution.error_message || ''}
                                          isLoading={false}
                                          executionTime={execution.execution_time || 0}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Input Data (if present) */}
                                  {execution.input_data && (
                                    <div className="bg-background border rounded-lg">
                                      <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                                        <h4 className="text-sm font-medium">Input Data</h4>
                                      </div>
                                      <div className="p-4">
                                        <pre className="text-sm bg-muted/50 p-3 rounded overflow-x-auto">
                                          <code>{execution.input_data}</code>
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {/* Pagination */}
                      {Math.ceil(getFilteredTemplateExecutions().length / pageSize) > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t">
                          <div className="text-sm text-muted-foreground">
                            Showing {((templateExecutionsPage - 1) * pageSize) + 1} to {Math.min(templateExecutionsPage * pageSize, getFilteredTemplateExecutions().length)} of {getFilteredTemplateExecutions().length} executions
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTemplateExecutionsPage(templateExecutionsPage - 1)}
                              disabled={templateExecutionsPage <= 1}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTemplateExecutionsPage(templateExecutionsPage + 1)}
                              disabled={templateExecutionsPage >= Math.ceil(getFilteredTemplateExecutions().length / pageSize)}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'template-submissions' && (
                <div className="space-y-6">
                  <TemplateSubmissions />
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <AdminAnalytics />
                </div>
              )}
              
              {activeTab === 'users' && (
                <div className="space-y-6">
            {/* Users Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  User Management
                </CardTitle>
                <div className="flex items-center space-x-2 mt-4">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getFilteredUsers().map((user: AdminUser) => (
                    <div key={user.id} className="border rounded-lg overflow-hidden">
                      <div 
                        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium">{user.username}</span>
                              {!user.is_active && (
                                <Badge variant="destructive" className="text-xs">Inactive</Badge>
                              )}
                              {!user.is_verified && (
                                <Badge variant="outline" className="text-xs">Unverified</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {user.email}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {user.code_executions} executions • {user.collaboration_sessions} sessions
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Joined: {formatDate(user.created_at)}
                            </div>
                          </div>
                          
                          <div className="flex space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestUserActivationToggle(user.id, user.username, user.is_active);
                              }}
                              title={user.is_active ? 'Deactivate user' : 'Activate user'}
                              disabled={toggleUserMutation.isPending}
                            >
                              {user.is_active ? (
                                <UserX className="w-3 h-3" />
                              ) : (
                                <UserCheck className="w-3 h-3" />
                              )}
                            </Button>
                            
                            {/* Generate Temp Password Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateTempPasswordRequest(user.id, user.username);
                              }}
                              disabled={generateTempPasswordMutation.isPending}
                              title="Generate temporary password"
                            >
                              <Key className="w-3 h-3" />
                            </Button>
                            
                            {/* Reset Username Button */}
                            <Dialog 
                              open={resetUsernameDialog.open && resetUsernameDialog.userId === user.id}
                              onOpenChange={(open) => {
                                if (!open) {
                                  handleCancelUsernameReset();
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResetUsernameRequest(user.id, user.username);
                                  }}
                                  title="Reset username"
                                >
                                  <RefreshCcw className="w-3 h-3" />
                                </Button>
                              </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Reset Username for {resetUsernameDialog.currentUsername}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="currentUsernameDisplay">Current Username</Label>
                                  <Input
                                    id="currentUsernameDisplay"
                                    value={resetUsernameDialog.currentUsername}
                                    disabled
                                    className="bg-muted"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="newUsername">New Username</Label>
                                  <Input
                                    id="newUsername"
                                    type="text"
                                    value={resetUsernameDialog.newUsername}
                                    onChange={(e) => setResetUsernameDialog(prev => ({ ...prev, newUsername: e.target.value }))}
                                    placeholder="Enter new username"
                                  />
                                </div>
                                                                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                  <div className="text-sm text-blue-800 dark:text-blue-200">
                                    <strong>ℹ️ Note:</strong> This will change the user's username immediately. The user will not be logged out and can continue using their account with the new username. Username must be at least 3 characters long and unique.
                                  </div>
                                </div>
                                <div className="flex justify-end space-x-2">
                                  <Button
                                    variant="outline"
                                    onClick={handleCancelUsernameReset}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={handleConfirmResetUsername}
                                    disabled={!resetUsernameDialog.newUsername.trim() || adminResetUsernameMutation.isPending}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    {adminResetUsernameMutation.isPending ? (
                                      <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                        Resetting...
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCcw className="w-3 h-3 mr-1" />
                                        Reset Username
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          
                          {/* Temporary Password Confirmation Dialog */}
                          <Dialog 
                            open={tempPasswordConfirmDialog.open && tempPasswordConfirmDialog.userId === user.id}
                            onOpenChange={(open) => {
                              if (!open) {
                                handleCancelTempPasswordGeneration();
                              }
                            }}
                          >
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle className="flex items-center text-amber-600">
                                  <AlertTriangle className="w-5 h-5 mr-2" />
                                  Generate Temporary Password
                                </DialogTitle>
                              </DialogHeader>
                              <div className="py-4">
                                <p className="text-sm text-muted-foreground mb-4">
                                  You are about to generate a temporary password for <strong>{tempPasswordConfirmDialog.username}</strong>.
                                </p>
                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                                  <div className="text-sm text-amber-800 dark:text-amber-200">
                                    <strong>⚠️ Warning:</strong> This action is not reversible and will:
                                    <ul className="ml-4 mt-2 space-y-1 text-xs">
                                      <li>• Immediately invalidate the user's current password</li>
                                      <li>• Log the user out of all active sessions immediately</li>
                                      <li>• Force disconnect the user from the platform</li>
                                      <li>• Generate a new temporary password that expires in 24 hours</li>
                                      <li>• Require the user to log in with temp password and change it</li>
                                    </ul>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  The user will need to use the temporary password to log in and then set a new permanent password.
                                </p>
                              </div>
                              <div className="flex justify-end space-x-2">
                                <Button variant="outline" onClick={handleCancelTempPasswordGeneration}>
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={handleConfirmGenerateTempPassword}
                                  disabled={generateTempPasswordMutation.isPending}
                                  className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                  {generateTempPasswordMutation.isPending ? (
                                    <>
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                      Generating...
                                    </>
                                  ) : (
                                    <>
                                      <Key className="w-3 h-3 mr-1" />
                                      Generate Temporary Password
                                    </>
                                  )}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded User Details */}
                      {expandedUser === user.id && (
                        <div className="border-t bg-muted/20 p-4">
                          <div className="space-y-4">
                            {/* User Details Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <label className="font-medium text-muted-foreground">Full Name</label>
                                <div>{user.full_name || 'Not provided'}</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Status</label>
                                <div className="flex space-x-1 flex-wrap">
                                  {user.is_active ? (
                                    <Badge className="badge-success text-xs">Active</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">Inactive</Badge>
                                  )}
                                  {user.is_verified ? (
                                    <Badge className="badge-info text-xs">Verified</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">Unverified</Badge>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Last Login</label>
                                <div>{user.last_login ? formatDate(user.last_login) : 'Never'}</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Member Since</label>
                                <div>{formatDate(user.created_at)}</div>
                              </div>
                            </div>
                            
                            {/* Temporary Password Section */}
                            {tempPasswordResult && tempPasswordResult.userId === user.id && (
                              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Temporary Password:</span>
                                    <div className="flex items-center gap-1">
                                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded font-mono text-blue-900 dark:text-blue-100 text-sm">
                                        {tempPasswordVisibility[user.id] ? tempPasswordResult.password : '••••••••'}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setTempPasswordVisibility(prev => ({ ...prev, [user.id]: !prev[user.id] }))}
                                        title={tempPasswordVisibility[user.id] ? 'Hide password' : 'Show password'}
                                        className="h-6 w-6 p-0 text-blue-600 dark:text-blue-400"
                                      >
                                        {tempPasswordVisibility[user.id] ? (
                                          <EyeOff className="w-3 h-3" />
                                        ) : (
                                          <Eye className="w-3 h-3" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => navigator.clipboard.writeText(tempPasswordResult.password)}
                                      title="Copy password"
                                      className="h-6 w-6 p-0 text-blue-600 dark:text-blue-400"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setTempPasswordResult(null);
                                        localStorage.removeItem('admin_temp_password');
                                      }}
                                      title="Dismiss"
                                      className="h-6 w-6 p-0 text-blue-600 dark:text-blue-400"
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="text-xs text-blue-600 dark:text-blue-300 mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{getRemainingTime(tempPasswordResult.createdAt)} • User should change after login.</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
                </div>
              )}
            </div>
            </Card>
          </div>

          {/* Mobile Content - Show below dropdown on small screens */}
          <div className="block lg:hidden">
            <div className="mt-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">

        {/* Stats Cards - Mobile version with skeleton loading */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.total_users}</div>
                  <p className="text-xs text-muted-foreground">
                    +{stats.new_users_today} today
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-16 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-20 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Code className="w-4 h-4 mr-2" />
                Code Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.total_code_executions}</div>
                  <p className="text-xs text-muted-foreground">
                    +{stats.executions_today} today
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-20 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-24 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Share2 className="w-4 h-4 mr-2" />
                Collaboration Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.total_collaboration_sessions}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.active_sessions} active
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-16 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-20 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Error Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-2xl font-bold">{stats.error_rate_percentage}%</div>
                  <p className="text-xs text-muted-foreground">
                    of executions
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold bg-muted rounded h-8 w-12 animate-pulse"></div>
                  <div className="text-xs bg-muted rounded h-4 w-24 animate-pulse mt-1"></div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Popular Languages */}
        {stats && stats.popular_languages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Popular Languages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {stats.popular_languages.map((lang: { language: string; count: number }) => (
                  <div key={lang.language} className="text-center">
                    <div className="text-2xl font-bold">{lang.count}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {lang.language}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

            {/* Recent Activities Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Activity className="w-5 h-5 mr-2" />
                    Recent Activities
                  </span>
                  <Badge variant="outline">{getFilteredActivities().length} shown</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {getFilteredActivities().slice(0, 5).map((activity) => (
                    <div key={`${activity.activity_type}-${activity.id}`} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          {getActivityIcon(activity.activity_type)}
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-sm">
                                {activity.username || 'Anonymous'}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {activity.activity_type.replace('_', ' ')}
                              </Badge>
                              {getStatusBadge(activity.status)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(activity.timestamp)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
                </div>
              )}
              
              {activeTab === 'classrooms' && (
                <div className="space-y-4">
                  {/* Mobile Classroom Management */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center">
                            <Shield className="w-5 h-5 mr-2" />
                            Classroom Management
                          </CardTitle>
                          <p className="text-muted-foreground text-sm mt-1">
                            Manage classrooms and settings
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => setIsCreatingClassroom(!isCreatingClassroom)}
                          className="text-xs"
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          {isCreatingClassroom ? 'Cancel' : 'Create'}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">

                        {/* Create classroom form - mobile optimized */}
                        {isCreatingClassroom && (
                          <div className="border rounded-lg p-4 bg-muted/20">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-medium">Create New Classroom</h4>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleCancelClassroomCreation}
                                className="h-8 w-8 p-0"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <Label htmlFor="mobile-classroom-name" className="text-sm">Name *</Label>
                                <Input
                                  id="mobile-classroom-name"
                                  value={newClassroom.name}
                                  onChange={(e) => setNewClassroom(prev => ({...prev, name: e.target.value}))}
                                  placeholder="e.g., CS101 Spring 2024"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor="mobile-classroom-description" className="text-sm">Description</Label>
                                <Input
                                  id="mobile-classroom-description"
                                  value={newClassroom.description}
                                  onChange={(e) => setNewClassroom(prev => ({...prev, description: e.target.value}))}
                                  placeholder="Brief description (optional)"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor="mobile-max-members" className="text-sm">Max Students</Label>
                                <Input
                                  id="mobile-max-members"
                                  type="number"
                                  value={newClassroom.maxMembers}
                                  onChange={(e) => setNewClassroom(prev => ({...prev, maxMembers: e.target.value}))}
                                  placeholder="100"
                                  min="1"
                                  max="1000"
                                  className="mt-1"
                                />
                              </div>
                              
                              {/* Error and Success Messages */}
                              {classroomCreationError && (
                                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                  <div className="flex items-center space-x-2">
                                    <AlertTriangle className="h-4 w-4 text-destructive" />
                                    <span className="text-sm text-destructive font-medium">
                                      {classroomCreationError}
                                    </span>
                                  </div>
                                </div>
                              )}
                              
                              {classroomCreationSuccess && (
                                <div className="p-3 rounded-md bg-green-50 border border-green-200">
                                  <div className="flex items-center space-x-2">
                                    <Check className="h-4 w-4 text-green-600" />
                                    <span className="text-sm text-green-700 font-medium">
                                      {classroomCreationSuccess}
                                    </span>
                                  </div>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-2 pt-2">
                                <Button 
                                  onClick={handleCreateClassroom}
                                  disabled={creatingClassroom || !newClassroom.name.trim()}
                                  size="sm"
                                  className="flex-1"
                                >
                                  {creatingClassroom ? 'Creating...' : 'Create Classroom'}
                                </Button>
                                <Button 
                                  variant="outline"
                                  onClick={handleCancelClassroomCreation}
                                  disabled={creatingClassroom}
                                  size="sm"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {user?.classroom_context?.classrooms && user.classroom_context.classrooms.length > 0 ? (
                          <div className="space-y-3">
                            {user.classroom_context.classrooms.map((classroom) => (
                            <div key={classroom.id} className="border rounded-lg">
                              <div 
                                className="p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                                onClick={() => handleClassroomClick(classroom.id)}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center space-x-2">
                                        <h4 className="font-semibold text-sm truncate">{classroom.name}</h4>
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          {classroom.role}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        {expandedClassroom === classroom.id ? (
                                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        )}
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          className="h-6 w-6 p-0 ml-2"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteClassroomClick(classroom.id, classroom.name, classroom.member_count);
                                          }}
                                          title="Delete classroom"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span><span className="font-medium">Key:</span> 
                                        <code className="ml-1 px-1 py-0.5 bg-muted rounded text-xs font-mono">
                                          {classroom.key}
                                        </code></span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyClassroomKey(classroom.key, classroom.id);
                                          }}
                                          title={copiedClassroomKey === classroom.id ? "Copied!" : "Copy classroom key"}
                                        >
                                          {copiedClassroomKey === classroom.id ? (
                                            <Check className="w-3 h-3 text-green-600" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                        </Button>
                                      </div>
                                      <div>
                                        <span className="font-medium">Members:</span> {classroom.member_count}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Copy-Paste Toggle Section */}
                              <div className="px-3 py-2 bg-muted/10 border-t border-muted/50">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs font-medium">Copy-Paste:</span>
                                    <span className="text-xs text-muted-foreground">
                                      {(() => {
                                        const { copy_paste_enabled, isLoading } = getClassroomSettings(classroom.id);
                                        return isLoading ? 'Loading...' : (copy_paste_enabled ? 'Enabled' : 'Disabled');
                                      })()}
                                    </span>
                                  </div>
                                  <Switch
                                    checked={getClassroomSettings(classroom.id).copy_paste_enabled}
                                    onCheckedChange={(checked) => handleClassroomCopyPasteToggle(classroom.id, checked)}
                                    disabled={getClassroomSettings(classroom.id).isLoading}
                                    className="scale-75"
                                  />
                                </div>
                                
                                {/* Inline Notification for this classroom */}
                                {classroomNotifications[classroom.id] && (
                                  <div className={`mt-2 p-2 rounded text-xs ${
                                    classroomNotifications[classroom.id]?.type === 'success' 
                                      ? 'bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                                      : 'bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                                  }`}>
                                    <div className="flex items-center">
                                      {classroomNotifications[classroom.id]?.type === 'success' ? (
                                        <Check className="w-3 h-3 mr-1" />
                                      ) : (
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                      )}
                                      {classroomNotifications[classroom.id]?.message}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Expanded Member List - Mobile optimized */}
                              {expandedClassroom === classroom.id && (
                                <div className="border-t bg-muted/20">
                                  <ClassroomMembersList 
                                    classroomId={classroom.id}
                                    members={getClassroomMembers(classroom.id).members}
                                    isLoading={getClassroomMembers(classroom.id).isLoading}
                                    handleRemoveMemberClick={handleRemoveMemberClick}
                                    handleAddStudentByEmail={handleAddStudentByEmail}
                                    studentEmails={studentEmails}
                                    setStudentEmails={setStudentEmails}
                                    addingStudent={addingStudent}
                                    userSearchError={userSearchError}
                                    setUserSearchError={setUserSearchError}
                                    classroom={classroom}
                                  />
                                </div>
                              )}
                            </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground">
                            <Shield className="w-8 h-8 mx-auto mb-3 opacity-50" />
                            {isAdmin ? (
                              <>
                                <p className="text-sm font-medium text-foreground mb-2">No classrooms yet</p>
                                <p className="text-xs mb-3">Create your first classroom to get started</p>
                                <Button 
                                  onClick={() => setIsCreatingClassroom(true)}
                                  size="sm" 
                                  variant="default"
                                  className="mb-2"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Create Classroom
                                </Button>
                              </>
                            ) : (
                              <>
                                <p className="text-sm">No classrooms found</p>
                                <p className="text-xs mb-3">This might be a data loading issue</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
              
              {activeTab === 'templates' && (
                <div className="space-y-6">
                  <TemplateManager />
                </div>
              )}

              {activeTab === 'assignments' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <FileText className="w-5 h-5 mr-2" />
                        Assignment Management
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AssignmentUpload onAssignmentCreated={loadAllData} />
                      <div className="mt-6">
                        <AssignmentReports />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'template-executions' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center">
                        <Play className="w-5 h-5 mr-2" />
                        Template Executions
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getFilteredTemplateExecutions().length} shown
                        </Badge>
                      </CardTitle>
                      
                      {/* Mobile-optimized Filters */}
                      <div className="space-y-2 mt-4">
                        <Select value={templateNameFilter} onValueChange={setTemplateNameFilter}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Filter by template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All templates</SelectItem>
                            {templates.map((template: any) => (
                              <SelectItem key={template.id} value={template.name}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={templateLanguageFilter} onValueChange={setTemplateLanguageFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Language" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All languages</SelectItem>
                              <SelectItem value="python">Python</SelectItem>
                              <SelectItem value="javascript">JavaScript</SelectItem>
                              <SelectItem value="java">Java</SelectItem>
                              <SelectItem value="cpp">C++</SelectItem>
                              <SelectItem value="go">Go</SelectItem>
                              <SelectItem value="rust">Rust</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <Select value={templateStatusFilter} onValueChange={setTemplateStatusFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All statuses</SelectItem>
                              <SelectItem value="success">Success</SelectItem>
                              <SelectItem value="error">Error</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {getFilteredTemplateExecutions().slice((templateExecutionsPage - 1) * 10, templateExecutionsPage * 10).map((execution: TemplateExecution) => (
                          <div key={execution.id} className="border rounded-lg overflow-hidden">
                            {/* Mobile Execution Card */}
                            <div 
                              className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setExpandedExecution(
                                expandedExecution === execution.id ? null : execution.id
                              )}
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                                    <span className="font-medium text-sm truncate">
                                      {execution.username || 'Anonymous'}
                                    </span>
                                    <Badge variant="outline" className="text-xs shrink-0">
                                      {execution.language}
                                    </Badge>
                                  </div>
                                  {getStatusBadge(execution.status)}
                                </div>
                                
                                {execution.template_name && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    Template: {execution.template_name}
                                  </div>
                                )}
                                
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{formatDate(execution.created_at)}</span>
                                  {execution.execution_time && (
                                    <span>{execution.execution_time.toFixed(3)}s</span>
                                  )}
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="h-6 w-12 text-xs p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedExecution(
                                        expandedExecution === execution.id ? null : execution.id
                                      );
                                    }}
                                  >
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                </div>
                                
                                {execution.error_message && (
                                  <div className="text-xs text-destructive bg-destructive/10 p-2 rounded max-h-20 overflow-y-auto">
                                    {execution.error_message}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Mobile Expanded View */}
                            {expandedExecution === execution.id && (
                              <div className="border-t bg-muted/20 p-3">
                                <div className="space-y-3">
                                  {/* Execution Info */}
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <span className="font-medium text-muted-foreground">User:</span>
                                      <div className="truncate">{execution.username}</div>
                                    </div>
                                    <div>
                                      <span className="font-medium text-muted-foreground">Language:</span>
                                      <div className="capitalize">{execution.language}</div>
                                    </div>
                                  </div>

                                  {/* Code Preview */}
                                  <div className="bg-background border rounded-lg">
                                    <div className="border-b px-3 py-2 bg-muted/30">
                                      <h5 className="text-xs font-medium">Code</h5>
                                    </div>
                                    <div className="p-3 max-h-64 overflow-y-auto">
                                      <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                                        <code>{execution.code}</code>
                                      </pre>
                                    </div>
                                  </div>

                                  {/* Output Preview */}
                                  {(execution.output || execution.error_message) && (
                                    <div className="bg-background border rounded-lg">
                                      <div className="border-b px-3 py-2 bg-muted/30">
                                        <h5 className="text-xs font-medium">Output</h5>
                                      </div>
                                      <div className="p-3 max-h-48 overflow-y-auto">
                                        {execution.output && (
                                          <pre className="text-xs bg-green-50 dark:bg-green-950/20 p-2 rounded overflow-x-auto mb-2">
                                            <code className="text-green-800 dark:text-green-200">
                                              {execution.output}
                                            </code>
                                          </pre>
                                        )}
                                        {execution.error_message && (
                                          <pre className="text-xs bg-red-50 dark:bg-red-950/20 p-2 rounded overflow-x-auto">
                                            <code className="text-red-800 dark:text-red-200">
                                              {execution.error_message}
                                            </code>
                                          </pre>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Input Data */}
                                  {execution.input_data && (
                                    <div className="bg-background border rounded-lg">
                                      <div className="border-b px-3 py-2 bg-muted/30">
                                        <h5 className="text-xs font-medium">Input Data</h5>
                                      </div>
                                      <div className="p-3 max-h-32 overflow-y-auto">
                                        <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                                          <code>{execution.input_data}</code>
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {getFilteredTemplateExecutions().length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Play className="w-8 h-8 mx-auto mb-3 opacity-50" />
                            <p className="text-sm font-medium text-foreground mb-1">No executions found</p>
                            <p className="text-xs">Template executions will appear here once users start running code</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Mobile Pagination */}
                      {Math.ceil(getFilteredTemplateExecutions().length / 10) > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t">
                          <div className="text-xs text-muted-foreground">
                            Page {templateExecutionsPage} of {Math.ceil(getFilteredTemplateExecutions().length / 10)}
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTemplateExecutionsPage(templateExecutionsPage - 1)}
                              disabled={templateExecutionsPage <= 1}
                              className="h-8 w-8 p-0"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTemplateExecutionsPage(templateExecutionsPage + 1)}
                              disabled={templateExecutionsPage >= Math.ceil(getFilteredTemplateExecutions().length / 10)}
                              className="h-8 w-8 p-0"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'template-submissions' && (
                <div className="space-y-6">
                  <TemplateSubmissions />
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <AdminAnalytics />
                </div>
              )}

              {activeTab === 'users' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center">
                        <Users className="w-5 h-5 mr-2" />
                        User Management
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getFilteredUsers().length} shown
                        </Badge>
                      </CardTitle>
                      
                      {/* Mobile Search */}
                      <div className="flex items-center space-x-2 mt-4">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search users..."
                          value={userSearch}
                          onChange={(e) => {
                            setUserSearch(e.target.value);
                            if (userSearchError) setUserSearchError(null);
                          }}
                          className={`flex-1 ${userSearchError ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                        />
                      </div>
                      
                      {/* Inline User Search Error */}
                      {userSearchError && (
                        <div className="mt-2 flex items-start space-x-2 p-2 border border-red-200 rounded bg-red-50 dark:bg-red-950/20 dark:border-red-900/30">
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-red-700 dark:text-red-400">{userSearchError}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setUserSearchError(null)}
                            className="h-6 w-6 p-0 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            ×
                          </Button>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {getFilteredUsers().map((user: AdminUser) => (
                          <div key={user.id} className="border rounded-lg overflow-hidden">
                            <div 
                              className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-2 mb-2">
                                    <span className="font-medium text-sm truncate">{user.username}</span>
                                    {!user.is_active && (
                                      <Badge variant="destructive" className="text-xs shrink-0">Inactive</Badge>
                                    )}
                                    {!user.is_verified && (
                                      <Badge variant="outline" className="text-xs shrink-0">Unverified</Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground mb-1 truncate">
                                    {user.email}
                                  </div>
                                  <div className="text-xs text-muted-foreground mb-1">
                                    {user.code_executions} executions • {user.collaboration_sessions} sessions
                                </div>
                                  <div className="text-xs text-muted-foreground">
                                    Joined: {formatDate(user.created_at)}
                                  </div>
                                  {user.last_login && (
                                    <div className="text-xs text-muted-foreground">
                                      Last login: {formatDate(user.last_login)}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex flex-col space-y-1 shrink-0 ml-3">
                                  {/* Toggle Activation Button */}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requestUserActivationToggle(user.id, user.username, user.is_active);
                                    }}
                                    className="h-8 w-8 p-0"
                                    title={user.is_active ? 'Deactivate user' : 'Activate user'}
                                    disabled={toggleUserMutation.isPending}
                                  >
                                    {user.is_active ? (
                                      <UserX className="w-3 h-3" />
                                    ) : (
                                      <UserCheck className="w-3 h-3" />
                                    )}
                                  </Button>
                                  
                                  {/* Generate Temp Password Button */}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleGenerateTempPasswordRequest(user.id, user.username);
                                    }}
                                    disabled={generateTempPasswordMutation.isPending}
                                    title="Generate temporary password"
                                    className="h-8 w-8 p-0"
                                  >
                                    <Key className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                            
                            {/* Expanded User Details - Mobile */}
                            {expandedUser === user.id && (
                              <div className="border-t bg-muted/20 p-3">
                                <div className="space-y-3">
                                  {/* User Details Grid - Mobile Optimized */}
                                  <div className="grid grid-cols-1 gap-3 text-sm">
                                    <div>
                                      <label className="font-medium text-muted-foreground text-xs">Full Name</label>
                                      <div className="text-sm">{user.full_name || 'Not provided'}</div>
                                    </div>
                                    <div>
                                      <label className="font-medium text-muted-foreground text-xs">Status</label>
                                      <div className="flex space-x-1 flex-wrap">
                                        {user.is_active ? (
                                          <Badge className="badge-success text-xs">Active</Badge>
                                        ) : (
                                          <Badge variant="destructive" className="text-xs">Inactive</Badge>
                                        )}
                                        {user.is_verified ? (
                                          <Badge className="badge-info text-xs">Verified</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-xs">Unverified</Badge>
                                        )}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="font-medium text-muted-foreground text-xs">Last Login</label>
                                        <div className="text-sm">{user.last_login ? formatDate(user.last_login) : 'Never'}</div>
                                      </div>
                                      <div>
                                        <label className="font-medium text-muted-foreground text-xs">Member Since</label>
                                        <div className="text-sm">{formatDate(user.created_at)}</div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Temporary Password Section - Mobile */}
                                  {tempPasswordResult && tempPasswordResult.userId === user.id && (
                                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                          <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Temporary Password:</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded font-mono text-blue-900 dark:text-blue-100 text-sm flex-1">
                                            {tempPasswordVisibility[user.id] ? tempPasswordResult.password : '••••••••••••'}
                                          </code>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTempPasswordVisibility(prev => ({ ...prev, [user.id]: !prev[user.id] }))}
                                            title={tempPasswordVisibility[user.id] ? 'Hide password' : 'Show password'}
                                            className="h-8 w-8 p-0 text-blue-600 dark:text-blue-400"
                                          >
                                            {tempPasswordVisibility[user.id] ? (
                                              <EyeOff className="w-4 h-4" />
                                            ) : (
                                              <Eye className="w-4 h-4" />
                                            )}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => navigator.clipboard.writeText(tempPasswordResult.password)}
                                            title="Copy password"
                                            className="h-8 w-8 p-0 text-blue-600 dark:text-blue-400"
                                          >
                                            <Copy className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setTempPasswordResult(null);
                                              localStorage.removeItem('admin_temp_password');
                                            }}
                                            title="Dismiss"
                                            className="h-8 w-8 p-0 text-blue-600 dark:text-blue-400"
                                          >
                                            <X className="w-4 h-4" />
                                          </Button>
                                        </div>
                                        <div className="text-xs text-blue-600 dark:text-blue-300 flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3" />
                                          <span>{getRemainingTime(tempPasswordResult.createdAt)} • User should change after login.</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {getFilteredUsers().length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Users className="w-8 h-8 mx-auto mb-3 opacity-50" />
                            <p className="text-sm font-medium text-foreground mb-1">No users found</p>
                            <p className="text-xs">
                              {userSearch ? 'Try adjusting your search terms' : 'User data will appear here once users register'}
                            </p>
                      </div>
                        )}
                      </div>
                      
                      {/* Mobile Load More (if needed) */}
                      {!userSearch && adminUsers.length > 10 && (
                        <div className="pt-4 border-t text-center">
                          <p className="text-xs text-muted-foreground mb-2">
                            Showing first 10 users. Use search to find specific users.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Dialogs - Available on all tabs */}
      {/* User Activation/Deactivation Confirmation Dialog */}
      <Dialog open={userActivationDialog.open} onOpenChange={(open) => {
        if (!open) handleCancelUserActivation();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={`flex items-center ${
              userActivationDialog.action === 'deactivate' ? 'text-red-600' : 'text-green-600'
            }`}>
              {userActivationDialog.action === 'deactivate' ? (
                <UserX className="w-5 h-5 mr-2" />
              ) : (
                <UserCheck className="w-5 h-5 mr-2" />
              )}
              {userActivationDialog.action === 'deactivate' ? 'Deactivate User' : 'Activate User'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to <strong>{userActivationDialog.action}</strong> the user <strong>{userActivationDialog.username}</strong>?
            </p>
            
            {userActivationDialog.action === 'deactivate' ? (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
                <div className="text-sm text-red-800 dark:text-red-200">
                  <strong>⚠️ Warning:</strong> Deactivating this user will:
                  <ul className="ml-4 mt-2 space-y-1 text-xs">
                    <li>• Prevent the user from logging in</li>
                    <li>• Log the user out of all active sessions immediately</li>
                    <li>• Disconnect the user from any active collaboration sessions</li>
                    <li>• Block access to all platform features</li>
                    <li>• The user can be reactivated later if needed</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4">
                <div className="text-sm text-green-800 dark:text-green-200">
                  <strong>✅ Reactivating:</strong> This user will:
                  <ul className="ml-4 mt-2 space-y-1 text-xs">
                    <li>• Be able to log in again</li>
                    <li>• Regain access to all platform features</li>
                    <li>• Be able to join collaboration sessions</li>
                    <li>• Have access to their previous data and settings</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleCancelUserActivation}>
              Cancel
            </Button>
            <Button 
              variant={userActivationDialog.action === 'deactivate' ? 'destructive' : 'default'}
              onClick={handleConfirmUserActivation}
              disabled={toggleUserMutation.isPending}
              className={userActivationDialog.action === 'deactivate' 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-green-600 hover:bg-green-700 text-white'
              }
            >
              {toggleUserMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                  {userActivationDialog.action === 'deactivate' ? 'Deactivating...' : 'Activating...'}
                </>
              ) : (
                <>
                  {userActivationDialog.action === 'deactivate' ? (
                    <UserX className="w-3 h-3 mr-1" />
                  ) : (
                    <UserCheck className="w-3 h-3 mr-1" />
                  )}
                  {userActivationDialog.action === 'deactivate' ? 'Deactivate User' : 'Activate User'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
