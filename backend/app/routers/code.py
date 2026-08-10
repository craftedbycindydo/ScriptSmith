from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import time
import asyncio

from app.core.config import settings
from app.database.base import get_db
from app.services.microservice_executor import microservice_executor
from app.routers.auth import get_current_user, get_current_user_optional
from typing import Union
from app.models.code_submission import CodeSubmission
from app.services.openai_service import openai_service
from app.services.cache_service import cache_service
from sqlalchemy import desc

router = APIRouter()

class CodeExecutionRequest(BaseModel):
    code: str
    language: str
    input_data: Optional[str] = ""
    template_id: Optional[int] = None  # Track which template was used
    is_submission: Optional[bool] = False  # If True, bypass cache to ensure fresh execution

class ComplexityAnalysis(BaseModel):
    time_complexity: str
    space_complexity: str
    explanation: str
    available: bool

class CodeExecutionResponse(BaseModel):
    output: str
    error: str
    execution_time: float
    status: str  # "success", "error", "timeout"
    complexity: Optional[ComplexityAnalysis] = None

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
    
    # Check cache first to avoid redundant execution (skip cache for submissions to ensure fresh results)
    # Use exact input_data to ensure bit-perfect caching
    input_data = request.input_data if request.input_data is not None else ""
    cached_result = None
    
    # Only use cache if this is not a submission - submissions need fresh execution
    if not request.is_submission:
        cached_result = await cache_service.get_cached_result(
            request.code, 
            request.language, 
            input_data
        )
    
    if cached_result:
        # Return cached result - convert complexity back to object if present
        complexity_data = cached_result.get("complexity")
        complexity_analysis = None
        if complexity_data:
            complexity_analysis = ComplexityAnalysis(
                time_complexity=complexity_data.get("time_complexity", "Not Available"),
                space_complexity=complexity_data.get("space_complexity", "Not Available"),
                explanation=complexity_data.get("explanation", "Not Available"),
                available=complexity_data.get("available", False)
            )
        
        return CodeExecutionResponse(
            output=cached_result.get("output", ""),
            error=cached_result.get("error", ""),
            execution_time=cached_result.get("execution_time", 0.0),
            status=cached_result.get("status", "error"),
            complexity=complexity_analysis
        )
    
    start_time = time.time()
    
    try:
        # Execute code using microservice
        result = await microservice_executor.execute_code(
            code=request.code,
            language=request.language,
            input_data=input_data
        )
        
        execution_time = time.time() - start_time
        
        # Perform complexity analysis ONLY if execution was successful - saves OpenAI calls
        complexity_analysis = None
        if result["status"] == "success":
            try:
                # Use asyncio.wait_for to enforce timeout and prevent blocking
                analysis_result = await asyncio.wait_for(
                    openai_service.analyze_code_complexity(request.code, request.language),
                    timeout=4.0  # Maximum 4 seconds total for complexity analysis
                )
                complexity_analysis = ComplexityAnalysis(
                    time_complexity=analysis_result["time_complexity"],
                    space_complexity=analysis_result["space_complexity"], 
                    explanation=analysis_result["explanation"],
                    available=analysis_result["available"]
                )
            except asyncio.TimeoutError:
                # Timeout - return response without complexity to avoid delays
                complexity_analysis = None
            except Exception:
                # Any other error - return response without complexity, no error details
                complexity_analysis = None
        else:
            # Code execution failed - skip OpenAI call to save API costs
            print(f"⏭️  Skipping OpenAI complexity analysis - code execution failed ({result['status']})")
        
        # Save execution to database if user is authenticated
        if current_user:
            from sqlalchemy.sql import func
            code_submission = CodeSubmission(
                user_id=current_user.id,
                template_id=request.template_id,
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
        
        # Prepare response
        response = CodeExecutionResponse(
            output=result["output"],
            error=result["error"],
            execution_time=execution_time,
            status=result["status"],
            complexity=complexity_analysis
        )
        
        # Cache the result synchronously to prevent race conditions.
        # Never cache infrastructure failures (executor down/unreachable): they are
        # transient, and a cached one would keep showing the error after recovery.
        if result.get("infrastructure_error"):
            print("⏭️  Not caching result - execution failed for infrastructure reasons")
            return response

        try:
            await cache_service.cache_result(
                request.code,
                request.language, 
                input_data,
                {
                    "output": result["output"],
                    "error": result["error"],
                    "execution_time": execution_time,
                    "status": result["status"],
                    "complexity": complexity_analysis.dict() if complexity_analysis else None
                }
            )
        except Exception:
            # Cache errors should not affect the response
            pass
            
        return response
    
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
        # Use microservice syntax validation
        validation_result = await microservice_executor.validate_code_syntax(
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


@router.get("/microservices/health")
async def check_microservices_health():
    """Check health status of all language execution microservices"""
    try:
        health_status = await microservice_executor.health_check()
        return health_status
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check microservices health: {str(e)}"
        )


@router.get("/microservices/info/{language}")
async def get_microservice_info(language: str):
    """Get information about a specific language microservice"""
    if language not in settings.supported_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{language}' is not supported"
        )
    
    try:
        service_info = await microservice_executor.get_service_info(language)
        return service_info
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get service info: {str(e)}"
        )


@router.get("/cache/stats")
async def get_cache_stats():
    """Get code execution cache statistics"""
    try:
        stats = await cache_service.get_cache_stats()
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get cache stats: {str(e)}"
        )


@router.post("/cache/ttl")
async def get_cache_ttl(
    request: CodeExecutionRequest
):
    """Get remaining TTL for cached code execution result"""
    try:
        ttl_seconds = await cache_service.get_cache_ttl(
            request.code,
            request.language,
            request.input_data or ""
        )
        
        if ttl_seconds == -1:
            return {
                "cached": False,
                "message": "Code not found in cache"
            }
        elif ttl_seconds == -2:
            return {
                "cached": True,
                "ttl_seconds": -2,
                "message": "Cached but no TTL set (permanent)"
            }
        else:
            ttl_hours = ttl_seconds / 3600
            return {
                "cached": True,
                "ttl_seconds": ttl_seconds,
                "ttl_hours": round(ttl_hours, 2),
                "message": f"Cache expires in {ttl_hours:.2f} hours"
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check cache TTL: {str(e)}"
        )


@router.delete("/cache/clear")
async def clear_cache(
    current_user = Depends(get_current_user)  # Require authentication
):
    """Clear code execution cache (admin only)"""
    # Check if user has admin privileges
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Admin access required to clear cache"
        )
    
    try:
        deleted_count = await cache_service.clear_cache()
        return {
            "message": f"Successfully cleared {deleted_count} cache entries",
            "deleted_count": deleted_count
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear cache: {str(e)}"
        )
