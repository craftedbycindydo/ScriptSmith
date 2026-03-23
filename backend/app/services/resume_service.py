"""
Resume Service - Business logic for saving and loading user resumes
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException, status
from app.models.resume import Resume


class ResumeService:
    """Service for managing user resumes"""

    @staticmethod
    def save_resume(db: Session, user_id: int, data: dict) -> Resume:
        """Create a new resume for a user"""
        resume = Resume(
            user_id=user_id,
            title=data.get("title", "Untitled Resume"),
            resume_data=data["resume_data"],
            section_order=data.get("section_order"),
            section_titles=data.get("section_titles"),
            font_family=data.get("font_family"),
            font_size=data.get("font_size", 10),
            margin=data.get("margin", 0.5),
        )
        db.add(resume)
        db.commit()
        db.refresh(resume)
        return resume

    @staticmethod
    def update_resume(db: Session, user_id: int, resume_id: int, data: dict) -> Resume:
        """Update an existing resume owned by the user"""
        resume = db.query(Resume).filter(
            Resume.id == resume_id,
            Resume.user_id == user_id,
        ).first()

        if not resume:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resume not found",
            )

        if "title" in data:
            resume.title = data["title"]
        if "resume_data" in data:
            resume.resume_data = data["resume_data"]
        if "section_order" in data:
            resume.section_order = data["section_order"]
        if "section_titles" in data:
            resume.section_titles = data["section_titles"]
        if "font_family" in data:
            resume.font_family = data["font_family"]
        if "font_size" in data:
            resume.font_size = data["font_size"]
        if "margin" in data:
            resume.margin = data["margin"]

        db.commit()
        db.refresh(resume)
        return resume

    @staticmethod
    def get_resumes(db: Session, user_id: int) -> List[Resume]:
        """Get all resumes for a user, most recent first"""
        return (
            db.query(Resume)
            .filter(Resume.user_id == user_id)
            .order_by(desc(Resume.updated_at))
            .all()
        )

    @staticmethod
    def get_resume(db: Session, user_id: int, resume_id: int) -> Optional[Resume]:
        """Get a specific resume owned by the user"""
        resume = db.query(Resume).filter(
            Resume.id == resume_id,
            Resume.user_id == user_id,
        ).first()

        if not resume:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resume not found",
            )
        return resume

    @staticmethod
    def delete_resume(db: Session, user_id: int, resume_id: int) -> bool:
        """Delete a resume owned by the user"""
        resume = db.query(Resume).filter(
            Resume.id == resume_id,
            Resume.user_id == user_id,
        ).first()

        if not resume:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resume not found",
            )

        db.delete(resume)
        db.commit()
        return True
