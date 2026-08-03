from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_, or_, text
from datetime import datetime, timedelta
import httpx
import logging
import time
from collections import defaultdict

from app.core.config import settings
from app.database.base import get_db
from app.routers.auth import get_current_user
from app.models.user import User, UserRole
from app.models.code_submission import CodeSubmission
from app.models.collaboration import CollaborationSession, CollaborationParticipant
from app.models.template import Template
from app.models.admin_settings import AdminSettings
from app.models.classroom import Classroom, UserClassroom
from app.services.admin_service import AdminService
from app.services.auth import AuthService
from app.services.classroom_service import ClassroomService
from app.services.railway_optimization_service import railway_performance_monitor
from app.services.openai_service import openai_service
import logging

logger = logging.getLogger(__name__)

def safe_datetime_format(dt_value):
    """Handle datetime formatting for both SQLite (string) and PostgreSQL (datetime)"""
    if dt_value is None:
        return None
    if isinstance(dt_value, str):
        return dt_value  # Already a string
    if hasattr(dt_value, 'isoformat'):
        return dt_value.isoformat()  # Datetime object
    return str(dt_value)  # Fallback

router = APIRouter()

# Initialize admin service
admin_service = AdminService(settings)

# Security logger for audit trails
security_logger = logging.getLogger("security.admin")

# Rate limiting storage (in production, use Redis)
grading_rate_limiter = defaultdict(list)
GRADING_RATE_LIMIT = 20  # Max 20 grading requests per admin per hour
GRADING_RATE_WINDOW = 3600  # 1 hour in seconds

# Request size limits for grading endpoint
MAX_SUBMISSIONS_PER_REQUEST = 100
MAX_SUBMISSION_CODE_SIZE = 50000  # 50KB per submission
MAX_TEMPLATE_SIZE = 100000  # 100KB for template code

def check_grading_rate_limit(admin_user_id: int, request_ip: str) -> None:
    """
    Check if admin user has exceeded rate limit for grading requests.
    Raises HTTPException if rate limit exceeded.
    """
    current_time = time.time()
    user_requests = grading_rate_limiter[admin_user_id]
    
    # Remove old requests outside the time window
    user_requests[:] = [req_time for req_time in user_requests if current_time - req_time < GRADING_RATE_WINDOW]
    
    if len(user_requests) >= GRADING_RATE_LIMIT:
        security_logger.warning(
            f"Rate limit exceeded for admin user {admin_user_id} from IP {request_ip}. "
            f"Attempted {len(user_requests)} requests in last hour (limit: {GRADING_RATE_LIMIT})"
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Maximum {GRADING_RATE_LIMIT} grading requests per hour allowed."
        )
    
    # Add current request timestamp
    user_requests.append(current_time)
    
    security_logger.info(
        f"Grading request approved for admin user {admin_user_id} from IP {request_ip}. "
        f"Request count in last hour: {len(user_requests)}/{GRADING_RATE_LIMIT}"
    )

def validate_grading_request_security(request: 'BatchGradingRequest', admin_user: User) -> None:
    """
    Perform comprehensive security validation on grading request.
    Raises HTTPException if validation fails.
    """
    # Validate number of submissions
    if len(request.submissions) > MAX_SUBMISSIONS_PER_REQUEST:
        security_logger.warning(
            f"Admin user {admin_user.id} attempted to grade {len(request.submissions)} submissions "
            f"(limit: {MAX_SUBMISSIONS_PER_REQUEST})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many submissions. Maximum {MAX_SUBMISSIONS_PER_REQUEST} submissions per request."
        )
    
    # Validate template size
    template_content = request.template_info.get('code_content', '')
    if len(template_content.encode('utf-8')) > MAX_TEMPLATE_SIZE:
        security_logger.warning(
            f"Admin user {admin_user.id} attempted to submit template code of size "
            f"{len(template_content.encode('utf-8'))} bytes (limit: {MAX_TEMPLATE_SIZE})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Template code too large. Maximum {MAX_TEMPLATE_SIZE} bytes allowed."
        )
    
    # Validate each submission size
    for i, submission in enumerate(request.submissions):
        code_size = len(submission.get('code', '').encode('utf-8'))
        if code_size > MAX_SUBMISSION_CODE_SIZE:
            security_logger.warning(
                f"Admin user {admin_user.id} attempted to submit code of size {code_size} bytes "
                f"for submission {i} (limit: {MAX_SUBMISSION_CODE_SIZE})"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Submission {i} code too large. Maximum {MAX_SUBMISSION_CODE_SIZE} bytes per submission."
            )
    
    # Validate grade scale and leniency ranges
    if request.grade_scale not in [10, 50, 100]:
        security_logger.warning(
            f"Admin user {admin_user.id} attempted invalid grade scale: {request.grade_scale}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Grade scale must be 10, 50, or 100"
        )
    
    if not (0 <= request.leniency <= 100):
        security_logger.warning(
            f"Admin user {admin_user.id} attempted invalid leniency: {request.leniency}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Leniency must be between 0 and 100"
        )
    
    security_logger.info(
        f"Grading request validation passed for admin user {admin_user.id}. "
        f"Submissions: {len(request.submissions)}, Grade scale: {request.grade_scale}, "
        f"Leniency: {request.leniency}"
    )

def get_client_ip(request: Request) -> str:
    """
    Safely extract client IP address from request headers.
    """
    # Check for forwarded IP (behind proxy/load balancer)
    forwarded_for = request.headers.get('x-forwarded-for')
    if forwarded_for:
        # Take the first IP in the chain (client IP)
        return forwarded_for.split(',')[0].strip()
    
    # Check for real IP header
    real_ip = request.headers.get('x-real-ip')
    if real_ip:
        return real_ip.strip()
    
    # Fallback to client host
    return request.client.host if request.client else 'unknown'

class UserActivityItem(BaseModel):
    id: int
    user_id: Optional[int]
    username: Optional[str]
    email: Optional[str]
    activity_type: str  # "code_execution", "session_creation", "session_join"
    activity_data: dict
    timestamp: str
    status: Optional[str]
    error_message: Optional[str]

class UserActivityResponse(BaseModel):
    activities: List[UserActivityItem]
    total: int
    page: int
    page_size: int

class AdminStatsResponse(BaseModel):
    total_users: int
    total_code_executions: int
    total_collaboration_sessions: int
    active_sessions: int
    executions_today: int
    new_users_today: int
    error_rate_percentage: float
    popular_languages: List[dict]

class UserDetailsResponse(BaseModel):
    user: dict
    code_executions: int
    collaboration_sessions: int
    recent_activity: List[UserActivityItem]

