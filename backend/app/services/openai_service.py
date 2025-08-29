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
    Service to analyze code complexity and grade code submissions using OpenAI API
    """
    
    def __init__(self):
        # Securely handle API key - never store in logs or expose in errors
        self._api_key = settings.openai_api_key
        self.base_url = "https://api.openai.com/v1"
        self.model = "gpt-4o"
        self.max_tokens = 128000  # GPT-4o context window
        self.tokens_per_char = 4  # Rough estimate: 1 token ≈ 4 characters
        
    @property
    def api_key(self) -> Optional[str]:
        """Secure access to API key - never log or expose this value"""
        return self._api_key
    
    def _mask_api_key(self, text: str) -> str:
        """
        Remove any accidental API key exposure from text (logs, errors, etc.)
        """
        if self._api_key and self._api_key in text:
            return text.replace(self._api_key, "***OPENAI_API_KEY***")
        return text
    
    def _validate_api_key(self) -> bool:
        """
        Validate that API key is properly configured and not empty
        """
        return bool(self._api_key and len(self._api_key.strip()) > 0)
    
    def _get_secure_headers(self) -> Dict[str, str]:
        """
        Get HTTP headers with secure API key handling
        """
        if not self._validate_api_key():
            raise ValueError("OpenAI API key not configured")
        
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": "CodeSubmissionPlatform/1.0"  # Custom user agent
        }
        
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
                headers = self._get_secure_headers()
                
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


    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text"""
        return len(text) // self.tokens_per_char
    
    def calculate_batch_size(self, template_info: str, submissions: list) -> int:
        """Calculate optimal batch size based on token limits"""
        # Include template code content in token calculation
        template_content = template_info if isinstance(template_info, str) else str(template_info)
        template_tokens = self.estimate_tokens(template_content)
        reserve_tokens = 2000  # Increased reserve for larger prompts with template code
        
        available_tokens = self.max_tokens - template_tokens - reserve_tokens
        
        # Calculate average submission size
        if not submissions:
            return 0
            
        avg_submission_tokens = sum(
            self.estimate_tokens(sub.get('code', '') + sub.get('output', '') + sub.get('error_message', ''))
            for sub in submissions
        ) // len(submissions)
        
        # Add overhead per submission (student info, formatting)
        submission_overhead = 200
        total_per_submission = avg_submission_tokens + submission_overhead
        
        if total_per_submission <= 0:
            return len(submissions)
            
        max_batch_size = available_tokens // total_per_submission
        return max(1, min(max_batch_size, len(submissions)))
    
    async def grade_code_batch(
        self,
        template_info: Dict[str, Any],
        submissions: list,
        grade_scale: int,
        leniency: int
    ) -> Dict[str, Any]:
        """
        Grade multiple code submissions in a single API call
        
        Args:
            template_info: Template details (name, description, language, etc.)
            submissions: List of student submissions to grade
            grade_scale: Grading scale (10, 50, or 100)
            leniency: Leniency percentage (0-100)
            
        Returns:
            Dict with grades for each student and any errors
        """
        if not self.api_key:
            return {
                "grades": {},
                "errors": ["OpenAI API key not configured"],
                "available": False
            }
        
        if not submissions:
            return {"grades": {}, "errors": [], "available": True}
        
        try:
            # Create the batch grading prompt
            prompt = self._create_batch_grading_prompt(
                template_info, submissions, grade_scale, leniency
            )
            
            # Create SSL context for secure connections
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            
            # Make API call with timeout
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                headers = self._get_secure_headers()
                
                payload = {
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are an expert code grader. Grade each submission fairly and consistently. Return grades in the exact JSON format requested."
                        },
                        {
                            "role": "user", 
                            "content": prompt
                        }
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.1
                }
                
                # Use reasonable timeout for batch grading
                timeout = aiohttp.ClientTimeout(total=30)
                
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=timeout
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        return self._parse_batch_grading_response(result, submissions)
                    else:
                        # API error - return failure
                        return {
                            "grades": {},
                            "errors": [f"OpenAI API request failed: HTTP {response.status}"],
                            "available": False
                        }
                        
        except asyncio.TimeoutError:
            return {
                "grades": {},
                "errors": ["AI grading timed out"],
                "available": False
            }
        except aiohttp.ClientError as e:
            # Mask any potential API key exposure in error messages
            safe_error_msg = self._mask_api_key(str(e))
            return {
                "grades": {},
                "errors": [f"Network error occurred"],  # Don't expose detailed network errors
                "available": False
            }
        except Exception as e:
            # Mask any potential API key exposure and don't expose internal errors
            safe_error_msg = self._mask_api_key(str(e))
            return {
                "grades": {},
                "errors": ["AI grading service temporarily unavailable"],
                "available": False
            }
    
    def _create_batch_grading_prompt(
        self, 
        template_info: Dict[str, Any], 
        submissions: list, 
        grade_scale: int, 
        leniency: int
    ) -> str:
        """Create a comprehensive prompt for batch grading"""
        
        leniency_desc = "very strict" if leniency < 30 else "strict" if leniency < 50 else "moderate" if leniency < 70 else "lenient"
        
        template_code = template_info.get('code_content', '')
        
        prompt = f"""
Grade the following {len(submissions)} code submissions for this assignment:

TEMPLATE INFORMATION:
- Name: {template_info.get('name', 'Code Assignment')}
- Language: {template_info.get('language', 'Unknown')}
- Description: {template_info.get('description', 'No description provided')}

ORIGINAL TEMPLATE/ASSIGNMENT CODE:
```{template_info.get('language', '')}
{template_code}
```

GRADING SCALE: Each submission will be graded from 0 to {grade_scale} points.

LENIENCY SETTING: {leniency}% leniency ({leniency_desc} grading)
- This affects how forgiving you should be with minor style/formatting issues
- Higher leniency = more forgiving, lower leniency = more strict
- ALWAYS give full points for correct output regardless of leniency

GRADING GUIDELINES:
1. PERFECT CODE (Correct output + good style): {grade_scale} points
2. WORKING CODE (Correct output, any style): {grade_scale - 5} to {grade_scale} points  
3. MOSTLY WORKING (Minor output differences): {int(grade_scale * 0.8)} to {grade_scale - 6} points
4. PARTIAL WORKING (Some logic correct): {int(grade_scale * 0.6)} to {int(grade_scale * 0.79)} points
5. SHOWS EFFORT (Major errors but tries): {int(grade_scale * 0.3)} to {int(grade_scale * 0.59)} points
6. MINIMAL EFFORT (Very basic attempt): {int(grade_scale * 0.1)} to {int(grade_scale * 0.29)} points
7. NO SUBMISSION OR BROKEN: 0 points

CRITICAL RULE: If student code produces the EXACT same output as the template, give {grade_scale} points (full credit).

LENIENCY APPLICATION:
- High leniency ({leniency}% ≥ 70): Be generous with partial credit, overlook style issues
- Medium leniency (30% ≤ {leniency}% < 70): Standard grading, some tolerance for style
- Low leniency ({leniency}% < 30): Strict grading, deduct for style and minor issues

SUBMISSIONS TO GRADE:
"""
        
        for i, submission in enumerate(submissions, 1):
            username = submission.get('username', f'Student{i}')
            code = submission.get('code', 'No code submitted')
            output = submission.get('output', 'No output')
            error = submission.get('error_message', 'None')
            status = submission.get('status', 'unknown')
            
            prompt += f"""
Student {i}: {username}
Status: {status}
Code:
```{template_info.get('language', '')}
{code}
```
Output: {output}
Error: {error}

---
"""
        
        prompt += f"""
FINAL INSTRUCTIONS:
- Grade each submission from 0 to {grade_scale} points
- If code output matches template output exactly: give {grade_scale} points
- If code works but has style differences: give {grade_scale - 2} to {grade_scale} points
- Apply leniency setting: {leniency}% ({"be generous" if leniency > 70 else "be moderate" if leniency > 50 else "be strict"})

Return your grades in this EXACT JSON format:
{{
  "grades": {{
    "{submissions[0].get('username', 'Student1')}": <number between 0 and {grade_scale}>,
    "{submissions[1].get('username', 'Student2') if len(submissions) > 1 else 'StudentX'}": <number between 0 and {grade_scale}>
    // ... for all students
  }},
  "reasoning": "Brief explanation of grading approach and why each grade was given"
}}

REMEMBER: Maximum possible grade is {grade_scale} points. Perfect working code = {grade_scale} points.
Return ONLY the JSON, no other text.
"""
        return prompt
    
    def _parse_batch_grading_response(self, response: Dict[str, Any], submissions: list) -> Dict[str, Any]:
        """Parse OpenAI batch grading response and extract grades"""
        try:
            content = response["choices"][0]["message"]["content"].strip()
            
            # Try to extract JSON from the response
            import json
            import re
            
            # Look for JSON block in response
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                try:
                    parsed_data = json.loads(json_str)
                    grades = parsed_data.get("grades", {})
                    
                    # Validate and clean grades
                    cleaned_grades = {}
                    for submission in submissions:
                        username = submission.get('username', '')
                        if username in grades:
                            try:
                                grade = float(grades[username])
                                cleaned_grades[username] = max(0, grade)  # Ensure non-negative
                            except (ValueError, TypeError):
                                cleaned_grades[username] = 0
                        else:
                            cleaned_grades[username] = 0
                    
                    return {
                        "grades": cleaned_grades,
                        "reasoning": parsed_data.get("reasoning", "AI grading completed"),
                        "available": True,
                        "errors": []
                    }
                except json.JSONDecodeError:
                    pass
            
            # If JSON parsing fails, return failure - no fallback grading
            return {
                "grades": {},
                "errors": ["Failed to parse AI response as JSON"],
                "available": False
            }
            
        except (KeyError, IndexError, Exception):
            return {
                "grades": {},
                "errors": ["Failed to parse AI grading response"],
                "available": False
            }
    


# Create service instance
openai_service = OpenAIService()
