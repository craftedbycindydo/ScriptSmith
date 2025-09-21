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
from sqlalchemy import or_
from fastapi import UploadFile
import hashlib

from app.models.assignment import Assignment, StudentSubmission
from app.services.code_execution import code_execution_service
from app.services.plagiarism_service import PlagiarismService
from app.services.openai_service import openai_service


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
        
        # Debug logging
        print(f"🔍 DEBUG: Analyzing submissions in: {extracted_path}")
        try:
            items = os.listdir(extracted_path)
            print(f"🔍 DEBUG: Found {len(items)} items in extracted folder: {items}")
        except Exception as e:
            print(f"❌ DEBUG: Error listing directory {extracted_path}: {e}")
            return submissions
        
        # Separate directories and files
        directories = []
        files = []
        
        for item in items:
            item_path = os.path.join(extracted_path, item)
            print(f"🔍 DEBUG: Checking item: {item} at path: {item_path}")
            
            if os.path.isdir(item_path):
                directories.append((item, item_path))
                print(f"✅ DEBUG: Found directory: {item}")
            elif os.path.isfile(item_path):
                files.append((item, item_path))
                print(f"✅ DEBUG: Found file: {item}")
        
        print(f"🔍 DEBUG: Found {len(directories)} directories and {len(files)} files")
        
        # Method 1: Handle student folders (original expected format)
        for item, item_path in directories:
            print(f"✅ DEBUG: Processing directory (student folder): {item}")
            student_name = item
            
            # Find code files in the folder
            code_files = await self._find_code_files(item_path, assignment.language)
            print(f"🔍 DEBUG: Found code files for {student_name}: {code_files}")
            
            if code_files:
                # Determine main file to execute
                main_file = await self._determine_main_file(code_files, assignment.language)
                print(f"✅ DEBUG: Main file for {student_name}: {main_file}")
                
                # Read and store code content from all files
                code_content = await self._read_code_files(item_path, code_files)
                print(f"✅ DEBUG: Read {len(code_content)} code files for {student_name}")
                
                # Create student submission record
                submission_data = {
                    'assignment_id': assignment.id,
                    'student_name': student_name,
                    'folder_path': item_path,
                    'code_files': code_files,
                    'main_file': main_file,
                    'execution_status': "pending"
                }
                
                # Add code_content only if the model supports it (backward compatibility)
                try:
                    # Check if the database supports the code_content field
                    from sqlalchemy import inspect
                    inspector = inspect(db.bind)
                    columns = [col['name'] for col in inspector.get_columns('student_submissions')]
                    if 'code_content' in columns:
                        submission_data['code_content'] = code_content
                        print(f"✅ DEBUG: Added code_content for {student_name}")
                    else:
                        print(f"⚠️ DEBUG: code_content field not in database schema, skipping for {student_name}")
                except Exception as e:
                    print(f"⚠️ DEBUG: Could not add code_content for {student_name}: {e}")
                
                submission = StudentSubmission(**submission_data)
                
                db.add(submission)
                submissions.append(submission)
            else:
                print(f"⚠️ DEBUG: No code files found in directory {student_name}")
        
        # Method 2: Handle individual files (Canvas/LMS bulk download format)
        if len(directories) == 0 and len(files) > 0:
            print(f"🔍 DEBUG: No directories found, processing individual files as student submissions")
            
            for item, item_path in files:
                # Check if it's a code file
                if await self._is_code_file(item, assignment.language):
                    print(f"✅ DEBUG: Processing individual code file: {item}")
                    
                    # Extract student name from filename
                    student_name = await self._extract_student_name_from_filename(item)
                    print(f"🔍 DEBUG: Extracted student name: {student_name}")
                    
                    # Read code content for single file
                    code_content = await self._read_code_files(extracted_path, [item])
                    print(f"✅ DEBUG: Read code content for {student_name}: {len(code_content)} files")
                    
                    # Create student submission record
                    submission_data = {
                        'assignment_id': assignment.id,
                        'student_name': student_name,
                        'folder_path': extracted_path,  # Use extracted path as folder
                        'code_files': [item],  # Just the single file
                        'main_file': item,     # The file itself is the main file
                        'execution_status': "pending"
                    }
                    
                    # Add code_content only if the model supports it (backward compatibility)
                    try:
                        # Check if the database supports the code_content field
                        from sqlalchemy import inspect
                        inspector = inspect(db.bind)
                        columns = [col['name'] for col in inspector.get_columns('student_submissions')]
                        if 'code_content' in columns:
                            submission_data['code_content'] = code_content
                            print(f"✅ DEBUG: Added code_content for {student_name}")
                        else:
                            print(f"⚠️ DEBUG: code_content field not in database schema, skipping for {student_name}")
                    except Exception as e:
                        print(f"⚠️ DEBUG: Could not add code_content for {student_name}: {e}")
                    
                    submission = StudentSubmission(**submission_data)
                    
                    db.add(submission)
                    submissions.append(submission)
                    print(f"✅ DEBUG: Created submission for {student_name} with file {item}")
                else:
                    print(f"⚠️ DEBUG: File {item} is not a recognized code file, skipping")
        
        print(f"✅ DEBUG: Created {len(submissions)} student submission records")
        
        try:
            db.commit()
            print(f"✅ DEBUG: Successfully committed {len(submissions)} submissions to database")
        except Exception as commit_error:
            print(f"❌ DEBUG: Commit failed: {commit_error}")
            try:
                db.rollback()
                print("🔄 DEBUG: Rolled back transaction")
                
                # Try to recreate submissions without code_content if that's the issue
                print("🔧 DEBUG: Attempting to recreate submissions without code_content...")
                for submission in submissions:
                    if hasattr(submission, 'code_content'):
                        submission.code_content = None  # Remove problematic field
                
                db.commit()
                print("✅ DEBUG: Successfully committed submissions without code_content")
            except Exception as rollback_error:
                print(f"❌ DEBUG: Rollback also failed: {rollback_error}")
                raise commit_error
        
        return submissions
    
    async def _find_code_files(self, folder_path: str, language: str = None) -> List[str]:
        """Find code files in a student's folder"""
        print(f"🔍 DEBUG: Finding code files in {folder_path} for language: {language}")
        
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
            print(f"🔍 DEBUG: Using language-specific extensions: {extensions}")
        else:
            # Use all extensions
            extensions = []
            for exts in code_extensions.values():
                extensions.extend(exts)
            print(f"🔍 DEBUG: Using all extensions: {extensions}")
        
        # Check if folder exists and list its contents
        if not os.path.exists(folder_path):
            print(f"❌ DEBUG: Folder does not exist: {folder_path}")
            return []
        
        try:
            all_files = []
            for root, dirs, files in os.walk(folder_path):
                print(f"🔍 DEBUG: Walking directory {root}, found {len(files)} files: {files}")
                all_files.extend(files)
            print(f"🔍 DEBUG: Total files found in {folder_path}: {all_files}")
        except Exception as e:
            print(f"❌ DEBUG: Error walking directory {folder_path}: {e}")
            return []
        
        code_files = []
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                print(f"🔍 DEBUG: Checking file: {file}")
                if any(file.endswith(ext) for ext in extensions):
                    file_path = os.path.join(root, file)
                    # Store relative path from student folder
                    rel_path = os.path.relpath(file_path, folder_path)
                    code_files.append(rel_path)
                    print(f"✅ DEBUG: Found code file: {file} -> {rel_path}")
                else:
                    print(f"⚠️ DEBUG: File {file} doesn't match any extension")
        
        print(f"✅ DEBUG: Final code files list: {code_files}")
        return code_files
    
    async def _read_code_files(self, folder_path: str, code_files: List[str]) -> Dict[str, str]:
        """Read content from all code files and return as dictionary"""
        print(f"🔍 DEBUG: Reading code files from {folder_path}: {code_files}")
        
        code_content = {}
        
        for code_file in code_files:
            try:
                file_path = os.path.join(folder_path, code_file)
                print(f"🔍 DEBUG: Reading file: {file_path}")
                
                if os.path.exists(file_path):
                    async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                        content = await f.read()
                        code_content[code_file] = content
                        print(f"✅ DEBUG: Read {len(content)} chars from {code_file}")
                else:
                    print(f"❌ DEBUG: File does not exist: {file_path}")
                    code_content[code_file] = f"Error: File not found at {file_path}"
                    
            except UnicodeDecodeError:
                try:
                    # Try with different encoding
                    async with aiofiles.open(file_path, 'r', encoding='latin-1') as f:
                        content = await f.read()
                        code_content[code_file] = content
                        print(f"✅ DEBUG: Read {len(content)} chars from {code_file} (latin-1)")
                except Exception as e:
                    print(f"❌ DEBUG: Error reading {code_file} with latin-1: {e}")
                    code_content[code_file] = f"Error reading file: {str(e)}"
                    
            except Exception as e:
                print(f"❌ DEBUG: Error reading {code_file}: {e}")
                code_content[code_file] = f"Error reading file: {str(e)}"
        
        print(f"✅ DEBUG: Successfully read {len(code_content)} code files")
        return code_content
    
    async def _is_code_file(self, filename: str, language: str = None) -> bool:
        """Check if a file is a code file based on its extension"""
        print(f"🔍 DEBUG: Checking if {filename} is a code file for language: {language}")
        
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
        
        is_code = any(filename.lower().endswith(ext) for ext in extensions)
        print(f"🔍 DEBUG: File {filename} is code file: {is_code}")
        return is_code
    
    async def _extract_student_name_from_filename(self, filename: str) -> str:
        """Extract student name from Canvas/LMS style filenames"""
        print(f"🔍 DEBUG: Extracting student name from filename: {filename}")
        
        # Remove file extension
        name_without_ext = os.path.splitext(filename)[0]
        
        # Common LMS patterns:
        # 1. "username_id_submissionid_DisplayName" -> extract DisplayName
        # 2. "lastname_firstname_id_assignment" -> extract lastname_firstname  
        # 3. "FirstName_LastName" -> extract FirstName_LastName
        
        parts = name_without_ext.split('_')
        
        if len(parts) >= 4:
            # Pattern: username_id_submissionid_DisplayName
            # Take the last part as display name, handle spaces in assignment names
            student_name = '_'.join(parts[3:])  # Join remaining parts in case name has underscores
            print(f"🔍 DEBUG: Extracted student name (pattern 1): {student_name}")
        elif len(parts) >= 2:
            # Pattern: FirstName_LastName or similar
            student_name = '_'.join(parts[:2])  # Take first two parts
            print(f"🔍 DEBUG: Extracted student name (pattern 2): {student_name}")
        else:
            # Fallback: use the whole filename without extension
            student_name = name_without_ext
            print(f"🔍 DEBUG: Extracted student name (fallback): {student_name}")
        
        # Clean up the student name
        student_name = student_name.replace('_', ' ').strip()
        
        # Handle special cases in your filenames
        # Examples from your logs:
        # baatotenorahamina_7258511_181677293_Norah_Baatote.py -> "Norah Baatote"
        # principeyandelenriquez_7208108_181676205_Homework Assignment1.py -> "Homework Assignment1"
        
        print(f"✅ DEBUG: Final cleaned student name: {student_name}")
        return student_name
    
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
    
    async def process_assignment(self, db: Session, assignment_id: int, grade_out_of: int = 100, leniency: int = 50):
        """Process all student submissions in an assignment with grading configuration"""
        
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
            db.commit()
            
            # AI Grading Phase - Grade submissions that have been executed (non-blocking)
            print(f"🤖 Starting AI grading phase with config: {grade_out_of} points, {leniency}% leniency...")
            try:
                await asyncio.wait_for(self._run_ai_grading(db, assignment, grade_out_of, leniency), timeout=120.0)
                print("✅ AI grading phase completed")
            except asyncio.TimeoutError:
                print("⚠️ AI grading timed out, continuing with plagiarism analysis")
            except Exception as grading_error:
                print(f"⚠️ AI grading failed: {grading_error}, continuing with plagiarism analysis")
            
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
            # Get code content from stored data (instead of reading from file)
            if hasattr(submission, 'code_content') and submission.code_content and submission.main_file in submission.code_content:
                code = submission.code_content[submission.main_file]
                print(f"✅ DEBUG: Using stored code content for {submission.student_name}")
            else:
                # Fallback to file reading if code_content is missing (legacy data or new field not yet available)
                print(f"⚠️ DEBUG: No stored code content, falling back to file read for {submission.student_name}")
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
            
            # Run plagiarism detection with database caching
            plagiarism_results = await self.plagiarism_service.detect_plagiarism(
                code_samples, 
                threshold=assignment.plagiarism_threshold,
                db=db,
                assignment_id=assignment.id
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

    async def _run_ai_grading(self, db: Session, assignment: Assignment, grade_out_of: int = 100, leniency: int = 50):
        """Run AI grading for assignment submissions that have execution results"""
        try:
            print(f"🤖 Starting AI grading for assignment: {assignment.name}")
            
            # Check if OpenAI service is available
            if not openai_service.api_key:
                print("⚠️ OpenAI API key not configured, skipping AI grading")
                return
            
            # Get ALL submissions for this assignment
            all_submissions = db.query(StudentSubmission).filter(
                StudentSubmission.assignment_id == assignment.id
            ).all()
            
            if not all_submissions:
                print("⚠️ No submissions found for grading")
                return
                
            # Separate submissions: those with output OR errors (for AI grading) vs those with nothing (auto-grade as 0)
            submissions_for_ai_grading = []
            submissions_no_execution = []
            
            for submission in all_submissions:
                has_output = submission.execution_output and submission.execution_output.strip()
                has_error = submission.execution_error and submission.execution_error.strip()
                
                if has_output or has_error:
                    # Has execution results (output or error) - send to AI for grading
                    submissions_for_ai_grading.append(submission)
                else:
                    # No execution results at all - auto-grade as 0
                    submissions_no_execution.append(submission)
            
            print(f"📊 Found {len(submissions_for_ai_grading)} submissions with execution results (output/errors), {len(submissions_no_execution)} with no execution")
            
            # Auto-grade submissions with no execution results as 0
            no_execution_count = 0
            for submission in submissions_no_execution:
                if submission.grade is None:  # Only grade if not already graded
                    submission.grade = 0.0
                    submission.max_grade = grade_out_of  # Use actual grade scale from API
                    submission.grading_notes = "No execution results - 0 points"
                    no_execution_count += 1
            
            if no_execution_count > 0:
                print(f"📝 Auto-graded {no_execution_count} submissions with no execution results as 0 points")
                db.commit()
            
            # Continue with AI grading for submissions that have execution results (output or errors)
            submissions = submissions_for_ai_grading
            
            print(f"🔍 Found {len(submissions)} submissions with execution results for grading")
            
            # Prepare template information
            template_info = self._prepare_template_info(assignment, submissions)
            
            # Process submissions in batches: 3 submissions per batch, 5 batches in parallel
            batch_size = 3
            parallel_batches = 5
            total_graded = 0
            
            # Split submissions into batches of 3
            submission_batches = [submissions[i:i + batch_size] for i in range(0, len(submissions), batch_size)]
            print(f"📝 Split {len(submissions)} submissions into {len(submission_batches)} batches of up to {batch_size} submissions each")
            
            # Process batches in groups of 5 parallel batches
            for batch_group_start in range(0, len(submission_batches), parallel_batches):
                batch_group = submission_batches[batch_group_start:batch_group_start + parallel_batches]
                print(f"🚀 Processing batch group {batch_group_start//parallel_batches + 1}: {len(batch_group)} parallel batches")
                
                # Create tasks for parallel execution
                grading_tasks = []
                for batch_idx, batch in enumerate(batch_group):
                    actual_batch_num = batch_group_start + batch_idx + 1
                    task = self._grade_submission_batch(db, assignment, batch, template_info, actual_batch_num, grade_out_of, leniency)
                    grading_tasks.append(task)
                
                # Execute batches in parallel
                try:
                    batch_results = await asyncio.gather(*grading_tasks, return_exceptions=True)
                    
                    # Process results
                    for batch_idx, result in enumerate(batch_results):
                        if isinstance(result, Exception):
                            print(f"❌ Batch {batch_group_start + batch_idx + 1} failed: {result}")
                        else:
                            graded_count = result.get('graded_count', 0)
                            total_graded += graded_count
                            if graded_count > 0:
                                print(f"✅ Batch {batch_group_start + batch_idx + 1}: Stored {graded_count} grades")
                    
                except Exception as parallel_error:
                    print(f"❌ Error in parallel batch processing: {parallel_error}")
            
            print(f"🎯 AI Grading Complete: Successfully graded {total_graded} out of {len(submissions)} submissions")
            
        except Exception as e:
            print(f"❌ AI grading failed with error: {e}")
            # Don't raise the error - grading failure shouldn't stop plagiarism analysis
    
    async def _grade_submission_batch(self, db: Session, assignment: Assignment, batch: List[StudentSubmission], 
                                     template_info: Dict[str, Any], batch_num: int, grade_out_of: int = 100, leniency: int = 50) -> Dict[str, Any]:
        """Grade a single batch of submissions (up to 3 submissions)"""
        try:
            print(f"📋 Batch {batch_num}: Processing {len(batch)} submissions")
            
            # Format submissions for grading (with privacy-preserving name hashing)
            formatted_submissions, name_mapping = await self._format_submissions_for_grading(batch, assignment.id)
            if not formatted_submissions:
                print(f"⚠️ Batch {batch_num}: No valid submissions to format")
                return {'graded_count': 0}
            
            # Grading settings (use passed parameters)
            grade_scale = grade_out_of
            # leniency parameter is already available
            enable_robustness = False
            enable_quality = False
            
            print(f"🎯 Batch {batch_num}: Grading {len(formatted_submissions)} submissions")
            
            # Call AI grading service with timeout
            grading_results = await asyncio.wait_for(
                openai_service.grade_code_batch(
                    template_info=template_info,
                    submissions=formatted_submissions,
                    grade_scale=grade_scale,
                    leniency=leniency,
                    enable_robustness=enable_robustness,
                    enable_quality=enable_quality
                ),
                timeout=45.0  # 45 second timeout per batch
            )
            
            if not grading_results.get("available", False):
                print(f"❌ Batch {batch_num}: Grading failed - {grading_results.get('errors', ['Unknown error'])}")
                return {'graded_count': 0}
            
            # Store grades in database
            grades = grading_results.get("grades", {})
            reasoning = grading_results.get("reasoning", "AI grading completed")
            
            graded_count = 0
            # Map hashed names back to real names for grade storage
            for submission in batch:
                real_name = submission.student_name
                # Find the hashed name for this student
                hashed_name = None
                for hashed, real in name_mapping.items():
                    if real == real_name:
                        hashed_name = hashed
                        break
                
                # Check if we have grades for this hashed name
                if hashed_name and hashed_name in grades:
                    try:
                        from sqlalchemy import inspect
                        inspector = inspect(db.bind)
                        columns = [col['name'] for col in inspector.get_columns('student_submissions')]
                        
                        if 'grade' in columns:
                            submission.grade = grades[hashed_name]
                            submission.max_grade = grade_scale
                            
                            if 'grading_notes' in columns:
                                # Use real name for feedback extraction, not hashed name
                                student_feedback = self._extract_student_feedback(reasoning, real_name)
                                submission.grading_notes = student_feedback
                            
                            graded_count += 1
                            print(f"📊 Batch {batch_num}: Graded {real_name} (hash: {hashed_name[:8]}...) = {grades[hashed_name]}/{grade_scale}")
                            
                    except Exception as e:
                        print(f"❌ Batch {batch_num}: Error updating grade for {real_name}: {e}")
                elif hashed_name:
                    print(f"⚠️ Batch {batch_num}: No grade returned for {real_name} (hash: {hashed_name[:8]}...)")
                else:
                    print(f"⚠️ Batch {batch_num}: Could not find hash mapping for {real_name}")
            
            # Commit this batch
            if graded_count > 0:
                db.commit()
            
            return {'graded_count': graded_count}
            
        except asyncio.TimeoutError:
            print(f"⚠️ Batch {batch_num}: AI grading timed out")
            return {'graded_count': 0}
        except Exception as e:
            print(f"❌ Batch {batch_num}: AI grading failed - {e}")
            return {'graded_count': 0}

    def _hash_student_name(self, student_name: str, assignment_id: int) -> str:
        """Create a privacy-preserving hash of student name for AI grading"""
        # Use assignment_id as salt to ensure different hashes per assignment
        combined = f"{student_name}_{assignment_id}_grading_salt"
        return hashlib.sha256(combined.encode()).hexdigest()[:12]  # Short hash for readability
    
    def _prepare_template_info(self, assignment: Assignment, submissions: List[StudentSubmission]) -> Dict[str, Any]:
        """Prepare template information for AI grading"""
        
        # Try to get template code from first submission's code_content
        template_code = ""
        if submissions and hasattr(submissions[0], 'code_content') and submissions[0].code_content:
            # Use the first submission's code as a reference for the template
            first_code_content = submissions[0].code_content
            if first_code_content and isinstance(first_code_content, dict):
                # Get the first code file as template reference
                template_code = list(first_code_content.values())[0] if first_code_content else ""
        
        return {
            "name": assignment.name,
            "description": assignment.description or "No description provided",
            "language": assignment.language or "python",
            "code_content": template_code,
            "instructions": f"Assignment: {assignment.name}. {assignment.description or 'Complete the programming task as specified.'}"
        }
    
    async def _format_submissions_for_grading(self, submissions: List[StudentSubmission], assignment_id: int = None) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
        """Format submissions for AI grading service with privacy-preserving hashed names
        
        Returns:
            Tuple of (formatted_submissions, name_mapping) where name_mapping maps hashed_name -> real_name
        """
        formatted_submissions = []
        name_mapping = {}  # hashed_name -> real_name mapping
        
        for submission in submissions:
            # Get code content
            code = ""
            if hasattr(submission, 'code_content') and submission.code_content:
                # Use stored code content
                if isinstance(submission.code_content, dict) and submission.main_file in submission.code_content:
                    code = submission.code_content[submission.main_file]
                elif isinstance(submission.code_content, dict):
                    # Get first available code file
                    code = list(submission.code_content.values())[0] if submission.code_content else ""
            
            # Skip only if no code AND no execution results (this shouldn't happen as we pre-filter)
            has_output = submission.execution_output and submission.execution_output.strip()
            has_error = submission.execution_error and submission.execution_error.strip()
            
            if not code.strip() and not has_output and not has_error:
                print(f"⚠️ No code or execution results for {submission.student_name}, skipping")
                continue
            
            # Create privacy-preserving hash of student name
            assignment_id_to_use = assignment_id or submission.assignment_id
            hashed_name = self._hash_student_name(submission.student_name, assignment_id_to_use)
            name_mapping[hashed_name] = submission.student_name
            
            formatted_submission = {
                "username": hashed_name,  # Send hashed name to AI instead of real name
                "code": code,
                "output": submission.execution_output or "",
                "error_message": submission.execution_error or "",
                "status": submission.execution_status or "unknown"
            }
            
            formatted_submissions.append(formatted_submission)
            
            # Log what we're sending to AI for this submission
            execution_type = []
            if has_output:
                execution_type.append("output")
            if has_error:
                execution_type.append("error")
            if not execution_type:
                execution_type.append("code-only")
            
            print(f"🔒 Privacy: Hashed {submission.student_name} → {hashed_name} (has: {', '.join(execution_type)})")
        
        return formatted_submissions, name_mapping
    
    def _extract_student_feedback(self, reasoning: str, student_name: str) -> str:
        """Extract specific feedback for a student from AI grading reasoning"""
        if not reasoning or not student_name:
            return "AI grading completed"
        
        # Look for student-specific feedback in the reasoning string
        lines = reasoning.split(';')
        for line in lines:
            if student_name in line:
                # Extract the part after the student name
                parts = line.split(':', 1)
                if len(parts) > 1:
                    return parts[1].strip()
        
        # Fallback to generic message
        return f"Graded using AI analysis. Full details: {reasoning[:200]}..."


# Global instance
assignment_service = AssignmentService()
