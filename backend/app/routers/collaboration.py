from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from typing import Optional, List, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.core.config import settings
from app.database.base import get_db
from app.routers.auth import get_current_user, get_current_user_optional
from app.models.user import User
from app.models.collaboration import CollaborationSession, CollaborationParticipant
import random

router = APIRouter()

class CreateSessionRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    language: str = "python"
    is_public: bool = False
    max_collaborators: int = 10
    initial_code: Optional[str] = ""

class SessionResponse(BaseModel):
    id: int
    share_id: str
    title: Optional[str]
    description: Optional[str]
    language: str
    is_active: bool
    is_public: bool
    max_collaborators: int
    code_content: Optional[str]
    owner_username: str
    participant_count: int
    created_at: str
    updated_at: Optional[str]

class JoinSessionRequest(BaseModel):
    username: str

class ParticipantResponse(BaseModel):
    id: int
    username: str
    is_connected: bool
    cursor_color: Optional[str]
    is_owner: bool
    joined_at: str

class SessionDetailsResponse(BaseModel):
    session: SessionResponse
    participants: List[ParticipantResponse]
    is_participant: bool
    user_participant_id: Optional[int]

class UpdateParticipantStatusRequest(BaseModel):
    is_connected: bool

class UpdateCursorRequest(BaseModel):
    cursor_position: Optional[Any] = None

class UpdateSessionStateRequest(BaseModel):
    yjs_state: Optional[str] = None
    document_content: Optional[str] = None

# Generate random cursor colors
CURSOR_COLORS = [
    "#FF5722", "#2196F3", "#4CAF50", "#FF9800", "#9C27B0", 
    "#F44336", "#00BCD4", "#8BC34A", "#FFC107", "#3F51B5",
    "#E91E63", "#009688", "#CDDC39", "#FF6F00", "#7B1FA2"
]

def get_random_cursor_color():
    return random.choice(CURSOR_COLORS)

