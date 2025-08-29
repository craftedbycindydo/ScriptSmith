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
        leniency: int,
        enable_robustness: bool = False,
        enable_quality: bool = False
    ) -> Dict[str, Any]:
        """
        Grade multiple code submissions in a single API call
        
        Args:
            template_info: Template details (name, description, language, etc.)
            submissions: List of student submissions to grade
            grade_scale: Grading scale (10, 50, or 100)
            leniency: Leniency percentage (0-100)
            enable_robustness: Whether to grade robustness (advanced)
            enable_quality: Whether to grade code quality (advanced)
            
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
                template_info, submissions, grade_scale, leniency, enable_robustness, enable_quality
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
                            "content": "You are an expert code grader using deterministic scoring methods. Compute sub-scores mathematically and return grades in the exact JSON format with evidence."
                        },
                        {
                            "role": "user", 
                            "content": prompt
                        }
                    ],
                    "max_tokens": 4000,  # Increased for detailed sub-scores, evidence, and feedback
                    "temperature": 0.0   # Maximum determinism for consistent grading
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
        leniency: int,
        enable_robustness: bool = False,
        enable_quality: bool = False
    ) -> str:
        """Create a deterministic, evidence-based prompt for batch grading"""
        
        template_code = template_info.get('code_content', '')
        template_name = template_info.get('name', 'Code Assignment')
        language = template_info.get('language', 'Unknown')
        description = template_info.get('description', 'No description provided')
        
        # Base scoring weights (adjusted based on enabled criteria)
        if enable_robustness and enable_quality:
            # All criteria enabled - use full weights
            base_weights = {
                "correctness": 0.65,  # Did it fulfill template instructions/requirements?
                "robustness": 0.10,   # Handles edge cases, avoids crashes
                "quality": 0.15,      # Variable/function naming, code structure (NOT student comments)
                "effort": 0.10        # Complexity of attempt, debugging signs (NOT student comments)
            }
        elif enable_robustness and not enable_quality:
            # Only robustness enabled - redistribute quality weight
            base_weights = {
                "correctness": 0.73,  # 0.65 + 0.15*0.53 (most of quality weight)
                "robustness": 0.10,   # Keep robustness
                "quality": 0.0,       # Disabled
                "effort": 0.17        # 0.10 + 0.15*0.47 (some of quality weight)
            }
        elif enable_quality and not enable_robustness:
            # Only quality enabled - redistribute robustness weight
            base_weights = {
                "correctness": 0.73,  # 0.65 + 0.10*0.8 (most of robustness weight)
                "robustness": 0.0,    # Disabled
                "quality": 0.15,      # Keep quality
                "effort": 0.12        # 0.10 + 0.10*0.2 (some of robustness weight)
            }
        else:
            # Both disabled - focus only on correctness and effort
            base_weights = {
                "correctness": 0.85,  # 0.65 + 0.25*0.8 (most of advanced weights)
                "robustness": 0.0,    # Disabled
                "quality": 0.0,       # Disabled
                "effort": 0.15        # 0.10 + 0.25*0.2 (some of advanced weights)
            }
        
        prompt = f"""
You are an expert {language} instructor grading {len(submissions)} code submissions **individually**.

ASSIGNMENT
- Template: {template_name}
- Language: {language}
- Description: {description}

REFERENCE TEMPLATE (contains assignment instructions)
```{language}
{template_code}
```

⚠️ **CRITICAL DISTINCTION - COMMENTS:**
- **Template comments**: These are ASSIGNMENT INSTRUCTIONS that define what students should implement. Use these to evaluate correctness.
- **Student comments**: These should be COMPLETELY IGNORED in all scoring. Do not consider student comments for any grading criteria.

GRADING SCALE
0 to {grade_scale} points per student.

You must compute sub-scores first, then the final score:

