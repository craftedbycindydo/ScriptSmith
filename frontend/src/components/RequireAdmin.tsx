import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !user.is_admin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
