#!/usr/bin/env python3
"""
C++ Code Execution Microservice
Railway.app compatible - Python wrapper for C++ execution
"""

import os
import sys
import tempfile
import time
import uuid
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(
    title="C++ Code Execution Service",
    description="Microservice for secure C++ code execution on Railway.app",
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
    status: str

class CodeValidationRequest(BaseModel):
    code: str

class CodeValidationResponse(BaseModel):
    is_valid: bool
    errors: list
    warnings: list

class CppExecutor:
    def __init__(self):
        self.max_execution_time = 30
        self.max_memory_mb = 128
        self.max_code_size_kb = 50
    
    async def execute_code(self, code: str, input_data: str = "", timeout: int = None) -> Dict[str, Any]:
        if timeout:
            self.max_execution_time = min(timeout, 60)
        
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
        temp_dir = None
        
        try:
            temp_dir = tempfile.mkdtemp(prefix="cpp_exec_")
            code_id = str(uuid.uuid4())
            cpp_file = Path(temp_dir) / f"code_{code_id}.cpp"
            exec_file = Path(temp_dir) / f"code_{code_id}"
            
            # Add standard headers and intelligently wrap user code
            full_code = """#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <climits>
#include <ctime>
#include <map>
#include <set>
#include <queue>
#include <stack>
#include <deque>
#include <list>
#include <bitset>
#include <utility>
#include <functional>
#include <numeric>
#include <iterator>
#include <sstream>
#include <iomanip>
using namespace std;

"""
            
            # Check if user code already has a main function
            if 'int main(' in code or 'int main()' in code:
                full_code += code
            else:
                # Wrap code in main function
                full_code += f"""int main() {{
    try {{
{code}
    }} catch (const exception& e) {{
        cerr << "Error: " << e.what() << endl;
        return 1;
    }} catch (...) {{
        cerr << "Unknown error occurred" << endl;
        return 1;
    }}
    return 0;
}}"""
            
            # Write code to file
            with open(cpp_file, 'w', encoding='utf-8') as f:
                f.write(full_code)
            
            # Compile
            compile_result = await self._compile_cpp(cpp_file, exec_file)
            if not compile_result["success"]:
                return {
                    "output": "",
                    "error": f"Compilation error: {compile_result['error']}",
                    "execution_time": time.time() - start_time,
                    "status": "error"
                }
            
            # Execute
            exec_result = await self._execute_cpp(exec_file, input_data)
            execution_time = time.time() - start_time
            
            return {
                "output": exec_result["stdout"],
                "error": exec_result["stderr"],
                "execution_time": execution_time,
                "status": exec_result["status"]
            }
            
        except Exception as e:
            return {
                "output": "",
                "error": f"Execution failed: {str(e)}",
                "execution_time": time.time() - start_time,
                "status": "error"
            }
        finally:
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                except:
                    pass
    
    async def _compile_cpp(self, cpp_file: Path, exec_file: Path) -> Dict[str, Any]:
        try:
            result = subprocess.run([
                'g++', '-std=c++17', '-O2', '-Wall', '-Wextra',
                str(cpp_file), '-o', str(exec_file)
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                return {"success": True, "error": ""}
            else:
                return {"success": False, "error": result.stderr.strip()}
                
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Compilation timed out"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _execute_cpp(self, exec_file: Path, input_data: str) -> Dict[str, Any]:
        try:
            # Set resource limits (more compatible approach)
            def set_limits():
                try:
                    import resource
                    # Set memory limit
                    resource.setrlimit(resource.RLIMIT_AS, (self.max_memory_mb * 1024 * 1024, self.max_memory_mb * 1024 * 1024))
                except (ImportError, OSError):
                    # Skip if resource limits not available (like on some macOS setups)
                    pass
            
            # Run without preexec_fn on macOS to avoid issues
            import platform
            if platform.system() == 'Darwin':  # macOS
                result = subprocess.run([
                    str(exec_file)
                ], 
                input=input_data, 
                capture_output=True, 
                text=True, 
                timeout=self.max_execution_time
                )
            else:
                result = subprocess.run([
                    str(exec_file)
                ], 
                input=input_data, 
                capture_output=True, 
                text=True, 
                timeout=self.max_execution_time,
                preexec_fn=set_limits
                )
            
            if result.returncode == 0:
                status = "success"
            else:
                status = "error"
            
            return {
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
                "status": status
            }
            
        except subprocess.TimeoutExpired:
            return {
                "stdout": "",
                "stderr": f"Code execution timed out after {self.max_execution_time} seconds",
                "status": "timeout"
            }
        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Execution error: {str(e)}",
                "status": "error"
            }
    
    async def validate_syntax(self, code: str) -> Dict[str, Any]:
        temp_dir = None
        try:
            temp_dir = tempfile.mkdtemp(prefix="cpp_validate_")
            code_id = str(uuid.uuid4())
            cpp_file = Path(temp_dir) / f"validate_{code_id}.cpp"
            
            # Add standard headers and wrap in main function for validation
            full_code = """#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <climits>
#include <ctime>
#include <map>
#include <set>
#include <queue>
#include <stack>
#include <deque>
#include <list>
#include <bitset>
#include <utility>
#include <functional>
#include <numeric>
#include <iterator>
#include <sstream>
#include <iomanip>
using namespace std;

int main() {
    try {
""" + code + """
    } catch (const exception& e) {
        cerr << "Error: " << e.what() << endl;
        return 1;
    } catch (...) {
        cerr << "Unknown error occurred" << endl;
        return 1;
    }
    return 0;
}"""
            
            with open(cpp_file, 'w', encoding='utf-8') as f:
                f.write(full_code)
            
            # Syntax check only
            result = subprocess.run([
                'g++', '-std=c++17', '-fsyntax-only', str(cpp_file)
            ], capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0:
                return {"is_valid": True, "errors": [], "warnings": []}
            else:
                return {
                    "is_valid": False,
                    "errors": [result.stderr.strip()],
                    "warnings": []
                }
                
        except Exception as e:
            return {
                "is_valid": False,
                "errors": [f"Validation error: {str(e)}"],
                "warnings": []
            }
        finally:
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                except:
                    pass

cpp_executor = CppExecutor()

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "cpp-executor"}

@app.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    try:
        result = await cpp_executor.execute_code(
            code=request.code,
            input_data=request.input_data or "",
            timeout=request.timeout
        )
        return CodeExecutionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/validate", response_model=CodeValidationResponse)
async def validate_code(request: CodeValidationRequest):
    try:
        result = await cpp_executor.validate_syntax(request.code)
        return CodeValidationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/info")
async def get_info():
    return {
        "service": "cpp-executor",
        "language": "cpp",
        "compiler": "g++",
        "standard": "C++17",
        "max_execution_time": cpp_executor.max_execution_time,
        "max_memory_mb": cpp_executor.max_memory_mb,
        "max_code_size_kb": cpp_executor.max_code_size_kb,
        "available_libraries": [
            "iostream", "string", "vector", "algorithm", "cmath",
            "cstdlib", "climits", "ctime", "map", "set", "queue",
            "stack", "deque", "list", "bitset", "utility"
        ]
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8004))
    uvicorn.run(app, host="0.0.0.0", port=port)
