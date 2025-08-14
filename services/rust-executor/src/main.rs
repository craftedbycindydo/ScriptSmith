use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tempfile::TempDir;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;
use warp::Filter;

#[derive(Deserialize)]
struct CodeExecutionRequest {
    code: String,
    #[serde(rename = "inputData")]
    input_data: Option<String>,
    timeout: Option<u64>,
}

#[derive(Serialize)]
struct CodeExecutionResponse {
    output: String,
    error: String,
    #[serde(rename = "executionTime")]
    execution_time: f64,
    status: String,
}

#[derive(Deserialize)]
struct CodeValidationRequest {
    code: String,
}

#[derive(Serialize)]
struct CodeValidationResponse {
    #[serde(rename = "isValid")]
    is_valid: bool,
    errors: Vec<String>,
    warnings: Vec<String>,
}

struct RustExecutor {
    max_execution_time: u64,
    max_memory_mb: u32,
    max_code_size_kb: u32,
}

impl RustExecutor {
    fn new() -> Self {
        Self {
            max_execution_time: 30,
            max_memory_mb: 128,
            max_code_size_kb: 50,
        }
    }

    async fn execute_code(
        &self,
        code: String,
        input_data: Option<String>,
        timeout_override: Option<u64>,
    ) -> CodeExecutionResponse {
        let execution_timeout = timeout_override
            .filter(|&t| t <= 60)
            .unwrap_or(self.max_execution_time);

        // Validate code size
        let code_size_kb = code.len() as f64 / 1024.0;
        if code_size_kb > self.max_code_size_kb as f64 {
            return CodeExecutionResponse {
                output: String::new(),
                error: format!(
                    "Code size ({:.1}KB) exceeds maximum allowed size ({}KB)",
                    code_size_kb, self.max_code_size_kb
                ),
                execution_time: 0.0,
                status: "error".to_string(),
            };
        }

        let start_time = Instant::now();

        // Create temporary directory
        let temp_dir = match TempDir::new() {
            Ok(dir) => dir,
            Err(e) => {
                return CodeExecutionResponse {
                    output: String::new(),
                    error: format!("Failed to create temp directory: {}", e),
                    execution_time: start_time.elapsed().as_secs_f64(),
                    status: "error".to_string(),
                };
            }
        };

        // Create Rust project structure
        let project_path = temp_dir.path();
        let src_dir = project_path.join("src");
        if let Err(e) = fs::create_dir_all(&src_dir) {
            return CodeExecutionResponse {
                output: String::new(),
                error: format!("Failed to create src directory: {}", e),
                execution_time: start_time.elapsed().as_secs_f64(),
                status: "error".to_string(),
            };
        }

        // Create Cargo.toml
        let cargo_toml = format!(
            r#"[package]
name = "rust_exec"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "main"
path = "src/main.rs"

[dependencies]
# No external dependencies for security
"#
        );

        if let Err(e) = fs::write(project_path.join("Cargo.toml"), cargo_toml) {
            return CodeExecutionResponse {
                output: String::new(),
                error: format!("Failed to create Cargo.toml: {}", e),
                execution_time: start_time.elapsed().as_secs_f64(),
                status: "error".to_string(),
            };
        }

        // Create restricted code
        let restricted_code = self.create_restricted_code(&code, execution_timeout);
        let main_rs_path = src_dir.join("main.rs");

        if let Err(e) = fs::write(main_rs_path, restricted_code) {
            return CodeExecutionResponse {
                output: String::new(),
                error: format!("Failed to write main.rs: {}", e),
                execution_time: start_time.elapsed().as_secs_f64(),
                status: "error".to_string(),
            };
        }

        // Compile and run
        let result = self
            .compile_and_run(project_path, input_data.as_deref(), execution_timeout)
            .await;

        let execution_time = start_time.elapsed().as_secs_f64();
        CodeExecutionResponse {
            output: result.0,
            error: result.1,
            execution_time,
            status: result.2,
        }
    }

