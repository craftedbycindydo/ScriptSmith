from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
import time

from app.core.config import settings
from app.database.base import get_db
from app.services.code_execution import code_execution_service
from app.routers.auth import get_current_user, get_current_user_optional
from typing import Union
from app.models.code_submission import CodeSubmission
from sqlalchemy import desc

router = APIRouter()

class CodeExecutionRequest(BaseModel):
    code: str
    language: str
    input_data: Optional[str] = ""

class CodeExecutionResponse(BaseModel):
    output: str
    error: str
    execution_time: float
    status: str  # "success", "error", "timeout"

class CodeValidationRequest(BaseModel):
    code: str
    language: str

class CodeValidationResponse(BaseModel):
    is_valid: bool
    errors: list
    warnings: list

class CodeHistoryItem(BaseModel):
    id: int
    code: str
    language: str
    input_data: Optional[str]
    output: Optional[str]
    error_message: Optional[str]
    execution_time: Optional[float]
    status: Optional[str]
    created_at: str
    executed_at: Optional[str]

class CodeHistoryResponse(BaseModel):
    history: list[CodeHistoryItem]
    total: int
    page: int
    page_size: int



@router.post("/code/execute", response_model=CodeExecutionResponse)
async def execute_code(
    request: CodeExecutionRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_optional)  # Optional authentication
):
    """Execute user code in a secure Docker environment"""
    
    # Validate language support
    if request.language not in settings.supported_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{request.language}' is not supported"
        )
    
    # Validate code size
    code_size_kb = len(request.code.encode('utf-8')) / 1024
    if code_size_kb > settings.max_code_size_kb:
        raise HTTPException(
            status_code=400,
            detail=f"Code size ({code_size_kb:.1f}KB) exceeds maximum allowed size ({settings.max_code_size_kb}KB)"
        )
    
    start_time = time.time()
    
    try:
        # Execute code in Docker container
        result = await code_execution_service.execute_code(
            code=request.code,
            language=request.language,
            input_data=request.input_data or ""
        )
        
        execution_time = time.time() - start_time
        
        # Save execution to database if user is authenticated
        if current_user:
            from sqlalchemy.sql import func
            code_submission = CodeSubmission(
                user_id=current_user.id,
                code=request.code,
                language=request.language,
                input_data=request.input_data,
                output=result["output"],
                error_message=result["error"],
                execution_time=execution_time,
                status=result["status"],
                executed_at=func.now()
            )
            db.add(code_submission)
            db.commit()
        
        return CodeExecutionResponse(
            output=result["output"],
            error=result["error"],
            execution_time=execution_time,
            status=result["status"]
        )
    
    except Exception as e:
        return CodeExecutionResponse(
            output="",
            error=f"Internal error: {str(e)}",
            execution_time=time.time() - start_time,
            status="error"
        )

@router.post("/code/validate", response_model=CodeValidationResponse)
async def validate_code(request: CodeValidationRequest):
    """Validate code syntax without executing it"""
    
    if request.language not in settings.supported_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{request.language}' is not supported"
        )
    
    try:
        # Use real syntax validation service
        validation_result = await code_execution_service.validate_code_syntax(
            request.code, 
            request.language
        )
        
        return CodeValidationResponse(
            is_valid=validation_result["is_valid"],
            errors=validation_result["errors"],
            warnings=validation_result["warnings"]
        )
    except Exception as e:
        return CodeValidationResponse(
            is_valid=False,
            errors=[f"Validation error: {str(e)}"],
            warnings=[]
        )

@router.get("/code/history", response_model=CodeHistoryResponse)
async def get_code_history(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)  # Required authentication
):
    """Get code execution history for the authenticated user"""
    
    # Validate pagination parameters
    if page < 1:
        raise HTTPException(status_code=400, detail="Page must be >= 1")
    if page_size < 1 or page_size > 100:
        raise HTTPException(status_code=400, detail="Page size must be between 1 and 100")
    
    # Calculate offset
    offset = (page - 1) * page_size
    
    # Get total count
    total = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == current_user.id
    ).count()
    
    # Get paginated history
    submissions = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == current_user.id
    ).order_by(desc(CodeSubmission.created_at)).offset(offset).limit(page_size).all()
    
    # Convert to response format
    history_items = []
    for submission in submissions:
        history_items.append(CodeHistoryItem(
            id=submission.id,
            code=submission.code,
            language=submission.language,
            input_data=submission.input_data,
            output=submission.output,
            error_message=submission.error_message,
            execution_time=submission.execution_time,
            status=submission.status,
            created_at=submission.created_at.isoformat() if submission.created_at else "",
            executed_at=submission.executed_at.isoformat() if submission.executed_at else None
        ))
    
    return CodeHistoryResponse(
        history=history_items,
        total=total,
        page=page,
        page_size=page_size
    )
