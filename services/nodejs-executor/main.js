#!/usr/bin/env node
/**
 * JavaScript/TypeScript Code Execution Microservice
 * Railway.app compatible - no Docker required
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 8002;

class JavaScriptExecutor {
    constructor() {
        this.maxExecutionTime = 30000; // 30 seconds in ms
        this.maxMemoryMB = 128;
        this.maxCodeSizeKB = 50;
    }

    async executeCode(code, inputData = '', timeout = null, language = 'javascript') {
        if (timeout) {
            this.maxExecutionTime = Math.min(timeout * 1000, 60000); // Max 60 seconds
        }

        // Validate code size
        const codeSizeKB = Buffer.byteLength(code, 'utf8') / 1024;
        if (codeSizeKB > this.maxCodeSizeKB) {
            return {
                output: '',
                error: `Code size (${codeSizeKB.toFixed(1)}KB) exceeds maximum allowed size (${this.maxCodeSizeKB}KB)`,
                executionTime: 0,
                status: 'error'
            };
        }

        const startTime = Date.now();
        let tempDir = null;

        try {
            // Create temporary directory
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'js_exec_'));
            const codeId = crypto.randomUUID();
            const codeFile = path.join(tempDir, `code_${codeId}.js`);

            // Create restricted code (handle TypeScript transpilation)
            const restrictedCode = this.createRestrictedCode(code, language);

            // Write code to file
            await fs.writeFile(codeFile, restrictedCode, 'utf8');

            // Execute code
            const result = await this.runNodeCode(codeFile, inputData);
            const executionTime = (Date.now() - startTime) / 1000;

            return {
                output: result.stdout,
                error: result.stderr,
                executionTime,
                status: result.status
            };

        } catch (error) {
            return {
                output: '',
                error: `Execution failed: ${error.message}`,
                executionTime: (Date.now() - startTime) / 1000,
                status: 'error'
            };
        } finally {
            // Clean up
            if (tempDir) {
                try {
                    await fs.rm(tempDir, { recursive: true, force: true });
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    createRestrictedCode(code, language) {
        // Handle TypeScript by transpiling to JavaScript
        if (language === 'typescript') {
            return this.transpileTypeScript(code);
        }
        return code;
    }
    
    transpileTypeScript(tsCode) {
        // Simple TypeScript to JavaScript transpilation
        // Remove type annotations and convert basic TS features
        let jsCode = tsCode
            // Remove type annotations from function parameters
            .replace(/(\w+):\s*\w+(\[\])?/g, '$1')
            // Remove return type annotations
            .replace(/\):\s*\w+(\[\])?\s*{/g, ') {')
            // Remove interface definitions (replace with empty object)
            .replace(/interface\s+\w+\s*{[^}]*}/g, '{}')
            // Remove type assertions
            .replace(/as\s+\w+/g, '')
            // Remove generic type parameters
            .replace(/<[^>]+>/g, '')
            // Convert let/const declarations (already valid JS)
            // Convert arrow functions with type annotations
            .replace(/(\w+):\s*\w+(\[\])?\s*=>/g, '$1 =>')
            // Remove export/import type-only statements
            .replace(/export\s+type\s+.*$/gm, '')
            .replace(/import\s+type\s+.*$/gm, '');
            
        return jsCode;
    }

    async runNodeCode(codeFile, inputData) {
        return new Promise((resolve) => {
            const child = spawn('node', [codeFile], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    NODE_OPTIONS: `--max-old-space-size=${this.maxMemoryMB}`,
                    PATH: process.env.PATH
                }
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Send input data if provided
            if (inputData) {
                child.stdin.write(inputData);
            }
            child.stdin.end();

            // Set a timeout to kill the process if it takes too long
            const timeoutId = setTimeout(() => {
                child.kill('SIGTERM');
                resolve({
                    stdout: stdout.trim(),
                    stderr: `Code execution timed out after ${this.maxExecutionTime / 1000} seconds`,
                    status: 'timeout'
                });
            }, this.maxExecutionTime);

            child.on('close', (code, signal) => {
                clearTimeout(timeoutId);
                let status = 'success';
                
                if (signal === 'SIGTERM' || code === 124) {
                    status = 'timeout';
                    stderr = `Code execution timed out after ${this.maxExecutionTime / 1000} seconds`;
                } else if (code !== 0) {
                    status = 'error';
                }

                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    status
                });
            });

            child.on('error', (error) => {
                resolve({
                    stdout: '',
                    stderr: `Process execution failed: ${error.message}`,
                    status: 'error'
                });
            });
        });
    }

    async validateSyntax(code, language = 'javascript') {
        try {
            // For JavaScript, we'll try to parse it using Node.js
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'js_validate_'));
            const codeId = crypto.randomUUID();
            const codeFile = path.join(tempDir, `validate_${codeId}.js`);

            try {
                // Write code to file
                await fs.writeFile(codeFile, code, 'utf8');

                // Run syntax check
                const result = await this.runSyntaxCheck(codeFile);
                
                // Clean up
                await fs.rm(tempDir, { recursive: true, force: true });

                return result;

            } catch (error) {
                // Clean up on error
                try {
                    await fs.rm(tempDir, { recursive: true, force: true });
                } catch (e) {
                    // Ignore cleanup errors
                }
                throw error;
            }

        } catch (error) {
            return {
                isValid: false,
                errors: [`Validation error: ${error.message}`],
                warnings: []
            };
        }
    }

    async runSyntaxCheck(codeFile) {
        return new Promise((resolve) => {
            const child = spawn('node', ['--check', codeFile], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 5000
            });

            let stderr = '';

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        isValid: true,
                        errors: [],
                        warnings: []
                    });
                } else {
                    resolve({
                        isValid: false,
                        errors: [stderr.trim()],
                        warnings: []
                    });
                }
            });

            child.on('error', (error) => {
                resolve({
                    isValid: false,
                    errors: [`Syntax check failed: ${error.message}`],
                    warnings: []
                });
            });
        });
    }
}

// Global executor instance
const jsExecutor = new JavaScriptExecutor();

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'nodejs-executor' });
});

app.post('/execute', async (req, res) => {
    try {
        const { code, inputData, timeout, language } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const result = await jsExecutor.executeCode(code, inputData, timeout, language || 'javascript');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/validate', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const result = await jsExecutor.validateSyntax(code);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/info', (req, res) => {
    res.json({
        service: 'nodejs-executor',
        language: 'javascript',
        version: process.version,
        maxExecutionTime: jsExecutor.maxExecutionTime / 1000,
        maxMemoryMB: jsExecutor.maxMemoryMB,
        maxCodeSizeKB: jsExecutor.maxCodeSizeKB,
        availableLibraries: [
            'Built-in Node.js modules (limited for security)',
            'console', 'JSON', 'Math', 'Date', 'Array', 'Object',
            'String', 'Number', 'Boolean', 'RegExp', 'setTimeout',
            'setInterval', 'clearTimeout', 'clearInterval'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`JavaScript executor service running on port ${PORT}`);
});
