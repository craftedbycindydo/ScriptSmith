import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/**
 * Route guard for admin-only routes.
 *
 * This is a UX guard, not a security boundary - `is_admin` comes from persisted
 * client state and can be edited. Every admin endpoint is enforced server-side
 * by get_admin_user; this only stops the admin shell from rendering for
 * non-admins and sends them somewhere useful instead.
 */
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
