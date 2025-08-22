const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

// Environment configuration
const PORT = process.env.PORT || 8007;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8082';
const CORS_ORIGINS = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173'];
const NODE_ENV = process.env.NODE_ENV || 'development';
const SOCKET_PING_TIMEOUT = parseInt(process.env.SOCKET_PING_TIMEOUT || '60000');
const SOCKET_PING_INTERVAL = parseInt(process.env.SOCKET_PING_INTERVAL || '25000');
const SESSION_CLEANUP_INTERVAL = parseInt(process.env.SESSION_CLEANUP_INTERVAL || '3600000');

// Configure CORS for Express
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));

app.use(express.json());

// Configure Socket.IO with CORS and performance optimization
const io = socketIo(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: SOCKET_PING_TIMEOUT,
  pingInterval: SOCKET_PING_INTERVAL,
  allowEIO3: true,
  // Enhanced connection management and performance
  connectTimeout: 30000, // Reduced to 30s for faster failover
  perMessageDeflate: {
    threshold: 1024, // Only compress messages > 1KB
    concurrencyLimit: 10,
    windowBits: 13
  },
  httpCompression: true, // Enable HTTP compression for better performance
  maxHttpBufferSize: 5e6, // Increased to 5MB for larger documents
  allowRequest: (req, callback) => {
    // Reduced logging for better performance
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 New connection request from: ${req.headers.origin || req.connection.remoteAddress}`);
    }
    callback(null, true);
  },
  // Performance optimizations for high-traffic collaboration
  adapter: null, // Use default in-memory adapter (fastest for single instance)
  cookie: false, // Disable cookies for better performance
  serveClient: false, // Don't serve client library
  destroyUpgrade: false, // Keep connections alive during upgrades
  destroyUpgradeTimeout: 1000
});

// SERVER-MANAGED SESSION PERSISTENCE
const activeConnections = new Map(); // sessionId -> Map(participantId -> socketId)
const sessionDocuments = new Map(); // sessionId -> document content (string)  
const sessionCursorPositions = new Map(); // sessionId -> Map(participantId -> cursor position)
const socketToSession = new Map(); // socketId -> {sessionId, participantId}
const sessionLastActivity = new Map(); // sessionId -> timestamp
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

// Performance optimization: throttling and debouncing
const documentChangeTimeouts = new Map(); // sessionId_participantId -> timeoutId
const cursorUpdateTimeouts = new Map(); // sessionId_participantId -> timeoutId
const lastDocumentChange = new Map(); // sessionId_participantId -> timestamp
const lastCursorUpdate = new Map(); // sessionId_participantId -> timestamp

// Configurable thresholds for performance tuning
const DOCUMENT_CHANGE_DEBOUNCE_MS = 150; // Wait 150ms after last keystroke
const CURSOR_UPDATE_THROTTLE_MS = 100; // Max one cursor update per 100ms
const BACKEND_SAVE_DEBOUNCE_MS = 1000; // Save to backend after 1s of inactivity

console.log(`🔌 WebSocket Service starting on port ${PORT}`);
console.log(`🔗 Backend URL: ${BACKEND_URL}`);
console.log(`🌐 CORS Origins: ${CORS_ORIGINS.join(', ')}`);

// Session timeout cleanup (runs every hour)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, lastActivity] of sessionLastActivity.entries()) {
    if (now - lastActivity > SESSION_TIMEOUT) {
      console.log(`🧹 Cleaning up inactive session: ${sessionId}`);
      // Clean up session data
      activeConnections.delete(sessionId);
      sessionDocuments.delete(sessionId);
      sessionLastActivity.delete(sessionId);
    }
  }
}, SESSION_CLEANUP_INTERVAL); // Check interval configurable via env

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'websocket-service',
    activeConnections: activeConnections.size,
    activeSessions: sessionLastActivity.size,
    timestamp: new Date().toISOString()
  });
});

// API endpoint to get session statistics
app.get('/api/sessions/:sessionId/stats', (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  const connections = activeConnections.get(sessionId);
  
  res.json({
    sessionId,
    connectedParticipants: connections ? connections.size : 0,
    participants: connections ? Array.from(connections.keys()) : []
  });
});

// API endpoint to broadcast to a session (for backend integration)
app.post('/api/sessions/:sessionId/broadcast', (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  const { event, data, excludeParticipant } = req.body;
  
  try {

    
    // Handle special RBAC events
    if (event === 'participant_permission_changed') {
      handleParticipantPermissionChanged(sessionId, data);
    } else if (event === 'batch_admission_update') {
      handleBatchAdmissionUpdate(sessionId, data);
    } else {
      // Regular broadcast for other events
      broadcastToSession(sessionId, event, data, excludeParticipant);
    }
    
    res.json({ success: true, message: 'Event broadcasted successfully' });
  } catch (error) {
    console.error(`❌ Broadcast failed for session ${sessionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to broadcast admin settings changes to classroom-specific clients
app.post('/api/broadcast/admin-settings', (req, res) => {
  const { event, data, classroom_id } = req.body;
  
  try {
    if (!classroom_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'classroom_id is required for admin settings broadcast' 
      });
    }
    
    // Broadcast to classroom-specific room
    const roomName = `classroom_${classroom_id}`;
    const socketsInRoom = io.sockets.adapter.rooms.get(roomName);
    const clientCount = socketsInRoom ? socketsInRoom.size : 0;
    
    io.to(roomName).emit(event, {
      ...data,
      classroom_id: classroom_id
    });
    
    
    
    res.json({ 
      success: true, 
      message: 'Admin settings broadcasted successfully',
      classroom_id: classroom_id,
      connectedClients: clientCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Utility function to make HTTP requests to backend
async function makeBackendRequest(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      url: `${BACKEND_URL}/api${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Backend request failed: ${method} ${endpoint}`, error.message);
    throw error;
  }
}

// Check if participant has permission to perform action
async function checkParticipantPermission(sessionId, participantId, action) {
  try {
    const participants = await makeBackendRequest(`/collaboration/sessions/${sessionId}/participants`);
    const participant = participants.find(p => p.id === participantId);
    
    if (!participant) {
      return { allowed: false, reason: 'Participant not found' };
    }
    
    if (participant.status !== 'approved') {
      return { allowed: false, reason: `Participant status is ${participant.status}` };
    }
    
    if (action === 'edit' && !['owner', 'editor'].includes(participant.role)) {
      return { allowed: false, reason: `Role ${participant.role} cannot edit` };
    }
    
    if (action === 'view' && !['owner', 'editor', 'viewer'].includes(participant.role)) {
      return { allowed: false, reason: `Role ${participant.role} cannot view` };
    }
    
    return { allowed: true, participant };
  } catch (error) {
    console.error('Permission check failed:', error.message);
    return { allowed: false, reason: 'Permission check failed' };
  }
}

// Utility function to broadcast to all participants in a session
function broadcastToSession(sessionId, event, data, excludeParticipantId = null) {
  const connections = activeConnections.get(sessionId);
  if (!connections) {
    
    return 0;
  }
  
  let broadcastCount = 0;
  connections.forEach((socketId, participantId) => {
    if (excludeParticipantId && participantId === excludeParticipantId) return;
    
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
      broadcastCount++;

    } else {

    }
  });
  
  return broadcastCount;
}

// Handle participant permission changes (RBAC events)
function handleParticipantPermissionChanged(sessionId, data) {
  const { participant_id, username, role, status, action } = data;
  

  
  // If participant was kicked, disconnect them
  if (action === 'kick' || status === 'kicked') {

    
    const connections = activeConnections.get(sessionId);
    if (connections && connections.has(participant_id)) {
      const socketId = connections.get(participant_id);
      const targetSocket = io.sockets.sockets.get(socketId);
      
      if (targetSocket) {

        
        // Send kick notification before disconnecting
        targetSocket.emit('kicked_from_session', {
          message: 'You have been removed from this collaboration session',
          reason: 'Kicked by session owner'
        });
        
        // Give time for the message to be received, then disconnect
        setTimeout(() => {
          targetSocket.disconnect(true);
        }, 100);
        
        // Remove from connections immediately
        connections.delete(participant_id);
        socketToSession.delete(socketId);
      }
    }
  }
  
  // Broadcast permission change to all participants (exclude kicked participant)
  broadcastToSession(sessionId, 'participant_permission_changed', data, action === 'kick' ? participant_id : null);
}

// Handle batch admission updates
function handleBatchAdmissionUpdate(sessionId, data) {

  
  // Broadcast to all participants in the session
  broadcastToSession(sessionId, 'batch_admission_update', data);
}

// Optimized cursor update function with backend debouncing
async function performCursorUpdate(sessionId, participantId, cursor) {
  try {
    // Persist cursor position in WebSocket server memory
    if (!sessionCursorPositions.has(sessionId)) {
      sessionCursorPositions.set(sessionId, new Map());
    }
    sessionCursorPositions.get(sessionId).set(participantId, cursor);
    
    // Broadcast cursor update to other participants immediately
    broadcastToSession(sessionId, 'cursor_update', {
      participant_id: participantId,
      cursor: cursor
    }, participantId);
    
    // Update cursor position in backend (with debouncing)
    // Skip backend updates for cursor positions to reduce load
    // Cursor positions are not critical to persist and cause high DB load
    // They are maintained in WebSocket server memory and re-sent when users join
    
  } catch (error) {
    console.error('Error in performCursorUpdate:', error);
  }
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  
  // Handle joining a classroom room for admin settings
  socket.on('join_classroom', async (data) => {
    try {
      const { classroom_id, user_id } = data;
      
      if (!classroom_id || !user_id) {
        socket.emit('error', { message: 'Missing classroom_id or user_id' });
        return;
      }
      
      const roomName = `classroom_${classroom_id}`;
      socket.join(roomName);
      

      socket.emit('classroom_joined', { classroom_id, room: roomName });
      
    } catch (error) {
      console.error('Error in join_classroom:', error);
      socket.emit('error', { message: 'Failed to join classroom' });
    }
  });
  
  // Handle leaving a classroom room
  socket.on('leave_classroom', async (data) => {
    try {
      const { classroom_id, user_id } = data;
      
      if (!classroom_id || !user_id) {
        socket.emit('error', { message: 'Missing classroom_id or user_id' });
        return;
      }
      
      const roomName = `classroom_${classroom_id}`;
      socket.leave(roomName);
      

      socket.emit('classroom_left', { classroom_id, room: roomName });
      
    } catch (error) {
      console.error('Error in leave_classroom:', error);
      socket.emit('error', { message: 'Failed to leave classroom' });
    }
  });
  
  // Handle joining a collaboration session
  socket.on('join_session', async (data) => {
    try {
      const { session_id, participant_id } = data;
      
      if (!session_id || !participant_id) {
        socket.emit('error', { message: 'Missing session_id or participant_id' });
        return;
      }
      
      const sessionId = parseInt(session_id);
      const participantId = parseInt(participant_id);
      
      // Store socket mapping
      socketToSession.set(socket.id, { sessionId, participantId });
      
      // Add to active connections
      if (!activeConnections.has(sessionId)) {
        activeConnections.set(sessionId, new Map());
      }
      activeConnections.get(sessionId).set(participantId, socket.id);
      
      // Update session activity - SESSION STAYS ALIVE ACROSS USER JOINS/LEAVES
      sessionLastActivity.set(sessionId, Date.now());
      
      // Update participant status in backend
      try {
        await makeBackendRequest(`/collaboration/participants/${participantId}/status`, 'PUT', {
          is_connected: true
        });
      } catch (error) {
        console.error('Failed to update participant status:', error.message);
      }
      
      // Get current participants list from backend
      try {
        const participants = await makeBackendRequest(`/collaboration/sessions/${sessionId}/participants`);
        socket.emit('participants_list', { participants });
      } catch (error) {
        console.error('Failed to get participants:', error.message);
      }
      
      // Check if this is the first participant in the session
      const sessionConnections = activeConnections.get(sessionId);
      const isFirstParticipant = !sessionConnections || sessionConnections.size === 0;
      
      // Check participant permission to join
      const permissionCheck = await checkParticipantPermission(sessionId, participantId, 'view');
      const canJoin = permissionCheck.allowed;
      
      // Send session joined confirmation with permission status
      const joinData = { 
        session_id: sessionId, 
        participant_id: participantId,
        is_first_participant: isFirstParticipant,
        permission_status: permissionCheck.allowed ? 'approved' : 'pending',
        role: permissionCheck.participant?.role || 'editor',
        can_edit: permissionCheck.participant?.role && ['owner', 'editor'].includes(permissionCheck.participant.role),
        message: permissionCheck.allowed ? 'Joined successfully' : 'Waiting for owner approval'
      };
      
      console.log(`✅ Participant ${participantId} joined session ${sessionId} with permissions:`, {
        permission_status: joinData.permission_status,
        role: joinData.role,
        can_edit: joinData.can_edit
      });
      
      socket.emit('session_joined', joinData);

      // Send current document content to the new participant
      let currentContent = sessionDocuments.get(sessionId);
      
      // If no content in memory, try to retrieve from backend
      if (currentContent === undefined) {
        try {
          const stateResponse = await makeBackendRequest(`/collaboration/sessions/${sessionId}/state`);
          if (stateResponse && stateResponse.document_content !== undefined) {
            currentContent = stateResponse.document_content;
            // Cache it in memory for future use
            sessionDocuments.set(sessionId, currentContent);
  
          } else {
            // Initialize empty document for new session
            currentContent = '';
            sessionDocuments.set(sessionId, currentContent);
            console.log(`🆕 Initialized new session ${sessionId} with empty document`);
          }
        } catch (error) {
          console.log(`📄 No existing content found for session ${sessionId} (new session)`);
          currentContent = '';
          sessionDocuments.set(sessionId, currentContent);
        }
      }
      
      // Send current document content to the participant
      socket.emit('document_content', { 
        session_id: sessionId,
        content: currentContent
      });
      
      // Send persisted cursor positions of other participants to the new participant
      const cursorsForSession = sessionCursorPositions.get(sessionId);
      if (cursorsForSession && cursorsForSession.size > 0) {
        console.log(`📍 Sending ${cursorsForSession.size} persisted cursor positions to participant ${participantId}`);
        cursorsForSession.forEach((cursorPosition, otherParticipantId) => {
          if (otherParticipantId !== participantId) { // Don't send their own cursor
            socket.emit('cursor_update', {
              participant_id: otherParticipantId,
              cursor: cursorPosition
            });
            console.log(`📍 Sent persisted cursor for participant ${otherParticipantId}:`, cursorPosition);
          }
        });
      }
      
      // Notify other participants about new connection
      broadcastToSession(sessionId, 'participant_connected', {
        participant_id: participantId
      }, participantId);
      
      console.log(`👥 Participant ${participantId} joined session ${sessionId}`);
      
    } catch (error) {
      console.error('Error in join_session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  });
  
  // Handle document content changes with debouncing
  socket.on('document_change', async (data) => {
    try {
      const { session_id, participant_id, content } = data;
      
      if (!session_id || !participant_id || content === undefined) {
        socket.emit('error', { message: 'Missing required data for document_change' });
        return;
      }
      
      const sessionId = parseInt(session_id);
      const participantId = parseInt(participant_id);
      const participantKey = `${sessionId}_${participantId}`;
      
      // Check if participant has edit permissions (cached for performance)
      const permissionCheck = await checkParticipantPermission(sessionId, participantId, 'edit');
      if (!permissionCheck.allowed) {
        socket.emit('permission_denied', { 
          message: `Edit permission denied: ${permissionCheck.reason}`,
          action: 'document_change'
        });
        return;
      }
      
      // Store the document content immediately for local state
      sessionDocuments.set(sessionId, content);
      sessionLastActivity.set(sessionId, Date.now());
      
      // Clear existing debounce timeout
      const existingTimeout = documentChangeTimeouts.get(participantKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      
      // Debounce document broadcasting and backend saving
      const debounceTimeout = setTimeout(async () => {
        try {
          // Broadcast to other participants (debounced)
          const broadcastResult = broadcastToSession(sessionId, 'document_changed', {
            participant_id: participantId,
            content: content
          }, participantId);
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`📤 Debounced broadcast to ${broadcastResult} participants for session ${sessionId}`);
          }
          
          // Re-broadcast cursor positions (throttled)
          const cursorsForSession = sessionCursorPositions.get(sessionId);
          if (cursorsForSession && cursorsForSession.size > 0) {
            cursorsForSession.forEach((cursorPosition, participantIdWithCursor) => {
              broadcastToSession(sessionId, 'cursor_update', {
                participant_id: participantIdWithCursor,
                cursor: cursorPosition
              }, -1);
            });
          }
          
          // Save to backend with longer debouncing
          const backendTimeoutKey = `${sessionId}_backend_timeout`;
          const existingBackendTimeout = sessionDocuments.get(backendTimeoutKey);
          if (existingBackendTimeout) {
            clearTimeout(existingBackendTimeout);
          }
          
          const backendSaveTimeout = setTimeout(async () => {
            try {
              await makeBackendRequest(`/collaboration/sessions/${sessionId}/state`, 'PUT', {
                document_content: content
              });
              if (process.env.NODE_ENV === 'development') {
                console.log(`✅ Saved session ${sessionId} to backend`);
              }
            } catch (error) {
              console.error(`❌ Backend save failed for session ${sessionId}:`, error.message);
              // Single retry with exponential backoff
              setTimeout(async () => {
                try {
                  await makeBackendRequest(`/collaboration/sessions/${sessionId}/state`, 'PUT', {
                    document_content: content
                  });
                } catch (retryError) {
                  console.error(`❌ Backend save retry failed for session ${sessionId}:`, retryError.message);
                }
              }, 2000);
            }
            sessionDocuments.delete(backendTimeoutKey);
          }, BACKEND_SAVE_DEBOUNCE_MS);
          
          sessionDocuments.set(backendTimeoutKey, backendSaveTimeout);
          
        } catch (error) {
          console.error('Error in debounced document_change:', error);
        }
        
        // Clean up timeout reference
        documentChangeTimeouts.delete(participantKey);
      }, DOCUMENT_CHANGE_DEBOUNCE_MS);
      
      documentChangeTimeouts.set(participantKey, debounceTimeout);
      
    } catch (error) {
      console.error('Error in document_change:', error);
      socket.emit('error', { message: 'Failed to process document change' });
    }
  });
  

  // Handle cursor position updates with throttling
  socket.on('cursor_update', async (data) => {
    try {
      const { session_id, participant_id, cursor } = data;
      
      if (!session_id || !participant_id || !cursor) {
        socket.emit('error', { message: 'Missing required data for cursor_update' });
        return;
      }
      
      const sessionId = parseInt(session_id);
      const participantId = parseInt(participant_id);
      const participantKey = `${sessionId}_${participantId}`;
      const now = Date.now();
      
      // Throttle cursor updates to prevent spam
      const lastUpdate = lastCursorUpdate.get(participantKey) || 0;
      if (now - lastUpdate < CURSOR_UPDATE_THROTTLE_MS) {
        // Update position locally but don't broadcast yet
        if (!sessionCursorPositions.has(sessionId)) {
          sessionCursorPositions.set(sessionId, new Map());
        }
        sessionCursorPositions.get(sessionId).set(participantId, cursor);
        
        // Clear existing throttle timeout and set new one
        const existingTimeout = cursorUpdateTimeouts.get(participantKey);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        
        const throttleTimeout = setTimeout(() => {
          performCursorUpdate(sessionId, participantId, cursor);
          cursorUpdateTimeouts.delete(participantKey);
        }, CURSOR_UPDATE_THROTTLE_MS - (now - lastUpdate));
        
        cursorUpdateTimeouts.set(participantKey, throttleTimeout);
        return;
      }
      
      // Immediate update if enough time has passed
      lastCursorUpdate.set(participantKey, now);
      performCursorUpdate(sessionId, participantId, cursor);
      
    } catch (error) {
      console.error('Error in cursor_update:', error);
      socket.emit('error', { message: 'Failed to update cursor position' });
    }
  });

  // Handle code execution results sharing
  socket.on('code_execution_result', async (data) => {
    try {
      const { session_id, participant_id, execution_result } = data;
      
      if (!session_id || !participant_id || !execution_result) {
        socket.emit('error', { message: 'Missing required data for code_execution_result' });
        return;
      }
      
      const sessionId = parseInt(session_id);
      const participantId = parseInt(participant_id);
      
      // Get participant info for the broadcaster
      try {
        const participants = await makeBackendRequest(`/collaboration/sessions/${sessionId}/participants`);
        const executingParticipant = participants.find(p => p.id === participantId);
        
        // Broadcast execution result to all participants in the session
        broadcastToSession(sessionId, 'code_execution_result', {
          participant_id: participantId,
          participant_username: executingParticipant?.username || 'Unknown',
          execution_result: execution_result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Failed to get participant info for execution broadcast:', error.message);
        // Still broadcast without participant username
        broadcastToSession(sessionId, 'code_execution_result', {
          participant_id: participantId,
          participant_username: 'Unknown',
          execution_result: execution_result,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('Error in code_execution_result:', error);
      socket.emit('error', { message: 'Failed to broadcast execution result' });
    }
  });
  
  // Handle leaving a session
  socket.on('leave_session', async (data) => {
    try {
      const { session_id, participant_id } = data;
      
      if (session_id && participant_id) {
        await handleDisconnection(socket.id, parseInt(session_id), parseInt(participant_id));
      }
      
    } catch (error) {
      console.error('Error in leave_session:', error);
    }
  });
  

  
  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    const sessionInfo = socketToSession.get(socket.id);
    if (sessionInfo) {
      await handleDisconnection(socket.id, sessionInfo.sessionId, sessionInfo.participantId);
    }
  });
});

// Helper function to handle disconnections
async function handleDisconnection(socketId, sessionId, participantId) {
  try {
    // Remove from active connections
    const connections = activeConnections.get(sessionId);
    if (connections) {
      connections.delete(participantId);
      if (connections.size === 0) {
        activeConnections.delete(sessionId);
      }
    }
    
    // Remove socket mapping
    socketToSession.delete(socketId);
    
    // Update participant status in backend
    try {
      await makeBackendRequest(`/collaboration/participants/${participantId}/status`, 'PUT', {
        is_connected: false
      });
    } catch (error) {
      console.error('Failed to update participant status on disconnect:', error.message);
    }
    
    // Notify other participants
    broadcastToSession(sessionId, 'participant_disconnected', {
      participant_id: participantId
    });
    
    console.log(`👋 Participant ${participantId} left session ${sessionId}`);
    
  } catch (error) {
    console.error('Error handling disconnection:', error);
  }
}

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WebSocket Service running on port ${PORT}`);
  console.log(`📊 Health check endpoint: /health`);
  console.log(`🔗 Backend URL: ${BACKEND_URL}`);
  console.log(`🌐 CORS Origins: ${CORS_ORIGINS.join(', ')}`);
  console.log(`⚙️  Environment: ${NODE_ENV}`);
  console.log(`🏓 Socket.IO Ping: ${SOCKET_PING_INTERVAL}ms / Timeout: ${SOCKET_PING_TIMEOUT}ms`);
  console.log(`🧹 Session cleanup interval: ${SESSION_CLEANUP_INTERVAL}ms`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ WebSocket Service stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ WebSocket Service stopped');
    process.exit(0);
  });
});
