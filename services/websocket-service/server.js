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

// Configure Socket.IO with CORS and production optimizations
const io = socketIo(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: SOCKET_PING_TIMEOUT,
  pingInterval: SOCKET_PING_INTERVAL,
  allowEIO3: true
});

// SERVER-MANAGED SESSION PERSISTENCE
const activeConnections = new Map(); // sessionId -> Map(participantId -> socketId)
const sessionStates = new Map(); // sessionId -> Y.js state data  
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
      sessionStates.delete(sessionId);
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
    broadcastToSession(sessionId, event, data, excludeParticipant);
    res.json({ success: true, message: 'Event broadcasted successfully' });
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

// Utility function to broadcast to all participants in a session
function broadcastToSession(sessionId, event, data, excludeParticipantId = null) {
  const connections = activeConnections.get(sessionId);
  if (!connections) return;
  
  connections.forEach((socketId, participantId) => {
    if (excludeParticipantId && participantId === excludeParticipantId) return;
    
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  });
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
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
      
      // Send session joined confirmation with current document state
      let currentState = sessionStates.get(sessionId);
      
      // If no state in memory, try to retrieve from backend
      if (!currentState) {
        try {
          const stateResponse = await makeBackendRequest(`/collaboration/sessions/${sessionId}/state`);
          if (stateResponse && stateResponse.yjs_state) {
            currentState = stateResponse.yjs_state;
            // Cache it in memory for future use
            sessionStates.set(sessionId, currentState);
            console.log(`📄 Retrieved session ${sessionId} state from backend`);
          }
        } catch (error) {
          console.log(`📄 No existing state found for session ${sessionId} (new session or state unavailable)`);
        }
      }
      
      // Check if this is the first participant in the session
      const sessionConnections = activeConnections.get(sessionId);
      const isFirstParticipant = !sessionConnections || sessionConnections.size === 0;
      
      socket.emit('session_joined', { 
        session_id: sessionId, 
        participant_id: participantId,
        yjs_state: currentState || null,
        is_first_participant: isFirstParticipant
      });
      
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
  
  // Handle Y.js document updates for collaborative editing
  socket.on('yjs_update', async (data) => {
    try {
      const { session_id, participant_id, yjs_update } = data;
      
      if (!session_id || !participant_id || !yjs_update) {
        socket.emit('error', { message: 'Missing required data for yjs_update' });
        return;
      }
      
      const sessionId = parseInt(session_id);
      const participantId = parseInt(participant_id);
      
      // Store the Y.js update state
      sessionStates.set(sessionId, yjs_update);
      
      // Broadcast to other participants in the session
      broadcastToSession(sessionId, 'yjs_update', {
        participant_id: participantId,
        yjs_update: yjs_update
      }, participantId);
      
      // Periodically save state to backend (debounced)
      clearTimeout(sessionStates.get(`${sessionId}_timeout`));
      sessionStates.set(`${sessionId}_timeout`, setTimeout(async () => {
        try {
          await makeBackendRequest(`/collaboration/sessions/${sessionId}/state`, 'PUT', {
            yjs_state: yjs_update
          });
        } catch (error) {
          console.error('Failed to save session state:', error.message);
        }
      }, 1000)); // Save after 1 second of inactivity
      
    } catch (error) {
      console.error('Error in yjs_update:', error);
      socket.emit('error', { message: 'Failed to process document update' });
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
