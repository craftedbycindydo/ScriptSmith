"""
Microservice Code Execution Client
Replaces Docker-based execution with HTTP calls to language-specific microservices
"""

import asyncio
import aiohttp
import time
from typing import Dict, Any, Optional
from app.core.config import settings

class MicroserviceExecutor:
    def __init__(self):
        # Microservice endpoints from configuration
        self.language_endpoints = {
            "python": settings.python_executor_url,
            "javascript": settings.javascript_executor_url,
            "typescript": settings.javascript_executor_url,  # Same as JS
            "java": settings.java_executor_url,
            "cpp": settings.cpp_executor_url,
            "go": settings.go_executor_url,
            "rust": settings.rust_executor_url,
        }
        
        # HTTP client session
        self.session = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if self.session is None:
            timeout = aiohttp.ClientTimeout(total=settings.max_execution_time + 10)
            self.session = aiohttp.ClientSession(timeout=timeout)
        return self.session
    
    async def execute_code(
        self, 
        code: str, 
        language: str, 
        input_data: str = ""
    ) -> Dict[str, Any]:
        """
        Execute code using appropriate microservice
        """
        if language not in self.language_endpoints:
            return {
                "output": "",
                "error": f"Language '{language}' is not supported",
                "status": "error"
            }
        
        endpoint = self.language_endpoints[language]
        
        try:
            session = await self._get_session()
            
            payload = {
                "code": code,
                "inputData": input_data,
                "timeout": settings.max_execution_time,
                "language": language
            }
            
            async with session.post(f"{endpoint}/execute", json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    
                    # Normalize response format to match original Docker service
                    return {
                        "output": result.get("output", ""),
                        "error": result.get("error", ""),
                        "status": result.get("status", "error")
                    }
                else:
                    error_text = await response.text()
                    return {
                        "output": "",
                        "error": f"Microservice error (HTTP {response.status}): {error_text}",
                        "status": "error"
                    }
                    
        except asyncio.TimeoutError:
            return {
                "output": "",
                "error": f"Code execution timed out after {settings.max_execution_time} seconds",
                "status": "timeout"
            }
        except aiohttp.ClientError as e:
            return {
                "output": "",
                "error": f"Network error: {str(e)}",
                "status": "error"
            }
        except Exception as e:
            return {
                "output": "",
                "error": f"Execution failed: {str(e)}",
                "status": "error"
            }
    
    async def validate_code_syntax(self, code: str, language: str) -> Dict[str, Any]:
        """
        Validate code syntax using appropriate microservice
        """
        if language not in self.language_endpoints:
            return {
                "is_valid": False,
                "errors": [f"Language '{language}' is not supported"],
                "warnings": []
            }
        
        endpoint = self.language_endpoints[language]
        
        try:
            session = await self._get_session()
            
            payload = {"code": code}
            
            async with session.post(f"{endpoint}/validate", json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    
                    # Normalize response format
                    return {
                        "is_valid": result.get("isValid", result.get("is_valid", False)),
                        "errors": result.get("errors", []),
                        "warnings": result.get("warnings", [])
                    }
                else:
                    error_text = await response.text()
                    return {
                        "is_valid": False,
                        "errors": [f"Validation service error (HTTP {response.status}): {error_text}"],
                        "warnings": []
                    }
                    
        except Exception as e:
            return {
                "is_valid": False,
                "errors": [f"Validation failed: {str(e)}"],
                "warnings": []
            }
    
    async def get_service_info(self, language: str) -> Dict[str, Any]:
        """
        Get information about a specific language microservice
        """
        if language not in self.language_endpoints:
            return {"error": f"Language '{language}' is not supported"}
        
        endpoint = self.language_endpoints[language]
        
        try:
            session = await self._get_session()
            
            async with session.get(f"{endpoint}/info") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"error": f"Service info unavailable (HTTP {response.status})"}
                    
        except Exception as e:
            return {"error": f"Failed to get service info: {str(e)}"}
    
    async def health_check(self, language: str = None) -> Dict[str, Any]:
        """
        Check health of microservices
        """
        if language:
            # Check specific language service
            if language not in self.language_endpoints:
                return {"status": "error", "message": f"Language '{language}' is not supported"}
            
            languages_to_check = [language]
        else:
            # Check all services
            languages_to_check = list(self.language_endpoints.keys())
        
        results = {}
        
        try:
            session = await self._get_session()
            
            # Check each service
            for lang in languages_to_check:
                endpoint = self.language_endpoints[lang]
                try:
                    async with session.get(f"{endpoint}/health", timeout=aiohttp.ClientTimeout(total=5)) as response:
                        if response.status == 200:
                            health_data = await response.json()
                            results[lang] = {
                                "status": "healthy",
                                "endpoint": endpoint,
                                "response": health_data
                            }
                        else:
                            results[lang] = {
                                "status": "unhealthy",
                                "endpoint": endpoint,
                                "error": f"HTTP {response.status}"
                            }
                except Exception as e:
                    results[lang] = {
                        "status": "unreachable",
                        "endpoint": endpoint,
                        "error": str(e)
                    }
            
            # Summary
            healthy_count = sum(1 for r in results.values() if r["status"] == "healthy")
            total_count = len(results)
            
            return {
                "overall_status": "healthy" if healthy_count == total_count else "degraded",
                "healthy_services": healthy_count,
                "total_services": total_count,
                "services": results
            }
            
        except Exception as e:
            return {
                "overall_status": "error",
                "error": f"Health check failed: {str(e)}"
            }
    
    async def close(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
            self.session = None

# Global instance
microservice_executor = MicroserviceExecutor()
