import { useState, useCallback, useEffect } from 'react';
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
  useUpdateClassroomSettings
} from '@/hooks/useAdminData';
import { useNavigate } from 'react-router-dom';
import AssignmentUpload from './AssignmentUpload';
import AssignmentReports from './AssignmentReports';
import TemplateManager from './TemplateManager';
import CodeEditor from './CodeEditor';
import OutputConsole from './OutputConsole';
import TemplateSubmissions from './TemplateSubmissions';
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
  Trash2
} from 'lucide-react';



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
  
  // React Query hooks - replaces direct API calls
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useAdminStats();
  const { data: adminUsers = [], isLoading: usersLoading, refetch: refetchUsers } = useAdminUsers();
  const { data: activities = [], isLoading: activitiesLoading } = useAdminActivities();
  const { data: templateExecutions = [], isLoading: templateExecutionsLoading } = useTemplateExecutions();
  const { data: templatesOptions = [] } = useTemplatesOptions();
  const { data: usersOptions = [] } = useUsersOptions();
  
  // Mutations for user actions
  const toggleUserMutation = useToggleUserActivation();
  const createClassroomMutation = useCreateClassroom();
  const deleteClassroomMutation = useDeleteClassroom();
  const addStudentMutation = useAddStudentToClassroom();
  const removeStudentMutation = useRemoveClassroomMember();
  const updateSettingsMutation = useUpdateClassroomSettings();
  
  // Combined loading state for initial load
  const loading = statsLoading || usersLoading || activitiesLoading || templateExecutionsLoading;
  
  // User search error state
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  
  // Get admin status from user data (server-side validated)
  const isAdmin = user?.is_admin || false;
  
  // Filters
  const [activityType, setActivityType] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  
  // Activity filters
  const [activityUserFilter, setActivityUserFilter] = useState('all');
  
  // Use React Query data directly for client-side filtering (2025 best practice)
  const allActivities = activities?.activities || [];
  const allTemplateExecutions = templateExecutions?.executions || [];
  
  // Tab state
  const [activeTab, setActiveTab] = useState('overview');
  
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

  // Toggle user activation using React Query mutation
  const toggleUserActivation = async (userId: number, activate: boolean) => {
    try {
      await toggleUserMutation.mutateAsync({ userId, activate });
    } catch (err: any) {
      console.error(`Failed to ${activate ? 'activate' : 'deactivate'} user:`, err);
    }
  };

  // Hook to get classroom settings using React Query
  const getClassroomSettings = (classroomId: number) => {
    const { data: settings, isLoading } = useClassroomSettings(classroomId, !!classroomId);
    return {
      copy_paste_enabled: settings?.copy_paste_enabled ?? true,
      isLoading
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

  // Hook to get classroom members using React Query
  const getClassroomMembers = (classroomId: number, enabled: boolean = true) => {
    const { data: members = [], isLoading } = useClassroomMembers(classroomId, enabled);
    return { members, isLoading };
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

  // SINGLE useEffect for WebSocket and settings only - React Query handles data loading
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadAdminSettings(isAuthenticated);
      
      // Initialize WebSocket with user and classroom context
      const classroomIds = user?.classroom_context?.classrooms?.map((c: any) => c.id) || [];
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

  const formatDate = (dateString: string) => {
    return new Date(dateString + (dateString.endsWith('Z') ? '' : 'Z')).toLocaleString();
  };

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
                <Button onClick={loadAllData} variant="default">
                  Refresh
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
              {user?.classroom_context?.current_classroom && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <span className="font-medium text-foreground mr-1">Classroom:</span>
                  {user.classroom_context.current_classroom.name}
                  <Badge variant="outline" className="ml-2 text-xs">
                    {user.classroom_context.current_classroom.role}
                  </Badge>
                  <span className="mx-2">•</span>
                  <span>{user.classroom_context.current_classroom.member_count} members</span>
                </div>
              )}
              {user?.classroom_context && !user.classroom_context.has_classroom && (
                <div className="text-sm text-amber-600 dark:text-amber-400">
                  ⚠️ No classroom assigned. Contact system administrator.
                </div>
              )}


            </div>
          </div>
          <Button onClick={loadAllData} variant="outline" className="shrink-0">
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Refresh</span>
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
                    {activeTab === 'users' && 'Users'}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem onClick={() => setActiveTab('overview')}>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  System Overview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('classrooms')}>
                  <Shield className="w-4 h-4 mr-2" />
                  Classrooms
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('templates')}>
                  <FileText className="w-4 h-4 mr-2" />
                  Professor Templates
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('assignments')}>
                  <Code className="w-4 h-4 mr-2" />
                  Assignments
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('template-executions')}>
                  <Play className="w-4 h-4 mr-2" />
                  Executions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('template-submissions')}>
                  <Send className="w-4 h-4 mr-2" />
                  Submissions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('users')}>
                  <Users className="w-4 h-4 mr-2" />
                  Users
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

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_users}</div>
                <p className="text-xs text-muted-foreground">
                  +{stats.new_users_today} today
                </p>
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
                <div className="text-2xl font-bold">{stats.total_code_executions}</div>
                <p className="text-xs text-muted-foreground">
                  +{stats.executions_today} today
                </p>
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
                <div className="text-2xl font-bold">{stats.total_collaboration_sessions}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.active_sessions} active
                </p>
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
                <div className="text-2xl font-bold">{stats.error_rate_percentage}%</div>
                <p className="text-xs text-muted-foreground">
                  of executions
                </p>
              </CardContent>
            </Card>
          </div>
        )}

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
                      <Badge variant="outline">{filteredActivities.length} shown</Badge>
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
                                          {getFilteredActivities().slice((currentPage - 1) * pageSize, currentPage * pageSize).map((activity) => (
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
                  ))}
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
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedUser(user)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent aria-describedby="user-details-description">
                              <DialogHeader>
                                <DialogTitle>User Details</DialogTitle>
                              </DialogHeader>
                              <div id="user-details-description" className="sr-only">
                                Detailed information about the selected user including status and activity
                              </div>
                              {selectedUser && (
                                <div className="space-y-4">
                                  <div>
                                    <label className="text-sm font-medium">Username</label>
                                    <div>{selectedUser.username}</div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Email</label>
                                    <div>{selectedUser.email}</div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Status</label>
                                    <div className="flex space-x-2">
                                      {selectedUser.is_active ? (
                                        <Badge className="badge-success">Active</Badge>
                                      ) : (
                                        <Badge variant="destructive">Inactive</Badge>
                                      )}
                                      {selectedUser.is_verified ? (
                                        <Badge className="badge-info">Verified</Badge>
                                      ) : (
                                        <Badge variant="outline">Unverified</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Activity</label>
                                    <div className="text-sm">
                                      {selectedUser.code_executions} code executions<br/>
                                      {selectedUser.collaboration_sessions} collaboration sessions
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Last Login</label>
                                    <div className="text-sm">
                                      {selectedUser.last_login ? formatDate(selectedUser.last_login) : 'Never'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleUserActivation(user.id, !user.is_active)}
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
                            Manage classrooms, members, and classroom-specific settings
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
                                  {(() => {
                                    const { members, isLoading } = getClassroomMembers(classroom.id, expandedClassroom === classroom.id);
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
                                              Joined: {new Date(member.joined_at + (member.joined_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString()}
                                            </div>
                                          </div>
                                          {member.role !== 'TEACHER' && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleRemoveMemberClick(classroom.id, member.id, member.username)}
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
                                              value={studentEmails[classroom.id] || ''}
                                              onChange={(e) => {
                                                setStudentEmails(prev => ({ 
                                                  ...prev, 
                                                  [classroom.id]: e.target.value 
                                                }));
                                                if (userSearchError) setUserSearchError(null); // Clear error when typing
                                              }}
                                              className={`flex-1 ${userSearchError ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                                              disabled={addingStudent[classroom.id]}
                                            />
                                            <Button
                                              onClick={() => handleAddStudentByEmail(classroom.id)}
                                              disabled={addingStudent[classroom.id] || !studentEmails[classroom.id]?.trim()}
                                              size="sm"
                                            >
                                              {addingStudent[classroom.id] ? (
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
                                          
                                          {/* Error display for add student */}
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
                                  })()}
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
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedUser(user)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent aria-describedby="user-details-description-users">
                              <DialogHeader>
                                <DialogTitle>User Details</DialogTitle>
                              </DialogHeader>
                              <div id="user-details-description-users" className="sr-only">
                                Detailed information about the selected user including status and activity
                              </div>
                              {selectedUser && (
                                <div className="space-y-4">
                                  <div>
                                    <label className="text-sm font-medium">Username</label>
                                    <div>{selectedUser.username}</div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Email</label>
                                    <div>{selectedUser.email}</div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Status</label>
                                    <div className="flex space-x-2">
                                      {selectedUser.is_active ? (
                                        <Badge className="badge-success">Active</Badge>
                                      ) : (
                                        <Badge variant="destructive">Inactive</Badge>
                                      )}
                                      {selectedUser.is_verified ? (
                                        <Badge className="badge-info">Verified</Badge>
                                      ) : (
                                        <Badge variant="outline">Unverified</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Activity</label>
                                    <div className="text-sm">
                                      {selectedUser.code_executions} code executions<br/>
                                      {selectedUser.collaboration_sessions} collaboration sessions
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">Last Login</label>
                                    <div className="text-sm">
                                      {selectedUser.last_login ? formatDate(selectedUser.last_login) : 'Never'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleUserActivation(user.id, !user.is_active)}
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
              )}
            </div>
            </Card>
          </div>

          {/* Mobile Content - Show below dropdown on small screens */}
          <div className="block lg:hidden">
            <div className="mt-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_users}</div>
                <p className="text-xs text-muted-foreground">
                  +{stats.new_users_today} today
                </p>
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
                <div className="text-2xl font-bold">{stats.total_code_executions}</div>
                <p className="text-xs text-muted-foreground">
                  +{stats.executions_today} today
                </p>
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
                <div className="text-2xl font-bold">{stats.total_collaboration_sessions}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.active_sessions} active
                </p>
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
                <div className="text-2xl font-bold">{stats.error_rate_percentage}%</div>
                <p className="text-xs text-muted-foreground">
                  of executions
                </p>
              </CardContent>
            </Card>
          </div>
        )}

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
                                  {(() => {
                                    const { members, isLoading } = getClassroomMembers(classroom.id, expandedClassroom === classroom.id);
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
                                        <div key={member.id} className="p-3">
                                          <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center space-x-2">
                                                <div className="font-medium text-sm truncate">{member.username}</div>
                                                <Badge variant={member.role === 'TEACHER' ? 'default' : 'secondary'} className="text-xs shrink-0">
                                                  {member.role}
                                                </Badge>
                                              </div>
                                              <div className="text-xs text-muted-foreground truncate">
                                                {member.email}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                Joined: {new Date(member.joined_at + (member.joined_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString()}
                                              </div>
                                            </div>
                                            {member.role !== 'TEACHER' && (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRemoveMemberClick(classroom.id, member.id, member.username)}
                                                className="text-red-600 hover:text-red-700 hover:border-red-300 h-8 text-xs"
                                              >
                                                <UserMinus className="w-3 h-3 mr-1" />
                                                Remove
                                              </Button>
                                            )}
                                          </div>
                                            </div>
                                          ))}
                                          
                                          {/* Add student by email - Mobile optimized */}
                                          <div className="p-3 border-t bg-muted/10">
                                        <div className="space-y-2">
                                          <div className="font-medium text-sm">Add Student by Email</div>
                                          <div className="space-y-2">
                                            <Input
                                              placeholder="student@example.com"
                                              type="email"
                                              value={studentEmails[classroom.id] || ''}
                                              onChange={(e) => {
                                                setStudentEmails(prev => ({ 
                                                  ...prev, 
                                                  [classroom.id]: e.target.value 
                                                }));
                                                if (userSearchError) setUserSearchError(null);
                                              }}
                                              className={`${userSearchError ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                                              disabled={addingStudent[classroom.id]}
                                            />
                                            <Button
                                              onClick={() => handleAddStudentByEmail(classroom.id)}
                                              disabled={addingStudent[classroom.id] || !studentEmails[classroom.id]?.trim()}
                                              size="sm"
                                              className="w-full"
                                            >
                                              {addingStudent[classroom.id] ? (
                                                <>
                                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                                  Adding...
                                                </>
                                              ) : (
                                                <>
                                                  <UserPlus className="w-3 h-3 mr-1" />
                                                  Add Student
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                          
                                          {/* Error display for add student */}
                                          {userSearchError && (
                                            <div className="text-xs text-red-600 dark:text-red-400">
                                              {userSearchError}
                                            </div>
                                          )}
                                          
                                          <div className="text-xs text-muted-foreground">
                                            Add existing users to this classroom by their registered email address.
                                          </div>
                                        </div>
                                      </div>

                                      {/* Registration instructions */}
                                      <div className="p-3 bg-blue-50 dark:bg-blue-950 border-t">
                                        <div className="text-xs">
                                          <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                                            For New Students
                                          </div>
                                          <div className="text-blue-700 dark:text-blue-200">
                                            Share the classroom key <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded text-xs">{classroom.key}</code> so new students can register for this classroom.
                                          </div>
                                        </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    return (
                                      <div className="p-4 text-center text-muted-foreground">
                                        <Users className="w-6 h-6 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No members found</p>
                                      </div>
                                    );
                                  })()}
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
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Play className="w-5 h-5 mr-2" />
                        Template Executions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-sm">
                        Use the desktop version for detailed execution viewing.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'template-submissions' && (
                <div className="space-y-6">
                  <TemplateSubmissions />
                </div>
              )}

              {activeTab === 'users' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Users className="w-5 h-5 mr-2" />
                        User Management
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2 mb-4">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search users..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {adminUsers.slice(0, 10).map((user: AdminUser) => (
                          <div key={user.id} className="border rounded-lg p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="font-medium text-sm">{user.username}</span>
                                  {!user.is_active && (
                                    <Badge variant="destructive" className="text-xs">Inactive</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {user.email}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleUserActivation(user.id, !user.is_active)}
                              >
                                {user.is_active ? (
                                  <UserX className="w-3 h-3" />
                                ) : (
                                  <UserCheck className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
