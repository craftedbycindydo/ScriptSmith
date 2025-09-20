from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Admin/Teacher who created the assignment
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_by = relationship("User", foreign_keys=[created_by_id])
    
    # Classroom scope (nullable for migration compatibility)
    classroom_id = Column(Integer, ForeignKey("classrooms.id"), nullable=True)
    classroom = relationship("Classroom", back_populates="assignments")
    
    # File storage information
    zip_file_path = Column(String(500), nullable=True)  # Path to original ZIP file
    extracted_path = Column(String(500), nullable=True)  # Path to extracted directory
    
    # Assignment metadata
    total_students = Column(Integer, default=0)
    processed_students = Column(Integer, default=0)
    
    # Status tracking
    status = Column(String(50), default="uploaded")  # uploaded, processing, completed, failed
    
    # Execution results summary
    execution_summary = Column(JSON, nullable=True)  # {success: int, error: int, timeout: int}
    
    # Plagiarism analysis
    plagiarism_status = Column(String(50), default="pending")  # pending, processing, completed, failed
    plagiarism_report = Column(JSON, nullable=True)
    plagiarism_threshold = Column(Float, default=0.8)  # Similarity threshold for flagging
    
    # Processing timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    processing_started_at = Column(DateTime(timezone=True), nullable=True)
    processing_completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Settings
    language = Column(String(50), nullable=True)  # Primary language for the assignment
    timeout_seconds = Column(Integer, default=30)  # Timeout for each student's code
    
    def __repr__(self):
        return f"<Assignment(id={self.id}, name='{self.name}', status='{self.status}')>"


class StudentSubmission(Base):
    __tablename__ = "student_submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    assignment = relationship("Assignment", back_populates="submissions")
    
    # Student information
    student_name = Column(String(255), nullable=False)  # Extracted from folder name
    folder_path = Column(String(500), nullable=False)   # Path to student's folder
    
    # Code files information
    code_files = Column(JSON, nullable=True)  # List of code files found
    main_file = Column(String(500), nullable=True)  # Primary file to execute
    code_content = Column(JSON, nullable=True)  # Dict mapping filename to code content
    
    # Execution results
    execution_status = Column(String(50), default="pending")  # pending, success, error, timeout
    execution_output = Column(Text, nullable=True)
    execution_error = Column(Text, nullable=True)
    execution_time = Column(Float, nullable=True)
    
    # Results file path
    results_file_path = Column(String(500), nullable=True)  # Path to saved results file
    
    # Plagiarism flags
    similarity_scores = Column(JSON, nullable=True)  # {student_name: similarity_score}
    is_flagged = Column(Boolean, default=False)
    flagged_for = Column(JSON, nullable=True)  # List of similar submissions
    
    # Grading
    grade = Column(Float, nullable=True)  # Grade/score for the submission
    max_grade = Column(Float, nullable=True, default=100.0)  # Maximum possible grade
    grading_notes = Column(Text, nullable=True)  # Optional grading comments
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    executed_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<StudentSubmission(id={self.id}, student='{self.student_name}', status='{self.execution_status}')>"


class PlagiarismAnalysis(Base):
    """Store detailed AI-powered plagiarism analysis results for caching and historical reference"""
    __tablename__ = "plagiarism_analyses"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    assignment = relationship("Assignment", back_populates="plagiarism_analyses")
    
    # Student pair being compared
    student_a_id = Column(Integer, ForeignKey("student_submissions.id"), nullable=False)
    student_b_id = Column(Integer, ForeignKey("student_submissions.id"), nullable=False)
    student_a = relationship("StudentSubmission", foreign_keys=[student_a_id], back_populates="plagiarism_analyses_as_a")
    student_b = relationship("StudentSubmission", foreign_keys=[student_b_id], back_populates="plagiarism_analyses_as_b")
    
    # Code snapshots (for quick access without file system)
    code_a_content = Column(Text, nullable=True)  # Snapshot of student A's code at time of analysis
    code_b_content = Column(Text, nullable=True)  # Snapshot of student B's code at time of analysis
    code_language = Column(String(50), nullable=True)  # Programming language detected
    
    # AI Analysis Results
    similarity_score = Column(Float, nullable=False, default=0.0)  # 0.0 - 1.0 similarity score
    is_flagged = Column(Boolean, default=False)  # Whether similarity exceeds threshold
    confidence_level = Column(String(20), nullable=True)  # 'high', 'medium', 'low', 'unavailable'
    
    # Detailed AI Analysis (JSON)
    ai_explanation = Column(Text, nullable=True)  # AI's detailed explanation
    ai_evidence = Column(JSON, nullable=True)  # Structured evidence from AI
    analysis_method = Column(String(50), nullable=True)  # 'ai_powered', 'fallback', 'manual'
    
    # Analysis metadata
    threshold_used = Column(Float, nullable=False)  # Threshold used for flagging
    model_used = Column(String(100), nullable=True)  # AI model used (e.g., 'gpt-4o-mini')
    tokens_used = Column(Integer, nullable=True)  # Approximate tokens consumed
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<PlagiarismAnalysis(id={self.id}, similarity={self.similarity_score:.3f}, flagged={self.is_flagged})>"


class CodeSnapshot(Base):
    """Store code content snapshots for quick access and historical reference"""
    __tablename__ = "code_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("student_submissions.id"), nullable=False)
    submission = relationship("StudentSubmission", back_populates="code_snapshots")
    
    # Code information
    file_name = Column(String(500), nullable=False)  # Original file name
    file_content = Column(Text, nullable=False)  # Full file content
    file_language = Column(String(50), nullable=True)  # Detected language
    file_size = Column(Integer, nullable=True)  # File size in bytes
    
    # Content hashes for deduplication and change detection
    content_hash = Column(String(64), nullable=False, index=True)  # SHA-256 hash
    normalized_hash = Column(String(64), nullable=True, index=True)  # Hash of normalized code
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<CodeSnapshot(id={self.id}, file='{self.file_name}', submission_id={self.submission_id})>"


# Add back-references
Assignment.submissions = relationship("StudentSubmission", back_populates="assignment", cascade="all, delete-orphan")
Assignment.plagiarism_analyses = relationship("PlagiarismAnalysis", back_populates="assignment", cascade="all, delete-orphan")

StudentSubmission.plagiarism_analyses_as_a = relationship(
    "PlagiarismAnalysis", 
    foreign_keys=[PlagiarismAnalysis.student_a_id], 
    back_populates="student_a",
    cascade="all, delete-orphan"
)
StudentSubmission.plagiarism_analyses_as_b = relationship(
    "PlagiarismAnalysis", 
    foreign_keys=[PlagiarismAnalysis.student_b_id], 
    back_populates="student_b",
    cascade="all, delete-orphan"
)
StudentSubmission.code_snapshots = relationship("CodeSnapshot", back_populates="submission", cascade="all, delete-orphan")
