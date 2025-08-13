import { type ReactNode } from 'react';
import Navbar from './Navbar';
import { useLocation } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  
  // Don't show navbar on auth pages for a cleaner look
  const hideNavbar = ['/login', '/signup', '/forgot-password'].includes(location.pathname);
  
  if (hideNavbar) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
