"""
OpenAI service for code complexity analysis
"""

import asyncio
import aiohttp
import ssl
import certifi
from typing import Dict, Any, Optional, List
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
        self.plagiarism_model = "gpt-4o-mini"  # Use mini for plagiarism - higher token limit, lower cost
        self.max_tokens = 128000  # GPT-4o context window
        self.mini_max_tokens = 128000  # GPT-4o-mini context window
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
            
            # Make API call with timeout - configure connector for batch processing
            connector = aiohttp.TCPConnector(
                ssl=ssl_context,
                keepalive_timeout=300,  # Keep connections alive longer for batch processing
                timeout_ceil_threshold=5  # Allow more time for slow connections
            )
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
                
                # Use reasonable timeout for batch grading to avoid hanging
                timeout = aiohttp.ClientTimeout(total=45)
                
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

⚠️ **BEGINNER-FRIENDLY GRADING** - This is beginner code. Focus on BASIC FUNCTIONALITY, not perfect implementation.

EVALUATION METHOD (lenient for beginners)

**PRIMARY FOCUS: Did the code attempt to solve the problem and execute successfully?**

Evaluation criteria (compute sub-scores on 0–1 scale):

- **correctness**: 
  - 1.0 = Code runs without errors AND produces reasonable output (even if not perfect)
  - 0.8-0.9 = Code runs but output has minor issues or formatting problems
  - 0.5-0.7 = Code runs but output is significantly different from expected
  - 0.2-0.4 = Code has runtime errors but shows understanding of the problem
  - 0.0-0.1 = Syntax errors or completely unrelated to assignment

- **effort**: 
  - 1.0 = Clear attempt at solving the problem with logical approach
  - 0.7-0.9 = Good attempt with most required elements present
  - 0.3-0.6 = Basic attempt, some relevant code present
  - 0.0-0.2 = Minimal or no relevant code

⚠️ **CRITICAL GRADING PHILOSOPHY FOR BEGINNERS:**
- If code RUNS and produces ANY reasonable output → MINIMUM 80/{grade_scale} points
- If code RUNS and produces expected output → FULL {grade_scale}/{grade_scale} points
- If code RUNS without errors (regardless of output) → At least 70/{grade_scale} points
- Do NOT penalize for non-optimal algorithms, variable names, or coding style
- Do NOT require perfect adherence to template instructions
- Focus on "Does it work?" not "Is it implemented perfectly?"
- BE GENEROUS with points - beginners deserve encouragement for working code!