    fn create_restricted_code(&self, user_code: &str, timeout_seconds: u64) -> String {
        // Check if user code already has a main function
        if user_code.contains("fn main()") {
            // User provided their own main function, just add imports
            format!(
                r#"use std::io;
use std::io::prelude::*;
use std::collections::{{HashMap, HashSet, BTreeMap, BTreeSet, VecDeque}};
use std::time::{{Duration, Instant}};
use std::thread;

{}"#,
                user_code
            )
        } else {
            // User code doesn't have main function, wrap it
            format!(
                r#"use std::io;
use std::io::prelude::*;
use std::collections::{{HashMap, HashSet, BTreeMap, BTreeSet, VecDeque}};
use std::time::{{Duration, Instant}};
use std::thread;

fn main() {{
    // Set execution timeout
    let start_time = Instant::now();
    let timeout = Duration::from_secs({});
    
    // Spawn timeout checker
    let timeout_checker = thread::spawn(move || {{
        thread::sleep(timeout);
        eprintln!("TIMEOUT: Code execution exceeded time limit");
        std::process::exit(124);
    }});
    
    // User code wrapper
    let result = std::panic::catch_unwind(|| {{
        // User code starts here
{}
    }});
    
    match result {{
        Ok(_) => {{
            // Success - try to kill timeout checker gracefully
            // Note: We can't actually kill the thread, but process will exit normally
        }}
        Err(e) => {{
            if let Some(s) = e.downcast_ref::<&str>() {{
                eprintln!("Error: {{}}", s);
            }} else if let Some(s) = e.downcast_ref::<String>() {{
                eprintln!("Error: {{}}", s);
            }} else {{
                eprintln!("Error: panic occurred");
            }}
            std::process::exit(1);
        }}
    }}
}}"#,
                timeout_seconds, user_code
            )
        }
    }

    async fn compile_and_run(
        &self,
        project_path: &Path,
        input_data: Option<&str>,
        timeout_seconds: u64,
    ) -> (String, String, String) {
        // Compile
        let compile_result = match timeout(
            Duration::from_secs(30),
            tokio::process::Command::new("cargo")
                .arg("build")
                .arg("--release")
                .arg("--bin")
                .arg("main")
                .current_dir(project_path)
                .env("CARGO_TARGET_DIR", project_path.join("target"))
                .output(),
        )
        .await
        {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => {
                return (
                    String::new(),
                    format!("Failed to execute cargo build: {}", e),
                    "error".to_string(),
                );
            }
            Err(_) => {
                return (
                    String::new(),
                    "Compilation timed out".to_string(),
                    "error".to_string(),
                );
            }
        };

        if !compile_result.status.success() {
            let stderr = String::from_utf8_lossy(&compile_result.stderr);
            return (
                String::new(),
                format!("Compilation error: {}", stderr),
                "error".to_string(),
            );
        }

        // Run the executable
        let executable_path = project_path
            .join("target")
            .join("release")
            .join("main");

        let mut cmd = tokio::process::Command::new(&executable_path);
        
        if input_data.is_some() {
            cmd.stdin(Stdio::piped());
        }
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let run_result = match timeout(
            Duration::from_secs(timeout_seconds),
            async {
                let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {}", e))?;

                // Send input if provided
                if let Some(input) = input_data {
                    if let Some(stdin) = child.stdin.as_mut() {
                        if let Err(e) = stdin.write_all(input.as_bytes()).await {
                            eprintln!("Failed to write to stdin: {}", e);
                        }
                        let _ = stdin; // Close stdin
                    }
                }

                child.wait_with_output().await.map_err(|e| format!("Process error: {}", e))
            }
        )
        .await
        {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => {
                return (String::new(), e, "error".to_string());
            }
            Err(_) => {
                return (
                    String::new(),
                    format!("Code execution timed out after {} seconds", timeout_seconds),
                    "timeout".to_string(),
                );
            }
        };

        let stdout = String::from_utf8_lossy(&run_result.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&run_result.stderr).trim().to_string();

        let status = if run_result.status.success() {
            "success"
        } else if run_result.status.code() == Some(124) {
            "timeout"
        } else {
            "error"
        };

        (stdout, stderr, status.to_string())
    }

