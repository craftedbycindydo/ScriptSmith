from sqlalchemy import Column, Integer, String, DateTime, Text, Float, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.base import Base


class CodeSubmission(Base):
    __tablename__ = "code_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Nullable for anonymous submissions
    
    # Code details
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    code = Column(Text, nullable=False)
    language = Column(String(50), nullable=False)
    input_data = Column(Text, nullable=True)
    
    # Execution results
    output = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    execution_time = Column(Float, nullable=True)
    status = Column(String(50), nullable=True)  # success, error, timeout
    
    # Metadata
    is_public = Column(Boolean, default=False)
    is_template = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    executed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", backref="code_submissions")
    
    def __repr__(self):
        return f"<CodeSubmission(id={self.id}, language='{self.language}', user_id={self.user_id})>"