⚠️ **IGNORE STUDENT COMMENTS** - Student comments should be completely ignored in scoring."""

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

BANDING FOR BEGINNER CODE (lenient - derived from computed score, not vice versa)
- {int(0.80*grade_scale)}–{grade_scale}: code runs and produces reasonable output (AWARD FULL POINTS LIBERALLY)
- {int(0.60*grade_scale)}–{int(0.79*grade_scale)}: code runs but output needs improvement
- {int(0.40*grade_scale)}–{int(0.59*grade_scale)}: code has issues but shows understanding
- {int(0.20*grade_scale)}–{int(0.39*grade_scale)}: basic attempt with significant problems
- 0–{int(0.19*grade_scale)}: minimal effort or won't run due to syntax errors

**Remember: Working code deserves high scores! Don't penalize beginners for imperfect implementation.**

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
    


    async def detect_code_plagiarism(
        self,
        code_pairs: List[Dict[str, Any]],
        language: str,
        threshold: float = 0.8
    ) -> List[Dict[str, Any]]:
        """
        Detect plagiarism between code pairs using GPT-4o-mini
        
        Args:
            code_pairs: List of code pair dictionaries with structure:
                       [{"student_a": str, "code_a": str, "student_b": str, "code_b": str}, ...]
            language: Programming language of the code
            threshold: Similarity threshold for flagging (0.0-1.0)
            
        Returns:
            List of plagiarism analysis results with similarity scores and explanations
        """
        if not self.api_key:
            return [{
                "student_a": pair.get("student_a", "Unknown"),
                "student_b": pair.get("student_b", "Unknown"), 
                "similarity_score": 0.0,
                "is_flagged": False,
                "explanation": "OpenAI API key not configured",
                "confidence": "unavailable"
            } for pair in code_pairs]
        
        if not code_pairs:
            return []
        
        try:
            # Calculate batch size based on token limits
            batch_size = self._calculate_plagiarism_batch_size(code_pairs, language)
            results = []
            
            # Process in batches to handle token limits
            for i in range(0, len(code_pairs), batch_size):
                batch = code_pairs[i:i + batch_size]
                batch_results = await self._process_plagiarism_batch(
                    batch, language, threshold
                )
                results.extend(batch_results)
            
            return results
            
        except Exception as e:
            # Return safe fallback results
            safe_error_msg = self._mask_api_key(str(e))
            return [{
                "student_a": pair.get("student_a", "Unknown"),
                "student_b": pair.get("student_b", "Unknown"),
                "similarity_score": 0.0,
                "is_flagged": False,
                "explanation": "Plagiarism analysis temporarily unavailable",
                "confidence": "unavailable"
            } for pair in code_pairs]
    
    def _calculate_plagiarism_batch_size(self, code_pairs: List[Dict[str, Any]], language: str) -> int:
        """Calculate optimal batch size for plagiarism analysis"""
        # Reserve tokens for prompt, response, and safety margin
        reserve_tokens = 3000
        available_tokens = self.mini_max_tokens - reserve_tokens
        
        if not code_pairs:
            return 0
        
        # Estimate average token usage per pair
        avg_code_length = 0
        for pair in code_pairs[:min(5, len(code_pairs))]:  # Sample first few pairs
            code_a = pair.get('code_a', '')
            code_b = pair.get('code_b', '')
            avg_code_length += len(code_a) + len(code_b)
        
        avg_code_length = avg_code_length // min(5, len(code_pairs))
        avg_tokens_per_pair = self.estimate_tokens(str(avg_code_length)) + 300  # 300 for formatting and metadata
        
        if avg_tokens_per_pair <= 0:
            return len(code_pairs)
        
        max_batch_size = available_tokens // avg_tokens_per_pair
        return max(1, min(max_batch_size, len(code_pairs), 8))  # Max 8 pairs per batch for quality
    
    async def _process_plagiarism_batch(
        self,
        code_pairs: List[Dict[str, Any]],
        language: str,
        threshold: float
    ) -> List[Dict[str, Any]]:
        """Process a batch of code pairs for plagiarism analysis"""
        
        try:
            # Create the plagiarism analysis prompt
            prompt = self._create_plagiarism_prompt(code_pairs, language, threshold)
            
            # Create SSL context for secure connections
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            
            # Make API call with extended timeout for batch processing
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                headers = self._get_secure_headers()
                
                payload = {
                    "model": self.plagiarism_model,  # Use GPT-4o-mini for plagiarism
                    "messages": [
                        {
                            "role": "system",
                            "content": f"You are an expert code plagiarism detector specializing in {language}. Analyze code pairs for similarity with high precision."
                        },
                        {
                            "role": "user", 
                            "content": prompt
                        }
                    ],
                    "max_tokens": 2000,  # Enough for detailed analysis results
                    "temperature": 0.1   # Low temperature for consistent analysis
                }
                
                # Extended timeout for plagiarism analysis
                timeout = aiohttp.ClientTimeout(total=120)
                
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=timeout
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        return self._parse_plagiarism_response(result, code_pairs)
                    else:
                        # API error - return fallback results
                        return self._get_plagiarism_fallback(code_pairs, "API request failed")
                        
        except asyncio.TimeoutError:
            return self._get_plagiarism_fallback(code_pairs, "Analysis timeout")
        except aiohttp.ClientError:
            return self._get_plagiarism_fallback(code_pairs, "Network error")
        except Exception:
            return self._get_plagiarism_fallback(code_pairs, "Analysis unavailable")
    
    def _create_plagiarism_prompt(
        self, 
        code_pairs: List[Dict[str, Any]], 
        language: str, 
        threshold: float
    ) -> str:
        """Create a structured prompt for plagiarism detection"""
        
        prompt = f"""
Analyze the following {len(code_pairs)} {language} code pairs for plagiarism. For each pair, provide:

1. **Similarity Score**: 0.0 (completely different) to 1.0 (identical)
2. **Is Flagged**: true if similarity > {threshold}, false otherwise  
3. **Confidence**: "high", "medium", or "low" based on analysis certainty
4. **Explanation**: Specific evidence supporting the similarity score

**Analysis Criteria:**
- **Structural Similarity**: Control flow, function organization, logic patterns
- **Semantic Similarity**: Variable usage, algorithm approach, problem-solving method
- **Syntactic Similarity**: Code structure, naming patterns, formatting choices
- **Unique Elements**: Comments, variable names, implementation details that indicate copying

**Important**: Focus on algorithmic and structural similarities, not superficial formatting.

**Return Format** (JSON only):
{{
  "results": [
    {{
      "pair_index": 0,
      "student_a": "student_name_a",
      "student_b": "student_name_b", 
      "similarity_score": 0.85,
      "is_flagged": true,
      "confidence": "high",
      "explanation": "Both codes use identical control flow structure with same variable naming pattern. Function implementations are nearly identical with only minor variable renaming.",
      "evidence": {{
        "structural_matches": ["same loop structure", "identical if-else chains"],
        "semantic_matches": ["same algorithm approach", "identical edge case handling"],
        "unique_indicators": ["same comment patterns", "unusual variable names"]
      }}
    }}
  ]
}}

