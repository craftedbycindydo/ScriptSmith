import { Fragment } from 'react';
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Key,
  RefreshCcw,
  Search,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/dateUtils';
import { Pill } from './StatusPill';
import type {
  AdminUser,
  ResetUsernameDialogState,
  TempPasswordConfirmState,
  TempPasswordResult,
} from './types';

/** Membership roles are stored as free-form strings ("TEACHER"/"STUDENT"). */
const isTeacherRole = (role?: string) => (role || '').toUpperCase() === 'TEACHER';

interface UsersTabProps {
  filteredUsers: AdminUser[];
  totalUsers: number;
  userSearch: string;
  onUserSearchChange: (v: string) => void;
  userSearchError: string | null;
  setUserSearchError: (v: string | null) => void;
  /** Aero surfaces the search in the shell's hero-search instead. */
  hideSearch?: boolean;
  expandedUser: number | null;
  setExpandedUser: (id: number | null) => void;
  onToggleActivation: (userId: number, username: string, currentStatus: boolean) => void;
  togglePending: boolean;
  onGenerateTempPasswordRequest: (userId: number, username: string) => void;
  generateTempPasswordPending: boolean;
  onResetUsernameRequest: (userId: number, currentUsername: string) => void;
  resetUsernameDialog: ResetUsernameDialogState;
  setResetUsernameDialog: React.Dispatch<React.SetStateAction<ResetUsernameDialogState>>;
  onConfirmResetUsername: () => void;
  onCancelUsernameReset: () => void;
  resetUsernamePending: boolean;
  tempPasswordConfirmDialog: TempPasswordConfirmState;
  onConfirmGenerateTempPassword: () => void;
  onCancelTempPasswordGeneration: () => void;
  tempPasswordResult: TempPasswordResult | null;
  clearTempPasswordResult: () => void;
  tempPasswordVisibility: { [userId: number]: boolean };
  toggleTempPasswordVisibility: (userId: number) => void;
  getRemainingTime: (createdAt: number) => string;
}

