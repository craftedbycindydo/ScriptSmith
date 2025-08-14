package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
)

type CodeExecutionRequest struct {
	Code      string `json:"code"`
	InputData string `json:"inputData,omitempty"`
	Timeout   int    `json:"timeout,omitempty"`
}

type CodeExecutionResponse struct {
	Output        string  `json:"output"`
	Error         string  `json:"error"`
	ExecutionTime float64 `json:"executionTime"`
	Status        string  `json:"status"`
}

type CodeValidationRequest struct {
	Code string `json:"code"`
}

type CodeValidationResponse struct {
	IsValid  bool     `json:"isValid"`
	Errors   []string `json:"errors"`
	Warnings []string `json:"warnings"`
}

type GoExecutor struct {
	MaxExecutionTime int
	MaxMemoryMB      int
	MaxCodeSizeKB    int
}

func NewGoExecutor() *GoExecutor {
	return &GoExecutor{
		MaxExecutionTime: 30,
		MaxMemoryMB:      128,
		MaxCodeSizeKB:    50,
	}
}

func (g *GoExecutor) ExecuteCode(code, inputData string, timeout int) CodeExecutionResponse {
	if timeout > 0 && timeout <= 60 {
		g.MaxExecutionTime = timeout
	}

	// Validate code size
	codeSizeKB := float64(utf8.RuneCountInString(code)) / 1024.0
	if codeSizeKB > float64(g.MaxCodeSizeKB) {
		return CodeExecutionResponse{
			Output:        "",
			Error:         fmt.Sprintf("Code size (%.1fKB) exceeds maximum allowed size (%dKB)", codeSizeKB, g.MaxCodeSizeKB),
			ExecutionTime: 0,
			Status:        "error",
		}
	}

	start := time.Now()

	// Create temporary directory
	tempDir, err := os.MkdirTemp("", "go_exec_*")
	if err != nil {
		return CodeExecutionResponse{
			Output:        "",
			Error:         fmt.Sprintf("Failed to create temp directory: %v", err),
			ExecutionTime: time.Since(start).Seconds(),
			Status:        "error",
		}
	}
	defer os.RemoveAll(tempDir)

	// Create Go file
	goFile := filepath.Join(tempDir, "main.go")
	fullCode := g.createRestrictedCode(code)

	err = os.WriteFile(goFile, []byte(fullCode), 0644)
	if err != nil {
		return CodeExecutionResponse{
			Output:        "",
			Error:         fmt.Sprintf("Failed to write code file: %v", err),
			ExecutionTime: time.Since(start).Seconds(),
			Status:        "error",
		}
	}

	// Execute Go code
	result := g.runGoCode(tempDir, inputData)
	result.ExecutionTime = time.Since(start).Seconds()

	return result
}

func (g *GoExecutor) createRestrictedCode(userCode string) string {
	// Check if user code already has a complete Go program with package declaration
	if strings.Contains(userCode, "package main") {
		// User provided a complete Go program, use it as-is
		return userCode
	}
	
	// Check if user code has main function but no package declaration
	if strings.Contains(userCode, "func main()") {
		// User provided their own main function, just add minimal imports and package
		restrictedCode := `package main

import (
	"fmt"
	"os"
	"time"
	"runtime"
)

// Security restrictions
func init() {
	// Limit goroutines
	runtime.GOMAXPROCS(1)
}

` + userCode
		return restrictedCode
	}

	// User code doesn't have main function, wrap it with minimal imports
	restrictedCode := `package main

import (
	"fmt"
	"os"
	"time"
	"runtime"
)

// Security restrictions
func init() {
	// Limit goroutines
	runtime.GOMAXPROCS(1)
}

func main() {
	// Set timeout
	timeout := time.After(30 * time.Second)
	done := make(chan bool)
	
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", r)
			}
			done <- true
		}()
		
		// User code starts here
` + userCode + `
	}()
	
	select {
	case <-done:
		// Code completed
	case <-timeout:
		fmt.Fprintf(os.Stderr, "TIMEOUT: Code execution exceeded time limit\n")
		os.Exit(124)
	}
}`

	return restrictedCode
}