    async fn validate_syntax(&self, code: String) -> CodeValidationResponse {
        let temp_dir = match TempDir::new() {
            Ok(dir) => dir,
            Err(e) => {
                return CodeValidationResponse {
                    is_valid: false,
                    errors: vec![format!("Failed to create temp directory: {}", e)],
                    warnings: vec![],
                };
            }
        };

        let project_path = temp_dir.path();
        let src_dir = project_path.join("src");
        if let Err(e) = fs::create_dir_all(&src_dir) {
            return CodeValidationResponse {
                is_valid: false,
                errors: vec![format!("Failed to create src directory: {}", e)],
                warnings: vec![],
            };
        }

        // Create minimal Cargo.toml
        let cargo_toml = r#"[package]
name = "rust_validate"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "main"
path = "src/main.rs"
"#;

        if let Err(e) = fs::write(project_path.join("Cargo.toml"), cargo_toml) {
            return CodeValidationResponse {
                is_valid: false,
                errors: vec![format!("Failed to create Cargo.toml: {}", e)],
                warnings: vec![],
            };
        }

        // Add standard library imports and handle main function intelligently
        let full_code = if code.contains("fn main()") {
            // User provided their own main function
            format!(
                r#"use std::io;
use std::collections::{{HashMap, HashSet, BTreeMap, BTreeSet}};

{}"#,
                code
            )
        } else {
            // Wrap user code in main function
            format!(
                r#"use std::io;
use std::collections::{{HashMap, HashSet, BTreeMap, BTreeSet}};

fn main() {{
{}
}}"#,
                code
            )
        };

        let main_rs_path = src_dir.join("main.rs");
        if let Err(e) = fs::write(main_rs_path, full_code) {
            return CodeValidationResponse {
                is_valid: false,
                errors: vec![format!("Failed to write main.rs: {}", e)],
                warnings: vec![],
            };
        }

        // Check syntax
        let check_result = match timeout(
            Duration::from_secs(10),
            tokio::process::Command::new("cargo")
                .arg("check")
                .current_dir(project_path)
                .output(),
        )
        .await
        {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => {
                return CodeValidationResponse {
                    is_valid: false,
                    errors: vec![format!("Failed to execute cargo check: {}", e)],
                    warnings: vec![],
                };
            }
            Err(_) => {
                return CodeValidationResponse {
                    is_valid: false,
                    errors: vec!["Syntax check timed out".to_string()],
                    warnings: vec![],
                };
            }
        };

        if check_result.status.success() {
            CodeValidationResponse {
                is_valid: true,
                errors: vec![],
                warnings: vec![],
            }
        } else {
            let stderr = String::from_utf8_lossy(&check_result.stderr);
            CodeValidationResponse {
                is_valid: false,
                errors: vec![stderr.to_string()],
                warnings: vec![],
            }
        }
    }
}

async fn health() -> Result<impl warp::Reply, warp::Rejection> {
    let mut response = HashMap::new();
    response.insert("status", "healthy");
    response.insert("service", "rust-executor");
    Ok(warp::reply::json(&response))
}

async fn execute(
    req: CodeExecutionRequest,
    executor: RustExecutor,
) -> Result<impl warp::Reply, warp::Rejection> {
    let result = executor
        .execute_code(req.code, req.input_data, req.timeout)
        .await;
    Ok(warp::reply::json(&result))
}

async fn validate(
    req: CodeValidationRequest,
    executor: RustExecutor,
) -> Result<impl warp::Reply, warp::Rejection> {
    let result = executor.validate_syntax(req.code).await;
    Ok(warp::reply::json(&result))
}

async fn info(executor: RustExecutor) -> Result<impl warp::Reply, warp::Rejection> {
    let mut info = HashMap::new();
    info.insert("service", serde_json::Value::String("rust-executor".to_string()));
    info.insert("language", serde_json::Value::String("rust".to_string()));
    info.insert("version", serde_json::Value::String("1.75".to_string()));
    info.insert("maxExecutionTime", serde_json::Value::Number(executor.max_execution_time.into()));
    info.insert("maxMemoryMB", serde_json::Value::Number(executor.max_memory_mb.into()));
    info.insert("maxCodeSizeKB", serde_json::Value::Number(executor.max_code_size_kb.into()));
    info.insert("availableLibraries", serde_json::Value::Array(vec![
        serde_json::Value::String("std::io".to_string()),
        serde_json::Value::String("std::collections".to_string()),
        serde_json::Value::String("std::time".to_string()),
        serde_json::Value::String("std::thread".to_string()),
        serde_json::Value::String("std::fs".to_string()),
        serde_json::Value::String("std::path".to_string()),
    ]));
    
    Ok(warp::reply::json(&info))
}

#[tokio::main]
async fn main() {
    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8006".to_string())
        .parse()
        .unwrap_or(8006);

    let executor = RustExecutor::new();

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type"])
        .allow_methods(vec!["GET", "POST"]);

    let health_route = warp::path("health")
        .and(warp::get())
        .and_then(health);

    let executor_execute = executor.clone();
    let executor_validate = executor.clone();
    let executor_info = executor.clone();

    let execute_route = warp::path("execute")
        .and(warp::post())
        .and(warp::body::json())
        .and(warp::any().map(move || executor_execute.clone()))
        .and_then(execute);

    let validate_route = warp::path("validate")
        .and(warp::post())
        .and(warp::body::json())
        .and(warp::any().map(move || executor_validate.clone()))
        .and_then(validate);

    let info_route = warp::path("info")
        .and(warp::get())
        .and(warp::any().map(move || executor_info.clone()))
        .and_then(info);

    let routes = health_route
        .or(execute_route)
        .or(validate_route)
        .or(info_route)
        .with(cors);

    println!("Rust executor service running on port {}", port);
    warp::serve(routes).run(([0, 0, 0, 0], port)).await;
}

impl Clone for RustExecutor {
    fn clone(&self) -> Self {
        Self {
            max_execution_time: self.max_execution_time,
            max_memory_mb: self.max_memory_mb,
            max_code_size_kb: self.max_code_size_kb,
        }
    }
}
