import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import CodeEditor from './CodeEditor';
import OutputConsole from './OutputConsole';
import { useCollaboration } from '@/hooks/useCollaboration';
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
  const [output, setOutput] = useState('');
  const [executionError, setExecutionError] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState<number>(0);
  
  const monacoEditorRef = useRef<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const {
    error: collaborationError
  } = useCollaboration({
    sessionId: sessionDetails?.session.id,
    participantId: sessionDetails?.user_participant_id,
    monacoEditor: monacoEditorRef.current,
    onParticipantsChange: setParticipants,
    onConnectionChange: setIsConnected
  });

  // Load session details
  const loadSession = async () => {
    if (!shareId) return;
    
    setLoading(true);
    try {
      const details = await apiService.getSessionDetails(shareId);
      setSessionDetails(details);
      setCode(details.session.code_content || '');
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
      await apiService.joinSession(shareId, { username: newUsername.trim() });
      await loadSession(); // Reload to get updated participant info
      setNewUsername('');
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
    
    try {
      const result = await apiService.executeCode({
        code,
        language: sessionDetails.session.language,
        input_data: ''
      });
      
      setOutput(result.output);
      setExecutionError(result.error);
      setExecutionTime(result.execution_time);
    } catch (err: any) {
      setExecutionError(err.response?.data?.detail || 'Failed to execute code');
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
  const handleEditorDidMount = (editor: any) => {
    monacoEditorRef.current = editor;
  };

  useEffect(() => {
    loadSession();
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

  if (!sessionDetails?.is_participant) {
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
      {/* Header */}
      <header className="border-b bg-card">
        <div className="p-4">
          <div className="flex items-center justify-between">
            {/* Left side - Session info */}
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
                <h1 className="text-lg font-bold">{sessionDetails.session.title}</h1>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{sessionDetails.session.language}</Badge>
                  <span>by {sessionDetails.session.owner_username}</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-destructive'}`} />
                    <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side - Actions and participants */}
            <div className="flex items-center space-x-4">
              {/* Participants */}
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span className="text-sm">{participants.length}</span>
                
                {/* Participant avatars */}
                <div className="flex -space-x-2">
                  {participants.slice(0, 5).map((participant) => (
                    <div
                      key={participant.id}
                      className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium text-primary-foreground relative"
                      style={{ backgroundColor: participant.cursor_color || '#666' }}
                      title={`${participant.username}${participant.is_owner ? ' (Owner)' : ''}`}
                    >
                      {participant.username.charAt(0).toUpperCase()}
                      {participant.is_owner && (
                        <div className="w-3 h-3 absolute -top-1 -right-1 bg-warning rounded-full" />
                      )}
                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-background ${
                        participant.is_connected ? 'bg-success' : 'bg-muted'
                      }`} />
                    </div>
                  ))}
                  {participants.length > 5 && (
                    <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs">
                      +{participants.length - 5}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyShareLink}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>

              <Button
                onClick={handleExecuteCode}
                disabled={isExecuting}
                className="btn-success"
                size="sm"
              >
                <Play className="w-4 h-4 mr-2" />
                {isExecuting ? 'Running...' : 'Run'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Code Editor */}
        <div className="flex-1 p-4 min-h-0">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Collaborative Code Editor
                {collaborationError && (
                  <span className="text-destructive text-xs ml-2">
                    ({collaborationError})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 h-full pb-6">
              <div className="h-full min-h-[300px]">
                <CodeEditor
                  language={sessionDetails.session.language}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  onMount={handleEditorDidMount}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Output Panel */}
        <div className="w-96 p-4 pl-0 flex-shrink-0">
          <OutputConsole
            output={output}
            error={executionError}
            isLoading={isExecuting}
            executionTime={executionTime}
          />
        </div>
      </div>
    </div>
  );
}
