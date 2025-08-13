import os
import zipfile
import asyncio
import json
import aiofiles
import shutil
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path
import tempfile

from sqlalchemy.orm import Session
from fastapi import UploadFile

from app.models.assignment import Assignment, StudentSubmission
from app.services.code_execution import code_execution_service
from app.services.plagiarism_service import PlagiarismService


class AssignmentService:
    def __init__(self):
        self.base_storage_path = "/tmp/assignments"
        self.plagiarism_service = PlagiarismService()
        os.makedirs(self.base_storage_path, exist_ok=True)
    
    async def create_assignment(
        self,
        db: Session,
        name: str,
        description: str,
        created_by_id: int,
        zip_file: UploadFile,
        language: str = None,
        timeout_seconds: int = 30
    ) -> Assignment:
        """Create a new assignment from uploaded ZIP file"""
        
        # Create assignment record
        assignment = Assignment(
            name=name,
            description=description,
            created_by_id=created_by_id,
            language=language,
            timeout_seconds=timeout_seconds,
            status="uploaded"
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
        try:
            # Create assignment directory
            assignment_dir = os.path.join(self.base_storage_path, f"assignment_{assignment.id}")
            os.makedirs(assignment_dir, exist_ok=True)
            
            # Save ZIP file
            zip_path = os.path.join(assignment_dir, f"{name}.zip")
            async with aiofiles.open(zip_path, 'wb') as f:
                content = await zip_file.read()
                await f.write(content)
            
            # Extract ZIP file
            extracted_path = os.path.join(assignment_dir, "extracted")
            await self._extract_zip(zip_path, extracted_path)
            
            # Update assignment with file paths
            assignment.zip_file_path = zip_path
            assignment.extracted_path = extracted_path
            
            # Analyze student submissions
            student_submissions = await self._analyze_submissions(db, assignment, extracted_path)
            assignment.total_students = len(student_submissions)
            
            db.commit()
            
            return assignment
            
        except Exception as e:
            # Rollback assignment creation on error
            assignment.status = "failed"
            db.commit()
            raise e
    
    async def _extract_zip(self, zip_path: str, extract_path: str):
        """Extract ZIP file to specified directory"""
        os.makedirs(extract_path, exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_path)
    
    async def _analyze_submissions(
        self, 
        db: Session, 
        assignment: Assignment, 
        extracted_path: str
    ) -> List[StudentSubmission]:
        """Analyze extracted submissions and create student submission records"""
        
        submissions = []
        
        # Look for student folders
        for item in os.listdir(extracted_path):
            item_path = os.path.join(extracted_path, item)
            
            if os.path.isdir(item_path):
                # This is a student folder
                student_name = item
                
                # Find code files in the folder
                code_files = await self._find_code_files(item_path, assignment.language)
                
                if code_files:
                    # Determine main file to execute
                    main_file = await self._determine_main_file(code_files, assignment.language)
                    
                    # Create student submission record
                    submission = StudentSubmission(
                        assignment_id=assignment.id,
                        student_name=student_name,
                        folder_path=item_path,
                        code_files=code_files,
                        main_file=main_file,
                        execution_status="pending"
                    )
                    
                    db.add(submission)
                    submissions.append(submission)
        
        db.commit()
        return submissions
    
    async def _find_code_files(self, folder_path: str, language: str = None) -> List[str]:
        """Find code files in a student's folder"""
        code_extensions = {
            'python': ['.py'],
            'javascript': ['.js'],
            'typescript': ['.ts'],
            'java': ['.java'],
            'cpp': ['.cpp', '.c++', '.cc'],
            'go': ['.go'],
            'rust': ['.rs']
        }
        
        # If language is specified, use its extensions
        if language and language in code_extensions:
            extensions = code_extensions[language]
        else:
            # Use all extensions
            extensions = []
            for exts in code_extensions.values():
                extensions.extend(exts)
        
        code_files = []
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                if any(file.endswith(ext) for ext in extensions):
                    file_path = os.path.join(root, file)
                    # Store relative path from student folder
                    rel_path = os.path.relpath(file_path, folder_path)
                    code_files.append(rel_path)
        
        return code_files
    
    async def _determine_main_file(self, code_files: List[str], language: str = None) -> str:
        """Determine which file should be the main entry point"""
        
        if not code_files:
            return None
        
        # Priority-based selection
        priority_names = [
            'main', 'Main', 'index', 'app', 'solution', 'program'
        ]
        
        # First, look for files with priority names
        for priority in priority_names:
            for file in code_files:
                filename = os.path.splitext(os.path.basename(file))[0]
                if filename.lower() == priority.lower():
                    return file
        
        # For Java, look for files with public class Main
        if language == 'java':
            for file in code_files:
                if 'Main.java' in file or 'main.java' in file:
                    return file
        
        # Default to first file
        return code_files[0]
    
    async def process_assignment(self, db: Session, assignment_id: int):
        """Process all student submissions in an assignment"""
        
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if not assignment:
            raise ValueError(f"Assignment {assignment_id} not found")
        
        assignment.status = "processing"
        assignment.processing_started_at = datetime.utcnow()
        db.commit()
        
        try:
            # Get all student submissions
            submissions = db.query(StudentSubmission).filter(
                StudentSubmission.assignment_id == assignment_id
            ).all()
            
            # Process each submission
            results = {"success": 0, "error": 0, "timeout": 0}
            
            for submission in submissions:
                result = await self._process_student_submission(db, submission)
                results[result] += 1
                
                # Update progress
                assignment.processed_students += 1
                db.commit()
            
            # Update assignment status
            assignment.status = "completed"
            assignment.execution_summary = results
            assignment.processing_completed_at = datetime.utcnow()
            
            # Start plagiarism analysis
            assignment.plagiarism_status = "processing"
            db.commit()
            
            # Run plagiarism detection
            await self._run_plagiarism_analysis(db, assignment)
            
        except Exception as e:
            assignment.status = "failed"
            db.commit()
            raise e
    
    async def _process_student_submission(
        self, 
        db: Session, 
        submission: StudentSubmission
    ) -> str:
        """Process a single student submission"""
        
        if not submission.main_file:
            submission.execution_status = "error"
            submission.execution_error = "No main file found"
            db.commit()
            return "error"
        
        try:
            # Read the main code file
            main_file_path = os.path.join(submission.folder_path, submission.main_file)
            
            async with aiofiles.open(main_file_path, 'r', encoding='utf-8') as f:
                code = await f.read()
            
            # Determine language from file extension
            language = self._get_language_from_file(submission.main_file)
            
            # Execute code
            start_time = datetime.utcnow()
            result = await code_execution_service.execute_code(code, language, "")
            execution_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Update submission with results
            submission.execution_status = result["status"]
            submission.execution_output = result.get("output", "")
            submission.execution_error = result.get("error", "")
            submission.execution_time = execution_time
            submission.executed_at = datetime.utcnow()
            
            # Save results to file
            await self._save_execution_results(submission, result)
            
            db.commit()
            return result["status"]
            
        except Exception as e:
            submission.execution_status = "error"
            submission.execution_error = f"Processing failed: {str(e)}"
            db.commit()
            return "error"
    
    def _get_language_from_file(self, filename: str) -> str:
        """Determine language from file extension"""
        ext = os.path.splitext(filename)[1].lower()
        
        language_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c++': 'cpp',
            '.cc': 'cpp',
            '.go': 'go',
            '.rs': 'rust'
        }
        
        return language_map.get(ext, 'python')  # Default to python
    
    async def _save_execution_results(self, submission: StudentSubmission, result: Dict[str, Any]):
        """Save execution results to a file in the student's folder"""
        
        results_data = {
            "student_name": submission.student_name,
            "execution_time": submission.execution_time,
            "execution_status": submission.execution_status,
            "output": result.get("output", ""),
            "error": result.get("error", ""),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        results_file_path = os.path.join(submission.folder_path, "execution_results.json")
        
        async with aiofiles.open(results_file_path, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(results_data, indent=2))
        
        submission.results_file_path = results_file_path
    
    async def _run_plagiarism_analysis(self, db: Session, assignment: Assignment):
        """Run plagiarism detection on all submissions"""
        
        try:
            submissions = db.query(StudentSubmission).filter(
                StudentSubmission.assignment_id == assignment.id
            ).all()
            
            # Get all code content for comparison
            code_samples = []
            for submission in submissions:
                if submission.main_file and submission.execution_status != "error":
                    main_file_path = os.path.join(submission.folder_path, submission.main_file)
                    try:
                        async with aiofiles.open(main_file_path, 'r', encoding='utf-8') as f:
                            code = await f.read()
                            code_samples.append({
                                'student_name': submission.student_name,
                                'code': code,
                                'submission_id': submission.id
                            })
                    except Exception:
                        continue
            
            # Run plagiarism detection
            plagiarism_results = await self.plagiarism_service.detect_plagiarism(
                code_samples, 
                threshold=assignment.plagiarism_threshold
            )
            
            # Update submissions with plagiarism results
            for result in plagiarism_results:
                submission = db.query(StudentSubmission).filter(
                    StudentSubmission.id == result['submission_id']
                ).first()
                
                if submission:
                    submission.similarity_scores = result.get('similarities', {})
                    submission.is_flagged = result.get('is_flagged', False)
                    submission.flagged_for = result.get('flagged_for', [])
            
            # Generate overall report
            flagged_count = sum(1 for r in plagiarism_results if r.get('is_flagged', False))
            
            assignment.plagiarism_report = {
                "total_analyzed": len(code_samples),
                "flagged_submissions": flagged_count,
                "analysis_timestamp": datetime.utcnow().isoformat(),
                "threshold_used": assignment.plagiarism_threshold,
                "results": plagiarism_results
            }
            
            assignment.plagiarism_status = "completed"
            db.commit()
            
        except Exception as e:
            assignment.plagiarism_status = "failed"
            db.commit()
            raise e
    
    async def get_assignment_report(self, db: Session, assignment_id: int) -> Dict[str, Any]:
        """Generate comprehensive assignment report"""
        
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if not assignment:
            raise ValueError(f"Assignment {assignment_id} not found")
        
        submissions = db.query(StudentSubmission).filter(
            StudentSubmission.assignment_id == assignment_id
        ).all()
        
        # Execution statistics
        execution_stats = {
            "total": len(submissions),
            "success": len([s for s in submissions if s.execution_status == "success"]),
            "error": len([s for s in submissions if s.execution_status == "error"]),
            "timeout": len([s for s in submissions if s.execution_status == "timeout"]),
            "pending": len([s for s in submissions if s.execution_status == "pending"])
        }
        
        # Plagiarism statistics
        plagiarism_stats = {
            "total_flagged": len([s for s in submissions if s.is_flagged]),
            "analysis_completed": assignment.plagiarism_status == "completed"
        }
        
        # Student details
        student_details = []
        for submission in submissions:
            student_details.append({
                "name": submission.student_name,
                "execution_status": submission.execution_status,
                "execution_time": submission.execution_time,
                "has_output": bool(submission.execution_output),
                "has_error": bool(submission.execution_error),
                "is_flagged": submission.is_flagged,
                "similarity_scores": submission.similarity_scores or {},
                "code_files": submission.code_files or []
            })
        
        return {
            "assignment": {
                "id": assignment.id,
                "name": assignment.name,
                "description": assignment.description,
                "status": assignment.status,
                "plagiarism_status": assignment.plagiarism_status,
                "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
                "processing_time": (
                    assignment.processing_completed_at - assignment.processing_started_at
                ).total_seconds() if assignment.processing_completed_at and assignment.processing_started_at else None
            },
            "execution_stats": execution_stats,
            "plagiarism_stats": plagiarism_stats,
            "students": student_details
        }


# Global instance
assignment_service = AssignmentService()
