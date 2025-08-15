import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { config } from '../config/env';

interface Participant {
  id: number;
  username: string;
  is_connected: boolean;
  cursor_color?: string;
  cursor_position?: { lineNumber: number; column: number };
  is_owner: boolean;
}

export interface ExecutionResult {
  output: string;
  error: string;
  execution_time: number;
  participant_id: number;
  participant_username: string;
  timestamp: string;
}

interface UseCollaborationProps {
  sessionId?: number;
  participantId?: number;
  monacoEditor?: any; // Monaco editor instance
  monaco?: any; // Monaco instance
  onParticipantsChange?: (participants: Participant[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  onExecutionResult?: (result: ExecutionResult) => void;
}

export const useCollaboration = ({
  sessionId,
  participantId,
  monacoEditor,
  monaco,
  onParticipantsChange,
  onConnectionChange,
  onExecutionResult
}: UseCollaborationProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // State for tracking initialization
  const [isInitialized, setIsInitialized] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const yjsDocRef = useRef<Y.Doc | null>(null);
  const monacoBindingRef = useRef<MonacoBinding | null>(null);
  const lastCursorPositionRef = useRef<{ lineNumber: number; column: number } | null>(null);

  // Send execution result to other participants
  const sendExecutionResult = useCallback((result: { output: string; error: string; execution_time: number }) => {
    if (socketRef.current && sessionId && participantId) {
      socketRef.current.emit('code_execution_result', {
        session_id: sessionId,
        participant_id: participantId,
        execution_result: result
      });
    }
  }, [sessionId, participantId]);

  // Initialize Monaco binding  
  const initializeMonacoBinding = useCallback(() => {
    if (!monacoEditor || !yjsDocRef.current || !monaco) {
      return;
    }

    // Prevent unnecessary re-initialization if binding already exists and is working
    if (monacoBindingRef.current && monacoBindingRef.current.awareness) {
      return;
    }

    // Clean up existing binding first
    if (monacoBindingRef.current) {
      monacoBindingRef.current.destroy();
      monacoBindingRef.current = null;
    }

    try {
      const yText = yjsDocRef.current.getText('monaco');
      
      // Create Monaco binding - websocket server is the source of truth
      // All document content comes from the server, not the UI
      monacoBindingRef.current = new MonacoBinding(
        yText,
        monacoEditor.getModel(),
        new Set([monacoEditor])
      );

      // Listen for cursor changes
      monacoEditor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } }) => {
        const position = {
          lineNumber: e.position.lineNumber,
          column: e.position.column
        };

        // Only send if position actually changed
        if (JSON.stringify(position) !== JSON.stringify(lastCursorPositionRef.current)) {
          lastCursorPositionRef.current = position;
          // Use socketRef directly to avoid dependency issues
          if (socketRef.current && sessionId && participantId) {
            socketRef.current.emit('cursor_update', {
              session_id: sessionId,
              participant_id: participantId,
              cursor: position
            });
          }
        }
      });

      setIsInitialized(true);
    } catch (error) {
      setError(`Failed to initialize collaborative editor: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [monacoEditor, monaco]);

  // Initialize Y.js document
  const initializeYjsDoc = useCallback(() => {
    if (!yjsDocRef.current) {
      yjsDocRef.current = new Y.Doc();
    }
    return yjsDocRef.current;
  }, []);

  // Initialize Monaco binding when all components are ready
  useEffect(() => {
    if (monacoEditor && monaco && yjsDocRef.current && isConnected && !monacoBindingRef.current && !isInitialized) {
      setTimeout(() => {
        initializeMonacoBinding();
      }, 100);
    }
  }, [monacoEditor, monaco, isConnected, isInitialized]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!sessionId || !participantId) {
      return;
    }

    if (socketRef.current?.connected) {
      return;
    }

    // Disconnect any existing socket first
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Initialize Y.js document
    initializeYjsDoc();

    // Create WebSocket connection to dedicated service
    socketRef.current = io(config.websocketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      onConnectionChange?.(true);

      // Join the session
      socket.emit('join_session', {
        session_id: sessionId,
        participant_id: participantId
      });
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      onConnectionChange?.(false);
      
      // Clear socket reference for certain disconnect reasons
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        socketRef.current = null;
      }
    });

    socket.on('connect_error', (err) => {
      setError(`Failed to connect to collaboration server: ${err.message || 'Unknown error'}`);
      setIsConnected(false);
      onConnectionChange?.(false);
    });

    // Session events
    socket.on('session_joined', (data) => {
      console.log('🔗 Joined session:', data.session_id);
      // Binding initialization is handled by useEffect
    });

    // Document content from server - replace entire editor content
    socket.on('document_content', (data) => {
      if (monacoEditor && data.content !== undefined) {
        const currentContent = monacoEditor.getValue();
        if (currentContent !== data.content) {
          console.log('📄 Updating editor content from server');
          monacoEditor.setValue(data.content);
        }
      }
    });

    socket.on('participants_list', (data) => {
      setParticipants(data.participants);
      onParticipantsChange?.(data.participants);
    });

    socket.on('participant_update', (data) => {
      setParticipants(prev => {
        const updated = prev.map(p => 
          p.id === data.participant_id 
            ? { ...p, ...data, id: data.participant_id }
            : p
        );
        
        // Add participant if not found
        if (!prev.find(p => p.id === data.participant_id)) {
          updated.push({ ...data, id: data.participant_id });
        }
        
        onParticipantsChange?.(updated);
        return updated;
      });
    });

    // Document changes from other participants
    socket.on('document_changed', (data) => {
      if (data.participant_id !== participantId && monacoEditor && data.content !== undefined) {
        const currentContent = monacoEditor.getValue();
        if (currentContent !== data.content) {
          console.log('📝 Document updated by participant:', data.participant_id);
          monacoEditor.setValue(data.content);
        }
      }
    });

    // Cursor updates
    socket.on('cursor_update', (data) => {
      // Update cursor position for the participant
      setParticipants(prev => 
        prev.map(p => 
          p.id === data.participant_id 
            ? { ...p, cursor_position: data.cursor }
            : p
        )
      );
    });

    socket.on('error', (data) => {
      setError(data.message || 'An error occurred');
    });

    // Handle execution results from other participants
    socket.on('code_execution_result', (data) => {
      // Only show results from other participants
      // Ensure this doesn't interfere with Y.js document synchronization
      if (data.participant_id !== participantId && onExecutionResult) {
        // Use setTimeout to avoid interfering with Y.js updates
        setTimeout(() => {
          onExecutionResult({
            output: data.execution_result.output,
            error: data.execution_result.error,
            execution_time: data.execution_result.execution_time,
            participant_id: data.participant_id,
            participant_username: data.participant_username,
            timestamp: data.timestamp
          });
        }, 0);
      }
    });

    // Send document changes to server
    let changeTimeout: NodeJS.Timeout | null = null;
    
    const handleDocumentChange = () => {
      if (changeTimeout) clearTimeout(changeTimeout);
      
      changeTimeout = setTimeout(() => {
        if (monacoEditor && socket && socket.connected) {
          const content = monacoEditor.getValue();
          socket.emit('document_change', {
            session_id: sessionId,
            participant_id: participantId,
            content: content
          });
        }
      }, 500); // Debounce document changes by 500ms
    };

    // Listen for Monaco editor changes
    if (monacoEditor) {
      const disposable = monacoEditor.onDidChangeModelContent(() => {
        handleDocumentChange();
      });
      
      // Store for cleanup
      (socketRef.current as any)._monacoDisposable = disposable;
    }

  }, [sessionId, participantId]); // Simplified dependencies - only core identifiers needed

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (sessionId && participantId) {
        socketRef.current.emit('leave_session', {
          session_id: sessionId,
          participant_id: participantId
        });
      }
      
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Clean up Monaco binding
    if (monacoBindingRef.current) {
      monacoBindingRef.current.destroy();
      monacoBindingRef.current = null;
    }

    // Clean up Monaco editor disposable
    if (socketRef.current && (socketRef.current as any)._monacoDisposable) {
      (socketRef.current as any)._monacoDisposable.dispose();
      delete (socketRef.current as any)._monacoDisposable;
    }

    if (yjsDocRef.current) {
      yjsDocRef.current.destroy();
      yjsDocRef.current = null;
    }

    setIsConnected(false);
    setParticipants([]);
    setError(null);
    onConnectionChange?.(false);
    onParticipantsChange?.([]);
  }, [sessionId, participantId, onConnectionChange, onParticipantsChange]);

  // Auto-connect when session exists
  useEffect(() => {
    if (sessionId && participantId && !socketRef.current?.connected) {
      connect();
    }

    return () => {
      // Don't disconnect here - socket persists for session, not individual users
    };
  }, [sessionId, participantId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    participants,
    error,
    connect,
    disconnect,
    yjsDoc: yjsDocRef.current,
    isInitialized,
    sendExecutionResult
  };
};