**Code Pairs to Analyze:**

"""
        
        for i, pair in enumerate(code_pairs):
            student_a = pair.get('student_a', f'Student_A_{i}')
            student_b = pair.get('student_b', f'Student_B_{i}')
            code_a = pair.get('code_a', '')
            code_b = pair.get('code_b', '')
            
            prompt += f"""
**Pair {i}**: {student_a} vs {student_b}

**{student_a}'s Code:**
```{language}
{code_a}
```

**{student_b}'s Code:**
```{language}
{code_b}
```

---
"""
        
        prompt += f"""

**Instructions:**
- Analyze each pair independently
- Be precise with similarity scores (use decimals like 0.73, 0.92)
- Focus on substantial similarities that indicate potential copying
- Consider legitimate similarities from common patterns or requirements
- Provide specific evidence in explanations
- Return ONLY the JSON format above

**Remember**: Threshold is {threshold} - flag pairs above this similarity."""

        return prompt
    
    def _parse_plagiarism_response(
        self, 
        response: Dict[str, Any], 
        code_pairs: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Parse OpenAI plagiarism analysis response"""
        
        try:
            content = response["choices"][0]["message"]["content"].strip()
            
            # Extract JSON from response
            import json
            import re
            
            # Find JSON block
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                json_str = json_match.group()
                try:
                    parsed_data = json.loads(json_str)
                    
                    if "results" in parsed_data and isinstance(parsed_data["results"], list):
                        results = []
                        
                        for i, result in enumerate(parsed_data["results"]):
                            # Ensure we have valid data
                            pair_index = result.get("pair_index", i)
                            original_pair = code_pairs[pair_index] if pair_index < len(code_pairs) else {}
                            
                            # Extract and validate similarity score
                            similarity_raw = result.get("similarity_score", 0.0)
                            if isinstance(similarity_raw, str):
                                try:
                                    similarity_score = float(similarity_raw)
                                except ValueError:
                                    similarity_score = 0.0
                            else:
                                similarity_score = float(similarity_raw)
                            
                            # Ensure score is in valid range
                            similarity_score = max(0.0, min(1.0, similarity_score))
                            
                            # Build result
                            plagiarism_result = {
                                "student_a": result.get("student_a", original_pair.get("student_a", "Unknown")),
                                "student_b": result.get("student_b", original_pair.get("student_b", "Unknown")),
                                "similarity_score": similarity_score,
                                "is_flagged": result.get("is_flagged", False),
                                "confidence": result.get("confidence", "medium"),
                                "explanation": result.get("explanation", "Analysis completed"),
                                "evidence": result.get("evidence", {}),
                                "available": True
                            }
                            
                            results.append(plagiarism_result)
                        
                        # Ensure we have results for all pairs
                        while len(results) < len(code_pairs):
                            missing_pair = code_pairs[len(results)]
                            results.append({
                                "student_a": missing_pair.get("student_a", "Unknown"),
                                "student_b": missing_pair.get("student_b", "Unknown"),
                                "similarity_score": 0.0,
                                "is_flagged": False,
                                "confidence": "low",
                                "explanation": "Analysis incomplete",
                                "evidence": {},
                                "available": False
                            })
                        
                        return results
                    
                except json.JSONDecodeError:
                    pass
            
            # Fallback if JSON parsing fails
            return self._get_plagiarism_fallback(code_pairs, "Failed to parse response")
            
        except (KeyError, IndexError):
            return self._get_plagiarism_fallback(code_pairs, "Invalid response format")
        except Exception:
            return self._get_plagiarism_fallback(code_pairs, "Response processing error")
    
    def _get_plagiarism_fallback(
        self, 
        code_pairs: List[Dict[str, Any]], 
        reason: str = "Analysis unavailable"
    ) -> List[Dict[str, Any]]:
        """Return fallback plagiarism results when AI analysis fails"""
        
        # Use simple text similarity as fallback
        from difflib import SequenceMatcher
        
        results = []
        for pair in code_pairs:
            code_a = pair.get('code_a', '')
            code_b = pair.get('code_b', '')
            
            # Basic similarity using difflib
            similarity_score = SequenceMatcher(None, code_a, code_b).ratio()
            
            results.append({
                "student_a": pair.get("student_a", "Unknown"),
                "student_b": pair.get("student_b", "Unknown"),
                "similarity_score": round(similarity_score, 3),
                "is_flagged": similarity_score > 0.8,  # Default threshold
                "confidence": "low",
                "explanation": f"Fallback analysis used: {reason}",
                "evidence": {"method": "basic_text_similarity"},
                "available": False
            })
        
        return results


# Create service instance
openai_service = OpenAIService()
