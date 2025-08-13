import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { User, LogOut, Settings } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function AuthButtons() {
  const { user, isAuthenticated, logout, getCurrentUser } = useAuthStore();

  // Try to get current user on mount if we have a token
  useEffect(() => {
    if (isAuthenticated && !user) {
      getCurrentUser();
    }
  }, [isAuthenticated, user, getCurrentUser]);

  const handleLogout = () => {
    logout();
  };

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-2 text-sm">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">{user.username}</span>
        </div>
        
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:ml-2 sm:inline">Settings</span>
        </Button>
        
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:ml-2 sm:inline">Sign Out</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Button 
        variant="outline" 
        size="sm"
        asChild
      >
        <Link to="/login">Sign In</Link>
      </Button>
      
      <Button 
        size="sm"
        asChild
      >
        <Link to="/signup">Sign Up</Link>
      </Button>
    </div>
  );
}
