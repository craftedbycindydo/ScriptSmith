from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.config import settings
from app.database.base import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.assignment import Assignment, StudentSubmission
from app.services.assignment_service import assignment_service

router = APIRouter()


class AssignmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    language: Optional[str] = None
    timeout_seconds: Optional[int] = 30
    plagiarism_threshold: Optional[float] = 0.8


class AssignmentResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str
    plagiarism_status: str
    total_students: int
    processed_students: int
    execution_summary: Optional[dict]
    plagiarism_report: Optional[dict]
    language: Optional[str]
    timeout_seconds: int
    plagiarism_threshold: float
    created_at: str
    processing_started_at: Optional[str]
    processing_completed_at: Optional[str]


class StudentSubmissionResponse(BaseModel):
    id: int
    student_name: str
    execution_status: str
    execution_time: Optional[float]
    has_output: bool
    has_error: bool
    is_flagged: bool
    similarity_scores: Optional[dict]
    code_files: Optional[List[str]]


class AssignmentReportResponse(BaseModel):
    assignment: dict
    execution_stats: dict
    plagiarism_stats: dict
    students: List[dict]


# Import admin service
from app.services.admin_service import AdminService

# Initialize admin service  
admin_service = AdminService(settings)

# Admin authentication dependency
async def get_admin_user(
    current_user: User = Depends(get_current_user)
):
    """Verify that the current user has admin access using secure RBAC"""
    admin_service.verify_admin_access(current_user)
    return current_user


