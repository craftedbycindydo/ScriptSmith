import { Fragment, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Code,
  Search,
  Share2,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/dateUtils';
import { Pill, StatusPill } from './StatusPill';
import type { AdminActivity, AdminUser } from './types';

interface OverviewTabProps {
  stats: any;
  // Activities (server-side filtered/paginated)
  activities: AdminActivity[];
  activitiesLoading: boolean;
  activitiesTotal: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  pageSize: number;
  activityType: string;
  setActivityType: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  activityUserFilter: string;
  setActivityUserFilter: (v: string) => void;
  combinedUsers: any[];
  // Users mini-list
  filteredUsers: AdminUser[];
  userSearch: string;
  onUserSearchChange: (v: string) => void;
  userSearchError: string | null;
  setUserSearchError: (v: string | null) => void;
  onToggleActivation: (userId: number, username: string, currentStatus: boolean) => void;
  togglePending: boolean;
}

function activityIcon(type: string) {
  switch (type) {
    case 'code_execution':
      return <Code className="h-3.5 w-3.5 shrink-0" />;
    case 'session_creation':
    case 'session_join':
      return <Share2 className="h-3.5 w-3.5 shrink-0" />;
    default:
      return <Activity className="h-3.5 w-3.5 shrink-0" />;
  }
}

function KpiValueSkeleton() {
  return (
    <>
      <div className="kpi-value">
        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="kpi-delta">
        <div className="mt-1 h-3 w-20 animate-pulse rounded bg-muted" />
      </div>
    </>
  );
}

export default function OverviewTab({
  stats,
  activities,
  activitiesLoading,
  activitiesTotal,
  currentPage,
  setCurrentPage,
  totalPages,
  pageSize,
  activityType,
  setActivityType,
  statusFilter,
  setStatusFilter,
  activityUserFilter,
  setActivityUserFilter,
  combinedUsers,
  filteredUsers,
  userSearch,
  onUserSearchChange,
  userSearchError,
  setUserSearchError,
  onToggleActivation,
  togglePending,
}: OverviewTabProps) {
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* KPI strip — renders segmented/ruled/plain/bubbles per design */}
      <div className="kpi-strip stagger">
        <div className="kpi-cell">
          <div className="kpi-label">
            <Users className="h-3.5 w-3.5" />
            Total Users
          </div>
          {stats ? (
            <>
              <div className="kpi-value">{stats.total_users}</div>
              <div className="kpi-delta">+{stats.new_users_today} today</div>
            </>
          ) : (
            <KpiValueSkeleton />
          )}
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">
            <Code className="h-3.5 w-3.5" />
            Executions
          </div>
          {stats ? (
            <>
              <div className="kpi-value">{stats.total_code_executions}</div>
              <div className="kpi-delta">+{stats.executions_today} today</div>
            </>
          ) : (
            <KpiValueSkeleton />
          )}
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">
            <Share2 className="h-3.5 w-3.5" />
            Shared Sessions
          </div>
          {stats ? (
            <>
              <div className="kpi-value">{stats.total_collaboration_sessions}</div>
              <div className="kpi-delta">{stats.active_sessions} active</div>
            </>
          ) : (
            <KpiValueSkeleton />
          )}
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">
            <AlertTriangle className="h-3.5 w-3.5" />
            Error Rate
          </div>
          {stats ? (
            <>
              <div className="kpi-value">{stats.error_rate_percentage}%</div>
              <div className="kpi-delta">of executions</div>
            </>
          ) : (
            <KpiValueSkeleton />
          )}
        </div>
      </div>

      {/* Popular languages */}
      {stats && stats.popular_languages.length > 0 && (
        <div className="panel anim-enter p-5">
          <div className="pane-label mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Popular Languages
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {stats.popular_languages.map((lang: { language: string; count: number }) => (
              <div key={lang.language} className="text-center">
                <div className="kpi-value">{lang.count}</div>
                <div className="text-sm capitalize text-muted-foreground">{lang.language}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activities + Users, side by side (stacked on mobile) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Activities */}
        <div className="min-w-0 xl:col-span-2">
          <div className="control-row">
            <h2 className="section-title mr-auto flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activities
              <span className="pane-label">{activitiesTotal} shown</span>
            </h2>
            <Select
              value={activityType}
              onValueChange={(v) => {
                setActivityType(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Activity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activities</SelectItem>
                <SelectItem value="code_execution">Code Execution</SelectItem>
                <SelectItem value="session_creation">Session Creation</SelectItem>
                <SelectItem value="session_join">Session Join</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={activityUserFilter}
              onValueChange={(v) => {
                setActivityUserFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {combinedUsers.map((u: any) => (
                  <SelectItem key={u.username} value={u.username}>
                    {u.display}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="table-shell anim-enter overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 && activitiesLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={4}>
                        <div className="h-5 w-full animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                ) : activities.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="py-8 text-center text-muted-foreground">
                        <Activity className="mx-auto mb-3 h-10 w-10 opacity-50" />
                        <p className="mb-1 font-medium text-foreground">No activities yet</p>
                        <p className="text-sm">
                          Activity data will appear here once users start interacting with the
                          platform
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  activities.map((activity) => {
                    const key = `${activity.activity_type}-${activity.id}`;
                    const expanded = expandedActivity === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          className={`cursor-pointer ${activity.status === 'error' ? 'row-error' : ''}`}
                          onClick={() => setExpandedActivity(expanded ? null : key)}
                        >
                          <td className="font-medium">{activity.username || 'Anonymous'}</td>
                          <td>
                            <span className="flex items-center gap-1.5 capitalize">
                              {activityIcon(activity.activity_type)}
                              {activity.activity_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td>
                            <StatusPill status={activity.status} />
                          </td>
                          <td className="whitespace-nowrap text-muted-foreground">
                            {formatDate(activity.timestamp)}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="expand-row">
                            <td colSpan={4}>
                              <div className="space-y-1 py-1 text-xs text-muted-foreground">
                                {activity.activity_type === 'code_execution' && (
                                  <div>
                                    Language: {activity.activity_data.language} · Code size:{' '}
                                    {activity.activity_data.code_size} chars
                                    {activity.activity_data.execution_time && (
                                      <> · {activity.activity_data.execution_time.toFixed(3)}s</>
                                    )}
                                  </div>
                                )}
                                {activity.activity_type === 'session_creation' && (
                                  <div>
                                    {activity.activity_data.title} ({activity.activity_data.language}
                                    )
                                    {activity.activity_data.is_public && ' · Public'}
                                  </div>
                                )}
                                {activity.email && <div>Email: {activity.email}</div>}
                                {activity.error_message && (
                                  <div className="rounded bg-destructive/10 p-2 text-destructive">
                                    {activity.error_message.slice(0, 200)}
                                    {activity.error_message.length > 200 && '…'}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="table-foot">
                <span>
                  {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, activitiesTotal)}{' '}
                  of {activitiesTotal}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Users */}
        <div className="min-w-0">
          <div className="control-row">
            <h2 className="section-title mr-auto flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </h2>
          </div>
          <div className="control-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => onUserSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          {userSearchError && (
            <div className="mb-3 flex items-start gap-2 rounded border border-destructive/20 bg-destructive/10 p-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="min-w-0 flex-1 text-sm text-destructive">{userSearchError}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserSearchError(null)}
                className="h-6 w-6 p-0 text-destructive"
              >
                ×
              </Button>
            </div>
          )}
          <div className="table-shell anim-enter overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th className="w-10" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="avatar-chip">{u.username?.charAt(0) || '?'}</span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.username}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {u.code_executions} executions • {u.collaboration_sessions} sessions ·
                            joined {formatDate(u.created_at)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {!u.is_active && <Pill tone="error">Inactive</Pill>}
                        {!u.is_verified && <Pill tone="neutral">Unverified</Pill>}
                        {u.is_active && u.is_verified && <Pill tone="success">Active</Pill>}
                      </div>
                    </td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => onToggleActivation(u.id, u.username, u.is_active)}
                        title={u.is_active ? 'Deactivate user' : 'Activate user'}
                        disabled={togglePending}
                      >
                        {u.is_active ? (
                          <UserX className="h-3 w-3" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No users found
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
