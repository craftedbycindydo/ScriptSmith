"""
Security validation utilities for 2025 best practices
"""
import re
import ipaddress
from typing import Optional
from fastapi import HTTPException, status


class SecurityValidator:
    """Security validation utilities for input sanitization and validation"""
    
    # Password strength regex patterns
    PASSWORD_MIN_LENGTH = 8
    PASSWORD_MAX_LENGTH = 128
    
    # Common weak passwords (simplified list)
    WEAK_PASSWORDS = {
        "password", "123456", "password123", "admin", "letmein",
        "welcome", "monkey", "1234567890", "qwerty", "abc123"
    }
    
    @staticmethod
    def validate_password_strength(password: str) -> tuple[bool, Optional[str]]:
        """
        Validate password strength according to 2025 security standards
        Returns: (is_valid, error_message)
        """
        if len(password) < SecurityValidator.PASSWORD_MIN_LENGTH:
            return False, f"Password must be at least {SecurityValidator.PASSWORD_MIN_LENGTH} characters long"
        
        if len(password) > SecurityValidator.PASSWORD_MAX_LENGTH:
            return False, f"Password must be no more than {SecurityValidator.PASSWORD_MAX_LENGTH} characters long"
        
        # Check for common weak passwords
        if password.lower() in SecurityValidator.WEAK_PASSWORDS:
            return False, "Password is too common. Please choose a stronger password"
        
        # Check for at least one uppercase letter
        if not re.search(r'[A-Z]', password):
            return False, "Password must contain at least one uppercase letter"
        
        # Check for at least one lowercase letter
        if not re.search(r'[a-z]', password):
            return False, "Password must contain at least one lowercase letter"
        
        # Check for at least one digit
        if not re.search(r'\d', password):
            return False, "Password must contain at least one number"
        
        # Check for at least one special character
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            return False, "Password must contain at least one special character (!@#$%^&*(),.?\":{}|<>)"
        
        return True, None
    
    @staticmethod
    def validate_email_format(email: str) -> tuple[bool, Optional[str]]:
        """
        Validate email format with enhanced security checks
        """
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        
        if not re.match(email_pattern, email):
            return False, "Invalid email format"
        
        # Check email length
        if len(email) > 254:  # RFC 5321 limit
            return False, "Email address is too long"
        
        # Check local part length
        local_part = email.split('@')[0]
        if len(local_part) > 64:  # RFC 5321 limit
            return False, "Email local part is too long"
        
        return True, None
    
    @staticmethod
    def validate_username(username: str) -> tuple[bool, Optional[str]]:
        """
        Validate username with security considerations
        """
        if len(username) < 3:
            return False, "Username must be at least 3 characters long"
        
        if len(username) > 50:
            return False, "Username must be no more than 50 characters long"
        
        # Allow only alphanumeric characters, underscores, and hyphens
        if not re.match(r'^[a-zA-Z0-9_-]+$', username):
            return False, "Username can only contain letters, numbers, underscores, and hyphens"
        
        # Don't allow username to start with special characters
        if username[0] in ['_', '-']:
            return False, "Username cannot start with special characters"
        
        # Reserved usernames
        reserved_usernames = {
            'admin', 'root', 'system', 'api', 'www', 'mail', 'ftp',
            'support', 'help', 'test', 'guest', 'user', 'null', 'undefined'
        }
        
        if username.lower() in reserved_usernames:
            return False, "Username is reserved. Please choose a different username"
        
        return True, None
    
    @staticmethod
    def sanitize_input(text: str, max_length: int = 1000) -> str:
        """
        Sanitize user input to prevent injection attacks
        """
        if not text:
            return ""
        
        # Trim whitespace
        text = text.strip()
        
        # Limit length
        if len(text) > max_length:
            text = text[:max_length]
        
        # Remove potentially dangerous characters
        # This is a basic implementation - in production, use a proper sanitization library
        dangerous_patterns = [
            r'<script.*?</script>',  # Script tags
            r'javascript:',          # Javascript protocol
            r'on\w+\s*=',           # Event handlers
            r'expression\s*\(',     # CSS expressions
        ]
        
        for pattern in dangerous_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.DOTALL)
        
        return text
    
    @staticmethod
    def validate_client_ip(ip_address: str) -> bool:
        """
        Validate if the client IP address is acceptable
        """
        try:
            ip = ipaddress.ip_address(ip_address)
            
            # Block certain IP ranges if needed (example: private networks in production)
            # This is just an example - adjust based on your security requirements
            if ip.is_loopback or ip.is_link_local:
                return True  # Allow for development
            
            return True
        except ValueError:
            return False
    
    @staticmethod
    def check_request_headers(headers: dict) -> tuple[bool, Optional[str]]:
        """
        Validate request headers for security issues
        """
        # Check for suspicious User-Agent strings
        user_agent = headers.get('user-agent', '').lower()
        
        suspicious_agents = [
            'sqlmap', 'nikto', 'dirbuster', 'nmap', 'masscan',
            'gobuster', 'dirb', 'wfuzz', 'burp'
        ]
        
        for agent in suspicious_agents:
            if agent in user_agent:
                return False, "Suspicious user agent detected"
        
        # Check for content length limits
        content_length = headers.get('content-length')
        if content_length:
            try:
                length = int(content_length)
                if length > 10_000_000:  # 10MB limit
                    return False, "Request too large"
            except ValueError:
                return False, "Invalid content length header"
        
        return True, None


def validate_input_security(
    password: Optional[str] = None,
    email: Optional[str] = None,
    username: Optional[str] = None
) -> None:
    """
    Comprehensive input validation that raises HTTPException on failure
    """
    if password is not None:
        is_valid, error = SecurityValidator.validate_password_strength(password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
    
    if email is not None:
        is_valid, error = SecurityValidator.validate_email_format(email)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
    
    if username is not None:
        is_valid, error = SecurityValidator.validate_username(username)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
