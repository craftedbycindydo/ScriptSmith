"""
Classroom Router - Handles classroom management endpoints

Provides endpoints for:
- Creating classrooms (admin only)
- Managing classroom membership
- Classroom settings and configuration
- Classroom analytics and reporting
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func, case
from datetime import datetime

from app.core.config import settings
from app.database.base import get_db
from app.routers.auth import get_current_user
from app.models.user import User, UserRole
from app.models.classroom import Classroom, UserClassroom
from app.services.classroom_service import ClassroomService
from app.services.admin_service import AdminService

router = APIRouter()

# Initialize admin service
admin_service = AdminService(settings)

# Pydantic models
class ClassroomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    classroom_key: Optional[str] = None
    max_members: Optional[int] = 100
    allow_collaboration: Optional[bool] = True

class ClassroomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_members: Optional[int] = None
    allow_collaboration: Optional[bool] = None

class ClassroomResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    classroom_key: str
    is_active: bool
    max_members: int
    allow_collaboration: bool
    created_at: str
    created_by_id: int
    created_by_username: str
    member_count: int
    teacher_count: int
    
    class Config:
        from_attributes = True

class UserClassroomResponse(BaseModel):
    id: int
    user_id: int
    username: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    joined_at: str
    last_accessed: Optional[str]
    
    class Config:
        from_attributes = True

class ClassroomStatsResponse(BaseModel):
    classroom_id: int
    classroom_name: str
    total_members: int
    active_members: int
    teachers: int
    students: int
    templates_count: int
    assignments_count: int
    code_submissions_count: int
    collaboration_sessions_count: int

class JoinClassroomRequest(BaseModel):
    classroom_key: str

# Admin authentication dependency
async def get_admin_user(
    current_user: User = Depends(get_current_user)
):
    """Verify that the current user has admin access"""
    admin_service.verify_admin_access(current_user)
    return current_user

# Teacher authentication dependency
async def get_teacher_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify that the current user has teacher access in their classroom"""
    if not current_user.is_admin:
        # Check if user is a teacher in at least one classroom
        teacher_membership = db.query(UserClassroom).filter(
            UserClassroom.user_id == current_user.id,
            UserClassroom.role == "TEACHER",
            UserClassroom.is_active == True
        ).first()
        
        if not teacher_membership:
            raise HTTPException(
                status_code=403,
                detail="Teacher access required"
            )
    
    return current_user

