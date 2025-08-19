import { useState, useEffect } from 'react';
import { Code2 } from 'lucide-react';

interface TypingCodeAnimationProps {
  className?: string;
}

export default function TypingCodeAnimation({ className = "" }: TypingCodeAnimationProps) {
  const [currentCode, setCurrentCode] = useState('');
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  const codeSnippets = [
    `// Real-time collaborative code editor
function initializeWebSocket() {
  const ws = new WebSocket(process.env.VITE_WEBSOCKET_URL);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'code_change') {
      updateEditor(data.content);
    }
  };
  return ws;
}`,
    `// Multi-language code execution service
async function executeCode(code, language, input) {
  const response = await fetch('/api/code/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language, input })
  });
  const result = await response.json();
  return result;
}`,
    `# Python algorithm implementation
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    
    return merge(left, right)`,
    `// Assignment template system
class AssignmentTemplate {
  constructor(name, language, starterCode) {
    this.name = name;
    this.language = language;
    this.starterCode = starterCode;
    this.submissions = [];
  }
  
  addSubmission(userId, code) {
    this.submissions.push({ userId, code, timestamp: Date.now() });
  }
}`,
    `// Real-time syntax highlighting
import { highlight, languages } from 'prismjs';

function highlightCode(code, language) {
  try {
    return highlight(code, languages[language], language);
  } catch (error) {
    return code; // Fallback to plain text
  }
}`,
    `/* C++ competitive programming solution */
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> nums = {3, 1, 4, 1, 5, 9, 2, 6};
    std::sort(nums.begin(), nums.end());
    
    for (int num : nums) {
        std::cout << num << " ";
    }
    return 0;
}`
  ];

  useEffect(() => {
    const currentSnippet = codeSnippets[currentLineIndex];
    
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (currentCharIndex < currentSnippet.length) {
          setCurrentCode(currentSnippet.slice(0, currentCharIndex + 1));
          setCurrentCharIndex(currentCharIndex + 1);
        } else {
          // Pause at the end before deleting
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        if (currentCharIndex > 0) {
          setCurrentCode(currentSnippet.slice(0, currentCharIndex - 1));
          setCurrentCharIndex(currentCharIndex - 1);
        } else {
          setIsDeleting(false);
          setCurrentLineIndex((currentLineIndex + 1) % codeSnippets.length);
        }
      }
    }, isDeleting ? 30 : Math.random() * 100 + 50); // Variable typing speed

    return () => clearTimeout(timeout);
  }, [currentCharIndex, currentLineIndex, isDeleting, codeSnippets]);

  // Cursor blinking effect
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530);

    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <div className={`relative flex flex-col h-full min-h-0 ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
      
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-10 left-10 w-2 h-2 bg-blue-400/20 rounded-full animate-pulse" />
        <div className="absolute top-32 right-16 w-1 h-1 bg-green-400/30 rounded-full animate-ping" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-20 w-1.5 h-1.5 bg-purple-400/25 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-32 right-12 w-1 h-1 bg-yellow-400/20 rounded-full animate-ping" style={{ animationDelay: '3s' }} />
      </div>

      <div className="relative z-20 flex items-center text-lg font-medium text-white p-6">
        <Code2 className="mr-2 h-6 w-6 text-blue-400" />
        Scripting Smith
      </div>
      
      <div className="relative z-20 flex-1 p-6 pt-0 min-h-0 overflow-hidden">
        <div className="bg-zinc-950/50 rounded-lg border border-zinc-700/50 p-4 h-full backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-700/30">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-xs text-zinc-400 ml-2">script.js</span>
          </div>
          
          <div className="font-mono text-sm">
            <pre className="text-gray-300 whitespace-pre-wrap">
              <code>
                <span className="text-gray-500">1  </span>
                <span className="text-blue-300">// Welcome to Scripting Smith</span>
                {'\n'}
                <span className="text-gray-500">2  </span>
                <span className="text-gray-500">// Code anywhere, anytime</span>
                {'\n'}
                <span className="text-gray-500">3  </span>
                {'\n'}
                <span className="text-gray-500">4  </span>
                <span 
                  className="syntax-highlight"
                  dangerouslySetInnerHTML={{ 
                    __html: highlightSyntax(currentCode) + (showCursor ? '<span class="text-white bg-white/80 animate-pulse">|</span>' : '') 
                  }}
                />
              </code>
            </pre>
          </div>
        </div>
      </div>

      <div className="relative z-20 mt-auto p-6">
        <blockquote className="space-y-2">
          <p className="text-lg text-white/90">
            "Build, debug, and deploy with our powerful online IDE. Your code, anywhere you go."
          </p>
        </blockquote>
      </div>
    </div>
  );
}

// Simple syntax highlighting function
function highlightSyntax(code: string): string {
  return code
    .replace(/\b(function|const|let|var|if|else|return|class|async|await|try|catch|for|while|do)\b/g, '<span class="text-purple-400">$1</span>')
    .replace(/\b(true|false|null|undefined)\b/g, '<span class="text-orange-400">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="text-orange-400">$1</span>')
    .replace(/"([^"]*)"/g, '<span class="text-green-400">"$1"</span>')
    .replace(/'([^']*)'/g, '<span class="text-green-400">\'$1\'</span>')
    .replace(/`([^`]*)`/g, '<span class="text-green-400">`$1`</span>')
    .replace(/\/\/.*$/gm, '<span class="text-gray-500">$&</span>')
    .replace(/\/\*[\s\S]*?\*\//g, '<span class="text-gray-500">$&</span>');
}
