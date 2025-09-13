"""
Analytics Service - Business logic for generating user and admin analytics
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_
from app.models.template import Template, TemplateSubmission
from app.models.user import User
from app.models.classroom import Classroom, UserClassroom
from app.models.code_submission import CodeSubmission


class AnalyticsService:
    """Service for generating analytics data for users and admins"""
    
    @staticmethod
    def get_user_analytics(db: Session, user_id: int) -> Dict[str, Any]:
        """Get comprehensive analytics for a specific user"""
        
        # Get template submissions
        template_submissions = db.query(TemplateSubmission).filter(
            TemplateSubmission.user_id == user_id
        ).all()
        
        # Get code executions  
        code_executions = db.query(CodeSubmission).filter(
            CodeSubmission.user_id == user_id
        ).all()
        
        # Calculate basic metrics
        total_submissions = len(template_submissions)
        successful_submissions = len([s for s in template_submissions if s.status == "success"])
        success_rate = (successful_submissions / total_submissions * 100) if total_submissions > 0 else 0
        
        total_executions = len(code_executions)
        successful_executions = len([e for e in code_executions if e.status == "success"])
        execution_success_rate = (successful_executions / total_executions * 100) if total_executions > 0 else 0
        
        # Language breakdown
        language_stats = {}
        for submission in template_submissions:
            lang = submission.language or "unknown"
            if lang not in language_stats:
                language_stats[lang] = {"total": 0, "successful": 0}
            language_stats[lang]["total"] += 1
            if submission.status == "success":
                language_stats[lang]["successful"] += 1
        
        # Calculate language success rates
        for lang in language_stats:
            total = language_stats[lang]["total"]
            successful = language_stats[lang]["successful"]
            language_stats[lang]["success_rate"] = (successful / total * 100) if total > 0 else 0
        
        # Performance over time (last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        recent_submissions = [s for s in template_submissions if s.submitted_at and 
                            (s.submitted_at.replace(tzinfo=timezone.utc) if s.submitted_at.tzinfo is None else s.submitted_at) >= thirty_days_ago]
        
        # Group by week for trend analysis
        weekly_performance = {}
        for submission in recent_submissions:
            # Ensure timezone-aware datetime
            submit_time = submission.submitted_at.replace(tzinfo=timezone.utc) if submission.submitted_at.tzinfo is None else submission.submitted_at
            week_start = submit_time.replace(hour=0, minute=0, second=0, microsecond=0)
            week_start -= timedelta(days=week_start.weekday())
            week_key = week_start.strftime("%Y-%m-%d")
            
            if week_key not in weekly_performance:
                weekly_performance[week_key] = {"total": 0, "successful": 0}
            
            weekly_performance[week_key]["total"] += 1
            if submission.status == "success":
                weekly_performance[week_key]["successful"] += 1
        
        # Convert to trend data
        performance_trend = []
        for week_key in sorted(weekly_performance.keys()):
            data = weekly_performance[week_key]
            success_rate = (data["successful"] / data["total"] * 100) if data["total"] > 0 else 0
            performance_trend.append({
                "date": week_key,
                "success_rate": round(success_rate, 1),
                "total_submissions": data["total"]
            })
        
        # Average execution time
        execution_times = [s.execution_time for s in template_submissions if s.execution_time is not None]
        avg_execution_time = sum(execution_times) / len(execution_times) if execution_times else 0
        
        # Current streak (consecutive successful submissions from most recent)
        current_streak = 0
        for submission in sorted(template_submissions, key=lambda x: x.submitted_at, reverse=True):
            if submission.status == "success":
                current_streak += 1
            else:
                break
        
        # Activity heatmap data (last 90 days)
        ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)
        recent_activity = [s for s in template_submissions if s.submitted_at and 
                         (s.submitted_at.replace(tzinfo=timezone.utc) if s.submitted_at.tzinfo is None else s.submitted_at) >= ninety_days_ago]
        
        activity_heatmap = {}
        for submission in recent_activity:
            # Ensure timezone-aware datetime
            submit_time = submission.submitted_at.replace(tzinfo=timezone.utc) if submission.submitted_at.tzinfo is None else submission.submitted_at
            date_key = submit_time.strftime("%Y-%m-%d")
            if date_key not in activity_heatmap:
                activity_heatmap[date_key] = 0
            activity_heatmap[date_key] += 1
        
        return {
            "overview": {
                "total_submissions": total_submissions,
                "successful_submissions": successful_submissions,
                "success_rate": round(success_rate, 1),
                "total_executions": total_executions,
                "execution_success_rate": round(execution_success_rate, 1),
                "average_execution_time": round(avg_execution_time, 2),
                "current_streak": current_streak,
                "languages_used": len(language_stats)
            },
            "language_performance": language_stats,
            "performance_trend": performance_trend,
            "activity_heatmap": activity_heatmap,
            "recent_submissions": len(recent_submissions)
        }
    
    @staticmethod
    def get_admin_analytics_overview(db: Session, admin_user_id: int) -> Dict[str, Any]:
        """Get analytics overview for admin dashboard"""
        
        # Get classrooms created by this admin
        admin_classrooms = db.query(Classroom).filter(
            Classroom.created_by_id == admin_user_id,
            Classroom.is_active == True
        ).all()
        
        classroom_ids = [c.id for c in admin_classrooms]
        
        # Get all students in admin's classrooms
        student_memberships = db.query(UserClassroom).filter(
            UserClassroom.classroom_id.in_(classroom_ids),
            UserClassroom.role == "STUDENT",
            UserClassroom.is_active == True
        ).all()
        
        student_ids = [m.user_id for m in student_memberships]
        
        # Get all template submissions from these students
        all_submissions = db.query(TemplateSubmission).filter(
            TemplateSubmission.user_id.in_(student_ids)
        ).all() if student_ids else []
        
        # Calculate class-wide metrics
        total_submissions = len(all_submissions)
        successful_submissions = len([s for s in all_submissions if s.status == "success"])
        class_success_rate = (successful_submissions / total_submissions * 100) if total_submissions > 0 else 0
        
        # Language performance across all students
        language_stats = {}
        for submission in all_submissions:
            lang = submission.language or "unknown"
            if lang not in language_stats:
                language_stats[lang] = {"total": 0, "successful": 0}
            language_stats[lang]["total"] += 1
            if submission.status == "success":
                language_stats[lang]["successful"] += 1
        
        for lang in language_stats:
            total = language_stats[lang]["total"]
            successful = language_stats[lang]["successful"]
            language_stats[lang]["success_rate"] = (successful / total * 100) if total > 0 else 0
        
        # Student performance summary
        student_performance = []
        for student_id in student_ids:
            student = db.query(User).filter(User.id == student_id).first()
            if not student:
                continue
                
            student_submissions = [s for s in all_submissions if s.user_id == student_id]
            student_total = len(student_submissions)
            student_successful = len([s for s in student_submissions if s.status == "success"])
            student_success_rate = (student_successful / student_total * 100) if student_total > 0 else 0
            
            # Calculate risk level
            risk_level = "low"
            if student_success_rate < 50:
                risk_level = "high"
            elif student_success_rate < 70:
                risk_level = "medium"
            
            # Last activity
            last_submission = max(student_submissions, key=lambda x: x.submitted_at) if student_submissions else None
            last_active = last_submission.submitted_at if last_submission else None
            
            student_performance.append({
                "user_id": student.id,
                "username": student.username,
                "full_name": student.full_name,
                "email": student.email,
                "total_submissions": student_total,
                "successful_submissions": student_successful,
                "success_rate": round(student_success_rate, 1),
                "risk_level": risk_level,
                "last_active": last_active.isoformat() if last_active else None
            })
        
        return {
            "overview": {
                "total_students": len(student_ids),
                "total_classrooms": len(admin_classrooms),
                "total_submissions": total_submissions,
                "class_success_rate": round(class_success_rate, 1),
                "active_languages": len(language_stats)
            },
            "language_performance": language_stats,
            "student_performance": sorted(student_performance, key=lambda x: x["success_rate"]),
            "classrooms": [
                {
                    "id": c.id,
                    "name": c.name,
                    "classroom_key": c.classroom_key,
                    "member_count": len([m for m in student_memberships if m.classroom_id == c.id])
                }
                for c in admin_classrooms
            ]
        }
    
    @staticmethod
    def get_student_analytics_for_admin(db: Session, admin_user_id: int, student_id: int) -> Dict[str, Any]:
        """Get detailed analytics for a specific student (admin view)"""
        
        # Verify admin has access to this student
        admin_classrooms = db.query(Classroom).filter(
            Classroom.created_by_id == admin_user_id,
            Classroom.is_active == True
        ).all()
        
        classroom_ids = [c.id for c in admin_classrooms]
        
        student_in_classroom = db.query(UserClassroom).filter(
            UserClassroom.user_id == student_id,
            UserClassroom.classroom_id.in_(classroom_ids),
            UserClassroom.role == "STUDENT",
            UserClassroom.is_active == True
        ).first()
        
        if not student_in_classroom:
            return {"error": "Student not found in your classrooms"}
        
        # Get student info
        student = db.query(User).filter(User.id == student_id).first()
        if not student:
            return {"error": "Student not found"}
        
        # Get student analytics (same as user view but with additional context)
        student_analytics = AnalyticsService.get_user_analytics(db, student_id)
        
        # Add class comparison data
        # Get all students in the same classrooms for comparison
        all_students_in_classrooms = db.query(UserClassroom).filter(
            UserClassroom.classroom_id.in_(classroom_ids),
            UserClassroom.role == "STUDENT",
            UserClassroom.is_active == True
        ).all()
        
        all_student_ids = [m.user_id for m in all_students_in_classrooms]
        
        # Calculate class averages
        all_submissions = db.query(TemplateSubmission).filter(
            TemplateSubmission.user_id.in_(all_student_ids)
        ).all()
        
        class_total = len(all_submissions)
        class_successful = len([s for s in all_submissions if s.status == "success"])
        class_average_success_rate = (class_successful / class_total * 100) if class_total > 0 else 0
        
        student_analytics["student_info"] = {
            "id": student.id,
            "username": student.username,
            "full_name": student.full_name,
            "email": student.email
        }
        
        student_analytics["class_comparison"] = {
            "class_average_success_rate": round(class_average_success_rate, 1),
            "student_vs_class": round(student_analytics["overview"]["success_rate"] - class_average_success_rate, 1)
        }
        
        return student_analytics
    
    @staticmethod
    def get_classroom_analytics(db: Session, admin_user_id: int, classroom_id: int) -> Dict[str, Any]:
        """Get detailed analytics for a specific classroom"""
        
        # Verify admin owns this classroom
        classroom = db.query(Classroom).filter(
            Classroom.id == classroom_id,
            Classroom.created_by_id == admin_user_id,
            Classroom.is_active == True
        ).first()
        
        if not classroom:
            return {"error": "Classroom not found or access denied"}
        
        # Get all students in this classroom
        student_memberships = db.query(UserClassroom).filter(
            UserClassroom.classroom_id == classroom_id,
            UserClassroom.role == "STUDENT",
            UserClassroom.is_active == True
        ).all()
        
        student_ids = [m.user_id for m in student_memberships]
        
        # Get all submissions from students in this classroom
        all_submissions = db.query(TemplateSubmission).filter(
            TemplateSubmission.user_id.in_(student_ids)
        ).all() if student_ids else []
        
        # Calculate classroom metrics
        total_submissions = len(all_submissions)
        successful_submissions = len([s for s in all_submissions if s.status == "success"])
        classroom_success_rate = (successful_submissions / total_submissions * 100) if total_submissions > 0 else 0
        
        # Performance by language
        language_stats = {}
        for submission in all_submissions:
            lang = submission.language or "unknown"
            if lang not in language_stats:
                language_stats[lang] = {"total": 0, "successful": 0}
            language_stats[lang]["total"] += 1
            if submission.status == "success":
                language_stats[lang]["successful"] += 1
        
        for lang in language_stats:
            total = language_stats[lang]["total"]
            successful = language_stats[lang]["successful"]
            language_stats[lang]["success_rate"] = (successful / total * 100) if total > 0 else 0
        
        # Individual student performance
        student_performance = []
        for membership in student_memberships:
            student = db.query(User).filter(User.id == membership.user_id).first()
            if not student:
                continue
                
            student_submissions = [s for s in all_submissions if s.user_id == student.id]
            student_total = len(student_submissions)
            student_successful = len([s for s in student_submissions if s.status == "success"])
            student_success_rate = (student_successful / student_total * 100) if student_total > 0 else 0
            
            # Risk assessment
            risk_level = "low"
            if student_success_rate < 50:
                risk_level = "high"
            elif student_success_rate < 70:
                risk_level = "medium"
                
            last_submission = max(student_submissions, key=lambda x: x.submitted_at) if student_submissions else None
            
            student_performance.append({
                "user_id": student.id,
                "username": student.username,
                "full_name": student.full_name,
                "total_submissions": student_total,
                "success_rate": round(student_success_rate, 1),
                "risk_level": risk_level,
                "last_active": last_submission.submitted_at.isoformat() if last_submission else None
            })
        
        return {
            "classroom_info": {
                "id": classroom.id,
                "name": classroom.name,
                "classroom_key": classroom.classroom_key,
                "created_at": classroom.created_at.isoformat(),
                "total_members": len(student_memberships)
            },
            "overview": {
                "total_students": len(student_ids),
                "total_submissions": total_submissions,
                "success_rate": round(classroom_success_rate, 1),
                "languages_used": len(language_stats)
            },
            "language_performance": language_stats,
            "student_performance": sorted(student_performance, key=lambda x: x["success_rate"]),
        }