@router.post("/assignments", response_model=AssignmentResponse)
async def create_assignment(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    timeout_seconds: Optional[int] = Form(30),
    plagiarism_threshold: Optional[float] = Form(0.8),
    zip_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Create a new assignment by uploading a ZIP file of student submissions"""
    
    # Validate file type
    if not zip_file.filename.endswith('.zip'):
        raise HTTPException(
            status_code=400,
            detail="Only ZIP files are allowed"
        )
    
    # Check file size (limit to 100MB)
    if zip_file.size and zip_file.size > 100 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File size too large. Maximum 100MB allowed."
        )
    
    try:
        # Create assignment
        assignment = await assignment_service.create_assignment(
            db=db,
            name=name,
            description=description,
            created_by_id=admin_user.id,
            zip_file=zip_file,
            language=language,
            timeout_seconds=timeout_seconds
        )
        
        # Set plagiarism threshold
        assignment.plagiarism_threshold = plagiarism_threshold
        db.commit()
        
        # Start background processing
        background_tasks.add_task(
            assignment_service.process_assignment,
            db,
            assignment.id
        )
        
        return AssignmentResponse(
            id=assignment.id,
            name=assignment.name,
            description=assignment.description,
            status=assignment.status,
            plagiarism_status=assignment.plagiarism_status,
            total_students=assignment.total_students,
            processed_students=assignment.processed_students,
            execution_summary=assignment.execution_summary,
            plagiarism_report=assignment.plagiarism_report,
            language=assignment.language,
            timeout_seconds=assignment.timeout_seconds,
            plagiarism_threshold=assignment.plagiarism_threshold,
            created_at=assignment.created_at.isoformat() if assignment.created_at else "",
            processing_started_at=assignment.processing_started_at.isoformat() if assignment.processing_started_at else None,
            processing_completed_at=assignment.processing_completed_at.isoformat() if assignment.processing_completed_at else None
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create assignment: {str(e)}"
        )


@router.get("/assignments", response_model=List[AssignmentResponse])
async def get_assignments(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all assignments"""
    
    assignments = db.query(Assignment).order_by(desc(Assignment.created_at)).offset(skip).limit(limit).all()
    
    result = []
    for assignment in assignments:
        result.append(AssignmentResponse(
            id=assignment.id,
            name=assignment.name,
            description=assignment.description,
            status=assignment.status,
            plagiarism_status=assignment.plagiarism_status,
            total_students=assignment.total_students,
            processed_students=assignment.processed_students,
            execution_summary=assignment.execution_summary,
            plagiarism_report=assignment.plagiarism_report,
            language=assignment.language,
            timeout_seconds=assignment.timeout_seconds,
            plagiarism_threshold=assignment.plagiarism_threshold,
            created_at=assignment.created_at.isoformat() if assignment.created_at else "",
            processing_started_at=assignment.processing_started_at.isoformat() if assignment.processing_started_at else None,
            processing_completed_at=assignment.processing_completed_at.isoformat() if assignment.processing_completed_at else None
        ))
    
    return result


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get a specific assignment"""
    
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return AssignmentResponse(
        id=assignment.id,
        name=assignment.name,
        description=assignment.description,
        status=assignment.status,
        plagiarism_status=assignment.plagiarism_status,
        total_students=assignment.total_students,
        processed_students=assignment.processed_students,
        execution_summary=assignment.execution_summary,
        plagiarism_report=assignment.plagiarism_report,
        language=assignment.language,
        timeout_seconds=assignment.timeout_seconds,
        plagiarism_threshold=assignment.plagiarism_threshold,
        created_at=assignment.created_at.isoformat() if assignment.created_at else "",
        processing_started_at=assignment.processing_started_at.isoformat() if assignment.processing_started_at else None,
        processing_completed_at=assignment.processing_completed_at.isoformat() if assignment.processing_completed_at else None
    )


@router.get("/assignments/{assignment_id}/report", response_model=AssignmentReportResponse)
async def get_assignment_report(
    assignment_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get comprehensive report for an assignment"""
    
    try:
        report = await assignment_service.get_assignment_report(db, assignment_id)
        return AssignmentReportResponse(**report)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


@router.get("/assignments/{assignment_id}/submissions", response_model=List[StudentSubmissionResponse])
async def get_assignment_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all student submissions for an assignment"""
    
    # Verify assignment exists
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    submissions = db.query(StudentSubmission).filter(
        StudentSubmission.assignment_id == assignment_id
    ).order_by(StudentSubmission.student_name).all()
    
    result = []
    for submission in submissions:
        result.append(StudentSubmissionResponse(
            id=submission.id,
            student_name=submission.student_name,
            execution_status=submission.execution_status,
            execution_time=submission.execution_time,
            has_output=bool(submission.execution_output),
            has_error=bool(submission.execution_error),
            is_flagged=submission.is_flagged,
            similarity_scores=submission.similarity_scores,
            code_files=submission.code_files
        ))
    
    return result


@router.get("/assignments/{assignment_id}/submissions/{submission_id}/details")
async def get_submission_details(
    assignment_id: int,
    submission_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get detailed information about a specific submission"""
    
    submission = db.query(StudentSubmission).filter(
        StudentSubmission.id == submission_id,
        StudentSubmission.assignment_id == assignment_id
    ).first()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # Read the actual code files
    code_content = {}
    if submission.code_files and submission.folder_path:
        import os
        import aiofiles
        
        for code_file in submission.code_files:
            try:
                file_path = os.path.join(submission.folder_path, code_file)
                if os.path.exists(file_path):
                    async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                        content = await f.read()
                        code_content[code_file] = content
            except Exception:
                code_content[code_file] = "Error reading file"
    
    return {
        "submission": {
            "id": submission.id,
            "student_name": submission.student_name,
            "execution_status": submission.execution_status,
            "execution_output": submission.execution_output,
            "execution_error": submission.execution_error,
            "execution_time": submission.execution_time,
            "is_flagged": submission.is_flagged,
            "similarity_scores": submission.similarity_scores,
            "flagged_for": submission.flagged_for,
            "executed_at": submission.executed_at.isoformat() if submission.executed_at else None
        },
        "code_files": code_content
    }


@router.post("/assignments/{assignment_id}/reprocess")
async def reprocess_assignment(
    assignment_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Reprocess an assignment (re-run code execution and plagiarism detection)"""
    
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    if assignment.status == "processing":
        raise HTTPException(
            status_code=400,
            detail="Assignment is currently being processed"
        )
    
    # Reset assignment status
    assignment.status = "uploaded"
    assignment.processed_students = 0
    assignment.processing_started_at = None
    assignment.processing_completed_at = None
    assignment.execution_summary = None
    assignment.plagiarism_status = "pending"
    assignment.plagiarism_report = None
    
    # Reset all submission statuses
    submissions = db.query(StudentSubmission).filter(
        StudentSubmission.assignment_id == assignment_id
    ).all()
    
    for submission in submissions:
        submission.execution_status = "pending"
        submission.execution_output = None
        submission.execution_error = None
        submission.execution_time = None
        submission.executed_at = None
        submission.similarity_scores = None
        submission.is_flagged = False
        submission.flagged_for = None
    
    db.commit()
    
    # Start background processing
    background_tasks.add_task(
        assignment_service.process_assignment,
        db,
        assignment.id
    )
    
    return {"message": "Assignment reprocessing started"}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Delete an assignment and all its data"""
    
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    if assignment.status == "processing":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete assignment while it's being processed"
        )
    
    try:
        # Clean up files
        import shutil
        import os
        
        if assignment.extracted_path and os.path.exists(assignment.extracted_path):
            shutil.rmtree(assignment.extracted_path)
        
        if assignment.zip_file_path and os.path.exists(assignment.zip_file_path):
            os.remove(assignment.zip_file_path)
        
        # Delete from database (cascades to submissions)
        db.delete(assignment)
        db.commit()
        
        return {"message": "Assignment deleted successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete assignment: {str(e)}"
        )
