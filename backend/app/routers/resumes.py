"""
Resume Router - API endpoints for saving and loading resumes
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.resume_service import ResumeService


router = APIRouter(prefix="/resumes", tags=["resumes"])


# --- Pydantic Models ---

class ResumeSave(BaseModel):
    title: Optional[str] = "Untitled Resume"
    resume_data: Dict[str, Any]
    section_order: Optional[List[str]] = None
    section_titles: Optional[Dict[str, str]] = None
    font_family: Optional[str] = None
    font_size: Optional[float] = 10
    margin: Optional[float] = 0.5


class ResumeResponse(BaseModel):
    id: int
    title: Optional[str]
    resume_data: Dict[str, Any]
    section_order: Optional[List[str]]
    section_titles: Optional[Dict[str, str]]
    font_family: Optional[str]
    font_size: Optional[float]
    margin: Optional[float]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Routes ---

@router.post("/", response_model=ResumeResponse)
async def save_resume(
    data: ResumeSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a new resume"""
    resume = ResumeService.save_resume(db, current_user.id, data.model_dump())
    return resume


@router.get("/", response_model=List[ResumeResponse])
async def list_resumes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all resumes for the current user"""
    return ResumeService.get_resumes(db, current_user.id)


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific resume"""
    return ResumeService.get_resume(db, current_user.id, resume_id)


@router.put("/{resume_id}", response_model=ResumeResponse)
async def update_resume(
    resume_id: int,
    data: ResumeSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing resume"""
    return ResumeService.update_resume(db, current_user.id, resume_id, data.model_dump())


@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a resume"""
    ResumeService.delete_resume(db, current_user.id, resume_id)
    return {"message": "Resume deleted successfully"}
