import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Shield, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  useAdminForceLogoutUser,
} from '@/hooks/useAdminData';
import { useNavigate } from 'react-router-dom';
import TemplateManager from './TemplateManager';
import TemplateSubmissions from './TemplateSubmissions';
import AdminAnalytics from './AdminAnalytics';
import AdminShell from './admin/AdminShell';
import OverviewTab from './admin/OverviewTab';
import UsersTab from './admin/UsersTab';
import ClassroomsTab from './admin/ClassroomsTab';
import ExecutionsTab from './admin/ExecutionsTab';
import type {
  AdminActivity,
  AdminUser,
  ResetUsernameDialogState,
  TemplateExecution,
  TempPasswordConfirmState,
  TempPasswordResult,
} from './admin/types';

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

  // Refresh button loading state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Trigger heavy data loading after page is interactive
  useEffect(() => {
    const timer = setTimeout(() => {
      setHeavyDataLoadTrigger(true);
    }, 100); // Shorter delay to ensure heavy queries load too
    return () => clearTimeout(timer);
  }, []);

  const pageSize = 20;

  // Filters and pagination - declared before the queries that send them to the server
  const [activityType, setActivityType] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [activityUserFilter, setActivityUserFilter] = useState('all');
  const [templateExecutionsPage, setTemplateExecutionsPage] = useState(1);
  const [templateNameFilter, setTemplateNameFilter] = useState('all');
  const [templateUserFilter, setTemplateUserFilter] = useState('all');
  const [templateLanguageFilter, setTemplateLanguageFilter] = useState('all');
  const [templateStatusFilter, setTemplateStatusFilter] = useState('all');

  // 'all' means "no filter" to the API
  const asParam = (v: string) => (v === 'all' || !v ? undefined : v);

  // React Query hooks - Stats load immediately for instant data, others lazy load
  const { data: stats, refetch: refetchStats } = useAdminStats(
    activeTab === 'overview' // Stats load immediately when on overview tab
  );

  // Only load data when the specific tab is active AND data loading is triggered
  const { data: adminUsers = [], refetch: refetchUsers } = useAdminUsers(
    activeTab === 'overview' || activeTab === 'users' // Users load immediately for overview and users tab
  );
  const { data: activities, isLoading: activitiesLoading, refetch: refetchActivities } = useAdminActivities(
    activeTab === 'overview', // Activities load immediately on overview tab for better UX
    currentPage,
    pageSize,
    asParam(activityType),
    asParam(statusFilter),
    asParam(activityUserFilter)
  );
  const { data: templateExecutions, refetch: refetchTemplateExecutions } = useTemplateExecutions(
    heavyDataLoadTrigger && activeTab === 'template-executions',
    templateExecutionsPage,
    pageSize,
    asParam(templateNameFilter),
    asParam(templateUserFilter),
    asParam(templateLanguageFilter),
    asParam(templateStatusFilter)
  );
  const { data: templatesOptions = [], refetch: refetchTemplatesOptions } = useTemplatesOptions(
    heavyDataLoadTrigger && (activeTab === 'templates' || activeTab === 'template-executions' || activeTab === 'template-submissions')
  );
  const { data: usersOptions = [], refetch: refetchUsersOptions } = useUsersOptions(
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

  // User search error state
  const [userSearchError, setUserSearchError] = useState<string | null>(null);

  // Get admin status from user data (server-side validated)
  const isAdmin = user?.is_admin || false;

  // Filters
  const [userSearch, setUserSearch] = useState('');

  // Password management state
  const [tempPasswordResult, setTempPasswordResult] = useState<TempPasswordResult | null>(null);
  const [, setTempPasswordUpdateTrigger] = useState(0);
  const [resetUsernameDialog, setResetUsernameDialog] = useState<ResetUsernameDialogState>({
    open: false,
    userId: null,
    newUsername: '',
    currentUsername: ''
  });
  const [tempPasswordConfirmDialog, setTempPasswordConfirmDialog] = useState<TempPasswordConfirmState>({
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

  // Use React Query data directly for client-side filtering (2025 best practice)
  // Server returns exactly one page; `total` is the full filtered count
  const allActivities: AdminActivity[] = activities?.activities || [];
  const activitiesTotal: number = activities?.total ?? 0;
  const allTemplateExecutions: TemplateExecution[] = templateExecutions?.executions || [];
  const executionsTotal: number = templateExecutions?.total ?? 0;

  // Template execution states
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

  // Dropdown options from React Query
  const templates = templatesOptions?.templates || [];
  const combinedUsers = usersOptions?.users || [];

  // Activities and template executions are filtered and paginated by the server.
  // Only the users list is filtered client-side - it is fetched whole.
  const filteredUsers = useMemo(() => {
    if (!userSearch) return adminUsers;

    const searchTerm = userSearch.toLowerCase();
    return adminUsers.filter((u: AdminUser) =>
      u.username?.toLowerCase().includes(searchTerm) ||
      u.email?.toLowerCase().includes(searchTerm) ||
      u.full_name?.toLowerCase().includes(searchTerm) ||
      u.classrooms?.some((c) => c.name.toLowerCase().includes(searchTerm))
    );
  }, [adminUsers, userSearch]);
  const [classroomNotifications, setClassroomNotifications] = useState<{[key: number]: {message: string, type: 'success' | 'error'} | null}>({});

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

      // Held in memory only - never persisted, so it cannot outlive the session
      setTempPasswordResult(tempPasswordData);

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

  // Recomputed on every render; the minute tick comes from tempPasswordUpdateTrigger
  const getRemainingTime = (createdAt: number) => {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const timeLeft = TWENTY_FOUR_HOURS - (Date.now() - createdAt);

    if (timeLeft <= 0) return 'Expired';

    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    return hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
  };

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

  // Refresh data based on the currently active tab
  const loadAllData = async () => {
    setIsRefreshing(true);
    try {
      const refetchPromises: Promise<any>[] = [];

      // Refetch based on active tab only
      switch (activeTab) {
        case 'overview':
          refetchPromises.push(refetchStats());
          refetchPromises.push(refetchUsers());
          refetchPromises.push(refetchActivities());
          break;
        case 'users':
          refetchPromises.push(refetchUsers());
          break;
        case 'template-executions':
          refetchPromises.push(refetchTemplateExecutions());
          refetchPromises.push(refetchTemplatesOptions());
          refetchPromises.push(refetchUsersOptions());
          break;
        case 'templates':
          refetchPromises.push(refetchTemplatesOptions());
          break;
        case 'template-submissions':
          refetchPromises.push(refetchTemplatesOptions());
          refetchPromises.push(refetchUsersOptions());
          break;
        case 'classrooms':
          // Classroom data is managed via user context, also refetch classroom settings
          await refreshUser();
          // Refetch all classroom settings
          const settingsRefetchPromises: Promise<any>[] = [];
          if (classroomSettings1?.refetch) settingsRefetchPromises.push(classroomSettings1.refetch());
          if (classroomSettings2?.refetch) settingsRefetchPromises.push(classroomSettings2.refetch());
          if (classroomSettings3?.refetch) settingsRefetchPromises.push(classroomSettings3.refetch());
          if (classroomSettings4?.refetch) settingsRefetchPromises.push(classroomSettings4.refetch());
          if (classroomSettings5?.refetch) settingsRefetchPromises.push(classroomSettings5.refetch());
          await Promise.all(settingsRefetchPromises);
          break;
        case 'analytics':
          // Analytics component manages its own data, trigger a page-level refresh
          // by briefly toggling the heavyDataLoadTrigger which will cause child components to reload
          setHeavyDataLoadTrigger(false);
          setTimeout(() => setHeavyDataLoadTrigger(true), 50);
          break;
      }

      await Promise.all(refetchPromises);

    } catch (err: any) {
      console.error('Error refreshing admin data:', err);
    } finally {
      setIsRefreshing(false);
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

  // Check for expired temp password and update remaining time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (tempPasswordResult) {
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

        if (now - tempPasswordResult.createdAt >= TWENTY_FOUR_HOURS) {
          setTempPasswordResult(null);
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

      // No user refresh here: validateSession() already fetched /auth/me on
      // this page load, and it returns the same classroom context.
    }

    // Cleanup websocket on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [isAuthenticated, isAdmin]); // Only trigger on auth/admin change, NOT filter changes

  // Pagination driven by the server's total, not the size of the current page
  const totalPages = Math.ceil(activitiesTotal / pageSize);
  const executionsTotalPages = Math.ceil(executionsTotal / pageSize);

  // Users search change shared by shell hero-search + tab inputs
  const handleUserSearchChange = (value: string) => {
    setUserSearch(value);
    if (userSearchError) setUserSearchError(null); // Clear error when typing
  };

  // Authentication check
  if (!isAuthenticated) {
    return (
      <div className="page-shell">
        <div className="panel anim-enter mx-auto mt-16 max-w-md p-8 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="page-title mb-2">Sign in required</h1>
          <p className="mb-4 text-muted-foreground">Please sign in to access the admin dashboard</p>
          <Button onClick={() => navigate('/login')}>Sign In</Button>
        </div>
      </div>
    );
  }

  // Show loading while user data is being loaded
  if (!user) {
    return (
      <div className="screen-h flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-foreground">Loading user information...</p>
        </div>
      </div>
    );
  }

  // Admin permission check
  if (!isAdmin) {
    return (
      <div className="page-shell">
        <div className="panel anim-enter mx-auto mt-16 max-w-md p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h1 className="page-title mb-2 text-destructive">Access Denied</h1>
          <p className="mb-4 text-muted-foreground">
            You don't have permission to access the admin dashboard
          </p>
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
    );
  }

  // Check if user has no classrooms (but allow admins to access dashboard to create classrooms)
  if (user?.classroom_context && !user.classroom_context.has_classroom && !isAdmin) {
    return (
      <div className="page-shell">
        <div className="panel anim-enter mx-auto mt-16 max-w-md p-8 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="page-title mb-2">No Classroom Access</h1>
          <p className="mb-4 text-muted-foreground">
            You don't have access to any classrooms yet.
            <br />
            Contact your system administrator to get added to a classroom.
          </p>
          <div className="space-x-2">
            <Button onClick={() => navigate('/')} variant="outline">
              Go to IDE
            </Button>
            <Button onClick={loadAllData} variant="default" disabled={isRefreshing}>
              {isRefreshing ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Note: Removed full-page error display, errors now shown inline

  const classroomNames =
    user?.classroom_context?.classrooms && user.classroom_context.classrooms.length > 0
      ? user.classroom_context.classrooms.map((classroom) => classroom.name).join(', ')
      : undefined;

  return (
    <>
      <AdminShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        classroomNames={classroomNames}
        showNoClassroomWarning={!!user?.classroom_context && !user.classroom_context.has_classroom}
      >
        {/* Keyed CSS entrance rather than AnimatePresence: `mode="wait"` gates
            mounting the next tab on the previous one's exit animation, and a
            stalled exit (observed frozen at opacity 0.27) left the dashboard
            showing the old tab forever. A CSS animation cannot deadlock. */}
        <div key={activeTab} className="anim-enter">
            {activeTab === 'overview' && (
              <OverviewTab
                stats={stats}
                activities={allActivities}
                activitiesLoading={activitiesLoading}
                activitiesTotal={activitiesTotal}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                activityType={activityType}
                setActivityType={setActivityType}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                activityUserFilter={activityUserFilter}
                setActivityUserFilter={setActivityUserFilter}
                combinedUsers={combinedUsers}
                filteredUsers={filteredUsers}
                userSearch={userSearch}
                onUserSearchChange={handleUserSearchChange}
                userSearchError={userSearchError}
                setUserSearchError={setUserSearchError}
                onToggleActivation={requestUserActivationToggle}
                togglePending={toggleUserMutation.isPending}
              />
            )}

            {activeTab === 'classrooms' && (
              <ClassroomsTab
                classrooms={user?.classroom_context?.classrooms || []}
                isAdmin={isAdmin}
                isCreatingClassroom={isCreatingClassroom}
                setIsCreatingClassroom={setIsCreatingClassroom}
                newClassroom={newClassroom}
                setNewClassroom={setNewClassroom}
                classroomCreationError={classroomCreationError}
                classroomCreationSuccess={classroomCreationSuccess}
                creatingClassroom={creatingClassroom}
                onCreateClassroom={handleCreateClassroom}
                onCancelClassroomCreation={handleCancelClassroomCreation}
                expandedClassroom={expandedClassroom}
                onClassroomClick={handleClassroomClick}
                onDeleteClassroomClick={handleDeleteClassroomClick}
                copiedClassroomKey={copiedClassroomKey}
                onCopyClassroomKey={copyClassroomKey}
                getClassroomSettings={getClassroomSettings}
                onCopyPasteToggle={handleClassroomCopyPasteToggle}
                classroomNotifications={classroomNotifications}
                getClassroomMembers={getClassroomMembers}
                handleRemoveMemberClick={handleRemoveMemberClick}
                handleAddStudentByEmail={handleAddStudentByEmail}
                studentEmails={studentEmails}
                setStudentEmails={setStudentEmails}
                addingStudent={addingStudent}
                userSearchError={userSearchError}
                setUserSearchError={setUserSearchError}
                removeModalOpen={removeModalOpen}
                setRemoveModalOpen={setRemoveModalOpen}
                memberToRemove={memberToRemove}
                onConfirmRemoveMember={confirmRemoveMember}
                onCancelRemoveMember={cancelRemoveMember}
                deleteClassroomModalOpen={deleteClassroomModalOpen}
                setDeleteClassroomModalOpen={setDeleteClassroomModalOpen}
                classroomToDelete={classroomToDelete}
                deletingClassroom={deletingClassroom}
                onConfirmDeleteClassroom={confirmDeleteClassroom}
                onCancelDeleteClassroom={cancelDeleteClassroom}
              />
            )}

            {activeTab === 'templates' && (
              <div className="anim-enter space-y-6">
                <TemplateManager />
              </div>
            )}

            {activeTab === 'template-executions' && (
              <ExecutionsTab
                executions={allTemplateExecutions}
                executionsTotal={executionsTotal}
                page={templateExecutionsPage}
                setPage={setTemplateExecutionsPage}
                totalPages={executionsTotalPages}
                pageSize={pageSize}
                templateNameFilter={templateNameFilter}
                setTemplateNameFilter={setTemplateNameFilter}
                templateUserFilter={templateUserFilter}
                setTemplateUserFilter={setTemplateUserFilter}
                templateLanguageFilter={templateLanguageFilter}
                setTemplateLanguageFilter={setTemplateLanguageFilter}
                templateStatusFilter={templateStatusFilter}
                setTemplateStatusFilter={setTemplateStatusFilter}
                templates={templates}
                combinedUsers={combinedUsers}
                expandedExecution={expandedExecution}
                setExpandedExecution={setExpandedExecution}
              />
            )}

            {activeTab === 'template-submissions' && (
              <div className="anim-enter space-y-6">
                <TemplateSubmissions />
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="anim-enter space-y-6">
                <AdminAnalytics />
              </div>
            )}

            {activeTab === 'users' && (
              <UsersTab
                filteredUsers={filteredUsers}
                totalUsers={adminUsers.length}
                userSearch={userSearch}
                onUserSearchChange={handleUserSearchChange}
                userSearchError={userSearchError}
                setUserSearchError={setUserSearchError}
                expandedUser={expandedUser}
                setExpandedUser={setExpandedUser}
                onToggleActivation={requestUserActivationToggle}
                togglePending={toggleUserMutation.isPending}
                onGenerateTempPasswordRequest={handleGenerateTempPasswordRequest}
                generateTempPasswordPending={generateTempPasswordMutation.isPending}
                onResetUsernameRequest={handleResetUsernameRequest}
                resetUsernameDialog={resetUsernameDialog}
                setResetUsernameDialog={setResetUsernameDialog}
                onConfirmResetUsername={handleConfirmResetUsername}
                onCancelUsernameReset={handleCancelUsernameReset}
                resetUsernamePending={adminResetUsernameMutation.isPending}
                tempPasswordConfirmDialog={tempPasswordConfirmDialog}
                onConfirmGenerateTempPassword={handleConfirmGenerateTempPassword}
                onCancelTempPasswordGeneration={handleCancelTempPasswordGeneration}
                tempPasswordResult={tempPasswordResult}
                clearTempPasswordResult={() => setTempPasswordResult(null)}
                tempPasswordVisibility={tempPasswordVisibility}
                toggleTempPasswordVisibility={(userId) =>
                  setTempPasswordVisibility((prev) => ({ ...prev, [userId]: !prev[userId] }))
                }
                getRemainingTime={getRemainingTime}
              />
            )}
        </div>
      </AdminShell>

      {/* Global Dialogs - Available on all tabs */}
      {/* User Activation/Deactivation Confirmation Dialog */}
      <Dialog
        open={userActivationDialog.open}
        onOpenChange={(open) => {
          if (!open) handleCancelUserActivation();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle
              className={`flex items-center ${
                userActivationDialog.action === 'deactivate' ? 'text-destructive' : 'text-success'
              }`}
            >
              {userActivationDialog.action === 'deactivate' ? (
                <UserX className="mr-2 h-5 w-5" />
              ) : (
                <UserCheck className="mr-2 h-5 w-5" />
              )}
              {userActivationDialog.action === 'deactivate' ? 'Deactivate User' : 'Activate User'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm text-muted-foreground">
              Are you sure you want to <strong>{userActivationDialog.action}</strong> the user{' '}
              <strong>{userActivationDialog.username}</strong>?
            </p>

            {userActivationDialog.action === 'deactivate' ? (
              <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <div className="text-sm">
                  <strong>Warning:</strong> Deactivating this user will:
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
              <div className="mb-4 rounded-lg border border-success/20 bg-success/10 p-3">
                <div className="text-sm">
                  <strong>Reactivating:</strong> This user will:
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
            >
              {toggleUserMutation.isPending ? (
                <>
                  <div className="mr-2 h-3 w-3 animate-spin rounded-full border-b-2 border-current"></div>
                  {userActivationDialog.action === 'deactivate' ? 'Deactivating...' : 'Activating...'}
                </>
              ) : (
                <>
                  {userActivationDialog.action === 'deactivate' ? (
                    <UserX className="mr-1 h-3 w-3" />
                  ) : (
                    <UserCheck className="mr-1 h-3 w-3" />
                  )}
                  {userActivationDialog.action === 'deactivate' ? 'Deactivate User' : 'Activate User'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
