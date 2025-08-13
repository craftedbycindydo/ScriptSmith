import { create } from 'zustand';
import { apiService, type Language } from '../services/api';

interface CodeState {
  code: string;
  language: string;
  output: string;
  error: string;
  isLoading: boolean;
  languages: Language[];
  executionTime: number;
  setCode: (code: string) => void;
  setLanguage: (language: string) => void;
  setOutput: (output: string) => void;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
  setExecutionTime: (time: number) => void;
  clearOutput: () => void;
  loadLanguages: () => Promise<void>;
  executeCode: () => Promise<void>;
}

const defaultCode: Record<string, string> = {
  python: `# Python Example
def greet(name):
    return f"Hello, {name}!"

print(greet("World"))`,
  javascript: `// JavaScript Example
function greet(name) {
    return \`Hello, \${name}!\`;
}

console.log(greet("World"));`,
  typescript: `// TypeScript Example
function greet(name: string): string {
    return \`Hello, \${name}!\`;
}

console.log(greet("World"));`,
  java: `// Java Example
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
  cpp: `// C++ Example
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
  go: `// Go Example
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
  rust: `// Rust Example
fn main() {
    println!("Hello, World!");
}`,
};

export const useCodeStore = create<CodeState>((set, get) => ({
  code: defaultCode.python,
  language: 'python',
  output: '',
  error: '',
  isLoading: false,
  languages: [],
  executionTime: 0,
  setCode: (code) => set({ code }),
  setLanguage: async (language) => {
    try {
      // Load template from API
      const template = await apiService.getLanguageTemplate(language);
      set({ 
        language, 
        code: template.template || defaultCode[language] || defaultCode.python,
        output: '',
        error: '',
        executionTime: 0
      });
    } catch (error) {
      // Fallback to local template
      set({ 
        language, 
        code: defaultCode[language] || defaultCode.python,
        output: '',
        error: '',
        executionTime: 0
      });
    }
  },
  setOutput: (output) => set({ output, error: '' }),
  setError: (error) => set({ error, output: '' }),
  setLoading: (isLoading) => set({ isLoading }),
  setExecutionTime: (executionTime) => set({ executionTime }),
  clearOutput: () => set({ output: '', error: '', executionTime: 0 }),
  
  loadLanguages: async () => {
    try {
      const response = await apiService.getLanguages();
      set({ languages: response.languages });
    } catch (error) {
      console.error('Failed to load languages:', error);
      // Set fallback languages
      set({ 
        languages: [
          { id: 'python', name: 'Python', version: '3.11', extension: 'py' },
          { id: 'javascript', name: 'JavaScript', version: 'Node.js 18', extension: 'js' },
          { id: 'typescript', name: 'TypeScript', version: '5.0', extension: 'ts' },
          { id: 'java', name: 'Java', version: 'OpenJDK 17', extension: 'java' },
          { id: 'cpp', name: 'C++', version: 'GCC 11', extension: 'cpp' },
          { id: 'go', name: 'Go', version: '1.21', extension: 'go' },
          { id: 'rust', name: 'Rust', version: '1.70', extension: 'rs' },
        ]
      });
    }
  },

  executeCode: async () => {
    const { code, language } = get();
    
    set({ isLoading: true, output: '', error: '', executionTime: 0 });
    
    try {
      const response = await apiService.executeCode({
        code,
        language,
        input_data: ''
      });
      
      set({ 
        output: response.output,
        error: response.error,
        executionTime: response.execution_time,
        isLoading: false
      });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || error.message || 'Failed to execute code',
        output: '',
        executionTime: 0,
        isLoading: false
      });
    }
  },
}));
