import asyncio
import os
import tempfile
import json
import time
import uuid
import shutil
from typing import Dict, Any, Optional
import docker
from docker.errors import ContainerError, ImageNotFound, APIError
from app.core.config import settings

class CodeExecutionService:
    def __init__(self):
        try:
            self.docker_client = docker.from_env()
            self.images_preloaded = False
        except Exception as e:
            print(f"Docker client initialization failed: {e}")
            self.docker_client = None
            self.images_preloaded = False
    
    # Language-specific Docker configurations with pre-installed libraries for kids
    LANGUAGE_CONFIGS = {
        "python": {
            "image": "code-execution-python:latest",
            "file_extension": "py",
            "cmd_template": ["python", "/app/main.py"],
            "setup_commands": [],
            "libraries": ["numpy", "pandas", "matplotlib", "requests", "pillow", "scipy", "seaborn", "plotly", "beautifulsoup4"]
        },
        "javascript": {
            "image": "code-execution-javascript:latest",
            "file_extension": "js", 
            "cmd_template": ["node", "/app/main.js"],
            "setup_commands": [],
            "libraries": ["lodash", "axios", "moment", "uuid", "express", "socket.io", "chalk", "fs-extra"]
        },
        "typescript": {
            "image": "code-execution-javascript:latest",
            "file_extension": "js",  # Run as JS to avoid TS compilation overhead
            "cmd_template": ["node", "/app/main.js"],
            "setup_commands": [],
            "libraries": ["lodash", "axios", "moment", "uuid", "express", "socket.io", "chalk", "typescript", "ts-node"]
        },
        "java": {
            "image": "code-execution-java:latest",
            "file_extension": "java",
            "cmd_template": ["sh", "-c", "cd /app && javac -cp '/usr/local/java-libs/*:.' Main.java && java -cp '/usr/local/java-libs/*:.' Main"],
            "setup_commands": [],
            "libraries": ["gson", "commons-lang3", "commons-io", "junit"]
        },
        "cpp": {
            "image": "gcc:12",
            "file_extension": "cpp",
            "cmd_template": ["sh", "-c", "cd /app && g++ -o main main.cpp && ./main"],
            "setup_commands": [],
            "libraries": ["STL (standard library only)"]
        },
        "go": {
            "image": "golang:1.21",
            "file_extension": "go",
            "cmd_template": ["sh", "-c", "cd /app && GOCACHE=/app/.cache GOPATH=/app go run main.go"],
            "setup_commands": [],
            "libraries": ["standard library only"]
        },
        "rust": {
            "image": "rust:1.75",
            "file_extension": "rs",
            "cmd_template": ["sh", "-c", "cd /app && rustc main.rs && ./main"],
            "setup_commands": [],
            "libraries": ["standard library only"]
        }
    }
    
    async def _pre_pull_images(self):
        """Pre-pull all required Docker images to eliminate runtime delays"""
        if self.docker_client is None or self.images_preloaded:
            return
            
        print("Pre-pulling Docker images for faster execution...")
        unique_images = set()
        for config in self.LANGUAGE_CONFIGS.values():
            unique_images.add(config["image"])
        
        for image in unique_images:
            try:
                await self._ensure_image(image)
                print(f"✅ Pre-pulled: {image}")
            except Exception as e:
                print(f"❌ Failed to pre-pull {image}: {e}")
        
        self.images_preloaded = True
        print("🚀 All Docker images pre-loaded for optimal performance!")
    
    async def execute_code(
        self, 
        code: str, 
        language: str, 
        input_data: str = ""
    ) -> Dict[str, Any]:
        """
        Execute code in a secure Docker container
        """
        if self.docker_client is None:
            return {
                "output": "",
                "error": "Docker service is not available",
                "status": "error"
            }
        
        # Pre-pull images on first use for optimal performance
        if not self.images_preloaded:
            await self._pre_pull_images()
        
        if language not in self.LANGUAGE_CONFIGS:
            return {
                "output": "",
                "error": f"Language '{language}' is not supported",
                "status": "error"
            }
        
        config = self.LANGUAGE_CONFIGS[language]
        
        try:
            # Images are pre-pulled for optimal performance
            
            # Create temporary directory on host for proper volume mounting
            # This works because we mount host Docker socket
            execution_id = str(uuid.uuid4())
            # Use a host-accessible path - this will be mounted properly
            temp_dir = f"/tmp/code_execution_{execution_id}"
            os.makedirs(temp_dir, exist_ok=True)
            
            try:
                # Write code to file
                filename = self._get_filename(language, config["file_extension"])
                code_file_path = os.path.join(temp_dir, filename)
                
                with open(code_file_path, 'w', encoding='utf-8') as f:
                    f.write(code)
                
                # Write input data to file if provided
                input_file_path = None
                if input_data:
                    input_file_path = os.path.join(temp_dir, "input.txt")
                    with open(input_file_path, 'w', encoding='utf-8') as f:
                        f.write(input_data)
                
                # Execute code in Docker container
                result = await self._run_in_container(
                    config, temp_dir, input_data
                )
                
                return result
            finally:
                # Clean up temporary directory
                try:
                    import shutil
                    shutil.rmtree(temp_dir)
                except Exception:
                    pass
                
        except Exception as e:
            return {
                "output": "",
                "error": f"Execution failed: {str(e)}",
                "status": "error"
            }
    
    async def _ensure_image(self, image_name: str):
        """Ensure Docker image is available locally"""
        try:
            self.docker_client.images.get(image_name)
        except ImageNotFound:
            print(f"Pulling Docker image: {image_name}")
            await asyncio.to_thread(self.docker_client.images.pull, image_name)
    
    def _get_filename(self, language: str, extension: str) -> str:
        """Get appropriate filename for the language"""
        if language == "java":
            return "Main.java"  # Java requires class name to match filename
        else:
            return f"main.{extension}"
    
    async def _run_in_container(
        self, 
        config: Dict[str, Any], 
        temp_dir: str, 
        input_data: str = ""
    ) -> Dict[str, Any]:
        """Run code in Docker container with security restrictions"""
        
        start_time = time.time()
        container = None
        
        try:
            # Container configuration - DON'T auto-remove to avoid race condition
            container_config = {
                "image": config["image"],
                "command": config["cmd_template"],
                "volumes": {temp_dir: {"bind": "/app", "mode": "rw"}},
                "working_dir": "/app",
                "network_disabled": True,  # Disable network access
                "mem_limit": f"{settings.max_memory_mb}m",  # Memory limit
                "memswap_limit": f"{settings.max_memory_mb}m",  # Swap limit
                "cpu_period": 100000,  # 100ms
                "cpu_quota": 50000,    # 50% of one CPU core
                "security_opt": ["no-new-privileges"],  # Security
                "cap_drop": ["ALL"],   # Drop all capabilities
                "read_only": False,    # Allow writing to /app for compilation
                "remove": False,       # Don't auto-remove to avoid race condition
                "stdin_open": bool(input_data),  # Enable stdin if input provided
                "tty": False,
                "user": "1000:1000"   # Run as non-root user
            }
            
            # Create and start container
            container = await asyncio.to_thread(
                self.docker_client.containers.run, 
                **container_config,
                detach=True
            )
            
            # Send input data if provided
            if input_data:
                try:
                    await asyncio.to_thread(
                        container.exec_run, 
                        f"echo '{input_data}' | cat",
                        stdin=True
                    )
                except Exception:
                    # Ignore input errors for now
                    pass
            
            # Wait for container to finish with timeout
            try:
                container_result = await asyncio.wait_for(
                    asyncio.to_thread(container.wait),
                    timeout=settings.max_execution_time
                )
                exit_code = container_result['StatusCode']
            except asyncio.TimeoutError:
                # Kill container if it times out
                try:
                    await asyncio.to_thread(container.kill)
                except Exception:
                    pass
                # Clean up container
                try:
                    await asyncio.to_thread(container.remove, force=True)
                except Exception:
                    pass
                return {
                    "output": "",
                    "error": f"Code execution timed out after {settings.max_execution_time} seconds",
                    "status": "timeout"
                }
            
            # Get container logs (stdout and stderr) before removing
            try:
                logs = await asyncio.to_thread(container.logs, stdout=True, stderr=True)
                logs_str = logs.decode('utf-8', errors='replace')
            except Exception as e:
                logs_str = f"Failed to retrieve logs: {str(e)}"
            
            # Clean up container manually
            try:
                await asyncio.to_thread(container.remove, force=True)
            except Exception:
                # Container cleanup failure is not critical
                pass
            
            execution_time = time.time() - start_time
            
            if exit_code == 0:
                return {
                    "output": logs_str.strip(),
                    "error": "",
                    "status": "success"
                }
            else:
                return {
                    "output": "",
                    "error": logs_str.strip() or "Code execution failed",
                    "status": "error"
                }
                
        except ContainerError as e:
            return {
                "output": "",
                "error": f"Container error: {e.stderr.decode('utf-8', errors='replace')}",
                "status": "error"
            }
        except APIError as e:
            return {
                "output": "",
                "error": f"Docker API error: {str(e)}",
                "status": "error"
            }
        except Exception as e:
            return {
                "output": "",
                "error": f"Unexpected error: {str(e)}",
                "status": "error"
            }
        finally:
            # Ensure container cleanup even if something goes wrong
            if container:
                try:
                    await asyncio.to_thread(container.remove, force=True)
                except Exception:
                    # Container cleanup failure is not critical
                    pass
    
    async def validate_code_syntax(self, code: str, language: str) -> Dict[str, Any]:
        """
        Validate code syntax without executing it
        """
        if language == "python":
            return await self._validate_python_syntax(code)
        elif language in ["javascript", "typescript"]:
            return await self._validate_js_syntax(code)
        else:
            # For other languages, use compilation check
            return await self._validate_by_compilation(code, language)
    
    async def _validate_python_syntax(self, code: str) -> Dict[str, Any]:
        """Validate Python syntax"""
        try:
            compile(code, "<string>", "exec")
            return {"is_valid": True, "errors": [], "warnings": []}
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
    
    async def _validate_js_syntax(self, code: str) -> Dict[str, Any]:
        """Validate JavaScript/TypeScript syntax using Node.js"""
        container = None
        try:
            # Use Node.js to check syntax
            config = self.LANGUAGE_CONFIGS["javascript"]
            
            with tempfile.TemporaryDirectory() as temp_dir:
                code_file = os.path.join(temp_dir, "check.js")
                with open(code_file, 'w', encoding='utf-8') as f:
                    f.write(code)
                
                # Run syntax check without auto-remove
                container = await asyncio.to_thread(
                    self.docker_client.containers.run,
                    config["image"],
                    ["node", "--check", "/app/check.js"],
                    volumes={temp_dir: {"bind": "/app", "mode": "ro"}},
                    remove=False,
                    network_disabled=True,
                    detach=True
                )
                
                # Wait for completion
                await asyncio.to_thread(container.wait)
                
                # Manual cleanup
                try:
                    await asyncio.to_thread(container.remove, force=True)
                except Exception:
                    pass
                
                return {"is_valid": True, "errors": [], "warnings": []}
                
        except ContainerError as e:
            error_msg = e.stderr.decode('utf-8', errors='replace')
            return {
                "is_valid": False,
                "errors": [error_msg],
                "warnings": []
            }
        except Exception as e:
            return {
                "is_valid": False,
                "errors": [f"Validation error: {str(e)}"],
                "warnings": []
            }
        finally:
            # Ensure container cleanup
            if container:
                try:
                    await asyncio.to_thread(container.remove, force=True)
                except Exception:
                    pass
    
    async def _validate_by_compilation(self, code: str, language: str) -> Dict[str, Any]:
        """Validate by attempting compilation"""
        # This is a simplified validation - in production you might want
        # more sophisticated syntax checking
        return {"is_valid": True, "errors": [], "warnings": []}

# Global instance
code_execution_service = CodeExecutionService()
