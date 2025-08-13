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
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    executed_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<StudentSubmission(id={self.id}, student='{self.student_name}', status='{self.execution_status}')>"


# Add back-reference
Assignment.submissions = relationship("StudentSubmission", back_populates="assignment", cascade="all, delete-orphan")
