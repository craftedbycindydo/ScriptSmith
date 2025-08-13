import asyncio
import json
import hashlib
import re
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
from difflib import SequenceMatcher
import ast
import math


@dataclass
class CodeFeatures:
    """Extracted features from code for comparison"""
    structure_hash: str
    variable_names: List[str]
    function_names: List[str]
    control_flow: List[str]
    import_statements: List[str]
    string_literals: List[str]
    normalized_code: str
    line_count: int
    complexity_score: float


class PlagiarismService:
    def __init__(self):
        self.max_context_window = 8000  # Conservative limit for most AI models
        self.chunk_overlap = 200  # Overlap between chunks for continuity
        
    async def detect_plagiarism(
        self, 
        code_samples: List[Dict[str, Any]], 
        threshold: float = 0.8
    ) -> List[Dict[str, Any]]:
        """
        Detect plagiarism among code samples using multiple techniques:
        1. Structural similarity
        2. Feature-based comparison  
        3. AI-powered semantic analysis (context-aware)
        """
        
        if len(code_samples) < 2:
            return []
        
        # Step 1: Extract features from all code samples
        features_data = []
        for sample in code_samples:
            features = await self._extract_code_features(sample['code'])
            features_data.append({
                'student_name': sample['student_name'],
                'submission_id': sample['submission_id'],
                'features': features,
                'original_code': sample['code']
            })
        
        # Step 2: Perform pairwise comparisons
        results = []
        for i, sample_a in enumerate(features_data):
            similarities = {}
            flagged_for = []
            max_similarity = 0.0
            
            for j, sample_b in enumerate(features_data):
                if i != j:
                    # Calculate similarity score
                    similarity = await self._calculate_similarity(
                        sample_a['features'], 
                        sample_b['features'],
                        sample_a['original_code'],
                        sample_b['original_code']
                    )
                    
                    similarities[sample_b['student_name']] = similarity
                    
                    if similarity > threshold:
                        flagged_for.append({
                            'student': sample_b['student_name'],
                            'similarity': similarity
                        })
                    
                    max_similarity = max(max_similarity, similarity)
            
            results.append({
                'submission_id': sample_a['submission_id'],
                'student_name': sample_a['student_name'],
                'similarities': similarities,
                'is_flagged': len(flagged_for) > 0,
                'flagged_for': flagged_for,
                'max_similarity': max_similarity
            })
        
        # Step 3: AI-powered analysis for flagged cases (context-aware)
        flagged_results = [r for r in results if r['is_flagged']]
        if flagged_results:
            await self._ai_enhanced_analysis(flagged_results, features_data, threshold)
        
        return results
    
    async def _extract_code_features(self, code: str) -> CodeFeatures:
        """Extract structural and semantic features from code"""
        
        # Normalize code (remove comments, extra whitespace)
        normalized = self._normalize_code(code)
        
        # Calculate structural hash
        structure_hash = hashlib.md5(normalized.encode()).hexdigest()
        
        # Extract various features based on language
        variable_names = self._extract_variable_names(code)
        function_names = self._extract_function_names(code)
        control_flow = self._extract_control_flow(code)
        import_statements = self._extract_imports(code)
        string_literals = self._extract_string_literals(code)
        
        # Calculate complexity
        complexity_score = self._calculate_complexity(code)
        
        return CodeFeatures(
            structure_hash=structure_hash,
            variable_names=variable_names,
            function_names=function_names,
            control_flow=control_flow,
            import_statements=import_statements,
            string_literals=string_literals,
            normalized_code=normalized,
            line_count=len(code.split('\n')),
            complexity_score=complexity_score
        )
    
    def _normalize_code(self, code: str) -> str:
        """Normalize code by removing comments, extra whitespace, and standardizing format"""
        
        # Remove single-line comments
        code = re.sub(r'//.*?$', '', code, flags=re.MULTILINE)
        code = re.sub(r'#.*?$', '', code, flags=re.MULTILINE)
        
        # Remove multi-line comments
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
        code = re.sub(r'""".*?"""', '', code, flags=re.DOTALL)
        code = re.sub(r"'''.*?'''", '', code, flags=re.DOTALL)
        
        # Normalize whitespace
        lines = []
        for line in code.split('\n'):
            line = line.strip()
            if line:
                # Replace multiple spaces with single space
                line = re.sub(r'\s+', ' ', line)
                lines.append(line)
        
        return '\n'.join(lines)
    
    def _extract_variable_names(self, code: str) -> List[str]:
        """Extract variable names from code"""
        # Simple regex-based extraction (can be enhanced for specific languages)
        pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*='
        variables = re.findall(pattern, code)
        return list(set(variables))
    
    def _extract_function_names(self, code: str) -> List[str]:
        """Extract function names from code"""
        patterns = [
            r'def\s+([a-zA-Z_][a-zA-Z0-9_]*)',  # Python
            r'function\s+([a-zA-Z_][a-zA-Z0-9_]*)',  # JavaScript
            r'public\s+.*?\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',  # Java
        ]
        
        functions = []
        for pattern in patterns:
            functions.extend(re.findall(pattern, code))
        
        return list(set(functions))
    
    def _extract_control_flow(self, code: str) -> List[str]:
        """Extract control flow structures"""
        patterns = [
            r'\bif\b', r'\belse\b', r'\belif\b', r'\bfor\b', 
            r'\bwhile\b', r'\btry\b', r'\bcatch\b', r'\bfinally\b',
            r'\bswitch\b', r'\bcase\b', r'\breturn\b'
        ]
        
        control_structures = []
        for pattern in patterns:
            matches = re.findall(pattern, code, re.IGNORECASE)
            control_structures.extend(matches)
        
        return control_structures
    
    def _extract_imports(self, code: str) -> List[str]:
        """Extract import statements"""
        patterns = [
            r'import\s+([a-zA-Z0-9_.]+)',  # Python, JavaScript
            r'from\s+([a-zA-Z0-9_.]+)\s+import',  # Python
            r'#include\s*<([^>]+)>',  # C/C++
            r'use\s+([a-zA-Z0-9_:]+)',  # Rust
        ]
        
        imports = []
        for pattern in patterns:
            imports.extend(re.findall(pattern, code))
        
        return list(set(imports))
    
    def _extract_string_literals(self, code: str) -> List[str]:
        """Extract string literals"""
        patterns = [
            r'"([^"]*)"',  # Double quotes
            r"'([^']*)'",  # Single quotes
        ]
        
        strings = []
        for pattern in patterns:
            strings.extend(re.findall(pattern, code))
        
        return [s for s in strings if len(s) > 2]  # Filter out very short strings
    
    def _calculate_complexity(self, code: str) -> float:
        """Calculate code complexity score"""
        lines = [line.strip() for line in code.split('\n') if line.strip()]
        
        # Basic complexity metrics
        complexity = 0
        
        # Count control structures
        control_patterns = [r'\bif\b', r'\bfor\b', r'\bwhile\b', r'\btry\b']
        for pattern in control_patterns:
            complexity += len(re.findall(pattern, code, re.IGNORECASE))
        
        # Count nesting (approximation based on indentation)
        max_nesting = 0
        for line in lines:
            leading_spaces = len(line) - len(line.lstrip())
            nesting_level = leading_spaces // 4  # Assuming 4-space indentation
            max_nesting = max(max_nesting, nesting_level)
        
        complexity += max_nesting
        
        # Normalize by code length
        normalized_complexity = complexity / max(len(lines), 1)
        
        return normalized_complexity
    
    async def _calculate_similarity(
        self, 
        features_a: CodeFeatures, 
        features_b: CodeFeatures,
        code_a: str,
        code_b: str
    ) -> float:
        """Calculate similarity between two code samples using multiple metrics"""
        
        # 1. Structural similarity (normalized code)
        structural_sim = SequenceMatcher(
            None, 
            features_a.normalized_code, 
            features_b.normalized_code
        ).ratio()
        
        # 2. Variable name similarity
        var_sim = self._jaccard_similarity(
            set(features_a.variable_names), 
            set(features_b.variable_names)
        )
        
        # 3. Function name similarity
        func_sim = self._jaccard_similarity(
            set(features_a.function_names), 
            set(features_b.function_names)
        )
        
        # 4. Control flow similarity
        control_sim = self._sequence_similarity(
            features_a.control_flow, 
            features_b.control_flow
        )
        
        # 5. Import similarity
        import_sim = self._jaccard_similarity(
            set(features_a.import_statements), 
            set(features_b.import_statements)
        )
        
        # 6. String literal similarity
        string_sim = self._jaccard_similarity(
            set(features_a.string_literals), 
            set(features_b.string_literals)
        )
        
        # 7. Complexity similarity
        complexity_diff = abs(features_a.complexity_score - features_b.complexity_score)
        complexity_sim = 1.0 - min(complexity_diff, 1.0)
        
        # Weighted combination
        weights = {
            'structural': 0.4,
            'variables': 0.15,
            'functions': 0.15,
            'control_flow': 0.15,
            'imports': 0.05,
            'strings': 0.05,
            'complexity': 0.05
        }
        
        total_similarity = (
            weights['structural'] * structural_sim +
            weights['variables'] * var_sim +
            weights['functions'] * func_sim +
            weights['control_flow'] * control_sim +
            weights['imports'] * import_sim +
            weights['strings'] * string_sim +
            weights['complexity'] * complexity_sim
        )
        
        return total_similarity
    
    def _jaccard_similarity(self, set_a: set, set_b: set) -> float:
        """Calculate Jaccard similarity between two sets"""
        if not set_a and not set_b:
            return 1.0
        
        intersection = len(set_a.intersection(set_b))
        union = len(set_a.union(set_b))
        
        return intersection / union if union > 0 else 0.0
    
    def _sequence_similarity(self, seq_a: List[str], seq_b: List[str]) -> float:
        """Calculate similarity between two sequences"""
        return SequenceMatcher(None, seq_a, seq_b).ratio()
    
    async def _ai_enhanced_analysis(
        self, 
        flagged_results: List[Dict[str, Any]], 
        features_data: List[Dict[str, Any]], 
        threshold: float
    ):
        """
        Perform AI-enhanced analysis for flagged cases
        This handles context window limitations by chunking and smart preprocessing
        """
        
        # For flagged pairs, do more detailed AI analysis
        for result in flagged_results:
            student_name = result['student_name']
            flagged_for = result['flagged_for']
            
            # Find the original data
            student_data = next(
                (fd for fd in features_data if fd['student_name'] == student_name), 
                None
            )
            
            if not student_data:
                continue
            
            # Analyze each flagged pair
            for flagged_case in flagged_for:
                other_student = flagged_case['student']
                other_data = next(
                    (fd for fd in features_data if fd['student_name'] == other_student), 
                    None
                )
                
                if other_data:
                    # Perform context-aware AI analysis
                    ai_similarity = await self._ai_semantic_analysis(
                        student_data['original_code'],
                        other_data['original_code'],
                        student_name,
                        other_student
                    )
                    
                    # Update the similarity score with AI analysis
                    flagged_case['ai_similarity'] = ai_similarity
                    flagged_case['confidence'] = 'high' if ai_similarity > 0.9 else 'medium' if ai_similarity > 0.7 else 'low'
    
    async def _ai_semantic_analysis(
        self, 
        code_a: str, 
        code_b: str, 
        student_a: str, 
        student_b: str
    ) -> float:
        """
        Perform AI-powered semantic analysis with context window management
        """
        
        # Step 1: Preprocessing to reduce token count
        processed_a = self._preprocess_for_ai(code_a)
        processed_b = self._preprocess_for_ai(code_b)
        
        # Step 2: Check if we can fit both codes in context window
        total_tokens = self._estimate_tokens(processed_a) + self._estimate_tokens(processed_b)
        
        if total_tokens <= self.max_context_window * 0.7:  # Leave room for prompt
            # Can analyze together
            return await self._direct_ai_comparison(processed_a, processed_b, student_a, student_b)
        else:
            # Need chunking strategy
            return await self._chunked_ai_comparison(processed_a, processed_b, student_a, student_b)
    
    def _preprocess_for_ai(self, code: str) -> str:
        """Preprocess code to reduce token count while preserving semantics"""
        
        # Remove comments and docstrings
        processed = self._normalize_code(code)
        
        # Remove excessive whitespace
        lines = []
        for line in processed.split('\n'):
            if line.strip():
                lines.append(line.strip())
        
        # Compress variable names for analysis (preserve structure)
        # This is a simple approach - in production, use more sophisticated methods
        var_map = {}
        var_counter = 0
        
        def replace_var(match):
            nonlocal var_counter
            var_name = match.group(1)
            if var_name not in var_map and not var_name in ['if', 'else', 'for', 'while', 'def', 'class', 'return']:
                var_map[var_name] = f'v{var_counter}'
                var_counter += 1
            return var_map.get(var_name, var_name)
        
        # Apply variable name compression
        processed_lines = []
        for line in lines:
            # Simple variable replacement (this could be enhanced)
            compressed_line = re.sub(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b', replace_var, line)
            processed_lines.append(compressed_line)
        
        return '\n'.join(processed_lines)
    
    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count (rough approximation)"""
        # Rough estimation: 1 token ≈ 4 characters for code
        return len(text) // 4
    
    async def _direct_ai_comparison(
        self, 
        code_a: str, 
        code_b: str, 
        student_a: str, 
        student_b: str
    ) -> float:
        """Direct AI comparison when both codes fit in context window"""
        
        # This is where you would integrate with your AI service
        # For now, return a placeholder based on simple similarity
        
        # In production, you would call an AI service like:
        # prompt = f"""
        # Analyze these two code submissions for plagiarism:
        # 
        # Student A ({student_a}):
        # {code_a}
        # 
        # Student B ({student_b}):
        # {code_b}
        # 
        # Return a similarity score from 0.0 to 1.0 based on semantic similarity.
        # """
        # 
        # response = await ai_service.analyze(prompt)
        # return float(response.similarity_score)
        
        # Placeholder implementation
        return SequenceMatcher(None, code_a, code_b).ratio()
    
    async def _chunked_ai_comparison(
        self, 
        code_a: str, 
        code_b: str, 
        student_a: str, 
        student_b: str
    ) -> float:
        """Chunked AI comparison for large code files"""
        
        # Strategy: Compare chunks and aggregate results
        chunks_a = self._create_chunks(code_a)
        chunks_b = self._create_chunks(code_b)
        
        similarities = []
        
        # Compare each chunk from A with all chunks from B
        for chunk_a in chunks_a:
            chunk_similarities = []
            for chunk_b in chunks_b:
                sim = await self._direct_ai_comparison(chunk_a, chunk_b, student_a, student_b)
                chunk_similarities.append(sim)
            
            # Take the maximum similarity for this chunk
            if chunk_similarities:
                similarities.append(max(chunk_similarities))
        
        # Return average of chunk similarities
        return sum(similarities) / len(similarities) if similarities else 0.0
    
    def _create_chunks(self, code: str) -> List[str]:
        """Create overlapping chunks of code"""
        lines = code.split('\n')
        chunk_size = 50  # lines per chunk
        
        chunks = []
        for i in range(0, len(lines), chunk_size - 10):  # 10 lines overlap
            chunk_lines = lines[i:i + chunk_size]
            chunk = '\n'.join(chunk_lines)
            chunks.append(chunk)
        
        return chunks
    
    async def generate_plagiarism_report(
        self, 
        results: List[Dict[str, Any]], 
        assignment_name: str
    ) -> Dict[str, Any]:
        """Generate a comprehensive plagiarism report"""
        
        flagged_submissions = [r for r in results if r['is_flagged']]
        
        # Create similarity matrix
        similarity_matrix = {}
        for result in results:
            student = result['student_name']
            similarities = result['similarities']
            similarity_matrix[student] = similarities
        
        # Identify potential clusters of similar submissions
        clusters = self._identify_clusters(similarity_matrix, threshold=0.7)
        
        report = {
            "assignment_name": assignment_name,
            "total_submissions": len(results),
            "flagged_submissions": len(flagged_submissions),
            "flagged_percentage": (len(flagged_submissions) / len(results)) * 100 if results else 0,
            "clusters": clusters,
            "detailed_results": results,
            "summary": {
                "highest_similarity": max(
                    (r['max_similarity'] for r in results), 
                    default=0.0
                ),
                "average_similarity": sum(r['max_similarity'] for r in results) / len(results) if results else 0,
                "most_flagged_student": max(
                    results, 
                    key=lambda x: len(x['flagged_for']),
                    default={}
                ).get('student_name', 'None')
            }
        }
        
        return report
    
    def _identify_clusters(self, similarity_matrix: Dict[str, Dict[str, float]], threshold: float = 0.7) -> List[List[str]]:
        """Identify clusters of similar submissions"""
        students = list(similarity_matrix.keys())
        clusters = []
        visited = set()
        
        for student in students:
            if student in visited:
                continue
            
            # Find all students similar to this one
            cluster = [student]
            visited.add(student)
            
            for other_student in students:
                if other_student != student and other_student not in visited:
                    similarity = similarity_matrix.get(student, {}).get(other_student, 0.0)
                    if similarity > threshold:
                        cluster.append(other_student)
                        visited.add(other_student)
            
            if len(cluster) > 1:
                clusters.append(cluster)
        
        return clusters
