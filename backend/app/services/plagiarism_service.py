import asyncio
import json
import hashlib
import re
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
from difflib import SequenceMatcher
import ast
import math
from datetime import datetime
from sqlalchemy.orm import Session

# Import OpenAI service for AI-powered plagiarism detection
# Use lazy import to avoid circular dependencies
def get_openai_service():
    from app.services.openai_service import openai_service
    return openai_service


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
        threshold: float = 0.8,
        db: Session = None,
        assignment_id: int = None
    ) -> List[Dict[str, Any]]:
        """
        Detect plagiarism among N code samples using modern clustering approach:
        1. AI-powered batch analysis (analyze all N submissions together)
        2. Clustering-based detection (group similar submissions)
        3. Fingerprint-based pre-filtering (avoid redundant AI calls)
        4. Database caching for efficiency
        """
        
        if len(code_samples) < 2:
            return []
        
        # Step 1: Check for cached results in database
        cached_results = []
        if db and assignment_id:
            cached_results = await self._get_cached_plagiarism_results(db, assignment_id, code_samples)
            if cached_results:
                print(f"✅ Using cached plagiarism results for {len(cached_results)} comparisons")
                return cached_results
        
        # Step 2: Create document fingerprints for efficient pre-filtering
        print(f"🔍 Analyzing plagiarism for {len(code_samples)} submissions...")
        fingerprints = await self._create_document_fingerprints(code_samples)
        
        # Step 3: Pre-filter using fingerprint similarity (fast elimination)
        potential_clusters = await self._identify_potential_clusters(fingerprints, threshold * 0.7)  # Lower threshold for pre-filtering
        
        if not potential_clusters:
            # No potential similarities found - all submissions appear unique
            return await self._create_clean_results(code_samples)
        
        # Step 4: AI-powered batch analysis for potential clusters
        print(f"🤖 Running AI analysis on {len(potential_clusters)} potential similarity clusters...")
        cluster_results = await self._ai_batch_cluster_analysis(code_samples, potential_clusters, threshold)
        
        # Step 5: Store results in database for future use
        if db and assignment_id and cluster_results:
            await self._cache_plagiarism_results(db, assignment_id, cluster_results)
        
        return cluster_results
    
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
        """Direct AI comparison when both codes fit in context window using GPT-4o-mini"""
        
        try:
            openai_service = get_openai_service()
            
            # Create code pair for AI analysis
            code_pairs = [{
                "student_a": student_a,
                "code_a": code_a,
                "student_b": student_b,
                "code_b": code_b
            }]
            
            # Detect language from code content (simple heuristic)
            language = self._detect_language(code_a + code_b)
            
            # Get AI analysis
            results = await openai_service.detect_code_plagiarism(
                code_pairs=code_pairs,
                language=language,
                threshold=0.8  # Standard threshold
            )
            
            if results and len(results) > 0:
                return results[0].get("similarity_score", 0.0)
            
        except Exception:
            # Fallback to simple similarity if AI fails
            pass
        
        # Fallback implementation
        return SequenceMatcher(None, code_a, code_b).ratio()
    
    async def _chunked_ai_comparison(
        self, 
        code_a: str, 
        code_b: str, 
        student_a: str, 
        student_b: str
    ) -> float:
        """Chunked AI comparison for large code files using batch processing"""
        
        try:
            openai_service = get_openai_service()
            
            # Create chunks for both codes
            chunks_a = self._create_chunks(code_a)
            chunks_b = self._create_chunks(code_b)
            
            # Create pairs of representative chunks (not all combinations to avoid token overflow)
            code_pairs = []
            
            # Compare the most significant chunks (first, middle, last)
            significant_indices_a = self._get_significant_chunk_indices(chunks_a)
            significant_indices_b = self._get_significant_chunk_indices(chunks_b)
            
            for i in significant_indices_a:
                for j in significant_indices_b:
                    code_pairs.append({
                        "student_a": f"{student_a}_chunk_{i}",
                        "code_a": chunks_a[i],
                        "student_b": f"{student_b}_chunk_{j}",
                        "code_b": chunks_b[j]
                    })
            
            if not code_pairs:
                return SequenceMatcher(None, code_a, code_b).ratio()
            
            # Detect language
            language = self._detect_language(code_a + code_b)
            
            # Get AI analysis for chunk pairs
            results = await openai_service.detect_code_plagiarism(
                code_pairs=code_pairs,
                language=language,
                threshold=0.8
            )
            
            # Calculate average similarity from all chunk comparisons
            if results:
                similarities = [r.get("similarity_score", 0.0) for r in results]
                return sum(similarities) / len(similarities) if similarities else 0.0
                
        except Exception:
            # Fallback to simple chunked comparison
            pass
        
        # Fallback: Simple chunk comparison
        chunks_a = self._create_chunks(code_a)
        chunks_b = self._create_chunks(code_b)
        
        similarities = []
        for chunk_a in chunks_a:
            chunk_similarities = []
            for chunk_b in chunks_b:
                sim = SequenceMatcher(None, chunk_a, chunk_b).ratio()
                chunk_similarities.append(sim)
            if chunk_similarities:
                similarities.append(max(chunk_similarities))
        
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
    
    def _get_significant_chunk_indices(self, chunks: List[str]) -> List[int]:
        """Get indices of most significant chunks (first, middle, last)"""
        if not chunks:
            return []
        
        indices = []
        
        # Always include first chunk
        indices.append(0)
        
        # Include middle chunk if we have more than 2 chunks
        if len(chunks) > 2:
            middle_idx = len(chunks) // 2
            indices.append(middle_idx)
        
        # Include last chunk if we have more than 1 chunk
        if len(chunks) > 1:
            indices.append(len(chunks) - 1)
        
        # Remove duplicates and sort
        return sorted(list(set(indices)))
    
    async def _get_cached_plagiarism_results(
        self, 
        db: Session, 
        assignment_id: int, 
        code_samples: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Check database for existing plagiarism analysis results"""
        try:
            from app.models.assignment import PlagiarismAnalysis, StudentSubmission
            
            # Get all cached analyses for this assignment
            cached_analyses = db.query(PlagiarismAnalysis).filter(
                PlagiarismAnalysis.assignment_id == assignment_id
            ).all()
            
            if not cached_analyses:
                return []
            
            # Build results from cached data
            results = []
            submission_map = {s['submission_id']: s for s in code_samples}
            
            for sample in code_samples:
                submission_id = sample['submission_id']
                similarities = {}
                flagged_for = []
                max_similarity = 0.0
                
                # Find all analyses involving this submission
                relevant_analyses = [
                    a for a in cached_analyses 
                    if a.student_a_id == submission_id or a.student_b_id == submission_id
                ]
                
                for analysis in relevant_analyses:
                    other_id = analysis.student_b_id if analysis.student_a_id == submission_id else analysis.student_a_id
                    other_sample = submission_map.get(other_id)
                    
                    if other_sample:
                        other_name = other_sample['student_name']
                        similarities[other_name] = analysis.similarity_score
                        
                        if analysis.is_flagged:
                            flagged_for.append({
                                'student': other_name,
                                'similarity': analysis.similarity_score
                            })
                        
                        max_similarity = max(max_similarity, analysis.similarity_score)
                
                results.append({
                    'submission_id': submission_id,
                    'student_name': sample['student_name'],
                    'similarities': similarities,
                    'is_flagged': len(flagged_for) > 0,
                    'flagged_for': flagged_for,
                    'max_similarity': max_similarity
                })
            
            # Only return cached results if we have complete coverage
            expected_comparisons = len(code_samples) * (len(code_samples) - 1) // 2
            actual_comparisons = len(cached_analyses)
            
            if actual_comparisons >= expected_comparisons * 0.9:  # 90% coverage threshold
                return results
            
            return []
            
        except Exception as e:
            print(f"Error retrieving cached results: {e}")
            return []
    
    async def _create_document_fingerprints(self, code_samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create efficient fingerprints for each code submission using modern hashing techniques"""
        fingerprints = []
        
        for sample in code_samples:
            code = sample['code']
            
            # Normalize code for fingerprinting
            normalized = self._normalize_code(code)
            
            # Create multiple types of fingerprints
            fingerprint = {
                'submission_id': sample['submission_id'],
                'student_name': sample['student_name'],
                'code_hash': hashlib.sha256(normalized.encode()).hexdigest(),
                'structure_hash': self._create_structure_hash(code),
                'token_hash': self._create_token_hash(code),
                'ngram_hashes': self._create_ngram_hashes(normalized, n=3),
                'normalized_code': normalized,
                'original_code': code
            }
            
            fingerprints.append(fingerprint)
        
        return fingerprints
    
    def _create_structure_hash(self, code: str) -> str:
        """Create hash based on code structure (control flow, functions)"""
        # Extract structural elements
        structure_elements = []
        structure_elements.extend(re.findall(r'\b(if|else|elif|for|while|def|class|try|except|finally)\b', code))
        structure_elements.extend(re.findall(r'[{}()\[\]]', code))
        
        structure_str = ''.join(structure_elements)
        return hashlib.md5(structure_str.encode()).hexdigest()
    
    def _create_token_hash(self, code: str) -> str:
        """Create hash based on significant tokens"""
        # Extract meaningful tokens (variables, functions, keywords)
        tokens = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', code)
        # Filter out common keywords
        keywords = {'if', 'else', 'for', 'while', 'def', 'class', 'import', 'from', 'return'}
        filtered_tokens = [t for t in tokens if t not in keywords and len(t) > 1]
        
        token_str = ''.join(sorted(set(filtered_tokens)))
        return hashlib.md5(token_str.encode()).hexdigest()
    
    def _create_ngram_hashes(self, text: str, n: int = 3) -> List[str]:
        """Create n-gram hashes for similarity detection"""
        words = text.split()
        if len(words) < n:
            return [hashlib.md5(' '.join(words).encode()).hexdigest()]
        
        ngrams = []
        for i in range(len(words) - n + 1):
            ngram = ' '.join(words[i:i + n])
            ngrams.append(hashlib.md5(ngram.encode()).hexdigest())
        
        return ngrams
    
    async def _identify_potential_clusters(
        self, 
        fingerprints: List[Dict[str, Any]], 
        threshold: float
    ) -> List[List[int]]:
        """Identify clusters of potentially similar submissions using fingerprint analysis"""
        clusters = []
        processed = set()
        
        for i, fp_a in enumerate(fingerprints):
            if i in processed:
                continue
            
            cluster = [i]
            processed.add(i)
            
            for j, fp_b in enumerate(fingerprints[i + 1:], i + 1):
                if j in processed:
                    continue
                
                # Calculate fingerprint similarity
                similarity = self._calculate_fingerprint_similarity(fp_a, fp_b)
                
                if similarity >= threshold:
                    cluster.append(j)
                    processed.add(j)
            
            # Only include clusters with potential similarities
            if len(cluster) > 1:
                clusters.append(cluster)
        
        return clusters
    
    def _calculate_fingerprint_similarity(self, fp_a: Dict[str, Any], fp_b: Dict[str, Any]) -> float:
        """Calculate similarity between two fingerprints"""
        similarities = []
        
        # Exact hash matches
        if fp_a['code_hash'] == fp_b['code_hash']:
            return 1.0  # Identical code
        
        # Structure similarity
        if fp_a['structure_hash'] == fp_b['structure_hash']:
            similarities.append(0.7)
        
        # Token similarity  
        if fp_a['token_hash'] == fp_b['token_hash']:
            similarities.append(0.6)
        
        # N-gram similarity
        ngram_a = set(fp_a['ngram_hashes'])
        ngram_b = set(fp_b['ngram_hashes'])
        if ngram_a and ngram_b:
            ngram_sim = len(ngram_a.intersection(ngram_b)) / len(ngram_a.union(ngram_b))
            similarities.append(ngram_sim)
        
        # Normalized code similarity
        text_sim = SequenceMatcher(None, fp_a['normalized_code'], fp_b['normalized_code']).ratio()
        similarities.append(text_sim)
        
        # Return weighted average
        if similarities:
            return sum(similarities) / len(similarities)
        
        return 0.0
    
    async def _create_clean_results(self, code_samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create results indicating no plagiarism detected"""
        results = []
        
        for sample in code_samples:
            results.append({
                'submission_id': sample['submission_id'],
                'student_name': sample['student_name'],
                'similarities': {},
                'is_flagged': False,
                'flagged_for': [],
                'max_similarity': 0.0
            })
        
        return results
    
    async def _ai_batch_cluster_analysis(
        self, 
        code_samples: List[Dict[str, Any]], 
        clusters: List[List[int]], 
        threshold: float
    ) -> List[Dict[str, Any]]:
        """Use AI to analyze clusters of potentially similar submissions"""
        try:
            openai_service = get_openai_service()
            
            # Initialize results for all students
            results = {}
            for sample in code_samples:
                results[sample['submission_id']] = {
                    'submission_id': sample['submission_id'],
                    'student_name': sample['student_name'],
                    'similarities': {},
                    'is_flagged': False,
                    'flagged_for': [],
                    'max_similarity': 0.0
                }
            
            # Analyze each cluster with AI
            for cluster_indices in clusters:
                if len(cluster_indices) < 2:
                    continue
                
                cluster_samples = [code_samples[i] for i in cluster_indices]
                
                # Create a comprehensive prompt for cluster analysis
                cluster_prompt = self._create_cluster_analysis_prompt(cluster_samples, threshold)
                
                # Detect language
                language = self._detect_language(cluster_samples[0]['code'])
                
                # Use AI for semantic cluster analysis
                ai_results = await self._ai_cluster_similarity_analysis(cluster_prompt, language)
                
                # Process AI results and update our results
                self._process_cluster_ai_results(ai_results, cluster_samples, results, threshold)
            
            return list(results.values())
            
        except Exception as e:
            print(f"Error in AI cluster analysis: {e}")
            # Fallback to fingerprint-based results
            return await self._create_fallback_cluster_results(code_samples, clusters, threshold)
    
    def _create_cluster_analysis_prompt(
        self, 
        cluster_samples: List[Dict[str, Any]], 
        threshold: float
    ) -> str:
        """Create AI prompt for analyzing a cluster of submissions"""
        
        prompt = f"""
Analyze this cluster of {len(cluster_samples)} code submissions for plagiarism. 
Determine similarity relationships and identify which submissions are similar.

ANALYSIS CRITERIA:
- Algorithmic similarity (same approach/logic)
- Structural similarity (same control flow)
- Implementation similarity (same patterns)
- Variable/function naming patterns
- Unique vs common solutions

THRESHOLD: Flag similarities > {threshold * 100:.0f}%

RETURN FORMAT (JSON only):
{{
  "cluster_analysis": {{
    "total_submissions": {len(cluster_samples)},
    "similar_pairs": [
      {{
        "student_a": "student_name_1",
        "student_b": "student_name_2", 
        "similarity_score": 0.85,
        "is_flagged": true,
        "evidence": ["same algorithm structure", "identical variable names", "same edge case handling"],
        "explanation": "Both submissions use identical sorting approach with same variable naming patterns"
      }}
    ],
    "unique_submissions": ["student_name_3", "student_name_4"]
  }}
}}

SUBMISSIONS TO ANALYZE:
"""
        
        for i, sample in enumerate(cluster_samples, 1):
            prompt += f"""
**Submission {i}: {sample['student_name']}**
```{self._detect_language(sample['code'])}
{sample['code']}
```

---
"""
        
        prompt += """
Focus on substantial similarities that indicate copying or collaboration, not superficial formatting differences.
Return ONLY the JSON format specified above.
"""
        
        return prompt
    
    async def _ai_cluster_similarity_analysis(self, prompt: str, language: str) -> Dict[str, Any]:
        """Use AI to analyze cluster similarities"""
        try:
            openai_service = get_openai_service()
            
            # Use a simple approach - treat this as a single "code pair" for the existing AI method
            # but with a more sophisticated prompt
            import aiohttp
            import ssl
            import certifi
            import json
            
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            
            async with aiohttp.ClientSession(connector=connector) as session:
                headers = openai_service._get_secure_headers()
                
                payload = {
                    "model": openai_service.plagiarism_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": f"You are an expert code plagiarism detector specializing in {language}. Analyze clusters of submissions for similarity patterns."
                        },
                        {
                            "role": "user", 
                            "content": prompt
                        }
                    ],
                    "max_tokens": 3000,
                    "temperature": 0.1
                }
                
                timeout = aiohttp.ClientTimeout(total=180)  # Extended timeout for cluster analysis
                
                async with session.post(
                    f"{openai_service.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=timeout
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        content = result["choices"][0]["message"]["content"].strip()
                        
                        # Extract JSON from response
                        import re
                        json_match = re.search(r'\{.*\}', content, re.DOTALL)
                        if json_match:
                            return json.loads(json_match.group())
                        
                        return {}
                    else:
                        return {}
        
        except Exception as e:
            print(f"Error in AI cluster analysis: {e}")
            return {}
    
    def _process_cluster_ai_results(
        self, 
        ai_results: Dict[str, Any], 
        cluster_samples: List[Dict[str, Any]], 
        results: Dict[int, Dict[str, Any]],
        threshold: float
    ):
        """Process AI cluster analysis results and update the results dictionary"""
        
        cluster_analysis = ai_results.get('cluster_analysis', {})
        similar_pairs = cluster_analysis.get('similar_pairs', [])
        
        # Create student name to submission ID mapping
        name_to_id = {s['student_name']: s['submission_id'] for s in cluster_samples}
        
        for pair in similar_pairs:
            student_a_name = pair.get('student_a', '')
            student_b_name = pair.get('student_b', '')
            similarity_score = pair.get('similarity_score', 0.0)
            is_flagged = pair.get('is_flagged', False)
            evidence = pair.get('evidence', [])
            explanation = pair.get('explanation', '')
            
            # Update results for both students
            student_a_id = name_to_id.get(student_a_name)
            student_b_id = name_to_id.get(student_b_name)
            
            if student_a_id and student_b_id:
                # Update student A's results
                results[student_a_id]['similarities'][student_b_name] = similarity_score
                results[student_a_id]['max_similarity'] = max(
                    results[student_a_id]['max_similarity'], 
                    similarity_score
                )
                
                if is_flagged:
                    results[student_a_id]['is_flagged'] = True
                    results[student_a_id]['flagged_for'].append({
                        'student': student_b_name,
                        'similarity': similarity_score,
                        'evidence': evidence,
                        'explanation': explanation
                    })
                
                # Update student B's results
                results[student_b_id]['similarities'][student_a_name] = similarity_score
                results[student_b_id]['max_similarity'] = max(
                    results[student_b_id]['max_similarity'], 
                    similarity_score
                )
                
                if is_flagged:
                    results[student_b_id]['is_flagged'] = True
                    results[student_b_id]['flagged_for'].append({
                        'student': student_a_name,
                        'similarity': similarity_score,
                        'evidence': evidence,
                        'explanation': explanation
                    })
    
    async def _create_fallback_cluster_results(
        self, 
        code_samples: List[Dict[str, Any]], 
        clusters: List[List[int]], 
        threshold: float
    ) -> List[Dict[str, Any]]:
        """Create fallback results using fingerprint similarity when AI fails"""
        
        results = {}
        for sample in code_samples:
            results[sample['submission_id']] = {
                'submission_id': sample['submission_id'],
                'student_name': sample['student_name'],
                'similarities': {},
                'is_flagged': False,
                'flagged_for': [],
                'max_similarity': 0.0
            }
        
        # Use fingerprint similarity for clusters
        fingerprints = await self._create_document_fingerprints(code_samples)
        
        for cluster_indices in clusters:
            for i in range(len(cluster_indices)):
                for j in range(i + 1, len(cluster_indices)):
                    idx_a, idx_b = cluster_indices[i], cluster_indices[j]
                    fp_a, fp_b = fingerprints[idx_a], fingerprints[idx_b]
                    
                    similarity = self._calculate_fingerprint_similarity(fp_a, fp_b)
                    
                    student_a_id = fp_a['submission_id']
                    student_b_id = fp_b['submission_id']
                    student_a_name = fp_a['student_name']
                    student_b_name = fp_b['student_name']
                    
                    # Update both students' results
                    results[student_a_id]['similarities'][student_b_name] = similarity
                    results[student_b_id]['similarities'][student_a_name] = similarity
                    
                    results[student_a_id]['max_similarity'] = max(results[student_a_id]['max_similarity'], similarity)
                    results[student_b_id]['max_similarity'] = max(results[student_b_id]['max_similarity'], similarity)
                    
                    if similarity > threshold:
                        results[student_a_id]['is_flagged'] = True
                        results[student_a_id]['flagged_for'].append({
                            'student': student_b_name,
                            'similarity': similarity
                        })
                        
                        results[student_b_id]['is_flagged'] = True
                        results[student_b_id]['flagged_for'].append({
                            'student': student_a_name,
                            'similarity': similarity
                        })
        
        return list(results.values())
    
    async def _cache_plagiarism_results(
        self, 
        db: Session, 
        assignment_id: int, 
        results: List[Dict[str, Any]]
    ):
        """Store plagiarism analysis results in database for future use"""
        try:
            from app.models.assignment import PlagiarismAnalysis, CodeSnapshot
            
            # Create code snapshots first
            for sample_result in results:
                submission_id = sample_result['submission_id']
                student_name = sample_result['student_name']
                
                # Find original code from results (we'll need to pass this)
                # For now, skip code snapshot creation - would need original code
                pass
            
            # Store plagiarism analyses
            for sample_result in results:
                student_a_id = sample_result['submission_id']
                student_a_name = sample_result['student_name']
                
                for flagged in sample_result.get('flagged_for', []):
                    student_b_name = flagged['student']
                    similarity_score = flagged['similarity']
                    
                    # Find student B's submission ID
                    student_b_result = next(
                        (r for r in results if r['student_name'] == student_b_name), 
                        None
                    )
                    
                    if student_b_result:
                        student_b_id = student_b_result['submission_id']
                        
                        # Check if analysis already exists (avoid duplicates)
                        existing = db.query(PlagiarismAnalysis).filter(
                            ((PlagiarismAnalysis.student_a_id == student_a_id) & 
                             (PlagiarismAnalysis.student_b_id == student_b_id)) |
                            ((PlagiarismAnalysis.student_a_id == student_b_id) & 
                             (PlagiarismAnalysis.student_b_id == student_a_id))
                        ).first()
                        
                        if not existing:
                            # Create new plagiarism analysis record
                            # Handle JSON serialization for database compatibility
                            evidence = flagged.get('evidence', {})
                            if isinstance(evidence, dict):
                                import json
                                evidence_json = json.dumps(evidence) if evidence else '{}'
                            else:
                                evidence_json = str(evidence)
                            
                            analysis = PlagiarismAnalysis(
                                assignment_id=assignment_id,
                                student_a_id=min(student_a_id, student_b_id),  # Consistent ordering
                                student_b_id=max(student_a_id, student_b_id),
                                similarity_score=similarity_score,
                                is_flagged=True,
                                confidence_level="high",
                                ai_explanation=flagged.get('explanation', ''),
                                ai_evidence=evidence_json,  # Store as JSON string for SQLite compatibility
                                analysis_method="ai_powered",
                                threshold_used=0.8,  # Would pass actual threshold
                                model_used="gpt-4o-mini"
                            )
                            
                            db.add(analysis)
            
            db.commit()
            print(f"✅ Cached plagiarism results for assignment {assignment_id}")
            
        except Exception as e:
            print(f"Error caching plagiarism results: {e}")
            db.rollback()
    
    def _detect_language(self, code: str) -> str:
        """Detect programming language from code content"""
        code_lower = code.lower()
        
        # Simple heuristic-based detection
        if 'def ' in code or 'import ' in code or 'from ' in code or 'print(' in code:
            return 'python'
        elif 'function ' in code or 'const ' in code or 'let ' in code or 'var ' in code:
            return 'javascript'
        elif 'public class' in code or 'public static void main' in code or 'System.out' in code:
            return 'java'
        elif '#include' in code or 'int main' in code or 'std::' in code:
            return 'cpp'
        elif 'func ' in code or 'package main' in code or 'fmt.Print' in code:
            return 'go'
        elif 'fn ' in code or 'let mut' in code or 'println!' in code:
            return 'rust'
        else:
            # Default to Python if uncertain
            return 'python'
    
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
