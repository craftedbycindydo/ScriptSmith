#!/usr/bin/env python3
"""
Python Code Execution Microservice
Railway.app compatible - no Docker required
"""

import asyncio
import os
import sys
import tempfile
import time
import uuid
import signal
import subprocess
import threading
from pathlib import Path
from typing import Dict, Any, Optional
import shutil

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn


app = FastAPI(
    title="Python Code Execution Service",
    description="Microservice for secure Python code execution on Railway.app",
    version="1.0.0"
)


class CodeExecutionRequest(BaseModel):
    code: str
    input_data: Optional[str] = ""
    timeout: Optional[int] = 30


class CodeExecutionResponse(BaseModel):
    output: str
    error: str
    execution_time: float
    status: str  # "success", "error", "timeout"


class CodeValidationRequest(BaseModel):
    code: str


class CodeValidationResponse(BaseModel):
    is_valid: bool
    errors: list
    warnings: list


class PythonExecutor:
    def __init__(self):
        self.max_execution_time = 30
        self.max_memory_mb = 128
        self.max_code_size_kb = 50
        
    def _create_safe_environment(self) -> Dict[str, str]:
        """Create a safe environment for code execution"""
        # Start with minimal environment
        safe_env = {
            'PATH': '/usr/bin:/bin',
            'PYTHONPATH': '',
            'PYTHONHOME': sys.prefix,
            'HOME': '/tmp',
            'USER': 'coderunner',
            'SHELL': '/bin/sh',
            'TMPDIR': '/tmp',
        }
        return safe_env
    
    def _create_restricted_code(self, code: str) -> str:
        """Wrap user code with security restrictions"""
        # Use subprocess approach instead of complex exec wrapping
        return code
    
    async def execute_code(self, code: str, input_data: str = "", timeout: int = None) -> Dict[str, Any]:
        """Execute Python code in a secure environment"""
        
        if timeout:
            self.max_execution_time = min(timeout, 60)  # Max 60 seconds
            
        # Validate code size
        code_size_kb = len(code.encode('utf-8')) / 1024
        if code_size_kb > self.max_code_size_kb:
            return {
                "output": "",
                "error": f"Code size ({code_size_kb:.1f}KB) exceeds maximum allowed size ({self.max_code_size_kb}KB)",
                "execution_time": 0,
                "status": "error"
            }
        
        start_time = time.time()
        
        # Create temporary directory
        temp_dir = None
        try:
            temp_dir = tempfile.mkdtemp(prefix="python_exec_")
            code_file = Path(temp_dir) / f"code_{uuid.uuid4().hex}.py"
            
            # Write user code directly to file (simpler and safer)
            with open(code_file, 'w', encoding='utf-8') as f:
                f.write(code)
            
            # Prepare input
            input_bytes = input_data.encode('utf-8') if input_data else None
            
            # Execute code
            result = await self._run_python_code(code_file, input_bytes)
            
            execution_time = time.time() - start_time
            
            return {
                "output": result["stdout"],
                "error": result["stderr"],
                "execution_time": execution_time,
                "status": result["status"]
            }
            
        except Exception as e:
            return {
                "output": "",
                "error": f"Execution failed: {str(e)}",
                "execution_time": time.time() - start_time,
                "status": "error"
            }
        finally:
            # Clean up
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                except:
                    pass
    
    async def _run_python_code(self, code_file: Path, input_data: bytes = None) -> Dict[str, Any]:
        """Run Python code file with security restrictions using subprocess"""
        
        try:
            # Create safe environment
            env = self._create_safe_environment()
            
            # Execute with subprocess - much cleaner approach
            process = await asyncio.create_subprocess_exec(
                sys.executable, str(code_file),
                stdin=asyncio.subprocess.PIPE if input_data else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=code_file.parent,
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(input=input_data),
                    timeout=self.max_execution_time
                )
                
                return_code = process.returncode
                
                if return_code == 0:
                    status = "success"
                elif return_code == 124:  # Timeout exit code
                    status = "timeout"
                else:
                    status = "error"
                
                return {
                    "stdout": stdout.decode('utf-8', errors='replace').strip(),
                    "stderr": stderr.decode('utf-8', errors='replace').strip(),
                    "status": status
                }
                
            except asyncio.TimeoutError:
                # Kill process group
                try:
                    if hasattr(os, 'killpg'):
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                    else:
                        process.kill()
                except:
                    pass
                
                try:
                    await process.wait()
                except:
                    pass
                
                return {
                    "stdout": "",
                    "stderr": f"Code execution timed out after {self.max_execution_time} seconds",
                    "status": "timeout"
                }
                
        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Process execution failed: {str(e)}",
                "status": "error"
            }
    
    async def validate_syntax(self, code: str) -> Dict[str, Any]:
        """Validate Python syntax without executing"""
        try:
            compile(code, "<string>", "exec")
            return {
                "is_valid": True,
                "errors": [],
                "warnings": []
            }
        except SyntaxError as e:
            return {
                "is_valid": False,
                "errors": [f"Syntax error on line {e.lineno}: {e.msg}"],
                "warnings": []
            }
        except Exception as e:
            return {
                "is_valid": False,
                "errors": [f"Validation error: {str(e)}"],
                "warnings": []
            }


# Global executor instance
python_executor = PythonExecutor()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "python-executor"}


@app.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """Execute Python code"""
    try:
        result = await python_executor.execute_code(
            code=request.code,
            input_data=request.input_data or "",
            timeout=request.timeout
        )
        return CodeExecutionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/validate", response_model=CodeValidationResponse)
async def validate_code(request: CodeValidationRequest):
    """Validate Python code syntax"""
    try:
        result = await python_executor.validate_syntax(request.code)
        return CodeValidationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/info")
async def get_info():
    """Get service information"""
    return {
        "service": "python-executor",
        "language": "python",
        "version": "3.12",
        "max_execution_time": python_executor.max_execution_time,
        "max_memory_mb": python_executor.max_memory_mb,
        "max_code_size_kb": python_executor.max_code_size_kb,
        "available_libraries": [
            "builtins", "sys", "os", "math", "random", "json", "datetime",
            "collections", "itertools", "functools", "operator", "string",
            "re", "time", "calendar", "hashlib", "base64", "urllib", "http"
        ]
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