@router.post("/collaboration/sessions", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new collaboration session"""
    
    # Validate language support
    if request.language not in settings.supported_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{request.language}' is not supported"
        )
    
    # Generate unique share ID
    share_id = CollaborationSession.generate_share_id()
    while db.query(CollaborationSession).filter(
        CollaborationSession.share_id == share_id
    ).first():
        share_id = CollaborationSession.generate_share_id()
    
    # Create session
    session = CollaborationSession(
        share_id=share_id,
        title=request.title or f"{current_user.username}'s {request.language} session",
        description=request.description,
        owner_id=current_user.id,
        language=request.language,
        is_public=request.is_public,
        max_collaborators=request.max_collaborators,
        code_content=request.initial_code or ""
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    # Add owner as first participant
    owner_participant = CollaborationParticipant(
        session_id=session.id,
        user_id=current_user.id,
        username=current_user.username,
        cursor_color=get_random_cursor_color(),
        is_connected=False
    )
    
    db.add(owner_participant)
    db.commit()
    
    return SessionResponse(
        id=session.id,
        share_id=session.share_id,
        title=session.title,
        description=session.description,
        language=session.language,
        is_active=session.is_active,
        is_public=session.is_public,
        max_collaborators=session.max_collaborators,
        code_content=session.code_content,
        owner_username=current_user.username,
        participant_count=1,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat() if session.updated_at else None
    )

@router.get("/collaboration/sessions/{share_id}", response_model=SessionDetailsResponse)
async def get_session(
    share_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get session details"""
    
    session = db.query(CollaborationSession).filter(
        CollaborationSession.share_id == share_id,
        CollaborationSession.is_active == True
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get participants
    participants = db.query(CollaborationParticipant).filter(
        CollaborationParticipant.session_id == session.id
    ).all()
    
    participant_responses = []
    is_participant = False
    user_participant_id = None
    
    for participant in participants:
        is_owner = participant.user_id == session.owner_id
        
        # Check if this is the current user (either authenticated or anonymous)
        if current_user and participant.user_id == current_user.id:
            is_participant = True
            user_participant_id = participant.id
        elif not current_user and not participant.user_id:
            # For anonymous users, we'll consider the most recent anonymous participant
            # as the current user (this is a simple approach for demo purposes)
            if not is_participant:  # Only set the first anonymous participant found
                is_participant = True
                user_participant_id = participant.id
        
        participant_responses.append(ParticipantResponse(
            id=participant.id,
            username=participant.username,
            is_connected=participant.is_connected,
            cursor_color=participant.cursor_color,
            is_owner=is_owner,
            joined_at=participant.joined_at.isoformat()
        ))
    
    session_response = SessionResponse(
        id=session.id,
        share_id=session.share_id,
        title=session.title,
        description=session.description,
        language=session.language,
        is_active=session.is_active,
        is_public=session.is_public,
        max_collaborators=session.max_collaborators,
        code_content=session.code_content,
        owner_username=session.owner.username,
        participant_count=len(participants),
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat() if session.updated_at else None
    )
    
    return SessionDetailsResponse(
        session=session_response,
        participants=participant_responses,
        is_participant=is_participant,
        user_participant_id=user_participant_id
    )

@router.post("/collaboration/sessions/{share_id}/join")
async def join_session(
    share_id: str,
    request: JoinSessionRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Join a collaboration session"""
    
    session = db.query(CollaborationSession).filter(
        CollaborationSession.share_id == share_id,
        CollaborationSession.is_active == True
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if session is full
    participant_count = db.query(CollaborationParticipant).filter(
        CollaborationParticipant.session_id == session.id
    ).count()
    
    if participant_count >= session.max_collaborators:
        raise HTTPException(status_code=400, detail="Session is full")
    
    # Check if user is already a participant
    existing_participant = None
    if current_user:
        existing_participant = db.query(CollaborationParticipant).filter(
            CollaborationParticipant.session_id == session.id,
            CollaborationParticipant.user_id == current_user.id
        ).first()
    else:
        # For anonymous users, check by username in this session
        existing_participant = db.query(CollaborationParticipant).filter(
            CollaborationParticipant.session_id == session.id,
            CollaborationParticipant.username == request.username,
            CollaborationParticipant.user_id.is_(None)
        ).first()
    
    if existing_participant:
        # Update existing participant
        existing_participant.username = request.username
        existing_participant.is_connected = False  # Will be set to True by WebSocket
        db.commit()
        participant_id = existing_participant.id
    else:
        # Create new participant
        participant = CollaborationParticipant(
            session_id=session.id,
            user_id=current_user.id if current_user else None,
            username=request.username,
            cursor_color=get_random_cursor_color(),
            is_connected=False
        )
        
        db.add(participant)
        db.commit()
        db.refresh(participant)
        participant_id = participant.id
    
    return {
        "participant_id": participant_id, 
        "message": "Successfully joined session",
        "session_id": session.id,
        "username": request.username
    }

@router.get("/collaboration/sessions", response_model=List[SessionResponse])
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    public_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """List collaboration sessions"""
    
    query = db.query(CollaborationSession).filter(
        CollaborationSession.is_active == True
    )
    
    if public_only:
        query = query.filter(CollaborationSession.is_public == True)
    elif current_user:
        # Show user's own sessions and public sessions
        query = query.filter(
            (CollaborationSession.owner_id == current_user.id) |
            (CollaborationSession.is_public == True)
        )
    else:
        # Anonymous users can only see public sessions
        query = query.filter(CollaborationSession.is_public == True)
    
    # Calculate offset and get sessions
    offset = (page - 1) * page_size
    sessions = query.order_by(desc(CollaborationSession.created_at)).offset(offset).limit(page_size).all()
    
    session_responses = []
    for session in sessions:
        participant_count = db.query(CollaborationParticipant).filter(
            CollaborationParticipant.session_id == session.id
        ).count()
        
        session_responses.append(SessionResponse(
            id=session.id,
            share_id=session.share_id,
            title=session.title,
            description=session.description,
            language=session.language,
            is_active=session.is_active,
            is_public=session.is_public,
            max_collaborators=session.max_collaborators,
            code_content="",  # Don't include code content in list view
            owner_username=session.owner.username,
            participant_count=participant_count,
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat() if session.updated_at else None
        ))
    
    return session_responses

@router.delete("/collaboration/sessions/{share_id}")
async def delete_session(
    share_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a collaboration session (owner only)"""
    
    session = db.query(CollaborationSession).filter(
        CollaborationSession.share_id == share_id,
        CollaborationSession.owner_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or you don't have permission")
    
    session.is_active = False
    db.commit()
    
    return {"message": "Session deactivated successfully"}

# API endpoints for WebSocket service integration

@router.put("/collaboration/participants/{participant_id}/status")
async def update_participant_status(
    participant_id: int,
    request: UpdateParticipantStatusRequest,
    db: Session = Depends(get_db)
):
    """Update participant connection status (called by WebSocket service)"""
    
    participant = db.query(CollaborationParticipant).filter(
        CollaborationParticipant.id == participant_id
    ).first()
    
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    participant.is_connected = request.is_connected
    if not request.is_connected:
        participant.last_seen = func.now()
    
    db.commit()
    
    return {"success": True, "participant_id": participant_id, "is_connected": request.is_connected}

@router.put("/collaboration/participants/{participant_id}/cursor")
async def update_participant_cursor(
    participant_id: int,
    request: UpdateCursorRequest,
    db: Session = Depends(get_db)
):
    """Update participant cursor position (called by WebSocket service)"""
    
    participant = db.query(CollaborationParticipant).filter(
        CollaborationParticipant.id == participant_id
    ).first()
    
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    participant.cursor_position = request.cursor_position
    db.commit()
    
    return {"success": True, "participant_id": participant_id}

@router.get("/collaboration/sessions/{session_id}/participants", response_model=List[ParticipantResponse])
async def get_session_participants(
    session_id: int,
    db: Session = Depends(get_db)
):
    """Get all participants for a session (called by WebSocket service)"""
    
    session = db.query(CollaborationSession).filter(
        CollaborationSession.id == session_id,
        CollaborationSession.is_active == True
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    participants = db.query(CollaborationParticipant).filter(
        CollaborationParticipant.session_id == session_id
    ).all()
    
    participant_responses = []
    for participant in participants:
        is_owner = participant.user_id == session.owner_id
        
        participant_responses.append(ParticipantResponse(
            id=participant.id,
            username=participant.username,
            is_connected=participant.is_connected,
            cursor_color=participant.cursor_color,
            is_owner=is_owner,
            joined_at=participant.joined_at.isoformat()
        ))
    
    return participant_responses

@router.put("/collaboration/sessions/{session_id}/state")
async def update_session_state(
    session_id: int,
    request: UpdateSessionStateRequest,
    db: Session = Depends(get_db)
):
    """Update session state and document content (called by WebSocket service)"""
    
    session = db.query(CollaborationSession).filter(
        CollaborationSession.id == session_id,
        CollaborationSession.is_active == True
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Update Y.js state if provided (legacy support)
    if request.yjs_state:
        session.yjs_state = request.yjs_state
    
    # Update document content if provided (new simple sync model)
    if request.document_content is not None:
        session.code_content = request.document_content
    
    session.updated_at = func.now()
    session.last_accessed = func.now()
    db.commit()
    
    return {"success": True, "session_id": session_id, "document_saved": request.document_content is not None}

@router.get("/collaboration/sessions/{session_id}/state")
async def get_session_state(
    session_id: int,
    db: Session = Depends(get_db)
):
    """Get session state and document content (called by WebSocket service)"""
    
    session = db.query(CollaborationSession).filter(
        CollaborationSession.id == session_id,
        CollaborationSession.is_active == True
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session_id,
        "document_content": session.code_content or "",
        "yjs_state": session.yjs_state,
        "last_updated": session.updated_at.isoformat() if session.updated_at else None
    }
