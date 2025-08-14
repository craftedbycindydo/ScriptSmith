"""
Microservice-based code execution service
No Docker needed - uses dedicated microservice executors
"""

from typing import Dict, Any
from app.services.microservice_executor import microservice_executor

class CodeExecutionService:
    """
    Code execution service using microservice executors
    """
    
    def __init__(self):
        print("✅ Code execution service initialized (microservice mode)")
    
    async def execute_code(
        self, 
        code: str, 
        language: str, 
        input_data: str = ""
    ) -> Dict[str, Any]:
        """
        Execute code using microservice executors
        """
        try:
            return await microservice_executor.execute_code(code, language, input_data)
        except Exception as e:
            return {
                "output": "",
                "error": f"Microservice execution failed: {str(e)}",
                "execution_time": 0.0,
                "success": False
            }

# Create service instance
code_execution_service = CodeExecutionService()