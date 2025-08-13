import socketio
import json
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.database.base import get_db
from app.models.collaboration import CollaborationSession, CollaborationParticipant
from app.models.user import User
from app.core.config import settings

# Create Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins=settings.allowed_origins,
    logger=True,
    engineio_logger=True
)

# Store active connections
# Format: {session_id: {participant_id: sid}}
active_connections: Dict[int, Dict[int, str]] = {}

# Store session states for Y.js synchronization
# Format: {session_id: yjs_state}
session_states: Dict[int, bytes] = {}

class CollaborationManager:
    def __init__(self):
        self.db_session = None
    
    def get_db(self):
        """Get database session"""
        return next(get_db())
    
    async def add_connection(self, session_id: int, participant_id: int, sid: str):
        """Add a connection to the active connections"""
        if session_id not in active_connections:
            active_connections[session_id] = {}
        active_connections[session_id][participant_id] = sid
        
        # Update participant status in database
        db = self.get_db()
        try:
            participant = db.query(CollaborationParticipant).filter(
                CollaborationParticipant.id == participant_id
            ).first()
            if participant:
                participant.is_connected = True
                db.commit()
                
                # Notify other participants
                await self.broadcast_participant_update(session_id, participant_id, exclude_sid=sid)
        finally:
            db.close()
    
    async def remove_connection(self, session_id: int, participant_id: int):
        """Remove a connection from active connections"""
        if session_id in active_connections and participant_id in active_connections[session_id]:
            del active_connections[session_id][participant_id]
            
            if not active_connections[session_id]:
                del active_connections[session_id]
        
        # Update participant status in database
        db = self.get_db()
        try:
            participant = db.query(CollaborationParticipant).filter(
                CollaborationParticipant.id == participant_id
            ).first()
            if participant:
                participant.is_connected = False
                db.commit()
                
                # Notify other participants
                await self.broadcast_participant_update(session_id, participant_id)
        finally:
            db.close()
    
    async def broadcast_to_session(self, session_id: int, event: str, data: dict, exclude_sid: Optional[str] = None):
        """Broadcast event to all participants in a session"""
        if session_id in active_connections:
            for participant_id, sid in active_connections[session_id].items():
                if exclude_sid and sid == exclude_sid:
                    continue
                await sio.emit(event, data, room=sid)
    
    async def broadcast_participant_update(self, session_id: int, participant_id: int, exclude_sid: Optional[str] = None):
        """Broadcast participant status update"""
        db = self.get_db()
        try:
            participant = db.query(CollaborationParticipant).filter(
                CollaborationParticipant.id == participant_id
            ).first()
            
            if participant:
                session = db.query(CollaborationSession).filter(
                    CollaborationSession.id == session_id
                ).first()
                
                if session:
                    data = {
                        "participant_id": participant_id,
                        "username": participant.username,
                        "is_connected": participant.is_connected,
                        "cursor_color": participant.cursor_color,
                        "is_owner": participant.user_id == session.owner_id
                    }
                    await self.broadcast_to_session(session_id, "participant_update", data, exclude_sid)
        finally:
            db.close()
    
    async def handle_code_change(self, session_id: int, participant_id: int, yjs_update: str):
        """Handle Y.js document update for code changes"""
        # Store the Y.js update
        if session_id not in session_states:
            session_states[session_id] = b""
        
        # Broadcast the Y.js update to other participants
        data = {
            "participant_id": participant_id,
            "yjs_update": yjs_update
        }
        
        # Get the sender's SID to exclude them from broadcast
        sender_sid = None
        if session_id in active_connections and participant_id in active_connections[session_id]:
            sender_sid = active_connections[session_id][participant_id]
        
        await self.broadcast_to_session(session_id, "yjs_update", data, exclude_sid=sender_sid)
        
        # Save the current state to database periodically (every 10 updates)
        # This is a simple approach - in production, you might want more sophisticated state management
        await self.save_session_state(session_id)
    
    async def handle_cursor_change(self, session_id: int, participant_id: int, cursor_data: dict):
        """Handle cursor position changes"""
        # Update cursor position in database
        db = self.get_db()
        try:
            participant = db.query(CollaborationParticipant).filter(
                CollaborationParticipant.id == participant_id
            ).first()
            if participant:
                participant.cursor_position = cursor_data
                db.commit()
        finally:
            db.close()
        
        # Broadcast cursor update to other participants
        data = {
            "participant_id": participant_id,
            "cursor": cursor_data
        }
        
        # Get the sender's SID to exclude them from broadcast
        sender_sid = None
        if session_id in active_connections and participant_id in active_connections[session_id]:
            sender_sid = active_connections[session_id][participant_id]
        
        await self.broadcast_to_session(session_id, "cursor_update", data, exclude_sid=sender_sid)
    
    async def save_session_state(self, session_id: int):
        """Save Y.js state to database"""
        if session_id in session_states:
            db = self.get_db()
            try:
                session = db.query(CollaborationSession).filter(
                    CollaborationSession.id == session_id
                ).first()
                if session:
                    # Convert bytes to string for storage
                    session.yjs_state = session_states[session_id].hex() if session_states[session_id] else None
                    db.commit()
            finally:
                db.close()
    
    async def get_session_participants(self, session_id: int) -> List[dict]:
        """Get all participants for a session"""
        db = self.get_db()
        try:
            session = db.query(CollaborationSession).filter(
                CollaborationSession.id == session_id
            ).first()
            
            if not session:
                return []
            
            participants = db.query(CollaborationParticipant).filter(
                CollaborationParticipant.session_id == session_id
            ).all()
            
            result = []
            for participant in participants:
                result.append({
                    "participant_id": participant.id,
                    "username": participant.username,
                    "is_connected": participant.is_connected,
                    "cursor_color": participant.cursor_color,
                    "cursor_position": participant.cursor_position,
                    "is_owner": participant.user_id == session.owner_id
                })
            
            return result
        finally:
            db.close()

