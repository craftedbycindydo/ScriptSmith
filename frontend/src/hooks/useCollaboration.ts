import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
// Simple websocket-based collaboration - no Y.js needed
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
  onParticipantsChange?: (participants: Participant[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  onExecutionResult?: (result: ExecutionResult) => void;
  initialContent?: string; // Content to set when creating/sharing a session
}

export const useCollaboration = ({
  sessionId,
  participantId,
  monacoEditor,
  onParticipantsChange,
  onConnectionChange,
  onExecutionResult,
  initialContent
}: UseCollaborationProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const lastCursorPositionRef = useRef<{ lineNumber: number; column: number } | null>(null);
  const isUpdatingFromServer = useRef(false); // Prevent loops when updating from server

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

  // Send document changes to server (debounced)
  const sendDocumentChange = useCallback((content: string) => {
    if (socketRef.current && sessionId && participantId && !isUpdatingFromServer.current) {
      socketRef.current.emit('document_change', {
        session_id: sessionId,
        participant_id: participantId,
        content: content
      });
    }
  }, [sessionId, participantId]);

  // Set up Monaco editor change listener
  useEffect(() => {
    if (!monacoEditor) return;

    let changeTimeout: NodeJS.Timeout | null = null;

    const disposable = monacoEditor.onDidChangeModelContent(() => {
      // Debounce changes to avoid too many requests
      if (changeTimeout) clearTimeout(changeTimeout);
      
      changeTimeout = setTimeout(() => {
        const content = monacoEditor.getValue();
        // Use socketRef directly to avoid stale closure issues
        if (socketRef.current && sessionId && participantId && !isUpdatingFromServer.current) {
          console.log('📤 Sending document change:', {
            session_id: sessionId,
            participant_id: participantId,
            contentLength: content.length,
            preview: content.substring(0, 50) + (content.length > 50 ? '...' : '')
          });
          socketRef.current.emit('document_change', {
            session_id: sessionId,
            participant_id: participantId,
            content: content
          });
        }
      }, 100); // Send after 100ms of no changes (faster)
    });

    // Set up cursor change listener
    const cursorDisposable = monacoEditor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } }) => {
      const position = {
        lineNumber: e.position.lineNumber,
        column: e.position.column
      };

      // Only send if position actually changed  
      if (JSON.stringify(position) !== JSON.stringify(lastCursorPositionRef.current)) {
        lastCursorPositionRef.current = position;
        // Use socketRef directly to avoid stale closure issues
        if (socketRef.current && sessionId && participantId) {
          socketRef.current.emit('cursor_update', {
            session_id: sessionId,
            participant_id: participantId,
            cursor: position
          });
        }
      }
    });

    // Force save on before leaving
    const forceSave = () => {
      if (changeTimeout) {
        clearTimeout(changeTimeout);
        changeTimeout = null;
      }
      const content = monacoEditor.getValue();
      if (socketRef.current && sessionId && participantId && !isUpdatingFromServer.current && content) {
        console.log('🚨 Force saving document before disconnect:', content.length, 'chars');
        socketRef.current.emit('document_change', {
          session_id: sessionId,
          participant_id: participantId,
          content: content
        });
      }
    };

    return () => {
      forceSave(); // Force save before cleanup
      if (changeTimeout) clearTimeout(changeTimeout);
      disposable.dispose();
      cursorDisposable.dispose();
    };
  }, [monacoEditor, sessionId, participantId]); // Added sessionId and participantId to avoid recreating listeners

  // Force save before page unload (refresh, close tab, navigate away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (monacoEditor && socketRef.current && sessionId && participantId) {
        const content = monacoEditor.getValue();
        if (content) {
          console.log('🚨 Force saving before page unload:', content.length, 'chars');
          // Force immediate send without debouncing
          socketRef.current?.emit('document_change', {
            session_id: sessionId,
            participant_id: participantId,
            content: content
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [monacoEditor, sessionId, participantId]);

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
      // Force save before disconnect
      if (monacoEditor) {
        const content = monacoEditor.getValue();
        if (content && socketRef.current) {
          console.log('🚨 Force saving before socket disconnect:', content.length, 'chars');
          socketRef.current.emit('document_change', {
            session_id: sessionId,
            participant_id: participantId,
            content: content
          });
        }
      }
      
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
      // If this is a new session and we have initial content, send it to the server
      if (data.is_first_participant && initialContent && monacoEditor) {
        isUpdatingFromServer.current = true;
        monacoEditor.setValue(initialContent);
        isUpdatingFromServer.current = false;
        
        // Send the initial content to the server
        setTimeout(() => {
          sendDocumentChange(initialContent);
        }, 100);
      }
    });

    // Receive current document content when joining
    socket.on('document_content', (data) => {
      // Use the same editor resolution logic
      const getCurrentEditor = () => {
        return monacoEditor || 
               (typeof window !== 'undefined' && (window as any).monacoEditorInstance) ||
               null;
      };
      
      const currentEditor = getCurrentEditor();
      if (currentEditor && data.content !== undefined) {
        const currentContent = currentEditor.getValue();
        if (currentContent !== data.content) {
          isUpdatingFromServer.current = true;
          currentEditor.setValue(data.content);
          isUpdatingFromServer.current = false;
        }
      } else if (data.content !== undefined) {
        // Retry if editor not available yet
        setTimeout(() => {
          const retryEditor = getCurrentEditor();
          if (retryEditor) {
            isUpdatingFromServer.current = true;
            retryEditor.setValue(data.content);
            isUpdatingFromServer.current = false;
          }
        }, 100);
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
      if (data.participant_id !== participantId && data.content !== undefined) {
        // Use a function to get the current Monaco editor reference
        const getCurrentEditor = () => {
          // Try multiple ways to get the editor reference
          return monacoEditor || 
                 (typeof window !== 'undefined' && (window as any).monacoEditorInstance) ||
                 null;
        };
        
        const currentEditor = getCurrentEditor();
        if (currentEditor) {
          const currentContent = currentEditor.getValue();
          if (currentContent !== data.content) {
            isUpdatingFromServer.current = true;
            currentEditor.setValue(data.content);
            isUpdatingFromServer.current = false;
          }
        } else {
          // Queue the update for when editor becomes available
          setTimeout(() => {
            const retryEditor = getCurrentEditor();
            if (retryEditor) {
              isUpdatingFromServer.current = true;
              retryEditor.setValue(data.content);
              isUpdatingFromServer.current = false;
            }
          }, 100);
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
      if (data.participant_id !== participantId && onExecutionResult) {
        onExecutionResult({
          output: data.execution_result.output,
          error: data.execution_result.error,
          execution_time: data.execution_result.execution_time,
          participant_id: data.participant_id,
          participant_username: data.participant_username,
          timestamp: data.timestamp
        });
      }
    });

  }, [sessionId, participantId, initialContent]); // Removed sendDocumentChange to avoid recreating socket listeners

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

    // Clean up state

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
    sendExecutionResult
  };
};