- **correctness**: did it fulfill the template instructions and produce expected behavior/output?
- **effort**: evidence of thoughtful attempt (non-trivial logic, meaningful approach, debugging attempts - IGNORE student comments)"""

        # Add optional criteria only if enabled
        if enable_quality:
            prompt += f"""
- **quality**: clarity, structure, modularity, meaningful naming (IGNORE student comments completely)"""
        
        if enable_robustness:
            prompt += f"""
- **robustness**: handles edge cases, avoids crashes for plausible inputs"""
        
        # Add note about disabled criteria
        disabled_criteria = []
        if not enable_quality:
            disabled_criteria.append("code quality")
        if not enable_robustness:
            disabled_criteria.append("robustness")
        
        if disabled_criteria:
            prompt += f"""

⚠️  **DISABLED CRITERIA**: {', '.join(disabled_criteria)} scoring is disabled - focus on correctness and effort only."""
        
        prompt += f"""

LENIENCY = {leniency}% (0–100)

Leniency adjusts only enabled quality and robustness weightings (not correctness).

Recalculate effective weights as:"""

        if enable_quality and enable_robustness:
            prompt += f"""
- quality_eff = {base_weights['quality']} * (1 - {leniency}/100)
- robustness_eff = {base_weights['robustness']} * (1 - {leniency}/100)

Shift the removed mass equally to correctness and effort:
- delta = ({base_weights['quality']} * ({leniency}/100) + {base_weights['robustness']} * ({leniency}/100))
- correctness_eff = {base_weights['correctness']} + delta * 0.85
- effort_eff = {base_weights['effort']} + delta * 0.15"""
        elif enable_quality and not enable_robustness:
            prompt += f"""
- quality_eff = {base_weights['quality']} * (1 - {leniency}/100)
- robustness_eff = 0 (disabled)

Shift the removed mass equally to correctness and effort:
- delta = ({base_weights['quality']} * ({leniency}/100))
- correctness_eff = {base_weights['correctness']} + delta * 0.85
- effort_eff = {base_weights['effort']} + delta * 0.15"""
        elif enable_robustness and not enable_quality:
            prompt += f"""
- quality_eff = 0 (disabled)
- robustness_eff = {base_weights['robustness']} * (1 - {leniency}/100)

Shift the removed mass equally to correctness and effort:
- delta = ({base_weights['robustness']} * ({leniency}/100))
- correctness_eff = {base_weights['correctness']} + delta * 0.85
- effort_eff = {base_weights['effort']} + delta * 0.15"""
        else:
            prompt += f"""
- quality_eff = 0 (disabled)
- robustness_eff = 0 (disabled)
- correctness_eff = {base_weights['correctness']} (no leniency adjustment needed)
- effort_eff = {base_weights['effort']} (no leniency adjustment needed)"""
        
        prompt += f"""

Normalize so all effective weights sum to 1.0 before scoring.

EVALUATION METHOD (deterministic)

Compare each student's code to the template requirements in two ways:
a. **Behavior**: compare given output to expected output; if outputs differ, describe concrete mismatches. If an error was raised, classify: syntax / runtime / logic.
b. **Implementation vs Instructions**: compare student's approach to template requirements (which may be specified in template comments). Check if required functions/features are present, algorithmic steps match instructions, data structures follow specifications. Prefer logical compliance over superficial token differences.

⚠️ **CRITICAL: IGNORE STUDENT COMMENTS ONLY** - Student comments should be completely ignored in all scoring. However, template comments are assignment instructions that define correctness criteria.

Compute sub-scores on a 0–1 scale:

- **correctness**: 1.0 for fully correct implementation of template instructions (which may be in template comments); partial credit if major functions pass or output matches requirements; 0 if non-running or unrelated to template requirements.
- **effort**: credit non-trivial attempts (e.g., multiple functions, visible debugging attempts, tests, iterative logic), even if buggy (do NOT consider STUDENT comments as effort indicators)."""

        # Add enabled criteria descriptions
        if enable_quality:
            prompt += f"""
