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

// Configure Socket.IO with CORS and enhanced stability
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
  // Enhanced connection management
  connectTimeout: 60000, // 1 minute connection timeout
  perMessageDeflate: false, // Disable compression for stability
  httpCompression: false,
  maxHttpBufferSize: 1e6, // 1MB max buffer
  allowRequest: (req, callback) => {
    // Allow all connections but log them
    console.log(`🔗 New connection request from: ${req.headers.origin || req.connection.remoteAddress}`);
    callback(null, true);
  }
});

// SERVER-MANAGED SESSION PERSISTENCE
const activeConnections = new Map(); // sessionId -> Map(participantId -> socketId)
const sessionDocuments = new Map(); // sessionId -> document content (string)  
const sessionCursorPositions = new Map(); // sessionId -> Map(participantId -> cursor position)
const socketToSession = new Map(); // socketId -> {sessionId, participantId}
const sessionLastActivity = new Map(); // sessionId -> timestamp
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

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
  
  // Handle document content changes
  socket.on('document_change', async (data) => {
    try {
      const { session_id, participant_id, content } = data;
      
      console.log('📝 Received document_change:', {
        sessionId: session_id,
        participantId: participant_id,
        contentLength: content?.length || 0,
        socketId: socket.id
      });
      
      if (!session_id || !participant_id || content === undefined) {
        console.log('❌ Missing required data for document_change');
        socket.emit('error', { message: 'Missing required data for document_change' });
        return;
      }
      
      const sessionId = parseInt(session_id);
      const participantId = parseInt(participant_id);
      
      // Check if participant has edit permissions
      const permissionCheck = await checkParticipantPermission(sessionId, participantId, 'edit');
      if (!permissionCheck.allowed) {
        console.log(`❌ Permission denied for participant ${participantId}: ${permissionCheck.reason}`);
        socket.emit('permission_denied', { 
          message: `Edit permission denied: ${permissionCheck.reason}`,
          action: 'document_change'
        });
        return;
      }
      
      // Update session last activity
      sessionLastActivity.set(sessionId, Date.now());
      
      // Store the document content
      sessionDocuments.set(sessionId, content);
      console.log('💾 Stored document for session:', sessionId);
      
      // Broadcast to other participants in the session
      const broadcastResult = broadcastToSession(sessionId, 'document_changed', {
        participant_id: participantId,
        content: content
      }, participantId);
      
      console.log('📤 Broadcasted document_changed to:', broadcastResult, 'participants');
      
      // After document change, re-broadcast all cursor positions to keep them synchronized
      // This ensures cursors are properly displayed after content changes
      const cursorsForSession = sessionCursorPositions.get(sessionId);
      if (cursorsForSession && cursorsForSession.size > 0) {
        console.log(`📍 Re-broadcasting ${cursorsForSession.size} cursor positions after document change`);
        cursorsForSession.forEach((cursorPosition, participantIdWithCursor) => {
          broadcastToSession(sessionId, 'cursor_update', {
            participant_id: participantIdWithCursor,
            cursor: cursorPosition
          }, -1); // Send to everyone (including the cursor owner for consistency)
        });
      }
      
      // Periodically save content to backend (debounced)
      const timeoutKey = `${sessionId}_timeout`;
      const existingTimeout = sessionDocuments.get(timeoutKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      
      const saveTimeout = setTimeout(async () => {
        try {
          console.log(`💾 Attempting to save session ${sessionId} content to backend...`);
          const response = await makeBackendRequest(`/collaboration/sessions/${sessionId}/state`, 'PUT', {
            document_content: content
          });
          console.log(`✅ Successfully saved session ${sessionId} content to backend:`, response);
        } catch (error) {
          console.error(`❌ Failed to save session ${sessionId} content:`, error.message);
          // Retry once after a short delay
          setTimeout(async () => {
            try {
              console.log(`🔄 Retrying save for session ${sessionId}...`);
              await makeBackendRequest(`/collaboration/sessions/${sessionId}/state`, 'PUT', {
                document_content: content
              });
              console.log(`✅ Retry successful for session ${sessionId}`);
            } catch (retryError) {
              console.error(`❌ Retry failed for session ${sessionId}:`, retryError.message);
            }
          }, 1000);
        }
        // Clean up the timeout reference
        sessionDocuments.delete(timeoutKey);
      }, 500); // Save after 500ms of inactivity (faster saves)
      
      sessionDocuments.set(timeoutKey, saveTimeout);
      
    } catch (error) {
      console.error('Error in document_change:', error);
      socket.emit('error', { message: 'Failed to process document change' });
    }
  });
  

  // Handle cursor position updates
  socket.on('cursor_update', async (data) => {
    try {
      const { session_id, participant_id, cursor } = data;
      
      if (!session_id || !participant_id) {
        socket.emit('error', { message: 'Missing required data for cursor_update' });
        return;
      }
      
      const sessionId = parseInt(session_id);
      const participantId = parseInt(participant_id);
      
      // Persist cursor position in WebSocket server memory
      if (!sessionCursorPositions.has(sessionId)) {
        sessionCursorPositions.set(sessionId, new Map());
      }
      sessionCursorPositions.get(sessionId).set(participantId, cursor);
      console.log(`💾 Persisted cursor position for participant ${participantId} in session ${sessionId}:`, cursor);
      
      // Update cursor position in backend
      try {
        await makeBackendRequest(`/collaboration/participants/${participantId}/cursor`, 'PUT', {
          cursor_position: cursor
        });
      } catch (error) {
        console.error('Failed to update cursor position:', error.message);
      }
      
      // Broadcast cursor update to other participants
      broadcastToSession(sessionId, 'cursor_update', {
        participant_id: participantId,
        cursor: cursor
      }, participantId);
      
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
