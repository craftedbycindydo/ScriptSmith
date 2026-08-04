import type { ReactNode } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ADMIN_NAV_GROUPS, ADMIN_TABS } from './adminNav';

interface AdminShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  /** Comma-joined classroom names shown under the title. */
  classroomNames?: string;
  showNoClassroomWarning?: boolean;
  children: ReactNode;
}

function MobileTabPicker({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const active = ADMIN_TABS.find((t) => t.id === activeTab);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cta-quiet w-full justify-between">
          <span className="flex items-center gap-2">
            {active && <active.icon className="h-4 w-4" />}
            {active?.label ?? 'Menu'}
          </span>
          <ChevronDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[calc(100vw-2rem)] max-w-none" align="start" sideOffset={4}>
        {ADMIN_TABS.map((tab) => (
          <DropdownMenuItem
            key={tab.id}
            className="flex items-center px-4 py-3"
            onClick={() => onTabChange(tab.id)}
          >
            <tab.icon className="mr-3 h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">{tab.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminShell({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  classroomNames,
  showNoClassroomWarning,
  children,
}: AdminShellProps) {
  const refreshButton = (
    <button className="cta-quiet press shrink-0" onClick={onRefresh} disabled={isRefreshing}>
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{isRefreshing ? 'Loading…' : 'Refresh'}</span>
    </button>
  );

  // Flush left rail (hidden below lg, replaced by the compact dropdown picker)
  // + internally-scrolling content column.
  const rail = (
    <aside className="admin-rail hidden lg:block">
      <nav aria-label="Admin sections">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                className="nav-item press"
                data-active={activeTab === tab.id}
                onClick={() => onTabChange(tab.id)}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );

  return (
    <div className="screen-h flex overflow-hidden">
      {rail}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="page-shell">
          <div className="title-row">
            <div className="min-w-0">
              <h1 className="page-title">Admin</h1>
              <p className="page-sub">
                Monitor system activity and manage users
                {classroomNames ? ` · ${classroomNames}` : ''}
              </p>
              {showNoClassroomWarning && (
                <p className="page-sub text-warning">
                  No classroom assigned. Contact system administrator.
                </p>
              )}
            </div>
            {refreshButton}
          </div>
          <div className="mb-4 lg:hidden">
            <MobileTabPicker activeTab={activeTab} onTabChange={onTabChange} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
