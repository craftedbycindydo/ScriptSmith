"""
Analytics Service - Business logic for generating user and admin analytics
"""

import re
from typing import List, Optional, Dict, Any
from collections import Counter
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_, case
from app.models.template import Template, TemplateSubmission
from app.models.user import User
from app.models.classroom import Classroom, UserClassroom
from app.models.code_submission import CodeSubmission
from app.services import lab_harness


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
            "recent_submissions": len(recent_submissions),
            **AnalyticsService._student_signals(db, user_id),
            "class_comparison": AnalyticsService._class_comparison_for(
                db, user_id, round(success_rate, 1)
            ),
        }
    
    # Matches the exception class in a Python traceback, e.g. "NameError: name
    # 'x' is not defined". Extraction runs in Python rather than SQL so it works
    # on Postgres and SQLite alike. Verified against 3,330 production error
    # messages: the first match equals the last in all but one row.
    _ERROR_TYPE_RE = re.compile(r"\b([A-Za-z_]+(?:Error|Exception|Warning))\b")

    @staticmethod
    def _classify_error(message: str) -> str:
        """
        Bucket one failure message.

        Timeouts and platform failures carry no exception class, so a plain
        regex drops them into "Other" - which is misleading: a timeout is a
        real teaching signal (runaway loop), and a network failure is the
        platform's fault, not the student's. Production data showed 79 timeouts
        and 11 network failures hiding in that bucket, so they are named.
        """
        text = message or ""
        lowered = text.lower()

        # The lab's harness reporting failures is not a crash: the code ran to
        # the end and the tests disagreed with it (services/lab_harness.py).
        if lab_harness.is_tests_failed(text):
            return "Tests failed"
        if "timed out" in lowered or "timeout" in lowered:
            return "Timeout"
        if lowered.startswith("network error") or "cannot connect to host" in lowered:
            return "Platform error"

        match = AnalyticsService._ERROR_TYPE_RE.search(text)
        return match.group(1) if match else "Other"

    @staticmethod
    def _student_signals(db: Session, user_id: int) -> Dict[str, Any]:
        """
        Signals a learner can act on, which the summary counters can't carry:
        which mistakes they actually repeat, how each assignment went in order,
        how much they run before submitting, and when they work.

        `performance_trend` above is windowed to 30 days, so it is empty for
        anyone whose term has ended. `assignment_history` is deliberately NOT
        windowed - a student's own record should never vanish with time.
        """
        error_rows = db.query(CodeSubmission.error_message).filter(
            CodeSubmission.user_id == user_id,
            CodeSubmission.error_message.isnot(None),
            CodeSubmission.error_message != "",
        ).all()

        counter: Counter = Counter()
        for (message,) in error_rows:
            counter[AnalyticsService._classify_error(message)] += 1
        error_breakdown = [{"type": t, "count": c} for t, c in counter.most_common()]

        # Chronological record: which assignment, passed or not, when.
        history_rows = db.query(
            TemplateSubmission.template_name,
            TemplateSubmission.status,
            TemplateSubmission.submitted_at,
            TemplateSubmission.execution_time,
        ).filter(
            TemplateSubmission.user_id == user_id,
            TemplateSubmission.template_name.isnot(None),
        ).order_by(TemplateSubmission.submitted_at).all()

        assignment_history = [
            {
                "name": name,
                "status": status,
                "passed": status == "success",
                "submitted_at": submitted_at.isoformat() if submitted_at else None,
                "execution_time": round(execution_time, 3) if execution_time is not None else None,
            }
            for name, status, submitted_at, execution_time in history_rows
        ]

        dow_rows = db.query(
            func.extract("dow", CodeSubmission.created_at).label("dow"),
            func.extract("hour", CodeSubmission.created_at).label("hour"),
            func.count(CodeSubmission.id).label("runs"),
        ).filter(
            CodeSubmission.user_id == user_id,
            CodeSubmission.created_at.isnot(None),
        ).group_by("dow", "hour").all()

        activity_by_weekday_hour = [
            {"dow": int(d), "hour": int(h), "runs": int(r)}
            for d, h, r in dow_rows
            if d is not None and h is not None
        ]

        total_runs = db.query(func.count(CodeSubmission.id)).filter(
            CodeSubmission.user_id == user_id
        ).scalar() or 0
        submissions = len(assignment_history)

        return {
            "error_breakdown": error_breakdown,
            "assignment_history": assignment_history,
            "activity_by_weekday_hour": activity_by_weekday_hour,
            "runs_per_submission": round(total_runs / submissions, 1) if submissions else 0.0,
        }

    @staticmethod
    def _class_comparison_for(db: Session, user_id: int, own_rate: float) -> Optional[Dict[str, Any]]:
        """
        How this student sits against the classmates they actually share a room
        with. Returns None when they have no classroom - an invented benchmark
        would be worse than none.
        """
        memberships = db.query(UserClassroom.classroom_id).filter(
            UserClassroom.user_id == user_id,
            UserClassroom.is_active == True
        ).all()
        classroom_ids = [c for (c,) in memberships]
        if not classroom_ids:
            return None

        peers = db.query(UserClassroom.user_id).filter(
            UserClassroom.classroom_id.in_(classroom_ids),
            UserClassroom.role == "STUDENT",
            UserClassroom.is_active == True
        ).all()
        peer_ids = [p for (p,) in peers]
        if not peer_ids:
            return None

        totals = db.query(
            func.count(TemplateSubmission.id),
            func.sum(case((TemplateSubmission.status == "success", 1), else_=0)),
        ).filter(TemplateSubmission.user_id.in_(peer_ids)).first()

        total, successful = int(totals[0] or 0), int(totals[1] or 0)
        if total == 0:
            return None

        own_submissions = db.query(func.count(TemplateSubmission.id)).filter(
            TemplateSubmission.user_id == user_id
        ).scalar() or 0

        class_rate = round(100.0 * successful / total, 1)
        return {
            "class_average_success_rate": class_rate,
            "student_vs_class": round(own_rate - class_rate, 1),
            "peers": len(peer_ids),
            # Volume alongside quality: a low rate on 20 attempts and a low rate
            # on 2 are different situations, and only the pair distinguishes them.
            "class_average_submissions": round(total / len(peer_ids), 1),
            "your_submissions": int(own_submissions),
        }

    @staticmethod
    def _teaching_signals(db: Session, student_ids: List[int]) -> Dict[str, Any]:
        """
        Class-level teaching signals that the per-student summaries can't show:
        which failures dominate, which assignments are hardest, when the class
        actually works, and how long their code runs.

        Every field here is derived from columns verified to be populated in
        production. `memory_used` (always NULL) and `resubmission_count`
        (always 0) are deliberately not used.
        """
        empty = {
            "error_breakdown": [],
            "template_difficulty": [],
            "activity_by_weekday_hour": [],
            "execution_time_buckets": [],
            "effort": [],
        }
        if not student_ids:
            return empty

        # --- Error taxonomy: what the class actually gets stuck on -----------
        error_rows = db.query(CodeSubmission.error_message).filter(
            CodeSubmission.user_id.in_(student_ids),
            CodeSubmission.error_message.isnot(None),
            CodeSubmission.error_message != "",
        ).all()

        counter: Counter = Counter()
        for (message,) in error_rows:
            counter[AnalyticsService._classify_error(message)] += 1

        error_breakdown = [
            {"type": name, "count": count} for name, count in counter.most_common()
        ]

        # --- Assignment difficulty: is it the student or the assignment? -----
        template_rows = db.query(
            TemplateSubmission.template_name,
            func.count(TemplateSubmission.id).label("attempts"),
            func.count(func.distinct(TemplateSubmission.user_id)).label("students"),
            func.sum(
                case((TemplateSubmission.status == "success", 1), else_=0)
            ).label("successful"),
        ).filter(
            TemplateSubmission.user_id.in_(student_ids),
            TemplateSubmission.template_name.isnot(None),
        ).group_by(TemplateSubmission.template_name).all()

        template_difficulty = sorted(
            [
                {
                    "name": name,
                    "attempts": int(attempts or 0),
                    "students": int(students or 0),
                    "success_rate": round(100.0 * int(successful or 0) / int(attempts), 1)
                    if attempts
                    else 0.0,
                }
                for name, attempts, students, successful in template_rows
            ],
            key=lambda t: (t["success_rate"], -t["attempts"]),
        )

        # --- When the class works (hour of day, 0-23) ------------------------
        # Hour-of-day alone can't answer "are they starting the night before?" -
        # that needs the weekday axis too. Postgres dow: 0=Sunday..6=Saturday.
        dow_rows = db.query(
            func.extract("dow", CodeSubmission.created_at).label("dow"),
            func.extract("hour", CodeSubmission.created_at).label("hour"),
            func.count(CodeSubmission.id).label("runs"),
        ).filter(
            CodeSubmission.user_id.in_(student_ids),
            CodeSubmission.created_at.isnot(None),
        ).group_by("dow", "hour").all()

        activity_by_weekday_hour = [
            {"dow": int(dow), "hour": int(hour), "runs": int(runs)}
            for dow, hour, runs in dow_rows
            if dow is not None and hour is not None
        ]

        # --- Run duration distribution (long-tailed; fixed buckets) ----------
        bounds = [0.05, 0.1, 0.25, 0.5, 1.0]
        labels = ["<50ms", "50-100ms", "100-250ms", "250-500ms", "0.5-1s", ">1s"]
        times = db.query(CodeSubmission.execution_time).filter(
            CodeSubmission.user_id.in_(student_ids),
            CodeSubmission.execution_time.isnot(None),
        ).all()

        buckets = [0] * len(labels)
        for (value,) in times:
            index = next((i for i, edge in enumerate(bounds) if value < edge), len(bounds))
            buckets[index] += 1
        execution_time_buckets = [
            {"label": label, "count": count} for label, count in zip(labels, buckets)
        ]

        # --- Effort vs outcome per student (drives the quadrant view) --------
        run_rows = db.query(
            CodeSubmission.user_id,
            func.count(CodeSubmission.id).label("runs"),
            func.sum(
                case((CodeSubmission.status == "success", 1), else_=0)
            ).label("successful"),
        ).filter(
            CodeSubmission.user_id.in_(student_ids)
        ).group_by(CodeSubmission.user_id).all()

        effort = [
            {
                "user_id": int(user_id),
                "runs": int(runs or 0),
                "run_success_rate": round(100.0 * int(successful or 0) / int(runs), 1)
                if runs
                else 0.0,
            }
            for user_id, runs, successful in run_rows
            if user_id is not None
        ]

        return {
            "error_breakdown": error_breakdown,
            "template_difficulty": template_difficulty,
            "activity_by_weekday_hour": activity_by_weekday_hour,
            "execution_time_buckets": execution_time_buckets,
            "effort": effort,
        }

    @staticmethod
    def get_admin_analytics_overview(db: Session, admin_user: User) -> Dict[str, Any]:
        """Get analytics overview for admin dashboard"""
        
        # Use same pattern as working Professor Templates endpoint
        # Get classrooms where admin is a teacher (includes ones they created)
        teacher_classrooms = db.query(Classroom).join(UserClassroom).filter(
            Classroom.is_active == True,
            UserClassroom.user_id == admin_user.id,
            UserClassroom.is_active == True,
            UserClassroom.role == "TEACHER"
        ).all()
        
        # Also include classrooms they created (in case they're not explicitly a member)
        created_classrooms = db.query(Classroom).filter(
            Classroom.is_active == True,
            Classroom.created_by_id == admin_user.id
        ).all()
        
        # Combine and deduplicate
        all_classrooms_dict = {c.id: c for c in teacher_classrooms + created_classrooms}
        admin_classrooms = list(all_classrooms_dict.values())
        classroom_ids = list(all_classrooms_dict.keys())
        
        if not classroom_ids:
            # Same shape as the populated response - the client types one payload.
            return {
                "overview": {
                    "total_students": 0,
                    "total_classrooms": 0,
                    "total_submissions": 0,
                    "class_success_rate": 0,
                    "active_languages": 0
                },
                "classrooms": [],
                "language_performance": {},
                "student_performance": [],
                **AnalyticsService._teaching_signals(db, [])
            }
        
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
        
        # Batch fetch all students in ONE query (avoid N+1 problem)
        students_map = {}
        if student_ids:
            students = db.query(User.id, User.username, User.full_name, User.email).filter(
                User.id.in_(student_ids)
            ).all()
            students_map = {s.id: s for s in students}
        
        # Class-level teaching signals (error taxonomy, assignment difficulty,
        # working hours, run durations, per-student effort).
        signals = AnalyticsService._teaching_signals(db, student_ids)
        effort_by_user = {e["user_id"]: e for e in signals["effort"]}

        # Student performance summary
        student_performance = []
        for student_id in student_ids:
            student = students_map.get(student_id)
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
                "last_active": last_active.isoformat() if last_active else None,
                # Effort signals: a student grinding through many failing runs
                # looks fine on submission rate alone, which is why the summary
                # above can't surface them.
                "total_runs": effort_by_user.get(student_id, {}).get("runs", 0),
                "run_success_rate": effort_by_user.get(student_id, {}).get("run_success_rate", 0.0),
            })

        # `effort` stays internal - it is already folded into each student row
        # above, and the client never reads the raw array.
        signals.pop("effort", None)

        return {
            **signals,
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
    def get_student_analytics_for_admin(db: Session, admin_user: User, student_id: int) -> Dict[str, Any]:
        """Get detailed analytics for a specific student (admin view)"""
        
        # Use same pattern as working Professor Templates endpoint
        # Get classrooms where admin is a teacher (includes ones they created)
        teacher_classrooms = db.query(Classroom).join(UserClassroom).filter(
            Classroom.is_active == True,
            UserClassroom.user_id == admin_user.id,
            UserClassroom.is_active == True,
            UserClassroom.role == "TEACHER"
        ).all()
        
        # Also include classrooms they created (in case they're not explicitly a member)
        created_classrooms = db.query(Classroom).filter(
            Classroom.is_active == True,
            Classroom.created_by_id == admin_user.id
        ).all()
        
        # Combine and deduplicate
        all_classrooms_dict = {c.id: c for c in teacher_classrooms + created_classrooms}
        classroom_ids = list(all_classrooms_dict.keys())
        
        if not classroom_ids:
            return {"error": "No classrooms found for admin"}
        
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
        
        # Same shape as the student's own view - this used to omit `peers`, so
        # the client rendered "undefined classmates" depending on which endpoint
        # it had loaded from.
        student_analytics["class_comparison"] = {
            "class_average_success_rate": round(class_average_success_rate, 1),
            "student_vs_class": round(
                student_analytics["overview"]["success_rate"] - class_average_success_rate, 1
            ),
            "peers": len(all_student_ids),
            "class_average_submissions": round(class_total / len(all_student_ids), 1)
            if all_student_ids
            else 0.0,
            "your_submissions": student_analytics["overview"]["total_submissions"],
        }
        
        return student_analytics
    
    @staticmethod
    def get_classroom_analytics(db: Session, admin_user: User, classroom_id: int) -> Dict[str, Any]:
        """Get detailed analytics for a specific classroom"""
        
        # Use same pattern as working Professor Templates endpoint
        # Get classrooms where admin is a teacher (includes ones they created)
        teacher_classrooms = db.query(Classroom).join(UserClassroom).filter(
            Classroom.is_active == True,
            UserClassroom.user_id == admin_user.id,
            UserClassroom.is_active == True,
            UserClassroom.role == "TEACHER"
        ).all()
        
        # Also include classrooms they created (in case they're not explicitly a member)
        created_classrooms = db.query(Classroom).filter(
            Classroom.is_active == True,
            Classroom.created_by_id == admin_user.id
        ).all()
        
        # Combine and deduplicate
        all_classrooms_dict = {c.id: c for c in teacher_classrooms + created_classrooms}
        classroom_ids = list(all_classrooms_dict.keys())
        
        if classroom_id not in classroom_ids:
            return {"error": "Classroom not found or access denied"}
            
        classroom = all_classrooms_dict.get(classroom_id)
        
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
        
        # Batch fetch all students in ONE query (avoid N+1 problem)
        students_map = {}
        if student_ids:
            students = db.query(User.id, User.username, User.full_name).filter(
                User.id.in_(student_ids)
            ).all()
            students_map = {s.id: s for s in students}
        
        # Individual student performance
        student_performance = []
        for membership in student_memberships:
            student = students_map.get(membership.user_id)
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
