import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CodeHistory from './CodeHistory';
import UserSubmissions from './UserSubmissions';
import UserAnalytics from './UserAnalytics';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { useCodeStore } from '@/store/codeStore';
import { useTheme, PALETTES, BACKDROPS } from '@/contexts/ThemeContext';
import { THEME_FAMILIES, EDITOR_BGS, CONSOLE_BGS, type ThemeSwatch } from '@/lib/editorThemes';
import beachImg from '@/assets/backdrops/beach.jpg';
import forestImg from '@/assets/backdrops/forest.jpg';
import sunsetImg from '@/assets/backdrops/sunset.jpg';
import mountainsImg from '@/assets/backdrops/mountains.jpg';
import { formatDateOnly } from '@/lib/dateUtils';
import { apiService } from '@/services/api';
import { 
  useCodeHistory,
  useUserSubmissions,
  useUserSubmissionStats,
  useUserTemplates
} from '@/hooks/useSettingsData';
import { 
  History, 
  User, 
  Palette,
  Moon,
  Sun,
  Monitor,
  ChevronDown,
  Send,
  CheckCircle,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  BarChart3,
  Check
} from 'lucide-react';

const SETTINGS_TABS = [
  { id: 'history', label: 'Code History', icon: History },
  { id: 'submissions', label: 'Submissions', icon: Send },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

const SETTINGS_NAV_GROUPS = [
  { label: 'Activity', tabs: SETTINGS_TABS.slice(0, 3) },
  { label: 'Account', tabs: SETTINGS_TABS.slice(3) },
];

const BACKDROP_THUMBS: Record<string, string> = {
  beach: beachImg,
  forest: forestImg,
  sunset: sunsetImg,
  mountains: mountainsImg,
};

/** One half of a paired theme-family preview (its light or dark variant). */
function ThemeHalf({ swatch }: { swatch: ThemeSwatch }) {
  return (
    <span className="theme-half" style={{ backgroundColor: swatch.bg }}>
      <span style={{ backgroundColor: swatch.accents[0], width: '72%' }} />
      <span style={{ backgroundColor: swatch.accents[1], width: '52%' }} />
      <span style={{ backgroundColor: swatch.accents[2], width: '62%' }} />
    </span>
  );
}

/** Editor controls: Monaco theme (VS Code / IntelliJ style), editor
    background, output console background. Instant apply, saved to account. */
function EditorAppearanceSection() {
  const { editorTheme, setEditorTheme, editorBg, setEditorBg, consoleBg, setConsoleBg } =
    useTheme();

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium mb-1 block">Editor theme</label>
        <p className="text-sm text-muted-foreground mb-3">
          Syntax color schemes like VS Code and IntelliJ. Paired themes follow your
          light/dark mode automatically. Saved to your account.
        </p>
        <div className="appearance-grid">
          {THEME_FAMILIES.map((t) => (
            <button
              key={t.id}
              className="editor-theme-card press"
              data-active={editorTheme === t.id}
              onClick={() => setEditorTheme(t.id)}
            >
              {t.paired ? (
                <span className="theme-preview split">
                  <ThemeHalf swatch={t.swatchLight} />
                  <ThemeHalf swatch={t.swatchDark} />
                </span>
              ) : (
                <span className="theme-preview" style={{ backgroundColor: t.swatchDark.bg }}>
                  <span style={{ backgroundColor: t.swatchDark.accents[0], width: '72%' }} />
                  <span style={{ backgroundColor: t.swatchDark.accents[1], width: '52%' }} />
                  <span style={{ backgroundColor: t.swatchDark.accents[2], width: '62%' }} />
                </span>
              )}
              <span className="theme-name">
                {t.label}
                {editorTheme === t.id && <Check className="w-3.5 h-3.5" />}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">Editor background</label>
        <p className="text-sm text-muted-foreground mb-3">
          Override the theme's editor background.
        </p>
        <div className="bg-swatch-row">
          {EDITOR_BGS.map((b) => (
            <button
              key={b.id}
              className="bg-swatch"
              data-active={editorBg === b.id}
              onClick={() => setEditorBg(b.id)}
              title={b.label}
            >
              <span
                className={`swatch-dot ${b.color ? '' : 'swatch-default'}`}
                style={b.color ? { backgroundColor: b.color } : undefined}
              />
              <span className="swatch-label">{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">Output background</label>
        <p className="text-sm text-muted-foreground mb-3">
          Background of the Run output console.
        </p>
        <div className="bg-swatch-row">
          {CONSOLE_BGS.map((b) => (
            <button
              key={b.id}
              className="bg-swatch"
              data-active={consoleBg === b.id}
              onClick={() => setConsoleBg(b.id)}
              title={b.label}
            >
              <span
                className={`swatch-dot ${b.color ? '' : 'swatch-default'}`}
                style={b.color ? { backgroundColor: b.color } : undefined}
              />
              <span className="swatch-label">{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Theme controls: light/dark mode, color palette, photo backdrop.
    Changes apply instantly and persist to the user's profile. */
function AppearanceSection() {
  const { theme, setTheme, resolvedTheme, palette, setPalette, backdrop, setBackdrop } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium mb-3 block">Mode</label>
          <div className="mode-row">
            <button data-active={theme === 'light'} onClick={() => setTheme('light')}>
              <Sun className="w-4 h-4" />
              Light
            </button>
            <button data-active={theme === 'dark'} onClick={() => setTheme('dark')}>
              <Moon className="w-4 h-4" />
              Dark
            </button>
            <button data-active={theme === 'system'} onClick={() => setTheme('system')}>
              <Monitor className="w-4 h-4" />
              System
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Color theme</label>
          <p className="text-sm text-muted-foreground mb-3">
            10 palettes, each with a light and dark variant. Saved to your account.
          </p>
          <div className="appearance-grid">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                className="palette-card press"
                data-active={palette === p.id}
                onClick={() => setPalette(p.id)}
                title={p.blurb}
              >
                {/* data-palette scopes that palette's tokens to this swatch;
                    .dark mirrors the active mode so previews match */}
                <span
                  className={`palette-swatch ${resolvedTheme === 'dark' ? 'dark' : ''}`}
                  data-palette={p.id}
                >
                  <span className="sw-bg" />
                  <span className="sw-card" />
                  <span className="sw-tint" />
                  <span className="sw-cta" />
                </span>
                <span className="palette-name">
                  {p.label}
                  {palette === p.id && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Backdrop</label>
          <p className="text-sm text-muted-foreground mb-3">
            Optional photo behind the workspace, like Outlook themes.
          </p>
          <div className="appearance-grid">
            {BACKDROPS.map((b) => (
              <button
                key={b.id}
                className="backdrop-card press"
                data-active={backdrop === b.id}
                onClick={() => setBackdrop(b.id)}
              >
                {b.id === 'none' ? (
                  <span className="backdrop-none">No backdrop</span>
                ) : (
                  <img src={BACKDROP_THUMBS[b.id]} alt={b.label} loading="lazy" />
                )}
                <span className="backdrop-name">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user, isAuthenticated, refreshUser, logout } = useAuthStore();
  const { setCode, setLanguage } = useCodeStore();
  const navigate = useNavigate();

  // Tab state
  const [activeTab, setActiveTab] = useState('history');

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
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Please sign in to access settings</p>
            <Button onClick={() => navigate('/login')}>Sign In</Button>
          </div>
        </div>
      </div>
    );
  }

  const activeTabDef = SETTINGS_TABS.find((t) => t.id === activeTab);

  return (
    <div className="screen-h flex overflow-hidden">
      {/* Left rail — same shell pattern as the admin dashboard */}
      <aside className="admin-rail hidden lg:block">
        <nav aria-label="Settings sections">
          {SETTINGS_NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.tabs.map((tab) => (
                <button
                  key={tab.id}
                  className="nav-item press"
                  data-active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="page-shell">
          <div className="title-row">
            <div className="min-w-0">
              <h1 className="page-title">Settings</h1>
              <p className="page-sub">Manage your account, activity and preferences</p>
            </div>
          </div>

          {/* Mobile section picker */}
          <div className="mb-4 lg:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="cta-quiet w-full justify-between">
                  <span className="flex items-center gap-2">
                    {activeTabDef && <activeTabDef.icon className="h-4 w-4" />}
                    {activeTabDef?.label ?? 'Menu'}
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[calc(100vw-2rem)] max-w-none"
                align="start"
                sideOffset={4}
              >
                {SETTINGS_TABS.map((tab) => (
                  <DropdownMenuItem
                    key={tab.id}
                    className="flex items-center px-4 py-3"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <tab.icon className="mr-3 h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 text-left">{tab.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div key={activeTab} className="anim-enter">
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

                {activeTab === 'analytics' && (
                  <div className="space-y-4">
                    <UserAnalytics />
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

                {activeTab === 'appearance' && (
                  <div className="space-y-4">
                    <AppearanceSection />
                    <Card>
                      <CardHeader>
                        <CardTitle>Editor</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <EditorAppearanceSection />
                      </CardContent>
                    </Card>
                  </div>
                )}
          </div>
        </div>
      </div>
    </div>
  );
}
