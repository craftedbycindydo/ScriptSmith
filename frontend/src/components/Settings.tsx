import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CodeHistory from './CodeHistory';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { useCodeStore } from '@/store/codeStore';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  Settings as SettingsIcon, 
  History, 
  User, 
  Shield, 
  Bell,
  Moon,
  Sun,
  Monitor,

} from 'lucide-react';

export default function Settings() {
  const { user, isAuthenticated } = useAuthStore();
  const { setCode, setLanguage } = useCodeStore();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);

  const isAdmin = user?.email === 'k@p.com';

  const handleLoadCode = (historyCode: string, historyLanguage: string) => {
    setCode(historyCode);
    setLanguage(historyLanguage);
    // Navigate back to IDE after loading code
    navigate('/');
  };

  const handleAdminDashboard = () => {
    navigate('/admin');
  };



  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">Please sign in to access settings</p>
              <Button onClick={() => navigate('/login')}>Sign In</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center mb-6">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </div>

      <Tabs defaultValue="history" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="history" className="flex items-center space-x-2">
            <History className="w-4 h-4" />
            <span>History</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center space-x-2">
            <User className="w-4 h-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center space-x-2">
            <Bell className="w-4 h-4" />
            <span>Preferences</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin" className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Admin</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Code Execution History</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeHistory onLoadCode={handleLoadCode} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
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
                    {isAdmin && (
                      <Badge className="bg-purple-100 text-purple-800">Admin</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                <p className="text-lg">{new Date(user?.created_at || '').toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
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
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="w-5 h-5" />
                  <span>Administrator Controls</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-info/10 border border-info/20 rounded-lg p-4">
                  <h4 className="font-medium text-info-foreground mb-2">Admin Dashboard</h4>
                  <p className="text-sm text-info-foreground/80 mb-3">
                    Access the full administrative dashboard to manage users, monitor system activity, and view detailed analytics.
                  </p>
                  <Button onClick={handleAdminDashboard} className="btn-info">
                    Open Admin Dashboard
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-info">Admin</div>
                    <div className="text-sm text-muted-foreground">Access Level</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-success">Full</div>
                    <div className="text-sm text-muted-foreground">Permissions</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">System</div>
                    <div className="text-sm text-muted-foreground">Management</div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h5 className="font-medium mb-2">Admin Capabilities:</h5>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>View all user activities and code executions</li>
                    <li>Monitor system statistics and performance</li>
                    <li>Manage user accounts (activate/deactivate)</li>
                    <li>Access collaboration session details</li>
                    <li>View error logs and system health</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
      </div>
    </div>
  );
}