# Admin authentication dependency with classroom context
async def get_admin_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify that the current user has admin access using secure RBAC"""
    admin_service.verify_admin_access(current_user)
    
    # Get user's classroom context
    classroom_context = ClassroomService.get_classroom_context(db, current_user)
    current_user.classroom_context = classroom_context
    
    return current_user

def get_user_classroom_ids(user: User) -> List[int]:
    """Get list of classroom IDs that the user has access to"""
    if not hasattr(user, 'classroom_context') or not user.classroom_context.get('classrooms'):
        return []
    return [c['id'] for c in user.classroom_context['classrooms']]

@router.get("/admin/stats", response_model=AdminStatsResponse)
@railway_performance_monitor("admin_stats")
async def get_admin_stats(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get classroom-scoped system statistics - Optimized for Railway PostgreSQL"""
    import time
    start_time = time.time()
    logger.info(f"Admin stats request started for user {admin_user.id}")
    
    from app.services.admin_cache_service import admin_cache
    
    # Get user's classroom IDs
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        # Return empty stats if user has no classrooms
        return AdminStatsResponse(
            total_users=0,
            total_code_executions=0,
            total_collaboration_sessions=0,
            active_sessions=0,
            executions_today=0,
            new_users_today=0,
            error_rate_percentage=0,
            popular_languages=[]
        )
    
    # Try cache first
    cached_stats = admin_cache.get_cached_admin_stats(classroom_ids)
    if cached_stats:
        return AdminStatsResponse(**cached_stats)
    
    # Calculate dates
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # SQLite/PostgreSQL compatible: Dynamic IN clause with individual parameters
    classroom_placeholders = ', '.join([f':classroom_id_{i}' for i in range(len(classroom_ids))])
    
    # Detect database type for compatibility
    from app.database.base import engine
    db_name = str(engine.url).split(':')[0].lower()
    is_sqlite = 'sqlite' in db_name
    
    if is_sqlite:
        # SQLite-compatible query
        stats_query = text(f"""
            WITH user_stats AS (
                -- Get classroom users efficiently
                SELECT 
                    u.id,
                    u.created_at,
                    CASE WHEN u.created_at >= :today_start THEN 1 ELSE 0 END as is_new_today
                FROM users u
                INNER JOIN user_classrooms uc ON u.id = uc.user_id
                WHERE uc.classroom_id IN ({classroom_placeholders})
                  AND uc.is_active = 1
            ),
            submission_stats AS (
                -- SQLite CASE WHEN instead of FILTER
                SELECT 
                    COUNT(cs.id) as total_executions,
                    SUM(CASE WHEN cs.created_at >= :today_start THEN 1 ELSE 0 END) as executions_today,
                    SUM(CASE WHEN cs.status = 'error' THEN 1 ELSE 0 END) as error_executions
                FROM code_submissions cs
                WHERE (cs.classroom_id IN ({classroom_placeholders}) 
                       OR cs.user_id IN (SELECT id FROM user_stats))
            ),
            session_stats AS (
                -- SQLite CASE WHEN instead of FILTER
                SELECT 
                    COUNT(col.id) as total_sessions,
                    SUM(CASE WHEN col.is_active = 1 THEN 1 ELSE 0 END) as active_sessions
                FROM collaboration_sessions col
                WHERE (col.classroom_id IN ({classroom_placeholders})
                       OR col.owner_id IN (SELECT id FROM user_stats))
            )
            SELECT 
                -- Simplified aggregations for SQLite
                (SELECT COUNT(id) FROM user_stats) as total_users,
                (SELECT SUM(is_new_today) FROM user_stats) as new_users_today,
                COALESCE(ss.total_executions, 0) as total_executions,
                COALESCE(ss.executions_today, 0) as executions_today,
                COALESCE(ss.error_executions, 0) as error_executions,
                COALESCE(cs.total_sessions, 0) as total_sessions,
                COALESCE(cs.active_sessions, 0) as active_sessions,
                '{{}}' as language_counts
            FROM submission_stats ss 
            CROSS JOIN session_stats cs
        """)
    else:
        # PostgreSQL-compatible query
        stats_query = text(f"""
            WITH user_stats AS (
                -- Get classroom users efficiently
                SELECT 
                    u.id,
                    u.created_at,
                    CASE WHEN u.created_at >= :today_start THEN 1 ELSE 0 END as is_new_today
                FROM users u
                INNER JOIN user_classrooms uc ON u.id = uc.user_id
                WHERE uc.classroom_id IN ({classroom_placeholders})
                  AND uc.is_active = true
            ),
            submission_stats AS (
                -- PostgreSQL FILTER for better performance
                SELECT 
                    COUNT(cs.id) as total_executions,
                    COUNT(cs.id) FILTER (WHERE cs.created_at >= :today_start) as executions_today,
                    COUNT(cs.id) FILTER (WHERE cs.status = 'error') as error_executions
                FROM code_submissions cs
                WHERE (cs.classroom_id IN ({classroom_placeholders}) 
                       OR cs.user_id IN (SELECT id FROM user_stats))
            ),
            session_stats AS (
                -- PostgreSQL FILTER for better performance
                SELECT 
                    COUNT(col.id) as total_sessions,
                    COUNT(col.id) FILTER (WHERE col.is_active = true) as active_sessions
                FROM collaboration_sessions col
                WHERE (col.classroom_id IN ({classroom_placeholders})
                       OR col.owner_id IN (SELECT id FROM user_stats))
            ),
            language_stats AS (
                -- Language stats with PostgreSQL JSONB
                SELECT 
                    jsonb_object_agg(language, lang_count) as language_counts
                FROM (
                    SELECT 
                        cs.language,
                        COUNT(cs.id) as lang_count
                    FROM code_submissions cs
                    WHERE (cs.classroom_id IN ({classroom_placeholders}) 
                           OR cs.user_id IN (SELECT id FROM user_stats))
                      AND cs.language IS NOT NULL
                    GROUP BY cs.language
                ) lang_summary
            )
            SELECT 
                -- Simplified aggregations
                (SELECT COUNT(id) FROM user_stats) as total_users,
                (SELECT SUM(is_new_today) FROM user_stats) as new_users_today,
                COALESCE(ss.total_executions, 0) as total_executions,
                COALESCE(ss.executions_today, 0) as executions_today,
                COALESCE(ss.error_executions, 0) as error_executions,
                COALESCE(cs.total_sessions, 0) as total_sessions,
                COALESCE(cs.active_sessions, 0) as active_sessions,
                COALESCE(ls.language_counts, '{{}}'::jsonb) as language_counts
            FROM submission_stats ss 
            CROSS JOIN session_stats cs 
            CROSS JOIN language_stats ls
        """)
    
    # Build parameter dict with individual classroom IDs
    params = {'today_start': today_start}
    for i, classroom_id in enumerate(classroom_ids):
        params[f'classroom_id_{i}'] = classroom_id
    
    # Execute with individual parameters
    result = db.execute(stats_query, params).fetchone()
    
    # Calculate error rate
    total_executions = result.total_executions or 0
    error_executions = result.error_executions or 0
    error_rate = (error_executions / total_executions * 100) if total_executions > 0 else 0
    
    # Handle language statistics - database-agnostic approach
    if is_sqlite:
        # For SQLite, manually query language stats since we couldn't do jsonb_object_agg
        language_query = text(f"""
            SELECT 
                cs.language,
                COUNT(cs.id) as lang_count
            FROM code_submissions cs
            INNER JOIN user_classrooms uc ON cs.user_id = uc.user_id
            WHERE uc.classroom_id IN ({classroom_placeholders})
              AND uc.is_active = 1
              AND cs.language IS NOT NULL
            GROUP BY cs.language
            ORDER BY lang_count DESC
            LIMIT 5
        """)
        
        language_results = db.execute(language_query, params).fetchall()
        popular_languages = [
            {"language": row.language, "count": row.lang_count}
            for row in language_results
        ]
    else:
        # PostgreSQL - process JSONB result
        language_counts = result.language_counts or {}
        if isinstance(language_counts, str):
            import json
            try:
                language_counts = json.loads(language_counts)
            except:
                language_counts = {}
        
        popular_languages = [
            {"language": lang, "count": count}
            for lang, count in sorted(language_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]
    
    stats_data = {
        "total_users": result.total_users or 0,
        "total_code_executions": total_executions,
        "total_collaboration_sessions": result.total_sessions or 0,
        "active_sessions": result.active_sessions or 0,
        "executions_today": result.executions_today or 0,
        "new_users_today": result.new_users_today or 0,
        "error_rate_percentage": round(error_rate, 2),
        "popular_languages": popular_languages
    }
    
    # Cache the results
    admin_cache.cache_admin_stats(classroom_ids, stats_data)
    
    total_time = time.time() - start_time
    logger.info(f"Admin stats request completed in {total_time:.3f}s for user {admin_user.id}")
    
    return AdminStatsResponse(**stats_data)

@router.get("/admin/activities", response_model=UserActivityResponse)
@railway_performance_monitor("admin_activities")
async def get_user_activities(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    activity_type: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    user_email: Optional[str] = Query(None),
    user_name: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all user activities with filtering - Optimized for Railway PostgreSQL"""
    from app.services.admin_cache_service import admin_cache
    
    # Parse dates
    date_from_dt = None
    date_to_dt = None
    
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")
    
    # Get classroom IDs
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return UserActivityResponse(activities=[], total=0, page=page, page_size=page_size)
    
    # Build cache key for filtering
    filter_params = {
        'classroom_ids': sorted(classroom_ids),
        'activity_type': activity_type,
        'user_id': user_id,
        'user_email': user_email,
        'user_name': user_name,
        'date_from': date_from,
        'date_to': date_to,
        'status': status,
        'page': page,
        'page_size': page_size
    }
    
    # Temporarily disable cache for activities to prevent Pydantic errors
    # TODO: Re-enable after cache serialization is confirmed working
    cached_activities = None  # admin_cache.get_cached_user_activities(filter_params)
    if cached_activities:
        # Ensure cached data is in the correct format
        try:
            return UserActivityResponse(**cached_activities)
        except Exception as cache_error:
            logger.warning(f"Cache data format error, ignoring cache: {cache_error}")
            # Continue with fresh query if cached data is invalid
    
    # Simplified approach: Get classroom users first, then fetch activities separately
    # This is more likely to use indexes properly
    
    # First, get the user IDs in classrooms for filtering (explicit scalar subquery to avoid warning)
    classroom_user_ids_query = db.query(User.id).join(UserClassroom).filter(
        UserClassroom.classroom_id.in_(classroom_ids),
        UserClassroom.is_active == True
    ).distinct().scalar_subquery()
    
    # Use simplified individual queries that can leverage indexes
    all_activities = []
    total = 0

    # Get code executions if requested
    if not activity_type or activity_type == "code_execution":
        exec_query = db.query(
            CodeSubmission.id,
            CodeSubmission.user_id,
            User.username,
            User.email,
            CodeSubmission.language,
            func.coalesce(func.length(CodeSubmission.code), 0).label('code_size'),
            CodeSubmission.execution_time,
            CodeSubmission.input_data,
            CodeSubmission.created_at,
            CodeSubmission.status,
            CodeSubmission.error_message
        ).join(User, CodeSubmission.user_id == User.id, isouter=True).filter(
            or_(
                CodeSubmission.classroom_id.in_(classroom_ids),
                and_(
                    CodeSubmission.classroom_id.is_(None),
                    CodeSubmission.user_id.in_(classroom_user_ids_query)
                )
            )
        )
        
        # Apply filters
        if user_id:
            exec_query = exec_query.filter(CodeSubmission.user_id == user_id)
        if user_email:
            exec_query = exec_query.filter(User.email == user_email)
        if user_name:
            exec_query = exec_query.filter(User.username == user_name)
        if status:
            exec_query = exec_query.filter(CodeSubmission.status == status)
        if date_from_dt:
            exec_query = exec_query.filter(CodeSubmission.created_at >= date_from_dt)
        if date_to_dt:
            exec_query = exec_query.filter(CodeSubmission.created_at <= date_to_dt)
        
        total = exec_query.count()
        executions = exec_query.order_by(
            desc(CodeSubmission.created_at)
        ).offset((page - 1) * page_size).limit(page_size).all()

        for exec_row in executions:
            all_activities.append({
                "id": exec_row.id,
                "user_id": exec_row.user_id,
                "username": exec_row.username or "Anonymous",
                "email": exec_row.email,
                "activity_type": "code_execution",
                "activity_data": {
                    "language": exec_row.language,
                    "code_size": exec_row.code_size,
                    "execution_time": exec_row.execution_time,
                    "input_data": bool(exec_row.input_data)
                },
                "timestamp": exec_row.created_at,
                "status": exec_row.status,
                "error_message": exec_row.error_message
            })

    paginated_activities = all_activities

    # Convert to UserActivityItem objects
    activities = []
    for activity in paginated_activities:
        activities.append(UserActivityItem(
            id=activity["id"],
            user_id=activity["user_id"],
            username=activity["username"],
            email=activity["email"],
            activity_type=activity["activity_type"],
            activity_data=activity["activity_data"],
            timestamp=safe_datetime_format(activity["timestamp"]),
            status=activity["status"],
            error_message=activity["error_message"]
        ))
    
    result = {
        "activities": activities,
        "total": total,
        "page": page,
        "page_size": page_size
    }
    
    # Temporarily disable caching to prevent serialization issues
    # TODO: Re-enable after cache serialization is confirmed working
    # admin_cache.cache_user_activities(filter_params, result)
    
    return UserActivityResponse(**result)

@router.get("/admin/users", response_model=List[dict])
@railway_performance_monitor("admin_users")
async def get_all_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get classroom-scoped users with basic info - Optimized for Railway PostgreSQL"""
    
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return []
    
    # Build database-agnostic query with dynamic IN clause
    offset = (page - 1) * page_size
    
    # Create placeholders for IN clause (SQLite/PostgreSQL compatible)
    classroom_placeholders = ','.join([f':classroom_id_{i}' for i in range(len(classroom_ids))])
    
    user_query = text(f"""
        SELECT DISTINCT
            u.id,
            u.username,
            u.email,
            u.full_name,
            u.is_active,
            u.is_verified,
            u.created_at,
            u.last_login,
            COALESCE(cs.execution_count, 0) as code_executions,
            COALESCE(col.session_count, 0) as collaboration_sessions
        FROM users u
        INNER JOIN user_classrooms uc ON u.id = uc.user_id
        LEFT JOIN (
            SELECT user_id, COUNT(id) as execution_count
            FROM code_submissions
            WHERE (classroom_id IN ({classroom_placeholders}) OR user_id IN (
                SELECT DISTINCT user_id FROM user_classrooms 
                WHERE classroom_id IN ({classroom_placeholders}) AND is_active = true
            ))
            GROUP BY user_id
        ) cs ON u.id = cs.user_id
        LEFT JOIN (
            SELECT owner_id, COUNT(id) as session_count
            FROM collaboration_sessions
            WHERE (classroom_id IN ({classroom_placeholders}) OR owner_id IN (
                SELECT DISTINCT user_id FROM user_classrooms 
                WHERE classroom_id IN ({classroom_placeholders}) AND is_active = true
            ))
            GROUP BY owner_id
        ) col ON u.id = col.owner_id
        WHERE uc.classroom_id IN ({classroom_placeholders})
          AND uc.is_active = true
          AND (:search IS NULL OR 
               u.username LIKE :search_pattern OR 
               u.email LIKE :search_pattern OR 
               u.full_name LIKE :search_pattern)
        ORDER BY u.created_at DESC
        LIMIT :page_size OFFSET :offset
    """)
    
    search_pattern = f"%{search}%" if search else None
    
    # Build parameters dictionary with individual classroom IDs
    params = {
        'search': search,
        'search_pattern': search_pattern,
        'page_size': page_size,
        'offset': offset
    }
    
    # Add individual classroom ID parameters
    for i, classroom_id in enumerate(classroom_ids):
        params[f'classroom_id_{i}'] = classroom_id
    
    results = db.execute(user_query, params).fetchall()
    
    return [
        {
            "id": row.id,
            "username": row.username,
            "email": row.email,
            "full_name": row.full_name,
            "is_active": row.is_active,
            "is_verified": row.is_verified,
            "created_at": safe_datetime_format(row.created_at) or "",
            "last_login": safe_datetime_format(row.last_login),
            "code_executions": row.code_executions,
            "collaboration_sessions": row.collaboration_sessions
        }
        for row in results
    ]

@router.get("/admin/users/{user_id}", response_model=UserDetailsResponse)
async def get_user_details(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get detailed information about a specific user"""
    
    # POSTGRESQL OPTIMIZED: Select only needed columns, not SELECT *
    user = db.query(
        User.id, User.username, User.email, User.full_name,
        User.is_active, User.is_verified, User.created_at, User.last_login,
        User.is_superuser, User.bio, User.avatar_url
    ).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get counts efficiently - COUNT doesn't need to pull all columns
    execution_count = db.query(func.count(CodeSubmission.id)).filter(
        CodeSubmission.user_id == user_id
    ).scalar()
    
    session_count = db.query(func.count(CollaborationSession.id)).filter(
        CollaborationSession.owner_id == user_id
    ).scalar()
    
    # Get recent activity - only needed columns, not SELECT *
    recent_executions = db.query(
        CodeSubmission.id, CodeSubmission.user_id, CodeSubmission.language,
        CodeSubmission.status, CodeSubmission.execution_time,
        CodeSubmission.created_at, CodeSubmission.error_message,
        func.coalesce(func.length(CodeSubmission.code), 0).label('code_size')
    ).filter(
        CodeSubmission.user_id == user_id
    ).order_by(desc(CodeSubmission.created_at)).limit(10).all()

    recent_activity = []
    for execution in recent_executions:
        recent_activity.append(UserActivityItem(
            id=execution.id,
            user_id=execution.user_id,
            username=user.username,
            email=user.email,
            activity_type="code_execution",
            activity_data={
                "language": execution.language,
                "code_size": execution.code_size,
                "execution_time": execution.execution_time
            },
            timestamp=safe_datetime_format(execution.created_at) or "",
            status=execution.status,
            error_message=execution.error_message
        ))
    
    user_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "is_superuser": user.is_superuser,
        "created_at": safe_datetime_format(user.created_at) or "",
        "last_login": safe_datetime_format(user.last_login),
        "bio": user.bio,
        "avatar_url": user.avatar_url
    }
    
    return UserDetailsResponse(
        user=user_data,
        code_executions=execution_count,
        collaboration_sessions=session_count,
        recent_activity=recent_activity
    )

@router.delete("/admin/users/{user_id}")
async def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Deactivate a user account"""
    
    # POSTGRESQL OPTIMIZED: Select only needed columns
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if admin_service.has_admin_access(user):
        raise HTTPException(status_code=400, detail="Cannot deactivate admin user")
    
    # Update only the is_active field
    db.query(User).filter(User.id == user_id).update({"is_active": False})
    db.commit()
    
    return {"message": f"User {user.username} has been deactivated"}


@router.post("/admin/users/{user_id}/promote")
async def promote_user_to_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Promote a user to admin role"""
    user = admin_service.promote_to_admin(db, user_id, admin_user)
    return {
        "message": f"User {user.username} has been promoted to admin",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "is_admin": user.is_admin
        }
    }


@router.post("/admin/users/{user_id}/demote")
async def demote_user_from_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Demote a user from admin role"""
    user = admin_service.demote_from_admin(db, user_id, admin_user)
    return {
        "message": f"User {user.username} has been demoted from admin",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "is_admin": user.is_admin
        }
    }


@router.get("/admin/users/admins")
async def get_admin_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all users with admin privileges"""
    admins = admin_service.get_admin_users(db)
    return {
        "admins": [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role.value,
                "is_admin": user.is_admin,
                "is_superuser": user.is_superuser,
                "is_initial_admin": admin_service.is_initial_admin_email(user.email)
            }
            for user in admins
        ]
    }


# Admin Settings Endpoints

@router.get("/admin/settings")
async def get_admin_settings(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get current admin settings for user's primary classroom (Admin only)"""
    try:
        classroom_ids = get_user_classroom_ids(admin_user)
        if not classroom_ids:
            raise HTTPException(
                status_code=404,
                detail="No classroom found for user"
            )
        
        # Use the first classroom for admin settings
        primary_classroom_id = classroom_ids[0]
        settings = AdminSettings.get_or_create_default(db, primary_classroom_id)
        
        return {
            "id": settings.id,
            "classroom_id": settings.classroom_id,
            "copy_paste_enabled": settings.copy_paste_enabled,
            "updated_by": settings.updated_by,
            "updated_at": settings.updated_at,
            "notes": settings.notes
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get admin settings: {str(e)}"
        )


class AdminSettingsUpdate(BaseModel):
    copy_paste_enabled: bool
    notes: Optional[str] = None

# Admin User Management Models  
class AdminResetUsernameRequest(BaseModel):
    user_id: int
    new_username: str

class TempPasswordResponse(BaseModel):
    message: str
    temp_password: str
    expires_in_hours: int = 24

# AI Grading Models
class BatchGradingRequest(BaseModel):
    template_info: dict  # Template details (name, description, language)
    submissions: List[dict]  # List of submissions with masked data
    grade_scale: int  # 10, 50, or 100
    leniency: int  # 0-100
    enable_robustness: bool = False  # Advanced: edge case handling
    enable_quality: bool = False  # Advanced: code style, naming

class BatchGradingResponse(BaseModel):
    success: bool
    grades: dict  # username -> grade mapping
    reasoning: Optional[str] = None
    errors: List[str] = []
    batches_processed: int = 1


@router.put("/admin/settings")
async def update_admin_settings(
    settings_update: AdminSettingsUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Update admin settings for user's primary classroom (Admin only)"""
    try:
        classroom_ids = get_user_classroom_ids(admin_user)
        if not classroom_ids:
            raise HTTPException(
                status_code=404,
                detail="No classroom found for user"
            )
        
        # Use the first classroom for admin settings
        primary_classroom_id = classroom_ids[0]
        admin_settings = AdminSettings.get_or_create_default(db, primary_classroom_id)
        
        # Update settings
        admin_settings.copy_paste_enabled = settings_update.copy_paste_enabled
        admin_settings.updated_by = admin_user.username
        if settings_update.notes is not None:
            admin_settings.notes = settings_update.notes
            
        db.commit()
        db.refresh(admin_settings)
        
        # Broadcast settings change to classroom-specific clients via websocket service
        try:
            websocket_url = f"{settings.websocket_service_url}/api/broadcast/admin-settings"  # WebSocket service URL
            broadcast_data = {
                "event": "admin_settings_changed",
                "classroom_id": primary_classroom_id,
                "data": {
                    "copy_paste_enabled": admin_settings.copy_paste_enabled,
                    "updated_by": admin_user.username,
                    "classroom_id": primary_classroom_id
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(websocket_url, json=broadcast_data, timeout=5.0)
                if response.status_code == 200:
                    print(f"✅ Successfully broadcasted admin settings change to websocket service")
                else:
                    print(f"⚠️ Failed to broadcast admin settings change: {response.status_code}")
        except Exception as broadcast_error:
            print(f"⚠️ Failed to broadcast admin settings change: {str(broadcast_error)}")
            # Don't fail the request if broadcast fails
        
        return {
            "message": "Admin settings updated successfully",
            "settings": {
                "id": admin_settings.id,
                "copy_paste_enabled": admin_settings.copy_paste_enabled,
                "updated_by": admin_settings.updated_by,
                "updated_at": admin_settings.updated_at,
                "notes": admin_settings.notes
            }
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update admin settings: {str(e)}"
        )

# Per-classroom admin settings endpoints
@router.get("/admin/classrooms/{classroom_id}/settings")
async def get_classroom_admin_settings(
    classroom_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get admin settings for a specific classroom (Admin only)"""
    try:
        # Validate admin has access to this classroom
        classroom_ids = get_user_classroom_ids(admin_user)
        if classroom_id not in classroom_ids:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this classroom"
            )
        
        settings = AdminSettings.get_or_create_default(db, classroom_id)
        
        return {
            "id": settings.id,
            "classroom_id": settings.classroom_id,
            "copy_paste_enabled": settings.copy_paste_enabled,
            "updated_by": settings.updated_by,
            "updated_at": settings.updated_at,
            "notes": settings.notes
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get admin settings: {str(e)}"
        )

@router.put("/admin/classrooms/{classroom_id}/settings")
async def update_classroom_admin_settings(
    classroom_id: int,
    settings_update: AdminSettingsUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Update admin settings for a specific classroom (Admin only)"""
    try:
        # Validate admin has access to this classroom
        classroom_ids = get_user_classroom_ids(admin_user)
        if classroom_id not in classroom_ids:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this classroom"
            )
        
        admin_settings = AdminSettings.get_or_create_default(db, classroom_id)
        
        # Update settings
        admin_settings.copy_paste_enabled = settings_update.copy_paste_enabled
        admin_settings.updated_by = admin_user.username
        if settings_update.notes is not None:
            admin_settings.notes = settings_update.notes
            
        db.commit()
        db.refresh(admin_settings)
        
        # Broadcast settings change to classroom-specific clients via websocket service
        try:
            websocket_url = f"{settings.websocket_service_url}/api/broadcast/admin-settings"
            broadcast_data = {
                "event": "admin_settings_changed",
                "classroom_id": classroom_id,
                "data": {
                    "copy_paste_enabled": admin_settings.copy_paste_enabled,
                    "updated_by": admin_user.username,
                    "classroom_id": classroom_id
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(websocket_url, json=broadcast_data, timeout=5.0)
                if response.status_code == 200:
                    print(f"✅ Successfully broadcasted admin settings change for classroom {classroom_id}")
                else:
                    print(f"⚠️ Failed to broadcast admin settings change for classroom {classroom_id}: {response.status_code}")
        except Exception as broadcast_error:
            print(f"⚠️ Failed to broadcast admin settings change for classroom {classroom_id}: {str(broadcast_error)}")
            # Don't fail the request if broadcast fails
        
        return {
            "message": "Admin settings updated successfully",
            "settings": {
                "id": admin_settings.id,
                "classroom_id": admin_settings.classroom_id,
                "copy_paste_enabled": admin_settings.copy_paste_enabled,
                "updated_by": admin_settings.updated_by,
                "updated_at": admin_settings.updated_at,
                "notes": admin_settings.notes
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update admin settings: {str(e)}"
        )


@router.get("/admin/settings/public")
async def get_public_admin_settings(
    db: Session = Depends(get_db)
):
    """Get public admin settings (no authentication required) - returns merged settings for all classrooms"""
    try:
        # POSTGRESQL OPTIMIZED: Get all classrooms - only need id
        classrooms = db.query(Classroom.id).all()
        if not classrooms:
            # Return defaults if no classrooms exist yet
            return {
                "copy_paste_enabled": True
            }
        
        # For public access, we need to decide on a policy:
        # If ANY classroom has copy-paste disabled, disable it globally
        # This ensures the most restrictive setting applies
        copy_paste_enabled = True
        
        for classroom in classrooms:
            # POSTGRESQL OPTIMIZED: Select only needed column
            settings = db.query(AdminSettings.copy_paste_enabled).filter(
                AdminSettings.classroom_id == classroom.id
            ).first()
            
            if settings and not settings.copy_paste_enabled:
                copy_paste_enabled = False
                break
        
        return {
            "copy_paste_enabled": copy_paste_enabled
        }
        
    except Exception as e:
        print(f"❌ Error in public admin settings: {str(e)}")
        # Return default values if settings can't be retrieved
        return {
            "copy_paste_enabled": True
        }

@router.get("/admin/settings/user")
async def get_user_admin_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get admin settings for the current user's classrooms (authenticated users only)
    
    Logic: If ANY classroom has copy-paste disabled, it should be disabled for the user.
    This ensures stricter security - professors can disable copy-paste for their class.
    """
    try:
        # Get user's classroom IDs
        classroom_memberships = db.query(UserClassroom).filter(
            UserClassroom.user_id == current_user.id,
            UserClassroom.is_active == True
        ).all()
        
        if not classroom_memberships:
            # Return defaults if user is not in any classroom - copy-paste ENABLED
            return {
                "copy_paste_enabled": True,
                "in_classroom": False
            }
        
        # Check ALL classrooms - if ANY has copy-paste disabled, disable it for user
        classroom_ids = [m.classroom_id for m in classroom_memberships]
        
        # Get settings for all user's classrooms in one query
        all_settings = db.query(AdminSettings).filter(
            AdminSettings.classroom_id.in_(classroom_ids)
        ).all()
        
        # Check if ANY classroom has copy-paste disabled
        copy_paste_enabled = True
        disabled_classroom_id = None
        
        for settings in all_settings:
            if not settings.copy_paste_enabled:
                copy_paste_enabled = False
                disabled_classroom_id = settings.classroom_id
                break  # Found one disabled, no need to check more
        
        # If no settings found for any classroom, create defaults (copy-paste enabled)
        if not all_settings:
            copy_paste_enabled = True
        
        return {
            "copy_paste_enabled": copy_paste_enabled,
            "in_classroom": True,
            "classroom_id": disabled_classroom_id or classroom_ids[0]
        }
        
    except Exception as e:
        print(f"❌ Error in user admin settings: {str(e)}")
        # Return default values if settings can't be retrieved
        return {
            "copy_paste_enabled": True,
            "in_classroom": False
        }

@router.post("/admin/users/{user_id}/activate")
async def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Activate a user account"""
    
    # POSTGRESQL OPTIMIZED: Select only needed columns
    user = db.query(User.id, User.is_active, User.username).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update only the is_active field
    db.query(User).filter(User.id == user_id).update({"is_active": True})
    db.commit()
    
    return {"message": f"User {user.username} has been activated"}

class TemplateExecutionItem(BaseModel):
    id: int
    user_id: Optional[int]
    username: Optional[str]
    email: Optional[str]
    full_name: Optional[str]
    template_id: Optional[int]
    template_name: Optional[str]
    code: str
    language: str
    input_data: Optional[str]
    output: Optional[str]
    error_message: Optional[str]
    execution_time: Optional[float]
    status: Optional[str]
    created_at: str
    executed_at: Optional[str]

class TemplateExecutionResponse(BaseModel):
    executions: List[TemplateExecutionItem]
    total: int
    page: int
    page_size: int

@router.get("/admin/template-executions", response_model=TemplateExecutionResponse)
async def get_template_executions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    template_id: Optional[int] = Query(None),
    template_name: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    user_name: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get template executions with filtering options"""
    
    # POSTGRESQL OPTIMIZED: Select only needed columns, not SELECT *
    query = db.query(
        CodeSubmission.id,
        CodeSubmission.user_id, 
        CodeSubmission.template_id,
        CodeSubmission.code,
        CodeSubmission.language,
        CodeSubmission.input_data,
        CodeSubmission.output,
        CodeSubmission.error_message,
        CodeSubmission.status,
        CodeSubmission.execution_time,
        CodeSubmission.created_at,
        CodeSubmission.executed_at,
        User.username,
        User.email,
        User.full_name,
        Template.name.label('template_name')
    ).join(User, CodeSubmission.user_id == User.id, isouter=True)
    query = query.join(Template, CodeSubmission.template_id == Template.id, isouter=True)
    
    # Apply filters
    filters = []
    
    if template_id:
        filters.append(CodeSubmission.template_id == template_id)
    
    if template_name:
        filters.append(Template.name == template_name)
    
    if user_email:
        filters.append(User.email == user_email)
    
    if user_name:
        filters.append(User.username == user_name)
    
    if language:
        filters.append(CodeSubmission.language == language)
    
    if status:
        filters.append(CodeSubmission.status == status)
    
    # Date filters
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            filters.append(CodeSubmission.created_at >= date_from_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            filters.append(CodeSubmission.created_at <= date_to_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")
    
    # Apply all filters
    if filters:
        query = query.filter(and_(*filters))
    
    # Get total count
    total = query.count()
    
    # Apply pagination and ordering
    offset = (page - 1) * page_size
    executions = query.order_by(desc(CodeSubmission.created_at)).offset(offset).limit(page_size).all()
    
    # Format response - use direct column access instead of relationships
    execution_items = []
    for execution in executions:
        execution_items.append(TemplateExecutionItem(
            id=execution.id,
            user_id=execution.user_id,
            username=execution.username,  # Direct column access
            email=execution.email,        # Direct column access
            full_name=execution.full_name,  # Direct column access
            template_id=execution.template_id,
            template_name=execution.template_name,  # Already labeled in query
            code=execution.code,
            language=execution.language,
            input_data=execution.input_data,
            output=execution.output,
            error_message=execution.error_message,
            execution_time=execution.execution_time,
            status=execution.status,
            created_at=safe_datetime_format(execution.created_at) or "",
            executed_at=safe_datetime_format(execution.executed_at)
        ))
    
    return TemplateExecutionResponse(
        executions=execution_items,
        total=total,
        page=page,
        page_size=page_size
    )

@router.get("/admin/templates-list")
async def get_templates_list(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get classroom-scoped templates for dropdown filter"""
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return {"templates": []}
    
    # POSTGRESQL OPTIMIZED: Select only needed columns for dropdown
    templates = db.query(Template.id, Template.name, Template.language).filter(
        Template.is_active == True,
        or_(
            Template.classroom_id.in_(classroom_ids),
            Template.classroom_id.is_(None)  # Include legacy templates
        )
    ).all()
    
    return {
        "templates": [
            {
                "id": template.id,
                "name": template.name,
                "language": template.language
            }
            for template in templates
        ]
    }

@router.get("/admin/users-list")
async def get_users_list(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get classroom-scoped users for dropdown filters"""
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return {"users": [], "usernames": [], "emails": []}
    
    # POSTGRESQL OPTIMIZED: Select only username and email, not SELECT *
    users = db.query(User.username, User.email).join(UserClassroom).filter(
        User.is_active == True,
        UserClassroom.classroom_id.in_(classroom_ids),
        UserClassroom.is_active == True
    ).distinct().all()
    
    # Get combined user data (username and email)
    combined_users = []
    for user in users:
        if user.username and user.email:
            combined_users.append({
                "username": user.username,
                "email": user.email,
                "display": f"{user.username} ({user.email})"
            })
    
    # Sort by username
    combined_users.sort(key=lambda x: x["username"])
    
    # For backward compatibility, also return separate arrays
    usernames = list(set([user.username for user in users if user.username]))
    emails = list(set([user.email for user in users if user.email]))
    
    return {
        "users": combined_users,
        "usernames": sorted(usernames),
        "emails": sorted(emails)
    }

@router.get("/admin/migration-status")
async def get_migration_status(
    admin_user: User = Depends(get_admin_user)
):
    """Get database migration and optimization status"""
    try:
        from app.services.database_migration_service import migration_service
        from app.services.railway_optimization_service import optimization_service
        
        migration_status = migration_service.get_migration_status()
        performance_report = optimization_service.get_performance_report()
        
        return {
            "success": True,
            "migration_status": migration_status,
            "performance_optimizations": {
                "applied": any(m.get("name") == "v1_performance_optimization" for m in migration_status.get("migrations", [])),
                "description": "Database indexes and performance optimizations for Railway.app deployment",
                "railway_optimizations": {
                    "version": performance_report.get("optimization_version"),
                    "connection_info": performance_report.get("database_connection_info"),
                    "cache_stats": performance_report.get("cache_stats"),
                    "query_metrics": performance_report.get("query_metrics")
                }
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "migration_status": {"migrations": []},
            "performance_optimizations": {"applied": False, "error": str(e)}
        }

@router.post("/admin/apply-optimizations")
async def apply_railway_optimizations(
    admin_user: User = Depends(get_admin_user)
):
    """Manually apply Railway.app optimizations"""
    try:
        from app.services.database_migration_service import migration_service
        from app.services.railway_optimization_service import optimization_service
        
        # Apply database migrations and optimizations
        migration_result = migration_service.apply_performance_optimizations()
        optimization_service.apply_railway_specific_optimizations()
        
        return {
            "success": True,
            "message": "Railway.app optimizations applied successfully",
            "migration_applied": migration_result
        }
    except Exception as e:
        logger.error(f"Error applying optimizations: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to apply optimizations"
        }

@router.get("/admin/debug-performance")
async def debug_performance(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Debug endpoint to check performance and optimization status"""
    import time
    
    debug_info = {
        "timestamp": datetime.utcnow().isoformat(),
        "tests": {},
        "database_info": {},
        "cache_info": {},
        "recommendations": []
    }
    
    try:
        # Test 1: Simple database connection - POSTGRESQL OPTIMIZED: Use pg_class for fast approximate count
        start_time = time.time()
        result = db.execute(text("""
            SELECT reltuples::bigint as count 
            FROM pg_class 
            WHERE relname = 'users'
        """)).fetchone()
        db_connection_time = time.time() - start_time
        debug_info["tests"]["db_connection"] = {
            "time_ms": round(db_connection_time * 1000, 2),
            "status": "ok" if db_connection_time < 0.1 else "slow",
            "user_count": result.count if result else 0
        }
        
        # Test 2: Check if indexes exist
        start_time = time.time()
        index_check = db.execute(text("""
            SELECT indexname, tablename 
            FROM pg_indexes 
            WHERE indexname LIKE 'idx_%' 
            AND schemaname = 'public'
            ORDER BY tablename, indexname
        """)).fetchall()
        index_check_time = time.time() - start_time
        
        debug_info["database_info"]["indexes"] = {
            "count": len(index_check),
            "time_ms": round(index_check_time * 1000, 2),
            "indexes": [f"{row.tablename}.{row.indexname}" for row in index_check[:10]]
        }
        
        # Test 3: Admin stats query performance
        classroom_ids = get_user_classroom_ids(admin_user)
        if classroom_ids:
            start_time = time.time()
            # POSTGRESQL OPTIMIZED: Use func.count for better performance
            user_count = db.query(func.count(User.id)).join(UserClassroom).filter(
                UserClassroom.classroom_id.in_(classroom_ids),
                UserClassroom.is_active == True
            ).scalar()
            admin_query_time = time.time() - start_time
            
            debug_info["tests"]["admin_user_count"] = {
                "time_ms": round(admin_query_time * 1000, 2),
                "status": "ok" if admin_query_time < 0.5 else "slow",
                "count": user_count
            }
        
        # Test 4: Redis cache connection
        try:
            from app.services.admin_cache_service import AdminCacheService
            cache_service = AdminCacheService()
            start_time = time.time()
            cache_service.redis_client.ping()
            cache_ping_time = time.time() - start_time
            
            debug_info["cache_info"] = {
                "connected": True,
                "ping_ms": round(cache_ping_time * 1000, 2)
            }
        except Exception as cache_error:
            debug_info["cache_info"] = {
                "connected": False,
                "error": str(cache_error)
            }
            debug_info["recommendations"].append("Redis cache not available - this will cause slow performance")
        
        # Test 5: Check migration status
        try:
            from app.services.database_migration_service import migration_service
            migration_status = migration_service.get_migration_status()
            
            performance_applied = any(
                m.get("name") == "v1_performance_optimization" 
                for m in migration_status.get("migrations", [])
            )
            
            debug_info["database_info"]["migrations"] = {
                "performance_optimization_applied": performance_applied,
                "total_migrations": len(migration_status.get("migrations", []))
            }
            
            if not performance_applied:
                debug_info["recommendations"].append(
                    "Performance optimization migration not applied - run POST /admin/apply-optimizations"
                )
                
        except Exception as migration_error:
            debug_info["database_info"]["migrations"] = {
                "error": str(migration_error)
            }
        
        # Generate recommendations
        if debug_info["tests"].get("db_connection", {}).get("time_ms", 0) > 100:
            debug_info["recommendations"].append("Database connection is slow - check Railway PostgreSQL performance")
        
        if debug_info["database_info"].get("indexes", {}).get("count", 0) < 10:
            debug_info["recommendations"].append("Few performance indexes found - run optimization migration")
        
        if not debug_info["cache_info"].get("connected", False):
            debug_info["recommendations"].append("Redis cache not connected - admin APIs will be very slow")
        
        return debug_info
        
    except Exception as e:
        logger.error(f"Debug performance error: {e}")
        return {
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
            "recommendations": ["Debug endpoint failed - check application logs"]
        }

@router.post("/admin/clear-cache")
async def clear_admin_cache(
    admin_user: User = Depends(get_admin_user)
):
    """Clear all admin cache data to fix serialization issues"""
    try:
        from app.services.admin_cache_service import AdminCacheService
        cache_service = AdminCacheService()
        
        if not cache_service.redis_available:
            return {
                "success": False,
                "message": "Redis cache not available"
            }
        
        # Clear all admin cache keys
        patterns_to_clear = [
            "admin_cache:*",
        ]
        
        total_cleared = 0
        for pattern in patterns_to_clear:
            cleared = cache_service.delete(pattern)
            total_cleared += cleared
            logger.info(f"Cleared {cleared} keys matching pattern: {pattern}")
        
        return {
            "success": True,
            "message": f"Successfully cleared {total_cleared} cache entries",
            "patterns_cleared": patterns_to_clear
        }
        
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to clear cache"
        }

@router.post("/admin/grade-submissions-batch", response_model=BatchGradingResponse)
async def grade_submissions_batch(
    request: BatchGradingRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """
    Grade multiple code submissions using AI with smart batching.
    Optimizes API calls by batching submissions based on token limits.
    
    Security Features:
    - Requires admin authentication with proper role verification
    - Rate limiting: 20 requests per admin per hour
    - Request size validation and limits
    - Security audit logging
    - Input validation and sanitization
    """
    try:
        # Extract client IP for security logging
        client_ip = get_client_ip(http_request)
        
        # Security audit log - request start
        security_logger.info(
            f"AI grading request initiated by admin user {admin_user.id} ({admin_user.username}) "
            f"from IP {client_ip}. Request contains {len(request.submissions)} submissions."
        )
        
        # Check rate limiting
        check_grading_rate_limit(admin_user.id, client_ip)
        
        # Comprehensive security validation
        validate_grading_request_security(request, admin_user)
        
        # Additional authentication verification (double-check admin status)
        if not admin_service.has_admin_access(admin_user):
            security_logger.warning(
                f"Unauthorized grading attempt by user {admin_user.id} ({admin_user.username}) "
                f"from IP {client_ip} - insufficient admin privileges"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient admin privileges for AI grading"
            )
        if not request.submissions:
            return BatchGradingResponse(
                success=True,
                grades={},
                reasoning="No submissions to grade",
                errors=[],
                batches_processed=0
            )
        
        # Validate grade scale
        if request.grade_scale not in [10, 50, 100]:
            raise HTTPException(
                status_code=400,
                detail="Grade scale must be 10, 50, or 100"
            )
        
        # Validate leniency
        if not (0 <= request.leniency <= 100):
            raise HTTPException(
                status_code=400,
                detail="Leniency must be between 0 and 100"
            )
        
        logger.info(f"Starting batch grading for {len(request.submissions)} submissions")
        
        # Calculate optimal batch size based on token limits (including template code)
        template_info_str = f"{request.template_info.get('name', '')} {request.template_info.get('description', '')} {request.template_info.get('code_content', '')}"
        optimal_batch_size = openai_service.calculate_batch_size(template_info_str, request.submissions)
        
        logger.info(f"Calculated optimal batch size: {optimal_batch_size}")
        
        # Split submissions into batches
        batches = []
        for i in range(0, len(request.submissions), optimal_batch_size):
            batch = request.submissions[i:i + optimal_batch_size]
            batches.append(batch)
        
        logger.info(f"Split into {len(batches)} batches")
        
        # Process each batch
        all_grades = {}
        all_errors = []
        successful_batches = 0
        
        for batch_num, batch in enumerate(batches, 1):
            logger.info(f"Processing batch {batch_num}/{len(batches)} with {len(batch)} submissions")
            
            try:
                # Process batch with AI
                batch_result = await openai_service.grade_code_batch(
                    template_info=request.template_info,
                    submissions=batch,
                    grade_scale=request.grade_scale,
                    leniency=request.leniency,
                    enable_robustness=request.enable_robustness,
                    enable_quality=request.enable_quality
                )
                
                if batch_result.get("available", False):
                    all_grades.update(batch_result.get("grades", {}))
                    if batch_result.get("errors"):
                        all_errors.extend(batch_result["errors"])
                    successful_batches += 1
                    logger.info(f"Batch {batch_num} completed successfully")
                else:
                    # AI service failed, no fallback
                    logger.warning(f"Batch {batch_num} failed: {batch_result.get('errors', ['AI grading failed'])}")
                    all_errors.extend(batch_result.get("errors", ["AI grading failed for this batch"]))
                
            except Exception as batch_error:
                logger.error(f"Error processing batch {batch_num}: {str(batch_error)}")
                # No fallback grading - just record the error
                all_errors.append(f"Batch {batch_num} failed: {str(batch_error)}")
        
        # Determine overall success - only successful if AI actually graded
        success = successful_batches > 0 and len(all_grades) > 0
        
        reasoning = f"Processed {len(batches)} batches. "
        if successful_batches == len(batches):
            reasoning += "All batches completed successfully with AI grading."
        elif successful_batches > 0:
            reasoning += f"{successful_batches}/{len(batches)} batches completed successfully with AI grading."
        else:
            reasoning += "AI grading failed for all batches."
        
        logger.info(f"Batch grading completed: {len(all_grades)} grades generated")
        
        # Security audit log - request completed successfully
        security_logger.info(
            f"AI grading request completed successfully for admin user {admin_user.id} "
            f"from IP {client_ip}. Generated {len(all_grades)} grades from {successful_batches}/{len(batches)} batches."
        )
        
        return BatchGradingResponse(
            success=success,
            grades=all_grades,
            reasoning=reasoning,
            errors=all_errors,
            batches_processed=len(batches)
        )
        
    except HTTPException as he:
        # Security audit log - request failed due to client error or authentication issue
        if he.status_code in [400, 401, 403, 429]:
            security_logger.warning(
                f"AI grading request rejected for admin user {admin_user.id if 'admin_user' in locals() else 'unknown'} "
                f"from IP {client_ip if 'client_ip' in locals() else 'unknown'}. "
                f"Status: {he.status_code}, Detail: {he.detail}"
            )
        raise
    except Exception as e:
        logger.error(f"Error in batch grading endpoint: {str(e)}")
        
        # Security audit log - unexpected error
        security_logger.error(
            f"AI grading request failed with unexpected error for admin user "
            f"{admin_user.id if 'admin_user' in locals() else 'unknown'} "
            f"from IP {client_ip if 'client_ip' in locals() else 'unknown'}. Error: {str(e)}"
        )
        
        raise HTTPException(
            status_code=500,
            detail="AI grading service temporarily unavailable"  # Don't expose internal error details
        )

# Admin Password Management Endpoints
@router.post("/admin/users/{user_id}/generate-temp-password", response_model=TempPasswordResponse)
async def generate_temp_password(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Generate temporary password for user (Admin only)"""
    try:
        temp_password = AuthService.admin_generate_temp_password(
            db=db,
            user_id=user_id,
            admin_user=admin_user
        )
        
        security_logger.info(
            f"Temporary password generated for user {user_id} by admin {admin_user.id}"
        )
        
        return TempPasswordResponse(
            message=f"Temporary password generated for user ID {user_id}",
            temp_password=temp_password,
            expires_in_hours=24
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating temp password: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate temporary password"
        )

@router.post("/admin/users/{user_id}/reset-username")
async def admin_reset_username(
    user_id: int,
    request: AdminResetUsernameRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Admin resets user username"""
    try:
        # Validate that the user_id in path matches the request body
        if user_id != request.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID in path must match user ID in request body"
            )

        # Get the target user
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
            
        # Validate new username format
        new_username = request.new_username.strip()
        if len(new_username) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be at least 3 characters long"
            )
            
        # Check if username already exists
        existing_user = db.query(User).filter(User.username == new_username).first()
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )

        old_username = target_user.username
        
        # Update the user's username
        target_user.username = new_username
        db.commit()
        
        security_logger.info(
            f"Admin {admin_user.id} ({admin_user.username}) reset username for user {user_id} from '{old_username}' to '{new_username}'"
        )
        
        return {"message": f"Username successfully changed from '{old_username}' to '{new_username}'"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting username: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset username"
        )
        
@router.post("/admin/users/{user_id}/force-logout")
async def admin_force_logout_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Admin forces user logout (invalidates all user sessions)"""
    try:
        # Get the target user
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        target_user.token_version = (target_user.token_version or 0) + 1
        db.commit()

        security_logger.info(
            f"Admin {admin_user.id} ({admin_user.username}) forced logout for user {user_id} ({target_user.username})"
        )
        
        return {"message": f"User {target_user.username} has been logged out of all sessions"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error forcing user logout: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to force logout user"
        )
