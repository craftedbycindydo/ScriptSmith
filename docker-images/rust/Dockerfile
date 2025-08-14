# Custom Rust image with pre-installed libraries for kids learning programming
FROM rust:1.75

# Install essential tools
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a Rust project with common dependencies
WORKDIR /app
RUN cargo init --name code-execution

# Add basic dependencies to Cargo.toml
RUN cat > Cargo.toml << 'EOF'
[package]
name = "code-execution"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rand = "0.8"
regex = "1.0"
EOF

# Pre-compile dependencies (check for errors first)
RUN cargo check && cargo build --release

# Create a sample main.rs with basic imports
RUN cat > src/main.rs << 'EOF'
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{self, Read, Write};
use serde::{Deserialize, Serialize};
use serde_json;
use rand::Rng;
use regex::Regex;

#[derive(Serialize, Deserialize, Debug)]
struct Example {
    name: String,
    value: i32,
}

fn main() {
    println!("Rust environment ready with basic crates!");
    
    // Example usage of common crates
    let mut rng = rand::thread_rng();
    let random_number: i32 = rng.gen_range(1..=100);
    println!("Random number: {}", random_number);
    
    // Example collections usage
    let mut numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
    numbers.push(random_number);
    println!("Numbers: {:?}", numbers);
    
    let example = Example {
        name: "Hello Rust".to_string(),
        value: random_number,
    };
    
    if let Ok(json) = serde_json::to_string(&example) {
        println!("JSON: {}", json);
    }
    
    // Example regex usage
    let re = Regex::new(r"\d+").unwrap();
    let text = "There are 123 numbers in this text";
    if let Some(mat) = re.find(text) {
        println!("Found number: {}", mat.as_str());
    }
}
EOF

# Build the project
RUN cargo build

# Create a non-root user
RUN useradd -m -u 1000 coderunner
RUN chown -R coderunner:coderunner /app
USER coderunner

WORKDIR /app

# Default command
CMD ["cargo"]
