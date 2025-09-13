"""
Analytics API endpoints for user and admin analytics
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database.base import get_db
from app.models.user import User
from app.routers.auth import get_current_user, get_admin_user
from app.services.analytics_service import AnalyticsService

router = APIRouter(tags=["analytics"])


@router.get("/analytics/user/personal")
async def get_personal_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get personal analytics for the current user"""
    try:
        analytics_data = AnalyticsService.get_user_analytics(db, current_user.id)
        return {
            "success": True,
            "data": analytics_data
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get personal analytics: {str(e)}"
        )


@router.get("/analytics/admin/overview")
async def get_admin_analytics_overview(
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get analytics overview for admin - all classrooms and students"""
    try:
        analytics_data = AnalyticsService.get_admin_analytics_overview(db, admin_user)
        return {
            "success": True,
            "data": analytics_data
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get admin analytics overview: {str(e)}"
        )


@router.get("/analytics/admin/student/{student_id}")
async def get_student_analytics_for_admin(
    student_id: int,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get detailed analytics for a specific student (admin view)"""
    try:
        analytics_data = AnalyticsService.get_student_analytics_for_admin(
            db, admin_user, student_id
        )
        
        if "error" in analytics_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=analytics_data["error"]
            )
        
        return {
            "success": True,
            "data": analytics_data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get student analytics: {str(e)}"
        )


@router.get("/analytics/admin/classroom/{classroom_id}")
async def get_classroom_analytics(
    classroom_id: int,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get detailed analytics for a specific classroom"""
    try:
        analytics_data = AnalyticsService.get_classroom_analytics(
            db, admin_user, classroom_id
        )
        
        if "error" in analytics_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=analytics_data["error"]
            )
        
        return {
            "success": True,
            "data": analytics_data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get classroom analytics: {str(e)}"
        )


@router.get("/analytics/admin/students")
async def get_filtered_student_analytics(
    classroom_id: Optional[int] = Query(None, description="Filter by classroom ID"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level: low, medium, high"),
    min_success_rate: Optional[float] = Query(None, description="Minimum success rate filter"),
    max_success_rate: Optional[float] = Query(None, description="Maximum success rate filter"),
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get filtered student analytics with various filter options"""
    try:
        # Get base overview data
        analytics_data = AnalyticsService.get_admin_analytics_overview(db, admin_user.id)
        
        students = analytics_data["student_performance"]
        
        # Apply filters
        if classroom_id is not None:
            # Get students in specific classroom
            classroom_analytics = AnalyticsService.get_classroom_analytics(
                db, admin_user.id, classroom_id
            )
            if "error" not in classroom_analytics:
                students = classroom_analytics["student_performance"]
            else:
                students = []
        
        if risk_level is not None:
            students = [s for s in students if s["risk_level"] == risk_level]
        
        if min_success_rate is not None:
            students = [s for s in students if s["success_rate"] >= min_success_rate]
            
        if max_success_rate is not None:
            students = [s for s in students if s["success_rate"] <= max_success_rate]
        
        return {
            "success": True,
            "data": {
                "filtered_students": students,
                "filter_summary": {
                    "total_students": len(students),
                    "classroom_id": classroom_id,
                    "risk_level": risk_level,
                    "success_rate_range": f"{min_success_rate or 0}-{max_success_rate or 100}%"
                }
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get filtered student analytics: {str(e)}"
        )