export default function UsersTab({
  filteredUsers,
  totalUsers,
  userSearch,
  onUserSearchChange,
  userSearchError,
  setUserSearchError,
  hideSearch,
  expandedUser,
  setExpandedUser,
  onToggleActivation,
  togglePending,
  onGenerateTempPasswordRequest,
  generateTempPasswordPending,
  onResetUsernameRequest,
  resetUsernameDialog,
  setResetUsernameDialog,
  onConfirmResetUsername,
  onCancelUsernameReset,
  resetUsernamePending,
  tempPasswordConfirmDialog,
  onConfirmGenerateTempPassword,
  onCancelTempPasswordGeneration,
  tempPasswordResult,
  clearTempPasswordResult,
  tempPasswordVisibility,
  toggleTempPasswordVisibility,
  getRemainingTime,
}: UsersTabProps) {
  return (
    <div>
      <div className="control-row">
        <h2 className="section-title mr-auto flex items-center gap-2">
          <Users className="h-4 w-4" />
          Users
          <span className="pane-label">{filteredUsers.length} shown</span>
        </h2>
        {!hideSearch && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => onUserSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        )}
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
              <th>Activity</th>
              <th>Classroom</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => {
              const expanded = expandedUser === u.id;
              return (
                <Fragment key={u.id}>
                  <tr
                    className="cursor-pointer"
                    onClick={() => setExpandedUser(expanded ? null : u.id)}
                  >
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="avatar-chip">{u.username?.charAt(0) || '?'}</span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.username}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {u.is_active ? (
                          <Pill tone="success">Active</Pill>
                        ) : (
                          <Pill tone="error">Inactive</Pill>
                        )}
                        {u.is_verified ? (
                          <Pill tone="info">Verified</Pill>
                        ) : (
                          <Pill tone="neutral">Unverified</Pill>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      <div>
                        {u.code_executions} executions · {u.collaboration_sessions} sessions
                      </div>
                      <div>Joined {formatDate(u.created_at)}</div>
                    </td>
                    <td>
                      {u.classrooms && u.classrooms.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.classrooms.map((c) => (
                            <Pill
                              key={c.id}
                              tone={isTeacherRole(c.role) ? 'warning' : 'neutral'}
                            >
                              {c.name}
                              {isTeacherRole(c.role) && ' · Teacher'}
                            </Pill>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No classroom</span>
                      )}
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="expand-row">
                      <td colSpan={4}>
                        <div className="space-y-4 py-2">
                          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                            <div>
                              <div className="pane-label">Full Name</div>
                              <div>{u.full_name || 'Not provided'}</div>
                            </div>
                            <div>
                              <div className="pane-label">Status</div>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {u.is_active ? (
                                  <Pill tone="success">Active</Pill>
                                ) : (
                                  <Pill tone="error">Inactive</Pill>
                                )}
                                {u.is_verified ? (
                                  <Pill tone="info">Verified</Pill>
                                ) : (
                                  <Pill tone="neutral">Unverified</Pill>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="pane-label">Last Login</div>
                              <div>{u.last_login ? formatDate(u.last_login) : 'Never'}</div>
                            </div>
                            <div>
                              <div className="pane-label">Member Since</div>
                              <div>{formatDate(u.created_at)}</div>
                            </div>
                          </div>

                          <div>
                            <div className="pane-label">Classrooms</div>
                            {u.classrooms && u.classrooms.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {u.classrooms.map((c) => (
                                  <Pill
                                    key={c.id}
                                    tone={isTeacherRole(c.role) ? 'warning' : 'neutral'}
                                  >
                                    {c.name} · {isTeacherRole(c.role) ? 'Teacher' : 'Student'}
                                  </Pill>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                Not enrolled in any of your classrooms
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="pane-label">Actions</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleActivation(u.id, u.username, u.is_active);
                                }}
                                disabled={togglePending}
                              >
                                {u.is_active ? (
                                  <UserX className="mr-1 h-3 w-3" />
                                ) : (
                                  <UserCheck className="mr-1 h-3 w-3" />
                                )}
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onGenerateTempPasswordRequest(u.id, u.username);
                                }}
                                disabled={generateTempPasswordPending}
                              >
                                <Key className="mr-1 h-3 w-3" />
                                Temp password
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onResetUsernameRequest(u.id, u.username);
                                }}
                              >
                                <RefreshCcw className="mr-1 h-3 w-3" />
                                Reset username
                              </Button>
                            </div>
                          </div>

                          {/* Temporary password (held in memory only) */}
                          {tempPasswordResult && tempPasswordResult.userId === u.id && (
                            <div className="rounded-md border border-info/20 bg-info/10 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Key className="h-4 w-4 text-info" />
                                  <span className="text-sm font-medium">Temporary Password:</span>
                                  <div className="flex items-center gap-1">
                                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                                      {tempPasswordVisibility[u.id]
                                        ? tempPasswordResult.password
                                        : '••••••••'}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTempPasswordVisibility(u.id);
                                      }}
                                      title={
                                        tempPasswordVisibility[u.id]
                                          ? 'Hide password'
                                          : 'Show password'
                                      }
                                      className="h-6 w-6 p-0 text-info"
                                    >
                                      {tempPasswordVisibility[u.id] ? (
                                        <EyeOff className="h-3 w-3" />
                                      ) : (
                                        <Eye className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(tempPasswordResult.password);
                                    }}
                                    title="Copy password"
                                    className="h-6 w-6 p-0 text-info"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearTempPasswordResult();
                                    }}
                                    title="Dismiss"
                                    className="h-6 w-6 p-0 text-info"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertTriangle className="h-3 w-3" />
                                <span>
                                  {getRemainingTime(tempPasswordResult.createdAt)} · User should
                                  change after login.
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="py-8 text-center text-muted-foreground">
                    <Users className="mx-auto mb-3 h-8 w-8 opacity-50" />
                    <p className="mb-1 text-sm font-medium text-foreground">No users found</p>
                    <p className="text-xs">
                      {userSearch
                        ? 'Try adjusting your search terms'
                        : 'User data will appear here once users register'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!userSearch && totalUsers > 10 && (
          <div className="table-foot justify-center">
            Showing all {totalUsers} users. Use search to find specific users.
          </div>
        )}
      </div>

      {/* Reset username dialog */}
      <Dialog
        open={resetUsernameDialog.open}
        onOpenChange={(open) => {
          if (!open) onCancelUsernameReset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Username for {resetUsernameDialog.currentUsername}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="currentUsernameDisplay">Current Username</Label>
              <Input
                id="currentUsernameDisplay"
                value={resetUsernameDialog.currentUsername}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="newUsername">New Username</Label>
              <Input
                id="newUsername"
                type="text"
                value={resetUsernameDialog.newUsername}
                onChange={(e) =>
                  setResetUsernameDialog((prev) => ({ ...prev, newUsername: e.target.value }))
                }
                placeholder="Enter new username"
              />
            </div>
            <div className="rounded-lg border border-info/20 bg-info/10 p-3">
              <div className="text-sm">
                <strong>Note:</strong> This will change the user's username immediately. The user
                will not be logged out and can continue using their account with the new username.
                Username must be at least 3 characters long and unique.
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onCancelUsernameReset}>
                Cancel
              </Button>
              <Button
                onClick={onConfirmResetUsername}
                disabled={!resetUsernameDialog.newUsername.trim() || resetUsernamePending}
              >
                {resetUsernamePending ? (
                  <>
                    <div className="mr-2 h-3 w-3 animate-spin rounded-full border-b-2 border-current" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="mr-1 h-3 w-3" />
                    Reset Username
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Temporary password confirmation dialog */}
      <Dialog
        open={tempPasswordConfirmDialog.open}
        onOpenChange={(open) => {
          if (!open) onCancelTempPasswordGeneration();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-warning">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Generate Temporary Password
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm text-muted-foreground">
              You are about to generate a temporary password for{' '}
              <strong>{tempPasswordConfirmDialog.username}</strong>.
            </p>
            <div className="mb-4 rounded-lg border border-warning/20 bg-warning/10 p-3">
              <div className="text-sm">
                <strong>Warning:</strong> This action is not reversible and will:
                <ul className="ml-4 mt-2 space-y-1 text-xs">
                  <li>• Immediately invalidate the user's current password</li>
                  <li>• Log the user out of all active sessions immediately</li>
                  <li>• Force disconnect the user from the platform</li>
                  <li>• Generate a new temporary password that expires in 24 hours</li>
                  <li>• Require the user to log in with temp password and change it</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The user will need to use the temporary password to log in and then set a new
              permanent password.
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onCancelTempPasswordGeneration}>
              Cancel
            </Button>
            <Button
              onClick={onConfirmGenerateTempPassword}
              disabled={generateTempPasswordPending}
            >
              {generateTempPasswordPending ? (
                <>
                  <div className="mr-2 h-3 w-3 animate-spin rounded-full border-b-2 border-current" />
                  Generating...
                </>
              ) : (
                <>
                  <Key className="mr-1 h-3 w-3" />
                  Generate Temporary Password
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