@router.post("/classrooms", response_model=ClassroomResponse)
async def create_classroom(
    classroom_data: ClassroomCreate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Create a new classroom (admin only)"""
    
    classroom = ClassroomService.create_classroom(
        db=db,
        name=classroom_data.name,
        description=classroom_data.description,
        created_by=admin_user,
        classroom_key=classroom_data.classroom_key
    )
    
    # Update optional settings
    if classroom_data.max_members:
        classroom.max_members = classroom_data.max_members
    if classroom_data.allow_collaboration is not None:
        classroom.allow_collaboration = classroom_data.allow_collaboration
    
    db.commit()
    db.refresh(classroom)
    
    return ClassroomResponse(
        id=classroom.id,
        name=classroom.name,
        description=classroom.description,
        classroom_key=classroom.classroom_key,
        is_active=classroom.is_active,
        max_members=classroom.max_members,
        allow_collaboration=classroom.allow_collaboration,
        created_at=classroom.created_at.isoformat(),
        created_by_id=classroom.created_by_id,
        created_by_username=classroom.creator.username,
        member_count=classroom.active_member_count,
        teacher_count=classroom.teacher_count
    )

@router.get("/classrooms", response_model=List[ClassroomResponse])
async def list_classrooms(
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """List classrooms created by the current admin (admin only)"""
    
    classrooms = db.query(Classroom).filter(
        Classroom.is_active == True,
        Classroom.created_by_id == admin_user.id
    ).order_by(desc(Classroom.created_at)).offset(skip).limit(limit).all()
    
    return [
        ClassroomResponse(
            id=classroom.id,
            name=classroom.name,
            description=classroom.description,
            classroom_key=classroom.classroom_key,
            is_active=classroom.is_active,
            max_members=classroom.max_members,
            allow_collaboration=classroom.allow_collaboration,
            created_at=classroom.created_at.isoformat(),
            created_by_id=classroom.created_by_id,
            created_by_username=classroom.creator.username,
            member_count=classroom.active_member_count,
            teacher_count=classroom.teacher_count
        )
        for classroom in classrooms
    ]

@router.get("/classrooms/my", response_model=List[ClassroomResponse])
async def get_my_classrooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get classrooms the current user belongs to"""
    
    classrooms = ClassroomService.get_user_classrooms(db, current_user)
    
    return [
        ClassroomResponse(
            id=classroom.id,
            name=classroom.name,
            description=classroom.description,
            classroom_key=classroom.classroom_key,
            is_active=classroom.is_active,
            max_members=classroom.max_members,
            allow_collaboration=classroom.allow_collaboration,
            created_at=classroom.created_at.isoformat(),
            created_by_id=classroom.created_by_id,
            created_by_username=classroom.creator.username,
            member_count=classroom.active_member_count,
            teacher_count=classroom.teacher_count
        )
        for classroom in classrooms
    ]

@router.get("/classrooms/{classroom_id}", response_model=ClassroomResponse)
async def get_classroom(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get classroom details (members only)"""
    
    # Verify user has access to this classroom
    ClassroomService.verify_classroom_access(db, current_user, classroom_id)
    
    classroom = ClassroomService.get_classroom_by_id(db, classroom_id)
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    return ClassroomResponse(
        id=classroom.id,
        name=classroom.name,
        description=classroom.description,
        classroom_key=classroom.classroom_key,
        is_active=classroom.is_active,
        max_members=classroom.max_members,
        allow_collaboration=classroom.allow_collaboration,
        created_at=classroom.created_at.isoformat(),
        created_by_id=classroom.created_by_id,
        created_by_username=classroom.creator.username,
        member_count=classroom.active_member_count,
        teacher_count=classroom.teacher_count
    )

@router.put("/classrooms/{classroom_id}", response_model=ClassroomResponse)
async def update_classroom(
    classroom_id: int,
    classroom_update: ClassroomUpdate,
    teacher_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Update classroom settings (teachers/admins only)"""
    
    # Verify user has teacher access to this classroom
    if not teacher_user.is_admin:
        ClassroomService.verify_classroom_access(db, teacher_user, classroom_id, "TEACHER")
    
    classroom = ClassroomService.update_classroom(
        db=db,
        classroom_id=classroom_id,
        user=teacher_user,
        **classroom_update.dict(exclude_unset=True)
    )
    
    return ClassroomResponse(
        id=classroom.id,
        name=classroom.name,
        description=classroom.description,
        classroom_key=classroom.classroom_key,
        is_active=classroom.is_active,
        max_members=classroom.max_members,
        allow_collaboration=classroom.allow_collaboration,
        created_at=classroom.created_at.isoformat(),
        created_by_id=classroom.created_by_id,
        created_by_username=classroom.creator.username,
        member_count=classroom.active_member_count,
        teacher_count=classroom.teacher_count
    )

@router.post("/classrooms/join", response_model=dict)
async def join_classroom(
    join_request: JoinClassroomRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Join a classroom using a classroom key"""
    
    membership = ClassroomService.join_classroom(
        db=db,
        user=current_user,
        classroom_key=join_request.classroom_key,
        role="TEACHER" if current_user.is_admin else "STUDENT"
    )
    
    return {
        "message": "Successfully joined classroom",
        "classroom_id": membership.classroom_id,
        "classroom_name": membership.classroom.name,
        "role": membership.role
    }

@router.get("/classrooms/{classroom_id}/members", response_model=List[UserClassroomResponse])
async def get_classroom_members(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100)
):
    """Get classroom members (classroom members only)"""
    
    # Verify user has access to this classroom
    ClassroomService.verify_classroom_access(db, current_user, classroom_id)
    
    members = db.query(UserClassroom).options(
        joinedload(UserClassroom.user)
    ).filter(
        UserClassroom.classroom_id == classroom_id,
        UserClassroom.is_active == True
    ).offset(skip).limit(limit).all()
    
    return [
        UserClassroomResponse(
            id=member.id,
            user_id=member.user_id,
            username=member.user.username,
            email=member.user.email,
            full_name=member.user.full_name,
            role=member.role,
            is_active=member.is_active,
            joined_at=member.joined_at.isoformat(),
            last_accessed=member.last_accessed.isoformat() if member.last_accessed else None
        )
        for member in members
    ]

@router.delete("/classrooms/{classroom_id}/leave")
async def leave_classroom(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Leave a classroom"""
    
    success = ClassroomService.leave_classroom(db, current_user, classroom_id)
    
    if not success:
        raise HTTPException(
            status_code=404,
            detail="User is not a member of this classroom"
        )
    
    return {"message": "Successfully left classroom"}

@router.get("/classrooms/{classroom_id}/stats", response_model=ClassroomStatsResponse)
async def get_classroom_stats(
    classroom_id: int,
    teacher_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get classroom statistics (teachers/admins only)"""
    
    # Verify user has teacher access to this classroom
    if not teacher_user.is_admin:
        ClassroomService.verify_classroom_access(db, teacher_user, classroom_id, "TEACHER")
    
    classroom = ClassroomService.get_classroom_by_id(db, classroom_id)
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    # Get member statistics
    member_stats = db.query(
        func.count(UserClassroom.id).label('total_members'),
        func.count(func.nullif(UserClassroom.is_active, False)).label('active_members'),
        func.sum(case((UserClassroom.role == 'TEACHER', 1), else_=0)).label('teachers'),
        func.sum(case((UserClassroom.role == 'STUDENT', 1), else_=0)).label('students')
    ).filter(UserClassroom.classroom_id == classroom_id).first()
    
    # Get content statistics
    templates_count = len(classroom.templates)
    assignments_count = len(classroom.assignments)
    code_submissions_count = len(classroom.code_submissions)
    collaboration_sessions_count = len(classroom.collaboration_sessions)
    
    return ClassroomStatsResponse(
        classroom_id=classroom.id,
        classroom_name=classroom.name,
        total_members=member_stats.total_members or 0,
        active_members=member_stats.active_members or 0,
        teachers=int(member_stats.teachers or 0),
        students=int(member_stats.students or 0),
        templates_count=templates_count,
        assignments_count=assignments_count,
        code_submissions_count=code_submissions_count,
        collaboration_sessions_count=collaboration_sessions_count
    )

# Member Management Endpoints

class ClassroomMember(BaseModel):
    id: int
    user_id: int
    username: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    joined_at: str

@router.get("/classrooms/{classroom_id}/members", response_model=List[ClassroomMember])
async def get_classroom_members(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all members of a classroom (teachers only)"""
    
    # Verify user has teacher access to the classroom
    ClassroomService.verify_classroom_access(
        db=db, 
        user=current_user, 
        classroom_id=classroom_id,
        required_role="TEACHER"
    )
    
    # Get all members with user details
    members = db.query(UserClassroom, User).join(
        User, UserClassroom.user_id == User.id
    ).filter(
        UserClassroom.classroom_id == classroom_id,
        UserClassroom.is_active == True
    ).order_by(UserClassroom.role.desc(), User.username).all()
    
    result = []
    for membership, user in members:
        result.append(ClassroomMember(
            id=membership.id,
            user_id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=membership.role,
            is_active=membership.is_active,
            joined_at=membership.joined_at.isoformat() if membership.joined_at else ""
        ))
    
    return result

@router.delete("/classrooms/{classroom_id}/members/{member_id}")
async def remove_classroom_member(
    classroom_id: int,
    member_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a member from classroom (teachers only)"""
    
    # Verify user has teacher access to the classroom
    ClassroomService.verify_classroom_access(
        db=db, 
        user=current_user, 
        classroom_id=classroom_id,
        required_role="TEACHER"
    )
    
    # Find the membership
    membership = db.query(UserClassroom).filter(
        UserClassroom.id == member_id,
        UserClassroom.classroom_id == classroom_id
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this classroom"
        )
    
    # Don't allow removing teachers
    if membership.role == "TEACHER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove teachers from classroom"
        )
    
    # Remove the membership
    db.delete(membership)
    db.commit()
    
    return {"message": "Member removed successfully"}

@router.post("/classrooms/{classroom_id}/invite")
async def invite_to_classroom(
    classroom_id: int,
    invite_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate invite information for a classroom (teachers only)"""
    
    # Verify user has teacher access to the classroom
    ClassroomService.verify_classroom_access(
        db=db, 
        user=current_user, 
        classroom_id=classroom_id,
        required_role="TEACHER"
    )
    
    classroom = ClassroomService.get_classroom_by_id(db, classroom_id)
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found"
        )
    
    # Return classroom key for manual sharing
    return {
        "message": "Share this classroom key with the student",
        "classroom_key": classroom.classroom_key,
        "classroom_name": classroom.name,
        "instructions": "Student should register using this key at /auth/register"
    }

class StudentCandidate(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None


@router.get("/classrooms/{classroom_id}/student-candidates", response_model=List[StudentCandidate])
async def get_student_candidates(
    classroom_id: int,
    q: str = Query("", description="Partial email or username to match"),
    limit: int = Query(8, ge=1, le=25),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Suggest users who can be added to this classroom (teachers only).

    Students may belong to only one classroom, so the only addable users are
    those with no active membership anywhere. Admins are excluded because
    add-student rejects them.
    """

    # Same access requirement as add-student: this exposes user email addresses
    ClassroomService.verify_classroom_access(
        db=db,
        user=current_user,
        classroom_id=classroom_id,
        required_role="TEACHER"
    )

    already_in_a_classroom = db.query(UserClassroom.user_id).filter(
        UserClassroom.is_active == True
    )

    query = db.query(User).filter(
        User.is_active == True,
        User.role != UserRole.ADMIN,
        User.is_superuser == False,
        ~User.id.in_(already_in_a_classroom)
    )

    term = q.strip().lower()
    if term:
        # Treat LIKE wildcards in the typed text as literal characters
        escaped = term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        pattern = f"%{escaped}%"
        query = query.filter(
            func.lower(User.email).like(pattern, escape='\\') |
            func.lower(User.username).like(pattern, escape='\\')
        )

    candidates = query.order_by(User.email).limit(limit).all()

    # ADMIN_EMAILS grants admin access without a role change - keep those out too
    return [
        StudentCandidate(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name
        )
        for user in candidates
        if not admin_service.is_initial_admin_email(user.email)
    ]


class AddStudentRequest(BaseModel):
    email: str

@router.post("/classrooms/{classroom_id}/add-student")
async def add_student_to_classroom(
    classroom_id: int,
    request: AddStudentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add an existing student to classroom by email (teachers only)"""
    
    # Verify user has teacher access to the classroom
    ClassroomService.verify_classroom_access(
        db=db, 
        user=current_user, 
        classroom_id=classroom_id,
        required_role="TEACHER"
    )
    
    # Find the user by email
    from app.models.user import User as UserModel
    student = db.query(UserModel).filter(UserModel.email == request.email.lower()).first()
    
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No user found with email: {request.email}"
        )
    
    # Check if student is already in a classroom (students can only be in one classroom)
    existing_membership = db.query(UserClassroom).filter(
        UserClassroom.user_id == student.id,
        UserClassroom.is_active == True
    ).first()
    
    if existing_membership:
        if existing_membership.classroom_id == classroom_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User {request.email} is already a member of this classroom"
            )
        else:
            # Get the other classroom name for better error message
            other_classroom = db.query(Classroom).filter(Classroom.id == existing_membership.classroom_id).first()
            classroom_name = other_classroom.name if other_classroom else "another classroom"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User {request.email} is already a member of {classroom_name}. Students can only be in one classroom."
            )
    
    # Check if user is an admin (admins shouldn't be added as students)
    if student.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot add admin users as students. User {request.email} is an administrator."
        )
    
    # Add the student to the classroom
    try:
        new_membership = UserClassroom(
            user_id=student.id,
            classroom_id=classroom_id,
            role="STUDENT",
            is_active=True
        )
        db.add(new_membership)
        db.commit()
        
        return {
            "message": f"Successfully added {student.username} ({request.email}) to the classroom",
            "student_username": student.username,
            "student_email": student.email,
            "role": "STUDENT"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add student to classroom: {str(e)}"
        )

@router.delete("/classrooms/{classroom_id}")
async def delete_classroom(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a classroom (teachers/admins only)"""
    
    # Verify user has teacher access to the classroom
    ClassroomService.verify_classroom_access(
        db=db, 
        user=current_user, 
        classroom_id=classroom_id, 
        required_role="TEACHER"
    )
    
    # Get the classroom
    classroom = db.query(Classroom).filter(
        Classroom.id == classroom_id,
        Classroom.is_active == True
    ).first()
    
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found"
        )
    
    try:
        # Get all memberships to notify about deletion
        memberships = db.query(UserClassroom).filter(
            UserClassroom.classroom_id == classroom_id
        ).all()
        
        # Count affected users for logging
        affected_users = len(memberships)
        
        # Delete all memberships first (cascade delete)
        for membership in memberships:
            db.delete(membership)
        
        # Delete the classroom
        db.delete(classroom)
        db.commit()
        
        return {
            "message": f"Classroom '{classroom.name}' deleted successfully",
            "affected_users": affected_users,
            "classroom_name": classroom.name
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete classroom: {str(e)}"
        )