func (g *GoExecutor) runGoCode(tempDir, inputData string) CodeExecutionResponse {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(g.MaxExecutionTime)*time.Second)
	defer cancel()

	// Create go.mod file
	goModContent := "module main\n\ngo 1.21\n"
	goModFile := filepath.Join(tempDir, "go.mod")
	err := os.WriteFile(goModFile, []byte(goModContent), 0644)
	if err != nil {
		return CodeExecutionResponse{
			Output: "",
			Error:  fmt.Sprintf("Failed to create go.mod: %v", err),
			Status: "error",
		}
	}

	// Run go code
	cmd := exec.CommandContext(ctx, "go", "run", "main.go")
	cmd.Dir = tempDir
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"),
		"GOCACHE=" + filepath.Join(tempDir, ".cache"),
		"HOME=" + tempDir,
		"GO111MODULE=on",
		"GOPATH=",
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if inputData != "" {
		cmd.Stdin = strings.NewReader(inputData)
	}

	err = cmd.Run()

	stdoutStr := strings.TrimSpace(stdout.String())
	stderrStr := strings.TrimSpace(stderr.String())

	if ctx.Err() == context.DeadlineExceeded {
		return CodeExecutionResponse{
			Output: "",
			Error:  fmt.Sprintf("Code execution timed out after %d seconds", g.MaxExecutionTime),
			Status: "timeout",
		}
	}

	if err != nil {
		// Check if it's a timeout exit
		if exitError, ok := err.(*exec.ExitError); ok {
			if status, ok := exitError.Sys().(syscall.WaitStatus); ok {
				if status.ExitStatus() == 124 {
					return CodeExecutionResponse{
						Output: "",
						Error:  fmt.Sprintf("Code execution timed out after %d seconds", g.MaxExecutionTime),
						Status: "timeout",
					}
				}
			}
		}

		status := "error"
		errorMsg := stderrStr
		if errorMsg == "" {
			errorMsg = err.Error()
		}

		return CodeExecutionResponse{
			Output: stdoutStr,
			Error:  errorMsg,
			Status: status,
		}
	}

	return CodeExecutionResponse{
		Output: stdoutStr,
		Error:  stderrStr,
		Status: "success",
	}
}

func (g *GoExecutor) ValidateSyntax(code string) CodeValidationResponse {
	tempDir, err := os.MkdirTemp("", "go_validate_*")
	if err != nil {
		return CodeValidationResponse{
			IsValid:  false,
			Errors:   []string{fmt.Sprintf("Failed to create temp directory: %v", err)},
			Warnings: []string{},
		}
	}
	defer os.RemoveAll(tempDir)

	// Create Go file
	goFile := filepath.Join(tempDir, "main.go")
	fullCode := g.createRestrictedCode(code)

	err = os.WriteFile(goFile, []byte(fullCode), 0644)
	if err != nil {
		return CodeValidationResponse{
			IsValid:  false,
			Errors:   []string{fmt.Sprintf("Failed to write code file: %v", err)},
			Warnings: []string{},
		}
	}

	// Create go.mod file
	goModContent := "module main\n\ngo 1.21\n"
	goModFile := filepath.Join(tempDir, "go.mod")
	err = os.WriteFile(goModFile, []byte(goModContent), 0644)
	if err != nil {
		return CodeValidationResponse{
			IsValid:  false,
			Errors:   []string{fmt.Sprintf("Failed to create go.mod: %v", err)},
			Warnings: []string{},
		}
	}

	// Syntax check
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "go", "build", "-o", "/dev/null", "main.go")
	cmd.Dir = tempDir
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"),
		"GOCACHE=" + filepath.Join(tempDir, ".cache"),
		"HOME=" + tempDir,
		"GO111MODULE=on",
		"GOPATH=",
	}

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	err = cmd.Run()
	if err != nil {
		return CodeValidationResponse{
			IsValid:  false,
			Errors:   []string{strings.TrimSpace(stderr.String())},
			Warnings: []string{},
		}
	}

	return CodeValidationResponse{
		IsValid:  true,
		Errors:   []string{},
		Warnings: []string{},
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "healthy",
		"service": "go-executor",
	})
}

func executeHandler(executor *GoExecutor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Handle CORS preflight
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}
		
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req CodeExecutionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		if req.Code == "" {
			http.Error(w, "Code is required", http.StatusBadRequest)
			return
		}

		result := executor.ExecuteCode(req.Code, req.InputData, req.Timeout)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(result)
	}
}

func validateHandler(executor *GoExecutor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Handle CORS preflight
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}
		
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req CodeValidationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		if req.Code == "" {
			http.Error(w, "Code is required", http.StatusBadRequest)
			return
		}

		result := executor.ValidateSyntax(req.Code)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(result)
	}
}

func infoHandler(executor *GoExecutor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info := map[string]interface{}{
			"service":             "go-executor",
			"language":            "go",
			"version":             "1.21",
			"maxExecutionTime":    executor.MaxExecutionTime,
			"maxMemoryMB":         executor.MaxMemoryMB,
			"maxCodeSizeKB":       executor.MaxCodeSizeKB,
			"availableLibraries": []string{
				"fmt", "os", "strings", "strconv", "math", "sort",
				"time", "bufio", "bytes", "io", "regexp", "unicode",
				"crypto/*", "encoding/*", "path/filepath", "runtime",
			},
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(info)
	}
}

func main() {
	port := "8005"
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}

	executor := NewGoExecutor()

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/execute", executeHandler(executor))
	http.HandleFunc("/validate", validateHandler(executor))
	http.HandleFunc("/info", infoHandler(executor))

	fmt.Printf("Go executor service running on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
