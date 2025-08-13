import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { apiService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import AssignmentUpload from './AssignmentUpload';
import AssignmentReports from './AssignmentReports';
import TemplateManager from './TemplateManager';
import { 
  Users, 
  Activity, 
  Code, 
  Share2, 
  AlertTriangle, 
  TrendingUp,
  Search,
  Eye,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
  ChevronDown,
  Menu
} from 'lucide-react';

interface AdminStats {
  total_users: number;
  total_code_executions: number;
  total_collaboration_sessions: number;
  active_sessions: number;
  executions_today: number;
  new_users_today: number;
  error_rate_percentage: number;
  popular_languages: Array<{ language: string; count: number }>;
}

interface UserActivity {
  id: number;
  user_id?: number;
  username?: string;
  email?: string;
  activity_type: string;
  activity_data: any;
  timestamp: string;
  status?: string;
  error_message?: string;
}

interface UserActivitiesResponse {
  activities: UserActivity[];
  total: number;
  page: number;
  page_size: number;
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

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [activityType, setActivityType] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalActivities, setTotalActivities] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState('overview');
  

  
  const pageSize = 20;
  // Use backend API to verify admin status instead of hardcoded email
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    if (user) {
      // Check admin status via backend API
      const checkAdminStatus = async () => {
        try {
          await apiService.getAdminStats();
          setIsAdmin(true);
        } catch (error) {
          setIsAdmin(false);
        }
      };
      checkAdminStatus();
    }
  }, [user]);

  // Load admin stats
  const loadStats = async () => {
    try {
      const data = await apiService.getAdminStats();
      setStats(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load stats');
    }
  };

  // Load user activities
  const loadActivities = async (page: number = 1) => {
    try {
      const data: UserActivitiesResponse = await apiService.getAdminActivities(
        page, 
        pageSize, 
        activityType === 'all' ? undefined : activityType || undefined, 
        statusFilter === 'all' ? undefined : statusFilter || undefined
      );
      setActivities(data.activities);
      setTotalActivities(data.total);
      setCurrentPage(data.page);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load activities');
    }
  };

  // Load users
  const loadUsers = async () => {
    try {
      const data = await apiService.getAdminUsers(1, 50, userSearch || undefined);
      setUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load users');
    }
  };

  // Toggle user activation
  const toggleUserActivation = async (userId: number, activate: boolean) => {
    try {
      if (activate) {
        await apiService.activateUser(userId);
      } else {
        await apiService.deactivateUser(userId);
      }
      
      await loadUsers(); // Reload users list
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || `Failed to ${activate ? 'activate' : 'deactivate'} user`);
    }
  };



  // Load all data
  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadStats(),
        loadActivities(),
        loadUsers()
      ]);
    } catch (err: any) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadAllData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadActivities(1);
    }
  }, [activityType, statusFilter, isAuthenticated, isAdmin]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadUsers();
    }
  }, [userSearch, isAuthenticated, isAdmin]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
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

  const totalPages = Math.ceil(totalActivities / pageSize);

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

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-destructive mb-2">Admin Dashboard Error</h2>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
            <p className="text-destructive font-mono text-sm">{error}</p>
          </div>
          <p className="text-muted-foreground mb-4 text-sm">
            This usually happens when:
            <br />• Backend server is not running
            <br />• Authentication token expired
            <br />• Admin endpoints are not accessible
          </p>
          <div className="space-x-2">
            <Button onClick={loadAllData} variant="outline">
              Try Again
            </Button>
            <Button onClick={() => navigate('/')} variant="default">
              Go to IDE
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
            <p className="text-muted-foreground text-sm lg:text-base">Monitor system activity and manage users</p>
          </div>
          <Button onClick={loadAllData} variant="outline" className="shrink-0">
            <Activity className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {/* Main Content with Responsive Tabs/Dropdown */}
        <div className="w-full">
          {/* Mobile Dropdown */}
          <div className="block md:hidden mb-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center">
                    <Menu className="w-4 h-4 mr-2" />
                    {activeTab === 'overview' && 'System Overview'}
                    {activeTab === 'templates' && 'Templates'}
                    {activeTab === 'assignments' && 'Assignments'}
                    {activeTab === 'users' && 'Users'}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem onClick={() => setActiveTab('overview')}>
                  <Activity className="w-4 h-4 mr-2" />
                  System Overview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('templates')}>
                  <FileText className="w-4 h-4 mr-2" />
                  Template Management
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('assignments')}>
                  <Code className="w-4 h-4 mr-2" />
                  Assignment Management
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('users')}>
                  <Users className="w-4 h-4 mr-2" />
                  User Management
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="hidden md:grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="text-sm">
                <Activity className="w-4 h-4 mr-2" />
                System Overview
              </TabsTrigger>
              <TabsTrigger value="templates" className="text-sm">
                <FileText className="w-4 h-4 mr-2" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="assignments" className="text-sm">
                <Code className="w-4 h-4 mr-2" />
                Assignments
              </TabsTrigger>
              <TabsTrigger value="users" className="text-sm">
                <Users className="w-4 h-4 mr-2" />
                Users
              </TabsTrigger>
            </TabsList>
          
            {/* Tab Content */}
            <div className="mt-6">
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
                {stats.popular_languages.map((lang) => (
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
                      <Badge variant="outline">{totalActivities} total</Badge>
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
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {activities.map((activity) => (
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
                      Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalActivities)} of {totalActivities} activities
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadActivities(currentPage - 1)}
                        disabled={currentPage <= 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadActivities(currentPage + 1)}
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
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {users.map((user) => (
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
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {users.map((user) => (
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
          </Tabs>
        </div>
      </div>
    </div>
  );
}
