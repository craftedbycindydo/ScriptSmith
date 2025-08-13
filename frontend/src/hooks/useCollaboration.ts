import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
// @ts-ignore - y-monaco doesn't have complete TypeScript definitions
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

interface UseCollaborationProps {
  sessionId?: number;
  participantId?: number;
  monacoEditor?: any; // Monaco editor instance
  onParticipantsChange?: (participants: Participant[]) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export const useCollaboration = ({
  sessionId,
  participantId,
  monacoEditor,
  onParticipantsChange,
  onConnectionChange
}: UseCollaborationProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const yjsDocRef = useRef<Y.Doc | null>(null);
  const monacoBindingRef = useRef<MonacoBinding | null>(null);
  const lastCursorPositionRef = useRef<{ lineNumber: number; column: number } | null>(null);

  // Initialize Y.js document
  const initializeYjsDoc = useCallback(() => {
    if (!yjsDocRef.current) {
      yjsDocRef.current = new Y.Doc();
    }
    return yjsDocRef.current;
  }, []);

  // Initialize Monaco binding
  const initializeMonacoBinding = useCallback(() => {
    if (!monacoEditor || !yjsDocRef.current || monacoBindingRef.current) {
      return;
    }

    const yText = yjsDocRef.current.getText('monaco');
    
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
        sendCursorUpdate(position);
      }
    });

  }, [monacoEditor]);

  // Send cursor update
  const sendCursorUpdate = useCallback((position: { lineNumber: number; column: number }) => {
    if (socketRef.current && sessionId && participantId) {
      socketRef.current.emit('cursor_update', {
        session_id: sessionId,
        participant_id: participantId,
        cursor: position
      });
    }
  }, [sessionId, participantId]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!sessionId || !participantId || socketRef.current?.connected) {
      return;
    }

    // Initialize Y.js document
    initializeYjsDoc();

    // Create WebSocket connection
    const wsUrl = config.apiBaseUrl.replace(/^http/, 'ws').replace('/api', '');
    socketRef.current = io(wsUrl, {
      transports: ['websocket'],
      upgrade: false
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected to collaboration server');
      setIsConnected(true);
      setError(null);
      onConnectionChange?.(true);

      // Join the session
      socket.emit('join_session', {
        session_id: sessionId,
        participant_id: participantId
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from collaboration server');
      setIsConnected(false);
      onConnectionChange?.(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect to collaboration server');
      setIsConnected(false);
      onConnectionChange?.(false);
    });

    // Session events
    socket.on('session_joined', (data) => {
      console.log('Joined session:', data);
      initializeMonacoBinding();
    });

    socket.on('participants_list', (data) => {
      console.log('Participants list:', data.participants);
      setParticipants(data.participants);
      onParticipantsChange?.(data.participants);
    });

    socket.on('participant_update', (data) => {
      console.log('Participant update:', data);
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

    // Y.js document updates
    socket.on('yjs_update', (data) => {
      if (data.participant_id !== participantId && yjsDocRef.current) {
        // Apply the update from other participants
        try {
          const update = new Uint8Array(
            Array.from(atob(data.yjs_update), c => c.charCodeAt(0))
          );
          Y.applyUpdate(yjsDocRef.current, update);
        } catch (err) {
          console.error('Error applying Y.js update:', err);
        }
      }
    });

    // Cursor updates
    socket.on('cursor_update', (data) => {
      console.log('Cursor update:', data);
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
      console.error('Socket error:', data);
      setError(data.message || 'An error occurred');
    });

    // Listen for Y.js document changes to send updates
    if (yjsDocRef.current) {
      const updateHandler = (update: Uint8Array, origin: unknown) => {
        // Only send updates that originated from this client
        if (origin !== socket) {
          const updateString = btoa(String.fromCharCode(...update));
          socket.emit('yjs_update', {
            session_id: sessionId,
            participant_id: participantId,
            yjs_update: updateString
          });
        }
      };

      yjsDocRef.current.on('update', updateHandler);

      // Store the handler for cleanup
      (yjsDocRef.current as Y.Doc & { _updateHandler?: any })._updateHandler = updateHandler;
    }

  }, [sessionId, participantId, initializeYjsDoc, initializeMonacoBinding, onConnectionChange, onParticipantsChange]);

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

    // Clean up Y.js
    if (monacoBindingRef.current) {
      monacoBindingRef.current.destroy();
      monacoBindingRef.current = null;
    }

    if (yjsDocRef.current) {
      // Remove update handler
      const docWithHandler = yjsDocRef.current as Y.Doc & { _updateHandler?: any };
      if (docWithHandler._updateHandler) {
        yjsDocRef.current.off('update', docWithHandler._updateHandler);
        delete docWithHandler._updateHandler;
      }
      
      yjsDocRef.current.destroy();
      yjsDocRef.current = null;
    }

    setIsConnected(false);
    setParticipants([]);
    setError(null);
    onConnectionChange?.(false);
    onParticipantsChange?.([]);
  }, [sessionId, participantId, onConnectionChange, onParticipantsChange]);

  // Auto-connect when session and participant are available
  useEffect(() => {
    if (sessionId && participantId && monacoEditor) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, participantId, monacoEditor, connect, disconnect]);

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
    yjsDoc: yjsDocRef.current
  };
};