- **quality**: meaningful variable/function names, code decomposition/structure, readable flow (do NOT consider STUDENT comments at all; do not nitpick cosmetic style)."""
        
        if enable_robustness:
            prompt += f"""
- **robustness**: credit for handling edge cases, avoiding obvious crashes, reasonable error handling."""
        
        prompt += f"""

Final score = round( {grade_scale} * Σ(effective_weight_i * subscore_i) , 1 ).

Round to 1 decimal place to allow differentiation without randomness.

Identical work may receive identical scores, but you MUST mark "identical_to" with the matching username and explain why.

BANDING (for human readability; derived from the computed score, not vice versa)
- {int(0.90*grade_scale)}–{grade_scale}: fully correct or tiny nits
- {int(0.75*grade_scale)}–{int(0.89*grade_scale)}: correct with small gaps  
- {int(0.50*grade_scale)}–{int(0.74*grade_scale)}: partially working
- {int(0.20*grade_scale)}–{int(0.49*grade_scale)}: attempted with significant errors
- 0–{int(0.19*grade_scale)}: minimal/irrelevant

RETURN FORMAT — JSON ONLY
Return only this JSON (no prose outside JSON). Use an array so we can handle any number of submissions.

{{
  "scale_max": {grade_scale},
  "leniency": {leniency},
  "weights_effective": {{
    "correctness": "<computed float 0–1>",
    "robustness": "<computed float 0–1>",
    "quality": "<computed float 0–1>",
    "effort": "<computed float 0–1>"
  }},
  "results": [
    {{
      "username": "<student username>",
      "status": "<as provided>",
      "score": "<number 0–{grade_scale} rounded to 1 decimal>",
      "subscores": {{
        "correctness": "<0–1>",
        "effort": "<0–1>"""

        # Add enabled criteria to subscores format
        if enable_quality:
            prompt += ',\n        "quality": "<0–1>"'
        
        if enable_robustness:
            prompt += ',\n        "robustness": "<0–1>"'
        
        prompt += f"""
      }},
      "evidence": {{
        "output_match": "describe exact matches/diffs vs expected (or 'no expected output provided')",
        "error_type": "<none | syntax | runtime | logic>",
        "notable_diffs_from_template": ["short bullets of structural differences"],
        "testlike_reasoning": "which parts appear correct/incorrect and why"
      }},
      "identical_to": "<username if truly identical, else null>",
      "feedback": "two to three specific, actionable suggestions to improve"
    }}
  ]
}}

SUBMISSIONS
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
```{language}
{code}
```
Output: {output}
Error: {error}

---
"""
        
        prompt += f"""

IMPORTANT:

- Grade each student independently using the deterministic method above.
- Do not invent tests; rely on provided output/error + structural comparison.  
- Avoid stylistic nitpicks unless leniency is very low (which the weights already capture).
- If two works are identical, set "identical_to" and explain; otherwise, do not force differences.
- **Return JSON only.**

FINAL CHECKLIST:
1. Compute effective weights (quality_eff, robustness_eff, correctness_eff, effort_eff) 
2. Normalize weights to sum to 1.0
3. For each student: compare behavior + implementation to template requirements
4. Compute 4 sub-scores (0–1 scale) with evidence
5. Calculate final score = round({grade_scale} * weighted_sum, 1)
6. Mark identical work with "identical_to"
7. Provide specific feedback per student
8. **CRITICAL: Template comments = assignment instructions (USE for grading). Student comments = ignore completely (DO NOT use for grading).**

Return ONLY the JSON array format specified above.
"""
        return prompt
    
    def _parse_batch_grading_response(self, response: Dict[str, Any], submissions: list) -> Dict[str, Any]:
        """Parse OpenAI batch grading response with new deterministic format"""
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
                    
                    # Handle new array-based format with detailed scoring
                    if "results" in parsed_data and isinstance(parsed_data["results"], list):
                        cleaned_grades = {}
                        feedback_details = []
                        
                        for result in parsed_data["results"]:
                            username = result.get("username", "")
                            if username:
                                try:
                                    # Extract score (could be string or number)
                                    score_raw = result.get("score", 0)
                                    if isinstance(score_raw, str):
                                        score = float(score_raw)
                                    else:
                                        score = float(score_raw)
                                    
                                    # Ensure score is within bounds
                                    max_scale = parsed_data.get("scale_max", 100)
                                    score = max(0, min(score, max_scale))
                                    cleaned_grades[username] = score
                                    
                                    # Collect detailed feedback for reasoning
                                    evidence = result.get("evidence", {})
                                    feedback = result.get("feedback", "")
                                    subscores = result.get("subscores", {})
                                    
                                    feedback_detail = f"{username}: {score}/{max_scale} points"
                                    if subscores:
                                        subscore_str = ", ".join([f"{k}: {v}" for k, v in subscores.items()])
                                        feedback_detail += f" (sub-scores: {subscore_str})"
                                    if feedback:
                                        feedback_detail += f" - {feedback}"
                                    feedback_details.append(feedback_detail)
                                    
                                except (ValueError, TypeError):
                                    cleaned_grades[username] = 0
                                    feedback_details.append(f"{username}: 0 points (parsing error)")
                        
                        # Ensure all submissions have grades
                        for submission in submissions:
                            username = submission.get('username', '')
                            if username not in cleaned_grades:
                                cleaned_grades[username] = 0
                                feedback_details.append(f"{username}: 0 points (not found in results)")
                        
                        # Build comprehensive reasoning
                        weights_info = parsed_data.get("weights_effective", {})
                        leniency_info = parsed_data.get("leniency", 0)
                        reasoning = f"Deterministic AI grading (leniency: {leniency_info}%, weights: {weights_info}). Individual results: " + "; ".join(feedback_details)
                        
                        return {
                            "grades": cleaned_grades,
                            "reasoning": reasoning,
                            "available": True,
                            "errors": [],
                            "metadata": {
                                "weights_effective": weights_info,
                                "leniency": leniency_info,
                                "scale_max": parsed_data.get("scale_max", 100)
                            }
                        }
                    
                    # Fallback: handle legacy format with direct grades dict
                    elif "grades" in parsed_data:
                        grades = parsed_data.get("grades", {})
                        cleaned_grades = {}
                        
                        for submission in submissions:
                            username = submission.get('username', '')
                            if username in grades:
                                try:
                                    grade = float(grades[username])
                                    cleaned_grades[username] = max(0, grade)
                                except (ValueError, TypeError):
                                    cleaned_grades[username] = 0
                            else:
                                cleaned_grades[username] = 0
                        
                        return {
                            "grades": cleaned_grades,
                            "reasoning": parsed_data.get("reasoning", "AI grading completed (legacy format)"),
                            "available": True,
                            "errors": []
                        }
                    
                    # No recognizable format found
                    return {
                        "grades": {},
                        "errors": ["AI response missing expected 'results' or 'grades' field"],
                        "available": False
                    }
                    
                except json.JSONDecodeError as e:
                    return {
                        "grades": {},
                        "errors": [f"Failed to parse AI response as JSON: {str(e)}"],
                        "available": False
                    }
            
            # No JSON found in response
            return {
                "grades": {},
                "errors": ["No JSON found in AI response"],
                "available": False
            }
            
        except (KeyError, IndexError) as e:
            return {
                "grades": {},
                "errors": [f"Missing required field in AI response: {str(e)}"],
                "available": False
            }
        except Exception as e:
            return {
                "grades": {},
                "errors": [f"Failed to parse AI grading response: {str(e)}"],
                "available": False
            }
    


# Create service instance
openai_service = OpenAIService()
