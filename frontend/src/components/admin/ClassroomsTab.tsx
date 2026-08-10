import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEffect, useRef, useState } from 'react';
import { formatDate } from '@/lib/dateUtils';
import { apiService } from '@/services/api';
import type { StudentCandidate } from '@/services/api';
import { Pill } from './StatusPill';
import type { Classroom } from './types';

// ---------------------------------------------------------------------------
// Add student by email, with live suggestions
// ---------------------------------------------------------------------------
interface AddStudentByEmailProps {
  classroomId: number;
  email: string;
  onEmailChange: (email: string) => void;
  onAdd: () => void;
  adding: boolean;
  error: string | null;
}

function AddStudentByEmail({
  classroomId,
  email,
  onEmailChange,
  onAdd,
  adding,
  error,
}: AddStudentByEmailProps) {
  const [suggestions, setSuggestions] = useState<StudentCandidate[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  // A pick fills the input; don't immediately re-query and reopen the list
  const skipNextLookup = useRef(false);

  // Re-query on every keystroke, debounced so typing stays responsive
  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    if (!isFocused) return;

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await apiService.getStudentCandidates(classroomId, email.trim());
        if (!cancelled) {
          setSuggestions(results);
          setHighlighted(0);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, classroomId, isFocused]);

  const pick = (candidate: StudentCandidate) => {
    skipNextLookup.current = true;
    onEmailChange(candidate.email);
    setSuggestions([]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSuggestions([]);
      return;
    }
    if (!suggestions.length) {
      if (event.key === 'Enter' && email.trim() && !adding) onAdd();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(suggestions[highlighted]);
    }
  };

  const showList = isFocused && (loading || suggestions.length > 0 || email.trim().length > 0);

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Add Student by Email</div>
      <div className="flex space-x-2">
        <div className="relative flex-1">
          <Input
            placeholder="student@example.com"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            className={`w-full ${error ? 'border-destructive/40 focus-visible:ring-destructive' : ''}`}
            disabled={adding}
          />

          {showList && (
            // Keep mousedown from blurring the input before the click lands
            <div
              className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
              onMouseDown={(e) => e.preventDefault()}
            >
              {suggestions.length > 0 ? (
                suggestions.map((candidate, index) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => pick(candidate)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={`flex w-full flex-col items-start px-3 py-2 text-left ${
                      index === highlighted ? 'bg-muted' : ''
                    }`}
                  >
                    <span className="text-sm font-medium">
                      {candidate.full_name || candidate.username}
                    </span>
                    <span className="text-xs text-muted-foreground">{candidate.email}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {loading ? 'Searching...' : 'No unassigned users match'}
                </div>
              )}
            </div>
          )}
        </div>

        <Button onClick={onAdd} disabled={adding || !email.trim()} size="sm">
          {adding ? (
            <>
              <div className="mr-2 h-3 w-3 animate-spin rounded-full border-b-2 border-current"></div>
              Adding...
            </>
          ) : (
            <>
              <UserPlus className="mr-1 h-3 w-3" />
              Add
            </>
          )}
        </Button>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="text-xs text-muted-foreground">
        Suggestions list users who are not in any classroom yet — students can belong to only one.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classroom members list (logic unchanged; moved from AdminDashboard.tsx)
// ---------------------------------------------------------------------------
interface ClassroomMembersListProps {
  classroomId: number;
  members: any[];
  isLoading: boolean;
  handleRemoveMemberClick: (classroomId: number, memberId: number, memberName: string) => void;
  handleAddStudentByEmail: (classroomId: number) => void;
  studentEmails: { [key: number]: string };
  setStudentEmails: any;
  addingStudent: { [key: number]: boolean };
  userSearchError: string | null;
  setUserSearchError: any;
  classroom: Classroom;
}

function ClassroomMembersList({
  classroomId,
  members,
  isLoading,
  handleRemoveMemberClick,
  handleAddStudentByEmail,
  studentEmails,
  setStudentEmails,
  addingStudent,
  userSearchError,
  setUserSearchError,
  classroom,
}: ClassroomMembersListProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="flex items-center justify-center space-x-2">
          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary"></div>
          <span className="text-sm text-muted-foreground">Loading members...</span>
        </div>
      </div>
    );
  }

  if (members && members.length > 0) {
    return (
      <div className="divide-y divide-border">
        {members.map((member: any) => (
          <div key={member.id} className="flex items-center justify-between p-4">
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <div className="font-medium">{member.username}</div>
                <Pill tone={member.role === 'TEACHER' ? 'info' : 'neutral'}>{member.role}</Pill>
              </div>
              <div className="text-sm text-muted-foreground">{member.email}</div>
              <div className="text-xs text-muted-foreground">
                Joined: {formatDate(member.joined_at)}
              </div>
            </div>
            {member.role !== 'TEACHER' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemoveMemberClick(classroomId, member.id, member.username)}
                className="text-destructive hover:border-destructive/40 hover:text-destructive"
              >
                <UserMinus className="mr-1 h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
        ))}

        {/* Add student by email */}
        <div className="bg-muted/10 border-t border-border p-4">
          <AddStudentByEmail
            classroomId={classroomId}
            email={studentEmails[classroomId] || ''}
            onEmailChange={(email) => {
              setStudentEmails((prev: any) => ({ ...prev, [classroomId]: email }));
              if (userSearchError) setUserSearchError(null);
            }}
            onAdd={() => handleAddStudentByEmail(classroomId)}
            adding={addingStudent[classroomId]}
            error={userSearchError}
          />
        </div>

        {/* Registration instructions */}
        <div className="border-t border-info/20 bg-info/10 p-4">
          <div className="text-sm">
            <div className="mb-2 font-medium">For New Students</div>
            <div className="text-muted-foreground">
              Share the classroom key{' '}
              <code className="rounded bg-muted px-2 py-1 font-mono">{classroom.key}</code> so new
              students can register for this classroom.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 text-center text-muted-foreground">
      <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
      <p>No members found</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classrooms tab
// ---------------------------------------------------------------------------
interface ClassroomsTabProps {
  classrooms: Classroom[];
  isAdmin: boolean;
  // Creation form
  isCreatingClassroom: boolean;
  setIsCreatingClassroom: (v: boolean) => void;
  newClassroom: { name: string; description: string; maxMembers: string };
  setNewClassroom: React.Dispatch<
    React.SetStateAction<{ name: string; description: string; maxMembers: string }>
  >;
  classroomCreationError: string;
  classroomCreationSuccess: string;
  creatingClassroom: boolean;
  onCreateClassroom: () => void;
  onCancelClassroomCreation: () => void;
  // Row expansion + settings
  expandedClassroom: number | null;
  onClassroomClick: (classroomId: number) => void;
  onDeleteClassroomClick: (classroomId: number, name: string, memberCount: number) => void;
  copiedClassroomKey: number | null;
  onCopyClassroomKey: (key: string, classroomId: number) => void;
  getClassroomSettings: (classroomId: number) => { copy_paste_enabled: boolean; isLoading: boolean };
  onCopyPasteToggle: (classroomId: number, enabled: boolean) => void;
  classroomNotifications: {
    [key: number]: { message: string; type: 'success' | 'error' } | null;
  };
  getClassroomMembers: (classroomId: number) => { members: any[]; isLoading: boolean };
  // Members list plumbing
  handleRemoveMemberClick: (classroomId: number, memberId: number, memberName: string) => void;
  handleAddStudentByEmail: (classroomId: number) => void;
  studentEmails: { [key: number]: string };
  setStudentEmails: any;
  addingStudent: { [key: number]: boolean };
  userSearchError: string | null;
  setUserSearchError: any;
  // Dialogs
  removeModalOpen: boolean;
  setRemoveModalOpen: (open: boolean) => void;
  memberToRemove: { classroomId: number; memberId: number; memberName: string } | null;
  onConfirmRemoveMember: () => void;
  onCancelRemoveMember: () => void;
  deleteClassroomModalOpen: boolean;
  setDeleteClassroomModalOpen: (open: boolean) => void;
  classroomToDelete: { id: number; name: string; memberCount: number } | null;
  deletingClassroom: boolean;
  onConfirmDeleteClassroom: () => void;
  onCancelDeleteClassroom: () => void;
}

export default function ClassroomsTab({
  classrooms,
  isAdmin,
  isCreatingClassroom,
  setIsCreatingClassroom,
  newClassroom,
  setNewClassroom,
  classroomCreationError,
  classroomCreationSuccess,
  creatingClassroom,
  onCreateClassroom,
  onCancelClassroomCreation,
  expandedClassroom,
  onClassroomClick,
  onDeleteClassroomClick,
  copiedClassroomKey,
  onCopyClassroomKey,
  getClassroomSettings,
  onCopyPasteToggle,
  classroomNotifications,
  getClassroomMembers,
  handleRemoveMemberClick,
  handleAddStudentByEmail,
  studentEmails,
  setStudentEmails,
  addingStudent,
  userSearchError,
  setUserSearchError,
  removeModalOpen,
  setRemoveModalOpen,
  memberToRemove,
  onConfirmRemoveMember,
  onCancelRemoveMember,
  deleteClassroomModalOpen,
  setDeleteClassroomModalOpen,
  classroomToDelete,
  deletingClassroom,
  onConfirmDeleteClassroom,
  onCancelDeleteClassroom,
}: ClassroomsTabProps) {
  const hasClassrooms = classrooms.length > 0;

  return (
    <div className="space-y-4">
      <div className="title-row">
        <div className="min-w-0">
          <h2 className="section-title flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Classrooms
          </h2>
          <p className="page-sub">
            Manage all classrooms you're a member of — created and joined.
          </p>
        </div>
        <button className="cta press shrink-0" onClick={() => setIsCreatingClassroom(!isCreatingClassroom)}>
          {isCreatingClassroom ? (
            <>
              <X className="h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              New classroom
            </>
          )}
        </button>
      </div>

      {/* Create classroom form */}
      {isCreatingClassroom && (
        <div className="panel anim-enter space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h3 className="section-title">Create New Classroom</h3>
            <Button variant="outline" size="sm" onClick={onCancelClassroomCreation}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="classroom-name">Name *</Label>
              <Input
                id="classroom-name"
                value={newClassroom.name}
                onChange={(e) => setNewClassroom((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., CS101 Spring 2024"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="classroom-description">Description</Label>
              <Input
                id="classroom-description"
                value={newClassroom.description}
                onChange={(e) =>
                  setNewClassroom((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Brief description (optional)"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="max-members">Max Students</Label>
              <Input
                id="max-members"
                type="number"
                value={newClassroom.maxMembers}
                onChange={(e) =>
                  setNewClassroom((prev) => ({ ...prev, maxMembers: e.target.value }))
                }
                placeholder="100"
                min="1"
                max="1000"
                className="mt-1"
              />
            </div>
          </div>

          {classroomCreationError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  {classroomCreationError}
                </span>
              </div>
            </div>
          )}

          {classroomCreationSuccess && (
            <div className="rounded-md border border-success/20 bg-success/10 p-3">
              <div className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">{classroomCreationSuccess}</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={onCreateClassroom}
              disabled={creatingClassroom || !newClassroom.name.trim()}
              className="px-6"
            >
              {creatingClassroom ? 'Creating...' : 'Create Classroom'}
            </Button>
            <Button variant="outline" onClick={onCancelClassroomCreation} disabled={creatingClassroom}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {hasClassrooms ? (
        <div className="stagger space-y-4">
          {/* Classroom summary */}
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Your Classroom Access</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {classrooms.filter((c) => c.is_creator).length} created ·{' '}
                  {classrooms.filter((c) => !c.is_creator).length} joined · {classrooms.length}{' '}
                  total
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone="info">Creator</Pill>
                <Pill tone="success">Member</Pill>
              </div>
            </div>
          </div>

          {classrooms.map((classroom) => (
            <div key={classroom.id} className="panel hover-lift overflow-hidden">
              <div
                className="cursor-pointer p-4 transition-colors hover:bg-muted/50"
                onClick={() => onClassroomClick(classroom.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{classroom.name}</h3>
                        <Pill tone="neutral">{classroom.role}</Pill>
                        {classroom.is_creator ? (
                          <Pill tone="info">Creator</Pill>
                        ) : (
                          <Pill tone="success">Member</Pill>
                        )}
                        {expandedClassroom === classroom.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteClassroomClick(
                            classroom.id,
                            classroom.name,
                            classroom.member_count
                          );
                        }}
                        title="Delete classroom"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center">
                        <span className="font-medium">Classroom Key:</span>
                        <code className="ml-1 rounded bg-muted px-2 py-1 font-mono text-xs">
                          {classroom.key}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyClassroomKey(classroom.key, classroom.id);
                          }}
                          title={
                            copiedClassroomKey === classroom.id ? 'Copied!' : 'Copy classroom key'
                          }
                        >
                          {copiedClassroomKey === classroom.id ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <div>
                        <span className="font-medium">Members:</span> {classroom.member_count}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Copy-paste toggle — independent of row click */}
              <div className="border-t border-border bg-muted/10 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium">Copy-Paste:</span>
                    <span className="text-sm text-muted-foreground">
                      {(() => {
                        const { copy_paste_enabled, isLoading } = getClassroomSettings(
                          classroom.id
                        );
                        return isLoading
                          ? 'Loading...'
                          : copy_paste_enabled
                            ? 'Enabled'
                            : 'Disabled';
                      })()}
                    </span>
                  </div>
                  <Switch
                    checked={getClassroomSettings(classroom.id).copy_paste_enabled}
                    onCheckedChange={(checked) => onCopyPasteToggle(classroom.id, checked)}
                    disabled={getClassroomSettings(classroom.id).isLoading}
                    className="scale-90"
                  />
                </div>

                {classroomNotifications[classroom.id] && (
                  <div
                    className={`mt-2 rounded p-2 text-sm ${
                      classroomNotifications[classroom.id]?.type === 'success'
                        ? 'border border-success/20 bg-success/10 text-success'
                        : 'border border-destructive/20 bg-destructive/10 text-destructive'
                    }`}
                  >
                    <div className="flex items-center">
                      {classroomNotifications[classroom.id]?.type === 'success' ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <AlertTriangle className="mr-2 h-4 w-4" />
                      )}
                      {classroomNotifications[classroom.id]?.message}
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded member list */}
              {expandedClassroom === classroom.id && (
                <div className="border-t border-border bg-muted/20">
                  <ClassroomMembersList
                    classroomId={classroom.id}
                    members={getClassroomMembers(classroom.id).members}
                    isLoading={getClassroomMembers(classroom.id).isLoading}
                    handleRemoveMemberClick={handleRemoveMemberClick}
                    handleAddStudentByEmail={handleAddStudentByEmail}
                    studentEmails={studentEmails}
                    setStudentEmails={setStudentEmails}
                    addingStudent={addingStudent}
                    userSearchError={userSearchError}
                    setUserSearchError={setUserSearchError}
                    classroom={classroom}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="panel anim-enter p-8 text-center text-muted-foreground">
          <Shield className="mx-auto mb-4 h-12 w-12 opacity-50" />
          {isAdmin ? (
            <>
              <p className="mb-2 text-lg font-medium text-foreground">Welcome, Admin!</p>
              <p className="mb-4">You haven't created any classrooms yet.</p>
              <p className="mb-4 text-sm">
                Create your first classroom to start organizing students and managing content.
              </p>
              <button className="cta press" onClick={() => setIsCreatingClassroom(true)}>
                <Plus className="h-4 w-4" />
                Create First Classroom
              </button>
            </>
          ) : (
            <>
              <p>No classrooms found in user context</p>
              <p className="mb-4 text-sm">This might be a data loading issue</p>
            </>
          )}
        </div>
      )}

      {/* Remove member confirmation */}
      <Dialog open={removeModalOpen} onOpenChange={setRemoveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <UserMinus className="mr-2 h-5 w-5" />
              Remove Student
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm text-muted-foreground">
              Are you sure you want to remove <strong>{memberToRemove?.memberName}</strong> from
              the classroom?
            </p>
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
              <div className="text-sm">
                <strong>Warning:</strong> This action cannot be undone. The student will lose
                access to all classroom content and will need to re-register using the classroom
                key to rejoin.
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onCancelRemoveMember}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmRemoveMember}>
              <UserMinus className="mr-1 h-3 w-3" />
              Remove Student
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete classroom confirmation */}
      <Dialog open={deleteClassroomModalOpen} onOpenChange={setDeleteClassroomModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <Trash2 className="mr-2 h-5 w-5" />
              Delete Classroom
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm text-muted-foreground">
              Are you sure you want to delete the classroom{' '}
              <strong>"{classroomToDelete?.name}"</strong>?
            </p>

            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center text-destructive">
                  <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />
                  <strong>Permanent Action - Cannot be undone!</strong>
                </div>
                <ul className="ml-6 space-y-1 text-xs">
                  <li>
                    • All {classroomToDelete?.memberCount || 0} members will lose access to this
                    classroom
                  </li>
                  <li>• Students will no longer be able to join using the classroom key</li>
                  <li>• All classroom-specific settings and data will be permanently deleted</li>
                  <li>• Members will need to join a new classroom to continue using the platform</li>
                </ul>
              </div>
            </div>

            <div className="rounded-lg border border-info/20 bg-info/10 p-3">
              <div className="text-sm">
                <strong>Alternative:</strong> Consider deactivating the classroom temporarily
                instead of permanent deletion, or moving students to another classroom first.
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onCancelDeleteClassroom} disabled={deletingClassroom}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDeleteClassroom}
              disabled={deletingClassroom}
            >
              {deletingClassroom ? (
                <>
                  <div className="mr-2 h-3 w-3 animate-spin rounded-full border-b-2 border-current"></div>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 h-3 w-3" />
                  Delete Classroom
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
