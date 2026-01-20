import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  Settings, 
  User, 
  LogOut, 
  Sun, 
  Moon, 
  Monitor,
  Shield,
  Menu,
  X,
  Code2,
} from 'lucide-react';
import ScriptingSmithLogo from '@/assets/scriptingsmith-logo.svg';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Use backend API to verify admin status instead of hardcoded email
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    if (user) {
      // Use server-side validated admin status from user object
      // This avoids making unnecessary API calls for non-admin users
      setIsAdmin(user.is_admin || false);
    }
  }, [user]);

  const navigationItems = [
    { name: 'IDE', path: '/', icon: Code2 },
    { name: 'Settings', path: '/settings', icon: Settings, requireAuth: true },
    ...(isAdmin ? [{ name: 'Admin', path: '/admin', icon: Shield, requireAuth: true }] : []),
  ];

  const handleLogout = () => {
    logout();
    setIsAdmin(false); // Reset admin status immediately on logout
    navigate('/');
    setIsMobileMenuOpen(false);
  };

  const handleNavigation = (path: string, requireAuth?: boolean) => {
    if (requireAuth && !isAuthenticated) {
      navigate('/login');
      return;
    }
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const getThemeIcon = () => {
    if (theme === 'light') return Sun;
    if (theme === 'dark') return Moon;
    return Monitor;
  };

  const ThemeIcon = getThemeIcon();

  const isCurrentPath = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/collab/');
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="w-full px-4 sm:px-6">
        <div className="flex h-14 items-center">
          {/* Logo */}
          <div 
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => handleNavigation('/')}
          >
            <img 
              src={ScriptingSmithLogo} 
              alt="Scripting Smith" 
              className="h-8 w-8 hover:opacity-80 transition-opacity" 
            />
            <span 
              className="font-bold hover:text-primary transition-colors text-sm sm:text-base"
            >
              Scripting Smith
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:space-x-6 ml-8">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              const isCurrent = isCurrentPath(item.path);
              
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigation(item.path, item.requireAuth)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isCurrent 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <IconComponent className="h-4 w-4" />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center space-x-2">
            {/* Theme Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden sm:flex">
                  <ThemeIcon className="h-4 w-4" />
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun className="mr-2 h-4 w-4" />
                  <span>Light</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon className="mr-2 h-4 w-4" />
                  <span>Dark</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>
                  <Monitor className="mr-2 h-4 w-4" />
                  <span>System</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium max-w-[80px] sm:max-w-none truncate">
                      {user?.username}
                    </span>
                    {isAdmin && (
                      <Badge variant="secondary" className="hidden lg:inline-flex text-xs">
                        Admin
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      <p className="font-medium">{user?.username}</p>
                      <p className="w-[200px] truncate text-sm text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleNavigation('/settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => handleNavigation('/admin')}>
                      <Shield className="mr-2 h-4 w-4" />
                      <span>Admin Dashboard</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                  Sign In
                </Button>
                <Button size="sm" onClick={() => navigate('/signup')}>
                  Sign Up
                </Button>
              </div>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t bg-background">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navigationItems.map((item) => {
                const IconComponent = item.icon;
                const isCurrent = isCurrentPath(item.path);
                
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavigation(item.path, item.requireAuth)}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-left font-medium transition-colors ${
                      isCurrent 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <IconComponent className="h-4 w-4" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
              
              {/* Mobile Theme Toggle */}
              <div className="pt-2 border-t">
                <div className="px-3 py-2 text-sm font-medium text-muted-foreground">
                  Theme
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant={theme === 'light' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTheme('light')}
                    className="flex-1"
                  >
                    <Sun className="h-4 w-4 mr-2" />
                    Light
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                    className="flex-1"
                  >
                    <Moon className="h-4 w-4 mr-2" />
                    Dark
                  </Button>
                  <Button
                    variant={theme === 'system' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTheme('system')}
                    className="flex-1"
                  >
                    <Monitor className="h-4 w-4 mr-2" />
                    Auto
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
