import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Users, 
  MoreVertical, 
  UserX, 
  Eye, 
  Edit,
  Crown,
  Clock,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { apiService } from '@/services/api';

interface Participant {
  id: number;
  username: string;
  is_connected: boolean;
  cursor_color?: string;
  is_owner: boolean;
  role: string;
  status: string;
  joined_at: string;
}

interface ParticipantManagerProps {
  shareId: string;
  participants: Participant[];
  currentUserParticipantId?: number;
  isOwner: boolean;
  onParticipantsUpdate?: () => void;
}

export default function ParticipantManager({ 
  shareId, 
  participants, 
  currentUserParticipantId, 
  isOwner,
  onParticipantsUpdate 
}: ParticipantManagerProps) {
  const [pendingParticipants, setPendingParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPopover, setShowPopover] = useState(false);

  // Load pending participants if user is owner
  const loadPendingParticipants = async () => {
    if (!isOwner) return;
    
    try {
      setLoading(true);
      const pending = await apiService.getPendingParticipants(shareId);
      setPendingParticipants(pending);
    } catch (err: any) {
      console.error('Failed to load pending participants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showPopover && isOwner) {
      loadPendingParticipants();
    }
  }, [showPopover, isOwner]);

  // Load pending participants when participants list changes (real-time updates)
  useEffect(() => {
    if (isOwner) {
      loadPendingParticipants();
    }
  }, [participants, isOwner]);

  const handleManageParticipant = async (participantId: number, action: string, role?: string) => {
    try {
      setLoading(true);
      await apiService.manageParticipant(shareId, participantId, { action, role });
      
      // Refresh data
      await loadPendingParticipants();
      onParticipantsUpdate?.();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to manage participant');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchAdmission = async (decisions: Array<{ participant_id: number; action: string }>) => {
    try {
      setLoading(true);
      await apiService.batchManageAdmissions(shareId, decisions);
      
      // Refresh data
      await loadPendingParticipants();
      onParticipantsUpdate?.();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process admissions');
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'editor': return <Edit className="w-4 h-4 text-blue-500" />;
      case 'viewer': return <Eye className="w-4 h-4 text-green-500" />;
      default: return null;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'default';
      case 'editor': return 'secondary';
      case 'viewer': return 'outline';
      default: return 'outline';
    }
  };



  const approvedParticipants = participants.filter(p => p.status === 'approved');
  const hasPendingParticipants = pendingParticipants.length > 0;

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Users className="w-4 h-4 mr-2" />
          Participants ({participants.length})
          {isOwner && hasPendingParticipants && (
            <Badge variant="destructive" className="absolute -top-2 -right-2 w-5 h-5 rounded-full p-0 flex items-center justify-center text-xs">
              {pendingParticipants.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 max-h-[60vh] overflow-y-auto" align="end">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4" />
            <h3 className="font-semibold">Participants</h3>
          </div>

        <div className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          )}

          {/* Pending Participants - Only show to owner */}
          {isOwner && pendingParticipants.length > 0 && (
            <>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Pending ({pendingParticipants.length})</span>
              </div>
              
              <div className="space-y-2">
                {pendingParticipants.map((participant) => (
                  <div key={participant.id} className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback 
                            style={{ backgroundColor: participant.cursor_color || '#666' }}
                            className="text-white text-sm font-medium"
                          >
                            {participant.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{participant.username}</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">Waiting for approval</p>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => handleManageParticipant(participant.id, 'approve')}
                          disabled={loading}
                          className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700 text-white font-medium"
                        >
                          ✓ Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleManageParticipant(participant.id, 'reject')}
                          disabled={loading}
                          className="h-7 px-3 text-xs border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                        >
                          ✕ Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {pendingParticipants.length > 1 && (
                  <div className="flex space-x-2 pt-1 border-t border-amber-200 dark:border-amber-800 mt-2">
                    <Button
                      size="sm"
                      onClick={() => handleBatchAdmission(
                        pendingParticipants.map(p => ({ participant_id: p.id, action: 'approve' }))
                      )}
                      disabled={loading}
                      className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white font-medium"
                    >
                      ✓ Approve All ({pendingParticipants.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBatchAdmission(
                        pendingParticipants.map(p => ({ participant_id: p.id, action: 'reject' }))
                      )}
                      disabled={loading}
                      className="flex-1 h-7 text-xs border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                    >
                      ✕ Reject All
                    </Button>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}

          {/* Active Participants */}
          <div>
            <div className="flex items-center space-x-2">
              <Shield className="w-3 h-3 text-green-600" />
              <span className="text-sm font-medium">Active ({approvedParticipants.length})</span>
            </div>
            
            <div className="space-y-1">
              {approvedParticipants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center space-x-2">
                    <Avatar 
                      className={`w-6 h-6 ring-1 ${
                        participant.is_connected ? 'ring-green-500' : 'ring-gray-400'
                      }`}
                    >
                      <AvatarFallback 
                        style={{ backgroundColor: participant.cursor_color || '#666' }}
                        className="text-white text-xs"
                      >
                        {participant.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center space-x-1">
                        <p className="text-sm font-medium">{participant.username}</p>
                        {participant.id === currentUserParticipantId && (
                          <Badge variant="outline" className="text-xs px-1">You</Badge>
                        )}
                        {getRoleIcon(participant.role)}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getRoleBadgeVariant(participant.role)} className="text-xs">
                          {participant.role}
                        </Badge>
                        <span className={`text-xs ${participant.is_connected ? 'text-green-600' : 'text-gray-500'}`}>
                          {participant.is_connected ? '●' : '○'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Only show actions for owner and not for themselves */}
                  {isOwner && participant.id !== currentUserParticipantId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleManageParticipant(participant.id, 'change_role', 'editor')}
                          disabled={loading || participant.role === 'editor'}
                        >
                          <Edit className="w-3 h-3 mr-2" />
                          Editor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleManageParticipant(participant.id, 'change_role', 'viewer')}
                          disabled={loading || participant.role === 'viewer'}
                        >
                          <Eye className="w-3 h-3 mr-2" />
                          Viewer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleManageParticipant(participant.id, 'kick')}
                          disabled={loading}
                          className="text-red-600 focus:text-red-600"
                        >
                          <UserX className="w-3 h-3 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        </div>
      </PopoverContent>
    </Popover>
  );
}
