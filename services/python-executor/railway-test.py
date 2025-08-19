#!/usr/bin/env python3
"""
Railway Compatibility Test Script
Tests the python-executor changes in Railway-like environment conditions
"""

import os
import sys
import platform
import subprocess
import tempfile
from pathlib import Path

def simulate_railway_environment():
    """Simulate Railway environment variables"""
    test_env = os.environ.copy()
    
    # Set Railway environment indicators
    test_env['RAILWAY_ENVIRONMENT'] = 'production'
    test_env['PORT'] = '8001'
    
    # Remove virtual environment variables that might exist locally
    venv_vars = ['PYTHONHOME', 'VIRTUAL_ENV', 'CONDA_DEFAULT_ENV', 'CONDA_PREFIX']
    for var in venv_vars:
        test_env.pop(var, None)
    
    # Set container-like paths
    test_env['PATH'] = '/usr/local/bin:/usr/bin:/bin'
    
    return test_env

def test_python_executable_detection():
    """Test the Python executable detection logic"""
    print("🧪 Testing Python executable detection...")
    
    # Test local environment detection
    is_container = os.path.exists('/.dockerenv') or os.environ.get('RAILWAY_ENVIRONMENT')
    is_macos = platform.system() == 'Darwin'
    
    print(f"  Local environment: container={is_container}, macos={is_macos}")
    
    # Test with simulated Railway environment
    old_env = os.environ.get('RAILWAY_ENVIRONMENT')
    os.environ['RAILWAY_ENVIRONMENT'] = 'production'
    
    is_container_simulated = os.path.exists('/.dockerenv') or os.environ.get('RAILWAY_ENVIRONMENT')
    print(f"  Simulated Railway: container={is_container_simulated}")
    
    # Restore environment
    if old_env:
        os.environ['RAILWAY_ENVIRONMENT'] = old_env
    else:
        os.environ.pop('RAILWAY_ENVIRONMENT', None)

def test_environment_cleaning():
    """Test environment variable cleaning"""
    print("🧪 Testing environment variable cleaning...")
    
    python_conflict_vars = {
        'PYTHONHOME', 'VIRTUAL_ENV', 'CONDA_DEFAULT_ENV', 'CONDA_PREFIX',
        'PIPENV_ACTIVE', 'POETRY_ACTIVE', 'PYENV_VERSION', 'PYTHONSTARTUP'
    }
    
    # Create test environment with problematic variables
    test_env = os.environ.copy()
    test_env.update({
        'PYTHONHOME': '/some/venv/path',
        'VIRTUAL_ENV': '/another/venv',
        'CONDA_DEFAULT_ENV': 'base'
    })
    
    # Clean environment (simulate the _create_safe_environment logic)
    cleaned_env = {}
    for key, value in test_env.items():
        if key not in python_conflict_vars:
            cleaned_env[key] = value
    
    # Check that problematic variables are removed
    found_conflicts = [var for var in python_conflict_vars if var in cleaned_env]
    
    if found_conflicts:
        print(f"  ❌ Still found conflict variables: {found_conflicts}")
    else:
        print(f"  ✅ Environment cleaned successfully")

def test_subprocess_execution():
    """Test subprocess execution with clean environment"""
    print("🧪 Testing subprocess execution...")
    
    # Create a simple test script
    test_code = """
import sys
import os
print("Test execution successful!")
print(f"Python executable: {sys.executable}")
print(f"PYTHONHOME: {os.environ.get('PYTHONHOME', 'Not set')}")
"""
    
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(test_code)
            test_file = f.name
        
        # Test with cleaned environment
        clean_env = simulate_railway_environment()
        
        result = subprocess.run(
            [sys.executable, test_file],
            capture_output=True,
            text=True,
            env=clean_env,
            timeout=10
        )
        
        if result.returncode == 0:
            print(f"  ✅ Subprocess execution successful")
            print(f"  Output: {result.stdout.strip()}")
        else:
            print(f"  ❌ Subprocess execution failed")
            print(f"  Error: {result.stderr}")
        
    except Exception as e:
        print(f"  ❌ Test failed: {e}")
    finally:
        # Clean up
        if 'test_file' in locals():
            os.unlink(test_file)

def check_railway_requirements():
    """Check Railway deployment requirements"""
    print("🚀 Checking Railway deployment requirements...")
    
    # Check required files
    required_files = ['main.py', 'requirements.txt', 'Dockerfile', 'railway.toml']
    for file in required_files:
        if os.path.exists(file):
            print(f"  ✅ {file} exists")
        else:
            print(f"  ❌ {file} missing")
    
    # Check Dockerfile FROM statement
    if os.path.exists('Dockerfile'):
        with open('Dockerfile', 'r') as f:
            content = f.read()
            if 'FROM python:3.12-slim' in content:
                print("  ✅ Dockerfile uses python:3.12-slim")
            else:
                print("  ⚠️  Dockerfile might not use expected Python base image")

def main():
    print("🔍 Railway Compatibility Test for Python Executor")
    print("=" * 50)
    
    test_python_executable_detection()
    print()
    test_environment_cleaning()
    print()
    test_subprocess_execution()
    print()
    check_railway_requirements()
    print()
    print("✅ Railway compatibility tests completed!")

if __name__ == "__main__":
    main()