# Create manager instance
collaboration_manager = CollaborationManager()

@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    print(f"Client {sid} connected")

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    print(f"Client {sid} disconnected")
    
    # Find and remove the connection
    for session_id, participants in list(active_connections.items()):
        for participant_id, connection_sid in list(participants.items()):
            if connection_sid == sid:
                await collaboration_manager.remove_connection(session_id, participant_id)
                break

@sio.event
async def join_session(sid, data):
    """Handle joining a collaboration session"""
    try:
        session_id = data.get("session_id")
        participant_id = data.get("participant_id")
        
        if not session_id or not participant_id:
            await sio.emit("error", {"message": "Missing session_id or participant_id"}, room=sid)
            return
        
        # Add connection
        await collaboration_manager.add_connection(session_id, participant_id, sid)
        
        # Send current participants list
        participants = await collaboration_manager.get_session_participants(session_id)
        await sio.emit("participants_list", {"participants": participants}, room=sid)
        
        # Send session joined confirmation
        await sio.emit("session_joined", {
            "session_id": session_id,
            "participant_id": participant_id
        }, room=sid)
        
    except Exception as e:
        await sio.emit("error", {"message": str(e)}, room=sid)

@sio.event
async def yjs_update(sid, data):
    """Handle Y.js document updates"""
    try:
        session_id = data.get("session_id")
        participant_id = data.get("participant_id")
        yjs_update = data.get("yjs_update")
        
        if not all([session_id, participant_id, yjs_update]):
            await sio.emit("error", {"message": "Missing required data"}, room=sid)
            return
        
        await collaboration_manager.handle_code_change(session_id, participant_id, yjs_update)
        
    except Exception as e:
        await sio.emit("error", {"message": str(e)}, room=sid)

@sio.event
async def cursor_update(sid, data):
    """Handle cursor position updates"""
    try:
        session_id = data.get("session_id")
        participant_id = data.get("participant_id")
        cursor_data = data.get("cursor")
        
        if not all([session_id, participant_id]):
            await sio.emit("error", {"message": "Missing required data"}, room=sid)
            return
        
        await collaboration_manager.handle_cursor_change(session_id, participant_id, cursor_data)
        
    except Exception as e:
        await sio.emit("error", {"message": str(e)}, room=sid)

@sio.event
async def leave_session(sid, data):
    """Handle leaving a collaboration session"""
    try:
        session_id = data.get("session_id")
        participant_id = data.get("participant_id")
        
        if not session_id or not participant_id:
            return
        
        await collaboration_manager.remove_connection(session_id, participant_id)
        
    except Exception as e:
        print(f"Error leaving session: {e}")

# Export the Socket.IO app
app = socketio.ASGIApp(sio)
