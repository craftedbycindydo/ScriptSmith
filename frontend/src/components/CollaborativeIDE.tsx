import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';

import CodeEditor from './CodeEditor';
import OutputConsole from './OutputConsole';
import ResizablePanels from './ResizablePanels';
import ParticipantManager from './ParticipantManager';
import { useCollaboration } from '@/hooks/useCollaboration';
import type { ExecutionResult } from '@/hooks/useCollaboration';
import { apiService } from '@/services/api';
import { config } from '@/config/env';
import { 
  Share2, 
  Play, 
  UserPlus, 
  ArrowLeft,
  Eye,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Participant {
  id: number;
  username: string;
  is_connected: boolean;
  cursor_color?: string;
  cursor_position?: any;
  is_owner: boolean;
  role: string;
  status: string;
  joined_at: string;
}

interface SessionDetails {
  session: {
    id: number;
    share_id: string;
    title?: string;
    description?: string;
    language: string;
    is_active: boolean;
    is_public: boolean;
    max_collaborators: number;
    code_content?: string;
    owner_username: string;
    participant_count: number;
    created_at: string;
    updated_at?: string;
  };
  participants: Participant[];
  is_participant: boolean;
  user_participant_id?: number;
}

export default function CollaborativeIDE() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [code, setCode] = useState('');
  const [hasJoinedSession, setHasJoinedSession] = useState(false);
  const [output, setOutput] = useState('');
  const [executionError, setExecutionError] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState<number>(0);
  const [lastExecutedBy, setLastExecutedBy] = useState<string>('');
  
  const monacoEditorRef = useRef<any>(null);
  const monacoInstanceRef = useRef<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [participantId, setParticipantId] = useState<number | undefined>(undefined);
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  // Update participant ID when session details or storage changes
  useEffect(() => {
    const updateParticipantId = () => {
      if (sessionDetails?.user_participant_id) {
        setParticipantId(sessionDetails.user_participant_id);
        return;
      }
      
      const storedId = sessionStorage.getItem(`session_${shareId}_participant_id`);
      if (storedId) {
        const id = parseInt(storedId);
        setParticipantId(id);
        console.log('🔄 Updated participant ID from sessionStorage:', id);
      } else {
        setParticipantId(undefined);
      }
    };

    updateParticipantId();
  }, [sessionDetails?.user_participant_id, shareId, hasJoinedSession]); // React to hasJoinedSession changes

  // Handle execution results from all participants (including self)
  const handleExecutionResult = (result: ExecutionResult) => {
    console.log('📺 Displaying execution result from:', result.participant_username);
    setOutput(result.output);
    setExecutionError(result.error);
    setExecutionTime(result.execution_time);
    setLastExecutedBy(result.participant_username);
  };

  const {
    error: collaborationError,
    permissionStatus,
    canEdit,
    userRole,
    sendExecutionResult
  } = useCollaboration({
    sessionId: sessionDetails?.session.id,
    participantId: participantId,
    monacoEditor: monacoEditorRef.current,
    onParticipantsChange: setParticipants,
    onConnectionChange: setIsConnected,
    onExecutionResult: handleExecutionResult,
    initialContent: monacoEditorRef.current?.getValue() // Pass current editor content when sharing
  });

  // Load session details
  const loadSession = async () => {
    if (!shareId) return;
    
    console.log('🔄 Loading session:', shareId);
    setLoading(true);
    try {
      const details = await apiService.getSessionDetails(shareId);
      console.log('✅ Session loaded:', details);
      setSessionDetails(details);
      setCode(details.session.code_content || '');
      setError(null);
    } catch (err: any) {
      console.error('❌ Session load failed:', err);
      setError(err.response?.data?.detail || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  // Check if current user is owner
  const isOwner = isAuthenticated 
    ? sessionDetails?.session.owner_username === user?.username
    : sessionDetails?.session.owner_username === sessionStorage.getItem(`session_${shareId}_username`);

  // Handle participants update - refresh participant list without reloading entire session
  const handleParticipantsUpdate = async () => {
    if (!shareId || !sessionDetails) return;
    
    try {
      console.log('🔄 Refreshing participant list for session:', shareId);
      const response = await fetch(`${config.apiBaseUrl}/collaboration/sessions/${shareId}/participants`);
      if (response.ok) {
        const freshParticipants = await response.json();
        console.log('✅ Fresh participants loaded:', freshParticipants);
        setParticipants(freshParticipants);
      } else {
        console.error('❌ Failed to refresh participants:', response.status);
        // Fallback to full session reload only if participant refresh fails
        loadSession();
      }
    } catch (error) {
      console.error('❌ Error refreshing participants:', error);
      // Fallback to full session reload on error
      loadSession();
    }
  };

  // Auto-join session for authenticated users
  const autoJoinSession = async () => {
    if (!shareId || !isAuthenticated || !user?.username || joining || autoJoinAttempted) return;
    
    console.log('Attempting auto-join for:', user.username);
    setAutoJoinAttempted(true);
    setJoining(true);
    try {
      const joinResponse = await apiService.joinSession(shareId, { username: user.username });
      
      // Store join status and participant info in session storage
      sessionStorage.setItem(`session_${shareId}_joined`, 'true');
      sessionStorage.setItem(`session_${shareId}_participant_id`, joinResponse.participant_id?.toString() || '');
      sessionStorage.setItem(`session_${shareId}_username`, user.username);
      
      // Update local state to show editor
      setHasJoinedSession(true);
      setSessionDetails(prev => prev ? {
        ...prev,
        is_participant: true,
        user_participant_id: joinResponse.participant_id
      } : null);
      
      // Trigger participant ID update
      setParticipantId(joinResponse.participant_id);
      
      setError(null);
      console.log('Auto-join successful for user:', user.username);
    } catch (err: any) {
      console.error('Auto-join failed:', err);
      setError(err.response?.data?.detail || 'Failed to join session');
      // Reset the flag so user can try manual join
      setAutoJoinAttempted(false);
    } finally {
      setJoining(false);
    }
  };

  // Join session for anonymous users
  const handleJoinSession = async () => {
    if (!shareId || !newUsername.trim()) return;
    
    setJoining(true);
    try {
      const joinResponse = await apiService.joinSession(shareId, { username: newUsername.trim() });
      
      // Store join status and participant info in session storage
      sessionStorage.setItem(`session_${shareId}_joined`, 'true');
      sessionStorage.setItem(`session_${shareId}_participant_id`, joinResponse.participant_id?.toString() || '');
      sessionStorage.setItem(`session_${shareId}_username`, newUsername.trim());
      
      // Update local state to show editor
      setHasJoinedSession(true);
      setSessionDetails(prev => prev ? {
        ...prev,
        is_participant: true,
        user_participant_id: joinResponse.participant_id
      } : null);
      
      // Trigger participant ID update
      setParticipantId(joinResponse.participant_id);
      
      // Reload session to get updated participant info
      await loadSession();
      setNewUsername('');
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to join session');
    } finally {
      setJoining(false);
    }
  };

  // Execute code
  const handleExecuteCode = async () => {
    if (!sessionDetails) return;
    
    setIsExecuting(true);
    // Clear previous output for all participants
    setOutput('');
    setExecutionError('');
    setExecutionTime(0);
    
    try {
      const result = await apiService.executeCode({
        code,
        language: sessionDetails.session.language,
        input_data: ''
      });
      
      // Share execution result with ALL participants (including self) via WebSocket
      // This ensures everyone sees the same result at the same time
      if (sendExecutionResult) {
        sendExecutionResult({
          output: result.output,
          error: result.error,
          execution_time: result.execution_time
        });
      }
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to execute code';
      
      // Share error result with ALL participants via WebSocket
      if (sendExecutionResult) {
        sendExecutionResult({
          output: '',
          error: errorMessage,
          execution_time: 0
        });
      }
    } finally {
      setIsExecuting(false);
    }
  };

  // Copy share link
  const handleCopyShareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    // You could show a toast notification here
  };

  // Handle Monaco editor mount
  const handleEditorDidMount = (editor: any, monaco: any) => {
    monacoEditorRef.current = editor;
    monacoInstanceRef.current = monaco;
    
    // Make editor available globally for socket listeners
    if (typeof window !== 'undefined') {
      (window as any).monacoEditorInstance = editor;
    }
    
    // Set initial code content if available
    if (sessionDetails?.session.code_content) {
      editor.setValue(sessionDetails.session.code_content);
    }
  };

  useEffect(() => {
    loadSession();
    setAutoJoinAttempted(false); // Reset auto-join flag for new sessions
  }, [shareId]);

  // Separate effect for auto-join logic to prevent infinite loops
  useEffect(() => {
    if (!shareId || !sessionDetails) return;
    
    const hasJoined = sessionStorage.getItem(`session_${shareId}_joined`) === 'true';
    const participantId = sessionStorage.getItem(`session_${shareId}_participant_id`);
    
    if (hasJoined && participantId) {
      setHasJoinedSession(true);
    } else if (isAuthenticated && user?.username && !sessionDetails.is_participant && !joining && !autoJoinAttempted) {
      // Auto-join authenticated users who haven't joined yet
      console.log('Auto-joining session for authenticated user:', user.username);
      autoJoinSession();
    }
  }, [shareId, isAuthenticated, user?.username, sessionDetails?.is_participant, autoJoinAttempted]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading collaboration session...</p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-gray-500 mt-2">
              Debug: shareId={shareId}, joining={joining.toString()}, autoJoinAttempted={autoJoinAttempted.toString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error && !sessionDetails) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to IDE
          </Button>
        </div>
      </div>
    );
  }

  if (sessionDetails && !sessionDetails.is_participant && !hasJoinedSession) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <UserPlus className="w-5 h-5" />
              <span>Join Collaboration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold">{sessionDetails?.session.title}</h3>
              <p className="text-sm text-muted-foreground">
                by {sessionDetails?.session.owner_username}
              </p>
              <Badge variant="outline" className="mt-2">
                {sessionDetails?.session.language}
              </Badge>
            </div>
            
            {sessionDetails?.session.description && (
              <p className="text-sm">{sessionDetails.session.description}</p>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Your display name</Label>
              <Input
                id="username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter your name..."
                onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
              />
            </div>
            
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            
            <div className="flex space-x-2">
              <Button 
                onClick={handleJoinSession}
                disabled={!newUsername.trim() || joining}
                className="flex-1"
              >
                {joining ? 'Joining...' : 'Join Session'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show permission status message if not approved
  if (permissionStatus !== 'approved' && sessionDetails?.is_participant) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {permissionStatus === 'pending' && <Clock className="w-5 h-5 text-yellow-500" />}
              {permissionStatus === 'rejected' && <AlertTriangle className="w-5 h-5 text-red-500" />}
              {permissionStatus === 'kicked' && <AlertTriangle className="w-5 h-5 text-red-500" />}
              <span>
                {permissionStatus === 'pending' && 'Waiting for Approval'}
                {permissionStatus === 'rejected' && 'Access Denied'}
                {permissionStatus === 'kicked' && 'Removed from Session'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold">{sessionDetails?.session.title}</h3>
              <p className="text-sm text-muted-foreground">
                by {sessionDetails?.session.owner_username}
              </p>
            </div>
            
            <p className="text-sm">
              {permissionStatus === 'pending' && 
                'The session owner needs to approve your request to join this collaboration.'}
              {permissionStatus === 'rejected' && 
                'Your request to join this session was rejected by the owner.'}
              {permissionStatus === 'kicked' && 
                'You have been removed from this collaboration session.'}
            </p>
            
            <Button onClick={() => navigate('/')} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to IDE
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b bg-card flex-shrink-0">
        <div className="px-4 py-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 sm:space-x-4">
            {/* Left side - Session info and back button */}
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              
              <div>
                <h1 className="text-lg font-bold">{sessionDetails?.session.title}</h1>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{sessionDetails?.session.language}</Badge>
                  <span>by {sessionDetails?.session.owner_username}</span>
                  {/* Permission Status */}
                  {userRole && (
                    <Badge 
                      variant={userRole === 'owner' ? 'default' : userRole === 'editor' ? 'secondary' : 'outline'}
                      className="flex items-center space-x-1"
                    >
                      {userRole === 'viewer' && <Eye className="w-3 h-3" />}
                      <span>{userRole}</span>
                    </Badge>
                  )}
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right side - Actions and participants */}
            <div className="flex items-center space-x-2 flex-wrap gap-1 sm:gap-0">
              {/* Participant Manager */}
              {shareId && (
                <ParticipantManager
                  shareId={shareId}
                  participants={participants}
                  currentUserParticipantId={participantId}
                  isOwner={isOwner}
                  onParticipantsUpdate={handleParticipantsUpdate}
                />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyShareLink}
              >
                <Share2 className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Share</span>
              </Button>

              {/* Only show Run button if user can edit or is owner */}
              {canEdit && (
                <Button
                  onClick={handleExecuteCode}
                  disabled={isExecuting}
                  className="btn-success flex-1 sm:flex-none"
                  size="sm"
                >
                  <Play className="w-4 h-4 mr-1 lg:mr-2" />
                  <span className="hidden sm:inline">{isExecuting ? 'Running...' : 'Run'}</span>
                  <span className="sm:hidden">{isExecuting ? '...' : 'Run'}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width Resizable Panels */}
      <div className="flex-1 overflow-hidden p-2 md:p-4 bg-muted/5">
        <ResizablePanels
          defaultLeftWidth={65}
          minLeftWidth={40}
          minRightWidth={25}
          leftPanel={
            <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm md:mr-2">
              <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Collaborative Code Editor</h3>
                  <div className="flex items-center space-x-2">
                    {collaborationError && (
                      <span className="text-red-600 text-xs">
                        Error
                      </span>
                    )}
                    {!isConnected && !collaborationError && (
                      <span className="text-yellow-600 text-xs">
                        Connecting...
                      </span>
                    )}
                    {isConnected && !collaborationError && (
                      <span className="text-green-600 text-xs flex items-center">
                        <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                        Live
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden rounded-b-lg">
                <CodeEditor
                  language={sessionDetails?.session.language || 'python'}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  onMount={handleEditorDidMount}
                  readOnly={!canEdit}
                />
              </div>
            </div>
          }
          rightPanel={
            <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm md:ml-2">
              <div className="flex-1 overflow-hidden rounded-lg">
                <OutputConsole
                  output={output}
                  error={executionError}
                  isLoading={isExecuting}
                  executionTime={executionTime}
                  lastExecutedBy={lastExecutedBy}
                />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
