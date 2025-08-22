"""
Classroom Service - Handles classroom-based multi-tenancy

This service manages:
- Classroom creation and management
- User classroom membership
- Classroom key validation
- Data scoping and access control
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from fastapi import HTTPException, status
from app.models.classroom import Classroom, UserClassroom
from app.models.user import User, UserRole
from app.models.admin_settings import AdminSettings


class ClassroomService:
    """Service for managing classroom operations and multi-tenancy"""
    
    @staticmethod
    def create_classroom(
        db: Session,
        name: str,
        description: Optional[str],
        created_by: User,
        classroom_key: Optional[str] = None
    ) -> Classroom:
        """Create a new classroom"""
        
        # Verify admin permissions using the same logic as AdminService
        # This includes both role-based admin AND environment-based admin emails
        from app.services.admin_service import AdminService
        from app.core.config import settings
        admin_service = AdminService(settings)
        
        if not admin_service.has_admin_access(created_by):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can create classrooms"
            )
        
        # Generate unique classroom key if not provided
        if not classroom_key:
            classroom_key = Classroom.generate_unique_classroom_key()
            # Ensure uniqueness
            attempts = 0
            while db.query(Classroom).filter(Classroom.classroom_key == classroom_key).first() and attempts < 10:
                classroom_key = Classroom.generate_unique_classroom_key()
                attempts += 1
            
            if attempts >= 10:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Unable to generate unique classroom key"
                )
        else:
            # Validate provided key is unique
            if db.query(Classroom).filter(Classroom.classroom_key == classroom_key).first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Classroom key already exists"
                )
        
        # Create classroom
        classroom = Classroom(
            name=name,
            description=description,
            classroom_key=classroom_key,
            created_by_id=created_by.id
        )
        
        db.add(classroom)
        db.flush()  # Get the ID
        
        # Add creator as a teacher in the classroom
        ClassroomService.add_user_to_classroom(
            db=db,
            user=created_by,
            classroom=classroom,
            role="TEACHER"
        )
        
        # Create default admin settings for this classroom
        AdminSettings.get_or_create_default(db, classroom.id)
        
        db.commit()
        db.refresh(classroom)
        
        # Ensure members relationship is loaded for property access
        _ = classroom.members  # Access to trigger loading
        
        return classroom
    
    @staticmethod
    def join_classroom(
        db: Session,
        user: User,
        classroom_key: str,
        role: str = "STUDENT"
    ) -> UserClassroom:
        """Add user to classroom using classroom key"""
        
        # Find classroom by key
        classroom = db.query(Classroom).filter(
            and_(
                Classroom.classroom_key == classroom_key,
                Classroom.is_active == True
            )
        ).first()
        
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid classroom key"
            )
        
        # Check if user is already in this classroom
        existing_membership = db.query(UserClassroom).filter(
            and_(
                UserClassroom.user_id == user.id,
                UserClassroom.classroom_id == classroom.id
            )
        ).first()
        
        if existing_membership:
            if existing_membership.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User is already a member of this classroom"
                )
            else:
                # Reactivate membership
                existing_membership.is_active = True
                existing_membership.role = role
                db.commit()
                return existing_membership
        
        # For non-admin users, check if they're already in another classroom as STUDENT
        if role == "STUDENT" and not user.is_admin:
            existing_student_membership = db.query(UserClassroom).filter(
                and_(
                    UserClassroom.user_id == user.id,
                    UserClassroom.role == "STUDENT",
                    UserClassroom.is_active == True
                )
            ).first()
            
            if existing_student_membership:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User is already a student in another classroom. Students can only be in one classroom."
                )
        
        # Check classroom capacity (if max_members is set)
        if classroom.max_members > 0:
            current_member_count = db.query(UserClassroom).filter(
                UserClassroom.classroom_id == classroom.id,
                UserClassroom.is_active == True
            ).count()
            
            if current_member_count >= classroom.max_members:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Classroom has reached maximum capacity"
                )
        
        return ClassroomService.add_user_to_classroom(db, user, classroom, role)
    
    @staticmethod
    def add_user_to_classroom(
        db: Session,
        user: User,
        classroom: Classroom,
        role: str = "STUDENT"
    ) -> UserClassroom:
        """Add user to classroom with specified role"""
        
        # Validate role
        if role not in ["STUDENT", "TEACHER"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role. Must be STUDENT or TEACHER"
            )
        
        # Create membership
        membership = UserClassroom(
            user_id=user.id,
            classroom_id=classroom.id,
            role=role
        )
        
        db.add(membership)
        db.commit()
        db.refresh(membership)
        
        return membership
    
    @staticmethod
    def get_user_classroom(db: Session, user: User) -> Optional[Classroom]:
        """Get the primary classroom for a user (for students) or None if admin"""
        
        # For admins/teachers, they might be in multiple classrooms
        # For now, return the first active one
        membership = db.query(UserClassroom).filter(
            and_(
                UserClassroom.user_id == user.id,
                UserClassroom.is_active == True
            )
        ).first()
        
        return membership.classroom if membership else None
    
    @staticmethod
    def get_user_classrooms(db: Session, user: User) -> List[Classroom]:
        """Get all classrooms user belongs to"""
        
        memberships = db.query(UserClassroom).filter(
            and_(
                UserClassroom.user_id == user.id,
                UserClassroom.is_active == True
            )
        ).all()
        
        return [m.classroom for m in memberships]
    
    @staticmethod
    def get_classroom_context(db: Session, user: User) -> Dict[str, Any]:
        """Get classroom context for current user"""
        
        memberships = db.query(UserClassroom).filter(
            and_(
                UserClassroom.user_id == user.id,
                UserClassroom.is_active == True
            )
        ).all()
        
        if not memberships:
            return {
                "has_classroom": False,
                "classrooms": [],
                "current_classroom": None,
                "roles": []
            }
        
        classrooms = []
        roles = []
        
        for membership in memberships:
            # Calculate member count for this classroom
            member_count = db.query(UserClassroom).filter(
                UserClassroom.classroom_id == membership.classroom.id,
                UserClassroom.is_active == True
            ).count()
            
            classrooms.append({
                "id": membership.classroom.id,
                "name": membership.classroom.name,
                "key": membership.classroom.classroom_key,
                "role": membership.role,
                "is_teacher": membership.role == "TEACHER",
                "member_count": member_count
            })
            roles.append(membership.role)
        
        # For students, use their only classroom as current
        # For teachers, use the first one as default (frontend can allow switching)
        current_classroom = classrooms[0] if classrooms else None
        
        return {
            "has_classroom": len(classrooms) > 0,
            "classrooms": classrooms,
            "current_classroom": current_classroom,
            "roles": roles,
            "is_teacher": "TEACHER" in roles,
            "is_student": "STUDENT" in roles
        }
    
    @staticmethod
    def verify_classroom_access(
        db: Session, 
        user: User, 
        classroom_id: int,
        required_role: Optional[str] = None
    ) -> UserClassroom:
        """Verify user has access to classroom with optional role requirement"""
        
        membership = db.query(UserClassroom).filter(
            and_(
                UserClassroom.user_id == user.id,
                UserClassroom.classroom_id == classroom_id,
                UserClassroom.is_active == True
            )
        ).first()
        
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: User is not a member of this classroom"
            )
        
        if required_role and membership.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {required_role} role required"
            )
        
        return membership
    
    @staticmethod
    def get_classroom_by_id(db: Session, classroom_id: int) -> Optional[Classroom]:
        """Get classroom by ID"""
        return db.query(Classroom).filter(
            and_(
                Classroom.id == classroom_id,
                Classroom.is_active == True
            )
        ).first()
    
    @staticmethod
    def update_classroom(
        db: Session,
        classroom_id: int,
        user: User,
        **updates
    ) -> Classroom:
        """Update classroom (teachers/admins only)"""
        
        classroom = ClassroomService.get_classroom_by_id(db, classroom_id)
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        # Verify user has teacher access
        ClassroomService.verify_classroom_access(db, user, classroom_id, "TEACHER")
        
        # Update allowed fields
        allowed_fields = ["name", "description", "max_members", "allow_collaboration"]
        for field, value in updates.items():
            if field in allowed_fields and hasattr(classroom, field):
                setattr(classroom, field, value)
        
        db.commit()
        db.refresh(classroom)
        
        return classroom
    
    @staticmethod
    def leave_classroom(db: Session, user: User, classroom_id: int) -> bool:
        """Remove user from classroom"""
        
        membership = db.query(UserClassroom).filter(
            and_(
                UserClassroom.user_id == user.id,
                UserClassroom.classroom_id == classroom_id,
                UserClassroom.is_active == True
            )
        ).first()
        
        if not membership:
            return False
        
        # Deactivate membership instead of deleting for audit trail
        membership.is_active = False
        db.commit()
        
        return True
