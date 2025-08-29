import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CodeHistory from './CodeHistory';
import UserSubmissions from './UserSubmissions';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { useCodeStore } from '@/store/codeStore';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDateOnly } from '@/lib/dateUtils';
import { apiService } from '@/services/api';
import { 
  useCodeHistory,
  useUserSubmissions,
  useUserSubmissionStats,
  useUserTemplates
} from '@/hooks/useSettingsData';
import { 
  Settings as SettingsIcon, 
  History, 
  User, 
  Bell,
  Moon,
  Sun,
  Monitor,
  PanelLeft,
  PanelLeftOpen,
  Menu,
  ChevronDown,
  Send,
  CheckCircle,
  AlertCircle,
  X,
  Eye,
  EyeOff
} from 'lucide-react';

export default function Settings() {
  const { user, isAuthenticated, refreshUser, logout } = useAuthStore();
  const { setCode, setLanguage } = useCodeStore();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);

  // Tab state and sidebar collapse
  const [activeTab, setActiveTab] = useState('history');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Password change form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Username change form state
  const [usernameForm, setUsernameForm] = useState({
    newUsername: ''
  });
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Notification state for inline messages - separate for each form
  const [passwordNotification, setPasswordNotification] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });
  
  const [usernameNotification, setUsernameNotification] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // React Query hooks - replaces direct API calls and state management
  const { data: codeHistoryData, isLoading: codeHistoryLoading } = useCodeHistory();
  const { data: userSubmissions = [], isLoading: submissionsLoading } = useUserSubmissions();
  const { data: submissionStats = {
    total_submissions: 0,
    success_submissions: 0,
    error_submissions: 0,
    success_rate: 0,
    submissions_by_language: []
  }, isLoading: statsLoading } = useUserSubmissionStats();
  const { data: templates = [], isLoading: templatesLoading } = useUserTemplates();

  // Extract data from React Query responses
  const allCodeHistory = codeHistoryData?.history || [];

  // Notification utility functions
  const showPasswordNotification = (type: 'success' | 'error', message: string) => {
    setPasswordNotification({ type, message });
    // Auto-clear notification after 5 seconds
    setTimeout(() => {
      setPasswordNotification({ type: null, message: '' });
    }, 5000);
  };
  
  const showUsernameNotification = (type: 'success' | 'error', message: string) => {
    setUsernameNotification({ type, message });
    // Auto-clear notification after 5 seconds
    setTimeout(() => {
      setUsernameNotification({ type: null, message: '' });
    }, 5000);
  };

  const handleLoadCode = (historyCode: string, historyLanguage: string) => {
    setCode(historyCode);
    setLanguage(historyLanguage);
    // Navigate back to IDE after loading code
    navigate('/');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      showPasswordNotification('error', 'All password fields are required');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showPasswordNotification('error', 'New password and confirmation do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      showPasswordNotification('error', 'Password must be at least 8 characters long');
      return;
    }

    setPasswordLoading(true);
    try {
      await apiService.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword
      );
      
      showPasswordNotification('success', 'Password changed successfully! Logging you out for security...');
      
      // Clear form
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      // Force logout for security after password change
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 2000); // 2 second delay to show success message
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || 'Failed to change password';
      showPasswordNotification('error', errorMessage);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleUsernameChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!usernameForm.newUsername.trim()) {
      showUsernameNotification('error', 'New username is required');
      return;
    }

    if (usernameForm.newUsername === user?.username) {
      showUsernameNotification('error', 'New username must be different from current username');
      return;
    }

    if (usernameForm.newUsername.length < 3) {
      showUsernameNotification('error', 'Username must be at least 3 characters long');
      return;
    }

    setUsernameLoading(true);
    try {
      await apiService.changeUsername(usernameForm.newUsername);
      
      showUsernameNotification('success', 'Username changed successfully!');
      
      // Clear form
      setUsernameForm({
        newUsername: ''
      });
      
      // Refresh user data to reflect the new username
      await refreshUser();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || 'Failed to change username';
      showUsernameNotification('error', errorMessage);
    } finally {
      setUsernameLoading(false);
    }
  };



  if (!isAuthenticated) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Please sign in to access settings</p>
            <Button onClick={() => navigate('/login')}>Sign In</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-hidden">
        {/* Page Header */}
        <div className="border-b bg-card flex-shrink-0">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-2">
              <SettingsIcon className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Settings</h1>
            </div>
          </div>
        </div>



        {/* Main Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {/* Mobile Dropdown */}
          <div className="block lg:hidden mb-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center">
                    <Menu className="w-4 h-4 mr-2" />
                    {activeTab === 'history' && 'Code History'}
                    {activeTab === 'submissions' && 'Submissions'}
                    {activeTab === 'profile' && 'Profile'}
                    {activeTab === 'preferences' && 'Preferences'}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                className="w-[calc(100vw-2rem)] max-w-none" 
                align="start" 
                sideOffset={4}
              >
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('history')}>
                  <History className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Code History</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('submissions')}>
                  <Send className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Submissions</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('profile')}>
                  <User className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center py-3 px-4" onClick={() => setActiveTab('preferences')}>
                  <Bell className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="flex-1 text-left">Preferences</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Desktop Layout: Left Panel + Right Panel */}
          <div className={`hidden lg:grid lg:gap-6 lg:h-[calc(100vh-160px)] ${
            sidebarCollapsed ? 'lg:grid-cols-[80px_1fr]' : 'lg:grid-cols-[280px_1fr]'
          }`}>
            {/* Left Navigation Panel */}
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  {!sidebarCollapsed && (
                    <CardTitle className="text-lg">Settings Menu</CardTitle>
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
                    variant={activeTab === 'history' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('history')}
                    title={sidebarCollapsed ? 'Code History' : ''}
                  >
            <History className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Code History</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'submissions' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('submissions')}
                    title={sidebarCollapsed ? 'Submissions' : ''}
                  >
            <Send className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Submissions</span>}
                  </Button>
                  <Button
                    variant={activeTab === 'profile' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('profile')}
                    title={sidebarCollapsed ? 'Profile' : ''}
                  >
            <User className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Profile</span>}
                  </Button>
                                    <Button
                    variant={activeTab === 'preferences' ? 'default' : 'ghost'}
                    className={`w-full h-12 px-4 ${
                      sidebarCollapsed ? 'justify-center' : 'justify-start'
                    }`}
                    onClick={() => setActiveTab('preferences')}
                    title={sidebarCollapsed ? 'Preferences' : ''}
                  >
            <Bell className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="ml-3">Preferences</span>}
                  </Button>
                </nav>
            </CardContent>
          </Card>

                        {/* Right Content Panel */}
            <Card className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">

                {activeTab === 'history' && (
                  <div className="space-y-4">
                    <CodeHistory 
                      onLoadCode={handleLoadCode} 
                      allCodeHistory={allCodeHistory}
                      loading={codeHistoryLoading}
                    />
                  </div>
                )}

                {activeTab === 'submissions' && (
                  <div className="space-y-4">
                    <UserSubmissions 
                      allUserSubmissions={userSubmissions}
                      submissionStats={submissionStats}
                      templates={templates}
                      loading={submissionsLoading || statsLoading || templatesLoading}
                    />
                  </div>
                )}

                {activeTab === 'profile' && (
                  <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Username</label>
                  <p className="text-lg">{user?.username}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-lg">{user?.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                  <p className="text-lg">{user?.full_name || 'Not provided'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Account Status</label>
                  <div className="flex items-center space-x-2 mt-1">
                    {user?.is_active ? (
                      <Badge className="badge-success">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                    {user?.is_verified ? (
                      <Badge className="badge-info">Verified</Badge>
                    ) : (
                      <Badge variant="outline">Unverified</Badge>
                    )}

                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                <p className="text-lg">{formatDateOnly(user?.created_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Account Management Section */}
          <Card>
            <CardHeader>
              <CardTitle>Account Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Change Password Form */}
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h4 className="font-medium">Change Password</h4>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ This will log you out of all sessions for security
                  </p>
                </div>
                
                {/* Inline Password Notification */}
                {passwordNotification.type && (
                  <div className={`p-3 rounded-lg border ${
                    passwordNotification.type === 'success' 
                      ? 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                      : 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {passwordNotification.type === 'success' ? (
                          <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium">{passwordNotification.message}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1 hover:bg-transparent"
                        onClick={() => setPasswordNotification({ type: null, message: '' })}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
                
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative mt-1">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                        placeholder="Enter current password"
                        disabled={passwordLoading}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        disabled={passwordLoading}
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative mt-1">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="Enter new password (min 8 characters)"
                        disabled={passwordLoading}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        disabled={passwordLoading}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative mt-1">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm new password"
                        disabled={passwordLoading}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={passwordLoading}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" disabled={passwordLoading}>
                    {passwordLoading ? 'Changing Password...' : 'Change Password'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Note: Changing your password will automatically log you out of all sessions. You'll need to log back in with your new password.
                  </p>
                </form>
              </div>

              {/* Change Username Form */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">Change Username</h4>
                
                {/* Inline Username Notification */}
                {usernameNotification.type && (
                  <div className={`p-3 rounded-lg border ${
                    usernameNotification.type === 'success' 
                      ? 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                      : 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {usernameNotification.type === 'success' ? (
                          <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium">{usernameNotification.message}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1 hover:bg-transparent"
                        onClick={() => setUsernameNotification({ type: null, message: '' })}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
                
                <form onSubmit={handleUsernameChange} className="space-y-4">
                  <div>
                    <Label htmlFor="currentUsername">Current Username</Label>
                    <Input
                      id="currentUsername"
                      value={user?.username || ''}
                      disabled
                      className="bg-muted mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newUsername">New Username</Label>
                    <Input
                      id="newUsername"
                      type="text"
                      value={usernameForm.newUsername}
                      onChange={(e) => setUsernameForm(prev => ({ ...prev, newUsername: e.target.value }))}
                      placeholder="Enter new username (min 3 characters)"
                      disabled={usernameLoading}
                      className="mt-1"
                    />
                  </div>
                  <Button type="submit" disabled={usernameLoading}>
                    {usernameLoading ? 'Changing Username...' : 'Change Username'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Note: Username changes don't require logout. Only password changes will log you out.
                  </p>
                </form>
              </div>
            </CardContent>
          </Card>
                  </div>
                )}

                {activeTab === 'preferences' && (
                  <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Editor Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-3 block">Theme</label>
                <div className="flex space-x-2">
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('light')}
                    className="flex items-center space-x-2"
                  >
                    <Sun className="w-4 h-4" />
                    <span>Light</span>
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                    className="flex items-center space-x-2"
                  >
                    <Moon className="w-4 h-4" />
                    <span>Dark</span>
                  </Button>
                  <Button
                    variant={theme === 'system' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('system')}
                    className="flex items-center space-x-2"
                  >
                    <Monitor className="w-4 h-4" />
                    <span>System</span>
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Notifications</label>
                  <p className="text-sm text-muted-foreground">Receive notifications about code execution results</p>
                </div>
                <Button
                  variant={notifications ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNotifications(!notifications)}
                >
                  {notifications ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2">Editor Settings</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Font size: 14px</p>
                  <p>• Tab size: 2 spaces</p>
                  <p>• Word wrap: Enabled</p>
                  <p>• Line numbers: Enabled</p>
                  <p>• Minimap: Disabled</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  More editor customization options coming soon!
                </p>
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
              {activeTab === 'history' && (
                <div className="space-y-4">
                  <CodeHistory 
                    onLoadCode={handleLoadCode} 
                    allCodeHistory={allCodeHistory}
                    loading={codeHistoryLoading}
                  />
                </div>
              )}

              {activeTab === 'submissions' && (
                <div className="space-y-4">
                  <UserSubmissions 
                    allUserSubmissions={userSubmissions}
                    submissionStats={submissionStats}
                    templates={templates}
                    loading={submissionsLoading || statsLoading || templatesLoading}
                  />
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Profile Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Username</label>
                          <p className="text-lg">{user?.username}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Email</label>
                          <p className="text-lg">{user?.email}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                          <p className="text-lg">{user?.full_name || 'Not provided'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Account Status</label>
                          <div className="flex items-center space-x-2 mt-1 flex-wrap">
                            {user?.is_active ? (
                              <Badge className="badge-success">Active</Badge>
                            ) : (
                              <Badge variant="destructive">Inactive</Badge>
                            )}
                            {user?.is_verified ? (
                              <Badge className="badge-info">Verified</Badge>
                            ) : (
                              <Badge variant="outline">Unverified</Badge>
                            )}

                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                          <p className="text-lg">{formatDateOnly(user?.created_at)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Mobile Account Management Section */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Account Management</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Change Password Form */}
                      <div className="border rounded-lg p-4 space-y-4">
                        <div>
                          <h4 className="font-medium">Change Password</h4>
                          <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                            ⚠️ This will log you out of all sessions for security
                          </p>
                        </div>
                        
                        {/* Inline Password Notification */}
                        {passwordNotification.type && (
                          <div className={`p-3 rounded-lg border ${
                            passwordNotification.type === 'success' 
                              ? 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                              : 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                {passwordNotification.type === 'success' ? (
                                  <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                )}
                                <span className="text-sm font-medium">{passwordNotification.message}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 hover:bg-transparent"
                                onClick={() => setPasswordNotification({ type: null, message: '' })}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                          <div>
                            <Label htmlFor="mobileCurrentPassword">Current Password</Label>
                            <div className="relative mt-1">
                              <Input
                                id="mobileCurrentPassword"
                                type={showCurrentPassword ? "text" : "password"}
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                placeholder="Enter current password"
                                disabled={passwordLoading}
                                className="pr-10"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                disabled={passwordLoading}
                              >
                                {showCurrentPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="mobileNewPassword">New Password</Label>
                            <div className="relative mt-1">
                              <Input
                                id="mobileNewPassword"
                                type={showNewPassword ? "text" : "password"}
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                placeholder="Enter new password (min 8 characters)"
                                disabled={passwordLoading}
                                className="pr-10"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                disabled={passwordLoading}
                              >
                                {showNewPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="mobileConfirmPassword">Confirm New Password</Label>
                            <div className="relative mt-1">
                              <Input
                                id="mobileConfirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                placeholder="Confirm new password"
                                disabled={passwordLoading}
                                className="pr-10"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                disabled={passwordLoading}
                              >
                                {showConfirmPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <Button type="submit" disabled={passwordLoading} className="w-full">
                            {passwordLoading ? 'Changing Password...' : 'Change Password'}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            ⚠️ Security Notice: Changing your password will automatically log you out of all sessions. You'll need to log back in with your new password.
                          </p>
                        </form>
                      </div>

                      {/* Change Username Form */}
                      <div className="border rounded-lg p-4 space-y-4">
                        <h4 className="font-medium">Change Username</h4>
                        
                        {/* Inline Username Notification */}
                        {usernameNotification.type && (
                          <div className={`p-3 rounded-lg border ${
                            usernameNotification.type === 'success' 
                              ? 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' 
                              : 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                {usernameNotification.type === 'success' ? (
                                  <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                )}
                                <span className="text-sm font-medium">{usernameNotification.message}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 hover:bg-transparent"
                                onClick={() => setUsernameNotification({ type: null, message: '' })}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        <form onSubmit={handleUsernameChange} className="space-y-4">
                          <div>
                            <Label htmlFor="mobileCurrentUsername">Current Username</Label>
                            <Input
                              id="mobileCurrentUsername"
                              value={user?.username || ''}
                              disabled
                              className="bg-muted mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="mobileNewUsername">New Username</Label>
                            <Input
                              id="mobileNewUsername"
                              type="text"
                              value={usernameForm.newUsername}
                              onChange={(e) => setUsernameForm(prev => ({ ...prev, newUsername: e.target.value }))}
                              placeholder="Enter new username (min 3 characters)"
                              disabled={usernameLoading}
                              className="mt-1"
                            />
                          </div>
                          <Button type="submit" disabled={usernameLoading} className="w-full">
                            {usernameLoading ? 'Changing Username...' : 'Change Username'}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            ℹ️ Note: Username changes don't require logout. Only password changes will log you out for security.
                          </p>
                        </form>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'preferences' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Editor Preferences</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <label className="text-sm font-medium mb-3 block">Theme</label>
                        <div className="flex space-x-2 flex-wrap gap-2">
                          <Button
                            variant={theme === 'light' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTheme('light')}
                            className="flex items-center space-x-2"
                          >
                            <Sun className="w-4 h-4" />
                            <span>Light</span>
                          </Button>
                          <Button
                            variant={theme === 'dark' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTheme('dark')}
                            className="flex items-center space-x-2"
                          >
                            <Moon className="w-4 h-4" />
                            <span>Dark</span>
                          </Button>
                          <Button
                            variant={theme === 'system' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTheme('system')}
                            className="flex items-center space-x-2"
                          >
                            <Monitor className="w-4 h-4" />
                            <span>System</span>
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium">Notifications</label>
                          <p className="text-sm text-muted-foreground">Receive notifications about code execution results</p>
                        </div>
                        <Button
                          variant={notifications ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNotifications(!notifications)}
                        >
                          {notifications ? 'Enabled' : 'Disabled'}
                        </Button>
                      </div>

                      <div className="pt-4 border-t">
                        <h4 className="font-medium mb-2">Editor Settings</h4>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>• Font size: 14px</p>
                          <p>• Tab size: 2 spaces</p>
                          <p>• Word wrap: Enabled</p>
                          <p>• Line numbers: Enabled</p>
                          <p>• Minimap: Disabled</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          More editor customization options coming soon!
                        </p>
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
