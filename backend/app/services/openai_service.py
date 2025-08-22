"""
OpenAI service for code complexity analysis
"""

import asyncio
import aiohttp
import ssl
import certifi
from typing import Dict, Any, Optional
from app.core.config import settings


class OpenAIService:
    """
    Service to analyze code complexity using OpenAI API
    """
    
    def __init__(self):
        self.api_key = settings.openai_api_key
        self.base_url = "https://api.openai.com/v1"
        self.model = "gpt-4o"
        
    async def analyze_code_complexity(
        self, 
        code: str, 
        language: str
    ) -> Dict[str, Any]:
        """
        Analyze code complexity using OpenAI API
        
        Args:
            code: The code to analyze
            language: Programming language
            
        Returns:
            Dict containing time_complexity, space_complexity, and explanation
            or error information if analysis fails
        """
        if not self.api_key:
            return {
                "time_complexity": "Not Available",
                "space_complexity": "Not Available",
                "explanation": "OpenAI API key not configured",
                "available": False
            }
            
        try:
            # Create the prompt for complexity analysis
            prompt = self._create_complexity_prompt(code, language)
            
            # Create SSL context for secure connections
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            
            # Make API call with timeout
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a code complexity analysis expert. Provide concise time and space complexity analysis."
                        },
                        {
                            "role": "user", 
                            "content": prompt
                        }
                    ],
                    "max_tokens": 300,
                    "temperature": 0.1
                }
                
                # Use short timeout to not delay code execution response
                timeout = aiohttp.ClientTimeout(total=3)
                
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=timeout
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        return self._parse_complexity_response(result)
                    else:
                        # API error - return fallback
                        return self._get_fallback_response("API request failed")
                        
        except asyncio.TimeoutError:
            return self._get_fallback_response("Analysis timeout")
        except aiohttp.ClientError:
            return self._get_fallback_response("Network error")
        except Exception:
            # Don't expose any error details to prevent information leakage
            return self._get_fallback_response("Analysis unavailable")
    
    def _create_complexity_prompt(self, code: str, language: str) -> str:
        """Create a focused prompt for complexity analysis"""
        return f"""
Analyze the time and space complexity of this {language} code. 
Provide ONLY:
1. Time Complexity: (e.g., O(n), O(log n), O(n²))
2. Space Complexity: (e.g., O(1), O(n), O(n²))  
3. Brief explanation (max 2 sentences)

Format your response exactly as:
Time: O(...)
Space: O(...)
Explanation: ...

Code to analyze:
```{language}
{code}
```
"""
    
    def _parse_complexity_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse OpenAI response and extract complexity information"""
        try:
            content = response["choices"][0]["message"]["content"]
            
            # Parse the structured response
            time_complexity = "Not Available"
            space_complexity = "Not Available"
            explanation = "Not Available"
            
            lines = content.strip().split('\n')
            for line in lines:
                line = line.strip()
                if line.lower().startswith('time:'):
                    time_complexity = line.split(':', 1)[1].strip()
                elif line.lower().startswith('space:'):
                    space_complexity = line.split(':', 1)[1].strip()
                elif line.lower().startswith('explanation:'):
                    explanation = line.split(':', 1)[1].strip()
            
            # If parsing failed, try to extract from full content
            if time_complexity == "Not Available" or space_complexity == "Not Available":
                # Fallback: extract O(...) patterns from content
                import re
                o_patterns = re.findall(r'O\([^)]+\)', content)
                if len(o_patterns) >= 2:
                    time_complexity = o_patterns[0] if time_complexity == "Not Available" else time_complexity
                    space_complexity = o_patterns[1] if space_complexity == "Not Available" else space_complexity
                elif len(o_patterns) == 1:
                    time_complexity = o_patterns[0] if time_complexity == "Not Available" else time_complexity
                
                if explanation == "Not Available":
                    explanation = content[:200] + "..." if len(content) > 200 else content
            
            return {
                "time_complexity": time_complexity,
                "space_complexity": space_complexity,
                "explanation": explanation,
                "available": True
            }
            
        except (KeyError, IndexError, Exception):
            return self._get_fallback_response("Failed to parse response")
    
    def _get_fallback_response(self, reason: str = "Analysis unavailable") -> Dict[str, Any]:
        """Return a fallback response when analysis fails"""
        return {
            "time_complexity": "Not Available",
            "space_complexity": "Not Available", 
            "explanation": "Complexity analysis not available",
            "available": False
        }


# Create service instance
openai_service = OpenAIService()
