import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';

// The OAuth consent screen is opened by an AI client, not browsed to. App
// chrome there is noise, and a "Sign In" button on a page the person has just
// signed in for is worse than noise - it invites them to derail the flow.
const BARE_ROUTES = ['/mcp/connect'];

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const bare = BARE_ROUTES.includes(useLocation().pathname);

  return (
    <div className="app-canvas min-h-screen flex flex-col">
      {!bare && <Navbar />}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
