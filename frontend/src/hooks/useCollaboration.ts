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
  role: string;
  status: string;
  joined_at: string;
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
  const [permissionStatus, setPermissionStatus] = useState<'approved' | 'pending' | 'rejected' | 'kicked'>('pending');
  const [canEdit, setCanEdit] = useState(false);
  const [userRole, setUserRole] = useState<string>('editor');
  
  const socketRef = useRef<Socket | null>(null);
  const isUpdatingFromServer = useRef(false); // Prevent loops when updating from server
  const cursorDecorationsRef = useRef<{ [participantId: number]: string[] }>({}); // Track cursor decorations for each participant

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

  // Generate unique color for each participant
  const getParticipantColor = useCallback((participantId: number): string => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
    ];
    return colors[participantId % colors.length];
  }, []);

  // Update cursor decorations for all participants - ROBUST editor reference
  const updateCursorDecorations = useCallback(() => {
    // Use robust editor reference like document changes
    const getCurrentEditor = () => {
      return monacoEditor || 
             (typeof window !== 'undefined' && (window as any).monacoEditorInstance) ||
             null;
    };
    
    const currentEditor = getCurrentEditor();
    if (!currentEditor) {
      return;
    }
    
    // Clear all existing cursor decorations
    Object.values(cursorDecorationsRef.current).forEach(decorationIds => {
      if (decorationIds.length > 0) {
        currentEditor.deltaDecorations(decorationIds, []);
      }
    });
    cursorDecorationsRef.current = {};

    // Add decorations for each participant with cursor position (excluding self)
    participants.forEach(participant => {
      if (participant.id !== participantId && participant.cursor_position && 
          participant.status === 'approved' && participant.role !== 'kicked') {
        const position = participant.cursor_position;
        const color = getParticipantColor(participant.id);
        
        // Create cursor line decoration
        const cursorDecorations = currentEditor.deltaDecorations([], [
          {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            },
            options: {
              className: `remote-cursor-${participant.id}`,
              hoverMessage: { value: `${participant.username}'s cursor` },
              beforeContentClassName: `remote-cursor-before-${participant.id}`,
              afterContentClassName: `remote-cursor-after-${participant.id}`,
              stickiness: 1 // monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
          }
        ]);

        cursorDecorationsRef.current[participant.id] = cursorDecorations;

        // Inject CSS for this specific cursor
        const styleId = `cursor-style-${participant.id}`;
        let existingStyle = document.getElementById(styleId);
        if (!existingStyle) {
          existingStyle = document.createElement('style');
          existingStyle.id = styleId;
          document.head.appendChild(existingStyle);
        }
        
        existingStyle.textContent = `
          .remote-cursor-${participant.id} {
            border-left: 2px solid ${color} !important;
            position: relative;
          }
          .remote-cursor-before-${participant.id}::before {
            content: "${participant.username}";
            position: absolute;
            top: -20px;
            left: -2px;
            background: ${color};
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            z-index: 1000;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .remote-cursor-after-${participant.id}::after {
            content: "";
            position: absolute;
            top: -6px;
            left: -3px;
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 6px solid ${color};
            z-index: 999;
            pointer-events: none;
          }
        `;
      }
    });
  }, [monacoEditor, participants, participantId, getParticipantColor]);

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
    
    // Store Monaco editor globally for robust access
    if (typeof window !== 'undefined') {
      (window as any).monacoEditorInstance = monacoEditor;
    }

    const disposable = monacoEditor.onDidChangeModelContent(() => {
      // Send changes with light client-side debouncing for performance
      const content = monacoEditor.getValue();
      if (socketRef.current && sessionId && participantId && !isUpdatingFromServer.current) {
        // Clear existing timeout to implement debouncing
        if ((window as any).documentChangeTimeout) {
          clearTimeout((window as any).documentChangeTimeout);
        }
        
        // Light debouncing (50ms) - server handles the heavy debouncing
        (window as any).documentChangeTimeout = setTimeout(() => {
          if (socketRef.current && !isUpdatingFromServer.current) {
            socketRef.current.emit('document_change', {
              session_id: sessionId,
              participant_id: participantId,
              content: content
            });
          }
        }, 50);
      }
    });

    // Set up cursor change listener with throttling for performance
    // Listen to BOTH cursor selection changes AND cursor position changes
    const cursorDisposable = monacoEditor.onDidChangeCursorPosition((e: any) => {
      const position = {
        lineNumber: e.position.lineNumber,
        column: e.position.column
      };
      // Throttle cursor updates to reduce network traffic
      if (socketRef.current && sessionId && participantId && !isUpdatingFromServer.current) {
        // Clear existing timeout to implement throttling
        if ((window as any).cursorUpdateTimeout) {
          clearTimeout((window as any).cursorUpdateTimeout);
        }
        
        // Light throttling (100ms) - matches server throttling
        (window as any).cursorUpdateTimeout = setTimeout(() => {
          if (socketRef.current && !isUpdatingFromServer.current) {
            socketRef.current.emit('cursor_update', {
              session_id: sessionId,
              participant_id: participantId,
              cursor: position
            });
          }
        }, 100);
      }
    });

    // Also listen to selection changes (covers more cursor movement cases)
    const selectionDisposable = monacoEditor.onDidChangeCursorSelection((e: any) => {
      const position = {
        lineNumber: e.selection.startLineNumber,
        column: e.selection.startColumn
      };
      // Use same throttling logic as cursor position changes
      if (socketRef.current && sessionId && participantId && !isUpdatingFromServer.current) {
        // Clear existing timeout to implement throttling
        if ((window as any).cursorUpdateTimeout) {
          clearTimeout((window as any).cursorUpdateTimeout);
        }
        
        // Light throttling (100ms) - matches server throttling
        (window as any).cursorUpdateTimeout = setTimeout(() => {
          if (socketRef.current && !isUpdatingFromServer.current) {
            socketRef.current.emit('cursor_update', {
              session_id: sessionId,
              participant_id: participantId,
              cursor: position
            });
          }
        }, 100);
      }
    });

    return () => {
      // No need for force save since we send immediately
      disposable.dispose();
      cursorDisposable.dispose();
      selectionDisposable.dispose();
    };
  }, [monacoEditor, sessionId, participantId]); // Added sessionId and participantId to avoid recreating listeners

  // Update cursor decorations when participants change - SIMPLE like document changes
  useEffect(() => {
    updateCursorDecorations();
  }, [participants, updateCursorDecorations]);





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

    // Create WebSocket connection to dedicated service with performance optimization
    socketRef.current = io(config.websocketUrl, {
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      timeout: 15000, // Reduced timeout for faster error detection
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      forceNew: true,
      // Performance optimizations
      upgrade: true,
      rememberUpgrade: true,
      autoConnect: true
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
        
        // Update permission status
        setPermissionStatus(data.permission_status || 'approved');
        setCanEdit(data.can_edit || false);
        setUserRole(data.role || 'editor');
        
        // Clear any previous errors
        setError(null);

        // Send initial cursor position when successfully joining
        setTimeout(() => {
          if (monacoEditor) {
            const position = monacoEditor.getPosition();
            if (position && socketRef.current) {
              socketRef.current.emit('cursor_update', {
                session_id: sessionId,
                participant_id: participantId,
                cursor: {
                  lineNumber: position.lineNumber,
                  column: position.column
                }
              });
            }
          }
        }, 200);
      
      // If this is a new session and we have initial content, send it to the server
      if (data.is_first_participant && initialContent && monacoEditor) {
        // For initial content, don't preserve cursor position
        isUpdatingFromServer.current = true;
        monacoEditor.setValue(initialContent);
        isUpdatingFromServer.current = false;
        
        // Force cursor decorations update after initial content setValue()
        setTimeout(() => {
          updateCursorDecorations();
        }, 50);
        
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
          // For initial content load, don't preserve cursor (start at beginning)
          isUpdatingFromServer.current = true;
          currentEditor.setValue(data.content);
          isUpdatingFromServer.current = false;
          
          // Force cursor decorations update after setValue()
          setTimeout(() => {
            updateCursorDecorations();
          }, 50);
        }
      } else if (data.content !== undefined) {
        // Retry if editor not available yet
        setTimeout(() => {
          const retryEditor = getCurrentEditor();
          if (retryEditor) {
            isUpdatingFromServer.current = true;
            retryEditor.setValue(data.content);
            isUpdatingFromServer.current = false;
            
            // Force cursor decorations update after setValue()
            setTimeout(() => {
              updateCursorDecorations();
            }, 50);
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

    // Document changes from other participants - WITH CURSOR PERSISTENCE
    socket.on('document_changed', (data) => {
      // Try to get Monaco editor reference robustly
      const getCurrentEditor = () => {
        return monacoEditor || 
               (typeof window !== 'undefined' && (window as any).monacoEditorInstance) ||
               null;
      };
      
      const currentEditor = getCurrentEditor();
      
      if (data.participant_id !== participantId && data.content !== undefined && currentEditor) {
        const currentContent = currentEditor.getValue();
        
        if (currentContent !== data.content) {
          // STEP 1: Store our cursor position before document change
          const ourPosition = currentEditor.getPosition();
          const ourSelection = currentEditor.getSelection();
          
          // STEP 2: Apply document change (this CLEARS all decorations including cursors!)
          isUpdatingFromServer.current = true;
          currentEditor.setValue(data.content);
          
          // STEP 3: Restore our cursor position and send update to others
          if (ourPosition && participantId) {
            try {
              const model = currentEditor.getModel();
              if (model) {
                const lineCount = model.getLineCount();
                const safeLineNumber = Math.min(ourPosition.lineNumber, lineCount);
                const lineContent = model.getLineContent(safeLineNumber);
                const safeColumn = Math.min(ourPosition.column, lineContent.length + 1);
                
                const safePosition = {
                  lineNumber: safeLineNumber,
                  column: safeColumn
                };
                
                currentEditor.setPosition(safePosition);
                
                // Send our updated cursor position to others immediately
                if (socketRef.current && sessionId) {
                  socketRef.current.emit('cursor_update', {
                    session_id: sessionId,
                    participant_id: participantId,
                    cursor: safePosition
                  });
                }
                
                // Restore selection if we had one
                if (ourSelection) {
                  const safeStartLine = Math.min(ourSelection.startLineNumber, lineCount);
                  const safeEndLine = Math.min(ourSelection.endLineNumber, lineCount);
                  const startLineContent = model.getLineContent(safeStartLine);
                  const endLineContent = model.getLineContent(safeEndLine);
                  const safeStartColumn = Math.min(ourSelection.startColumn, startLineContent.length + 1);
                  const safeEndColumn = Math.min(ourSelection.endColumn, endLineContent.length + 1);
                  
                  currentEditor.setSelection({
                    startLineNumber: safeStartLine,
                    startColumn: safeStartColumn,
                    endLineNumber: safeEndLine,
                    endColumn: safeEndColumn
                  });
                }
              }
            } catch (error) {
              console.warn('Could not restore cursor position after document change:', error);
              currentEditor.setPosition({ lineNumber: 1, column: 1 });
            }
          }
          
          isUpdatingFromServer.current = false;
          
          // STEP 4: Immediately re-apply cursor decorations after setValue() cleared them
          // No setTimeout needed - just re-read participants state and apply decorations
          updateCursorDecorations();
        }
      }
    });
    


    // Cursor updates - SIMPLE like document changes
    socket.on('cursor_update', (data) => {
      // Update cursor position for the participant
      setParticipants(prev => 
        prev.map(p => 
          p.id === data.participant_id 
            ? { ...p, cursor_position: data.cursor }
            : p
        )
      );
      // Update decorations immediately - no setTimeout
      updateCursorDecorations();
    });

    socket.on('error', (data) => {
      setError(data.message || 'An error occurred');
    });

    // Handle permission denied
    socket.on('permission_denied', (data) => {
      setError(data.message || 'Permission denied');
      console.warn('Permission denied:', data);
    });

    // Handle being kicked from session
    socket.on('kicked_from_session', (data) => {
      setError(data.message || 'You have been removed from this session');
      setPermissionStatus('kicked');
      setCanEdit(false);
      disconnect();
    });

        // Handle permission changes  
    socket.on('participant_permission_changed', (data) => {
      
      // If this is about the current user, update their permissions
      if (data.participant_id === participantId) {
        setPermissionStatus(data.status);
        setCanEdit(data.role && ['owner', 'editor'].includes(data.role));
        setUserRole(data.role);
        
        if (data.action === 'kick' || data.status === 'kicked') {
          setError('You have been removed from this session');
          disconnect();
          return;
        }
      }
      
      // Update participants list using functional state update to avoid stale closure
      setParticipants(prevParticipants => {
        let updatedParticipants;
        
        if (data.action === 'kick' || data.status === 'kicked') {
          // Remove kicked participants entirely from the list
          updatedParticipants = prevParticipants.filter(p => p.id !== data.participant_id);
        } else {
          // Update participant properties for other actions
          updatedParticipants = prevParticipants.map(p => 
            p.id === data.participant_id 
              ? { ...p, role: data.role, status: data.status }
              : p
          );
        }
        
        // Also notify parent component with updated list immediately
        onParticipantsChange?.(updatedParticipants);
        
        return updatedParticipants;
      });
    });

    // Handle batch admission updates
    socket.on('batch_admission_update', (data) => {
      
      // Instead of clearing participants, update them based on the batch results
      if (data.results && Array.isArray(data.results)) {
        setParticipants(prevParticipants => {
          let updatedParticipants = [...prevParticipants];
          
          // Apply each batch result to the participant list
          data.results.forEach((result: any) => {
            if (result.success) {
              updatedParticipants = updatedParticipants.map(p => 
                p.id === result.participant_id 
                  ? { 
                      ...p, 
                      status: result.action === 'approve' ? 'approved' : 
                             result.action === 'reject' ? 'rejected' : p.status
                    }
                  : p
              );
            }
          });
          
          // Notify parent component immediately
          onParticipantsChange?.(updatedParticipants);
          
          return updatedParticipants;
        });
      } else {
        // Fallback: refresh from backend only if no batch results provided
        setTimeout(async () => {
          try {
            const response = await fetch(`${config.apiBaseUrl}/collaboration/sessions/${sessionId}/participants`);
            if (response.ok) {
              const freshParticipants = await response.json();
              setParticipants(freshParticipants);
              onParticipantsChange?.(freshParticipants);
            }
          } catch (error) {
            console.error('Failed to refresh participants after batch update:', error);
          }
        }, 100);
      }
    });

    // Handle participant connection events
    socket.on('participant_connected', (_data) => {
      
      // Refresh participant list when someone new joins
      setTimeout(async () => {
        try {
          const response = await fetch(`${config.apiBaseUrl}/collaboration/sessions/${sessionId}/participants`);
          if (response.ok) {
            const freshParticipants = await response.json();
            setParticipants(freshParticipants);
            onParticipantsChange?.(freshParticipants);
          }
        } catch (error) {
          console.error('Failed to refresh participants after connection:', error);
        }
      }, 500); // Small delay to allow backend to process the join
    });

    socket.on('participant_disconnected', (data) => {
      
      // Remove disconnected participant from list
      setParticipants(prevParticipants => {
        const updatedParticipants = prevParticipants.map(p => 
          p.id === data.participant_id 
            ? { ...p, is_connected: false }
            : p
        );
        
        onParticipantsChange?.(updatedParticipants);
        return updatedParticipants;
      });
    });

    // Handle participant list refresh requests
    socket.on('participants_list_updated', (_data) => {
      
      // Refresh participant list from backend
      setTimeout(async () => {
        try {
          const response = await fetch(`${config.apiBaseUrl}/collaboration/sessions/${sessionId}/participants`);
          if (response.ok) {
            const freshParticipants = await response.json();
            setParticipants(freshParticipants);
            onParticipantsChange?.(freshParticipants);
          }
        } catch (error) {
          console.error('Failed to refresh participants after list update:', error);
        }
      }, 200);
    });

    // Handle execution results from all participants (including self for consistency)
    socket.on('code_execution_result', (data) => {
      
      if (onExecutionResult) {
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

    // Clean up cursor decorations
    if (monacoEditor) {
      Object.values(cursorDecorationsRef.current).forEach(decorationIds => {
        if (decorationIds.length > 0) {
          monacoEditor.deltaDecorations(decorationIds, []);
        }
      });
      cursorDecorationsRef.current = {};
    }

    // Clean up cursor styles
    Object.keys(cursorDecorationsRef.current).forEach(participantId => {
      const styleElement = document.getElementById(`cursor-style-${participantId}`);
      if (styleElement) {
        styleElement.remove();
      }
    });

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
    permissionStatus,
    canEdit,
    userRole,
    connect,
    disconnect,
    sendExecutionResult
  };
};
