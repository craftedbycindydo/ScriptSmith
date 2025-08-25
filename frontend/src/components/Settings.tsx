import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import CodeHistory from './CodeHistory';
import UserSubmissions from './UserSubmissions';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { useCodeStore } from '@/store/codeStore';
import { useTheme } from '@/contexts/ThemeContext';
import { apiService, type CodeHistoryItem, type TemplateSubmission } from '@/services/api';
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
  Send
} from 'lucide-react';

export default function Settings() {
  const { user, isAuthenticated } = useAuthStore();
  const { setCode, setLanguage } = useCodeStore();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);

  // Tab state and sidebar collapse
  const [activeTab, setActiveTab] = useState('history');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 2025 Best Practice: Central data management - load ALL data once
  const [allCodeHistory, setAllCodeHistory] = useState<CodeHistoryItem[]>([]);
  const [allUserSubmissions, setAllUserSubmissions] = useState<TemplateSubmission[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [submissionStats, setSubmissionStats] = useState<{
    total_submissions: number;
    success_submissions: number;
    error_submissions: number;
    success_rate: number;
    submissions_by_language: Array<{ language: string; count: number }>;
  }>({
    total_submissions: 0,
    success_submissions: 0,
    error_submissions: 0,
    success_rate: 0,
    submissions_by_language: []
  });

  const [loading, setLoading] = useState(false);
  
  // Prevent duplicate API calls
  const loadingRefs = useRef<{[key: string]: boolean}>({});

  const handleLoadCode = (historyCode: string, historyLanguage: string) => {
    setCode(historyCode);
    setLanguage(historyLanguage);
    // Navigate back to IDE after loading code
    navigate('/');
  };

  // Load ALL code history once (no more pagination API calls)
  const loadAllCodeHistory = async () => {
    if (loadingRefs.current['codeHistory']) return;
    loadingRefs.current['codeHistory'] = true;
    
    try {
      // Load larger batch to get most data in one call (100 items)
      const response = await apiService.getCodeHistory(1, 100);
      setAllCodeHistory(response.history);
    } catch (error) {
      console.error('Failed to load all code history:', error);
    } finally {
      loadingRefs.current['codeHistory'] = false;
    }
  };

  // Load ALL user submissions once (no more refresh API calls)
  const loadAllUserSubmissions = async () => {
    if (loadingRefs.current['userSubmissions']) return;
    loadingRefs.current['userSubmissions'] = true;
    
    try {
      const response = await apiService.getUserSubmissions();
      setAllUserSubmissions(response);
    } catch (error) {
      console.error('Failed to load all user submissions:', error);
    } finally {
      loadingRefs.current['userSubmissions'] = false;
    }
  };

  // Load submission stats once
  const loadSubmissionStats = async () => {
    if (loadingRefs.current['submissionStats']) return;
    loadingRefs.current['submissionStats'] = true;
    
    try {
      const response = await apiService.getUserSubmissionsStats();
      setSubmissionStats(response);
    } catch (error) {
      console.error('Failed to load submission stats:', error);
    } finally {
      loadingRefs.current['submissionStats'] = false;
    }
  };

  // Load templates once (using USER endpoint, not admin)
  const loadTemplates = async () => {
    if (loadingRefs.current['templates']) return;
    loadingRefs.current['templates'] = true;
    
    try {
      // Use user endpoint instead of admin endpoint
      const response = await apiService.getUserTemplatesList();
      setTemplates(response || []); // /templates endpoint returns array directly
    } catch (error) {
      console.error('Failed to load templates:', error);
      setTemplates([]);
    } finally {
      loadingRefs.current['templates'] = false;
    }
  };

  // Load ALL settings data once - no more multiple API calls per tab switch
  const loadAllSettingsData = async () => {
    setLoading(true);
    try {
      // Load all data in parallel - single API call per data type
      await Promise.all([
        loadAllCodeHistory(),
        loadAllUserSubmissions(),
        loadSubmissionStats(),
        loadTemplates()
      ]);
    } catch (error) {
      console.error('Failed to load settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  // SINGLE useEffect for initial data load - NO MORE TAB-TRIGGERED API CALLS
  useEffect(() => {
    if (isAuthenticated) {
      // Load ALL data once on page load - tabs work client-side
      loadAllSettingsData();
    }
  }, [isAuthenticated]); // Only trigger on auth change, NOT tab changes



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
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem onClick={() => setActiveTab('history')}>
                  <History className="w-4 h-4 mr-2" />
                  Code History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('submissions')}>
                  <Send className="w-4 h-4 mr-2" />
                  Submissions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('profile')}>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('preferences')}>
                  <Bell className="w-4 h-4 mr-2" />
                  Preferences
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
                      loading={loading}
                    />
                  </div>
                )}

                {activeTab === 'submissions' && (
                  <div className="space-y-4">
                    <UserSubmissions 
                      allUserSubmissions={allUserSubmissions}
                      submissionStats={submissionStats}
                      templates={templates}
                      loading={loading}
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
                <p className="text-lg">{new Date((user?.created_at || '') + ((user?.created_at && user.created_at.endsWith('Z')) ? '' : 'Z')).toLocaleDateString()}</p>
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
                    loading={loading}
                  />
                </div>
              )}

              {activeTab === 'submissions' && (
                <div className="space-y-4">
                  <UserSubmissions 
                    allUserSubmissions={allUserSubmissions}
                    submissionStats={submissionStats}
                    templates={templates}
                    loading={loading}
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
                          <p className="text-lg">{new Date((user?.created_at || '') + ((user?.created_at && user.created_at.endsWith('Z')) ? '' : 'Z')).toLocaleDateString()}</p>
                        </div>
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
