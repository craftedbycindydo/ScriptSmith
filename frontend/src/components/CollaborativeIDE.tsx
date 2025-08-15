import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import CodeEditor from './CodeEditor';
import OutputConsole from './OutputConsole';
import ResizablePanels from './ResizablePanels';
import { useCollaboration } from '@/hooks/useCollaboration';
import type { ExecutionResult } from '@/hooks/useCollaboration';
import { apiService } from '@/services/api';
import { 
  Users, 
  Share2, 
  Play, 
  UserPlus, 
  ArrowLeft
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

  // Handle execution results from other participants
  const handleExecutionResult = (result: ExecutionResult) => {
    setOutput(result.output);
    setExecutionError(result.error);
    setExecutionTime(result.execution_time);
    setLastExecutedBy(result.participant_username);
  };

  const {
    error: collaborationError,
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
    
    setLoading(true);
    try {
      const details = await apiService.getSessionDetails(shareId);
      setSessionDetails(details);
      setCode(details.session.code_content || '');
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  // Join session
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
    setOutput('');
    setExecutionError('');
    
    // Get current user's username
    const currentUsername = sessionStorage.getItem(`session_${shareId}_username`) || 'You';
    setLastExecutedBy(currentUsername);
    
    try {
      const result = await apiService.executeCode({
        code,
        language: sessionDetails.session.language,
        input_data: ''
      });
      
      setOutput(result.output);
      setExecutionError(result.error);
      setExecutionTime(result.execution_time);
      
      // Share execution result with other participants
      if (sendExecutionResult) {
        sendExecutionResult({
          output: result.output,
          error: result.error,
          execution_time: result.execution_time
        });
      }
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to execute code';
      setExecutionError(errorMessage);
      
      // Share error result with other participants
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
    
    // Check if user has already joined this session
    if (shareId) {
      const hasJoined = sessionStorage.getItem(`session_${shareId}_joined`) === 'true';
      const participantId = sessionStorage.getItem(`session_${shareId}_participant_id`);
      
      if (hasJoined && participantId) {
        setHasJoinedSession(true);
      }
    }
  }, [shareId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading collaboration session...</p>
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
              {/* Participants */}
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Users className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">{participants.length}</span>
                
                {/* Participant avatars */}
                <div className="flex -space-x-1 sm:-space-x-2">
                  {participants.slice(0, 4).map((participant) => (
                    <Avatar
                      key={participant.id}
                      className={`w-7 h-7 sm:w-8 sm:h-8 ring-2 ${
                        participant.is_connected 
                          ? participant.is_owner 
                            ? 'ring-yellow-500' // Owner: yellow ring
                            : 'ring-green-500'  // Online: green ring
                          : 'ring-gray-400'     // Offline: gray ring
                      } ring-offset-2 ring-offset-background`}
                      title={`${participant.username}${participant.is_owner ? ' (Owner)' : ''}${participant.is_connected ? ' • Online' : ' • Offline'}`}
                    >
                      <AvatarFallback 
                        className="text-xs sm:text-sm font-medium text-white"
                        style={{ backgroundColor: participant.cursor_color || '#666' }}
                      >
                        {participant.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  
                  {/* Show overflow count */}
                  {participants.length > 4 && (
                    <Avatar className="w-7 h-7 sm:w-8 sm:h-8 ring-2 ring-muted ring-offset-2 ring-offset-background">
                      <AvatarFallback className="bg-muted text-xs sm:text-sm font-medium">
                        +{participants.length - 4}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
                
                {/* Mobile participant count */}
                <span className="text-sm sm:hidden">({participants.length})</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyShareLink}
              >
                <Share2 className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Share</span>
              </Button>

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
                />
              </div>
            </div>
          }
          rightPanel={
            <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm md:ml-2">
              <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Output</h3>
                  {lastExecutedBy && (
                    <span className="text-xs text-muted-foreground">
                      by {lastExecutedBy}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-hidden rounded-b-lg">
                <OutputConsole
                  output={output}
                  error={executionError}
                  isLoading={isExecuting}
                  executionTime={executionTime}
                />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
