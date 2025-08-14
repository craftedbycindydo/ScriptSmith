from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

# Language configurations with sample code templates
LANGUAGE_CONFIGS = {
    "python": {
        "id": "python",
        "name": "Python",
        "version": "3.12",
        "extension": "py",
        "template": '''# Python Example
def greet(name):
    return f"Hello, {name}!"

print(greet("World"))''',
        "compile_command": None,
        "run_command": "python3 main.py"
    },
    "javascript": {
        "id": "javascript", 
        "name": "JavaScript",
        "version": "Node.js 22",
        "extension": "js",
        "template": '''// JavaScript Example
function greet(name) {
    return `Hello, ${name}!`;
}

console.log(greet("World"));''',
        "compile_command": None,
        "run_command": "node main.js"
    },
    "typescript": {
        "id": "typescript",
        "name": "TypeScript", 
        "version": "5.0",
        "extension": "ts",
        "template": '''// TypeScript Example
function greet(name: string): string {
    return `Hello, ${name}!`;
}

console.log(greet("World"));''',
        "compile_command": "tsc main.ts",
        "run_command": "node main.js"
    },
    "java": {
        "id": "java",
        "name": "Java",
        "version": "OpenJDK 17",
        "extension": "java", 
        "template": '''// Java Example
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}''',
        "compile_command": "javac Main.java",
        "run_command": "java Main"
    },
    "cpp": {
        "id": "cpp",
        "name": "C++",
        "version": "GCC 13", 
        "extension": "cpp",
        "template": '''// C++ Example
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}''',
        "compile_command": "g++ -o main main.cpp",
        "run_command": "./main"
    },
    "go": {
        "id": "go",
        "name": "Go",
        "version": "1.23",
        "extension": "go",
        "template": '''// Go Example
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}''',
        "compile_command": "go build -o main main.go", 
        "run_command": "./main"
    },
    "rust": {
        "id": "rust",
        "name": "Rust",
        "version": "1.82",
        "extension": "rs",
        "template": '''// Rust Example
fn main() {
    println!("Hello, World!");
}''',
        "compile_command": "rustc main.rs",
        "run_command": "./main"
    }
}

@router.get("/languages")
async def get_supported_languages():
    """Get list of supported programming languages"""
    languages = []
    for lang_id in settings.supported_languages:
        if lang_id in LANGUAGE_CONFIGS:
            config = LANGUAGE_CONFIGS[lang_id]
            languages.append({
                "id": config["id"],
                "name": config["name"], 
                "version": config["version"],
                "extension": config["extension"]
            })
    
    return {
        "languages": languages,
        "total": len(languages)
    }

@router.get("/languages/{language_id}/template")
async def get_language_template(language_id: str):
    """Get code template for a specific language"""
    if language_id not in LANGUAGE_CONFIGS:
        return {"error": f"Language '{language_id}' not supported"}
    
    config = LANGUAGE_CONFIGS[language_id]
    return {
        "language": language_id,
        "template": config["template"],
        "extension": config["extension"]
    }
