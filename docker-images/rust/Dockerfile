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

# Add common dependencies to Cargo.toml
RUN cat > Cargo.toml << 'EOF'
[package]
name = "code-execution"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
reqwest = { version = "0.11", features = ["json"] }
tokio = { version = "1.0", features = ["full"] }
clap = { version = "4.0", features = ["derive"] }
rand = "0.8"
chrono = { version = "0.4", features = ["serde"] }
regex = "1.0"
log = "0.4"
env_logger = "0.10"
anyhow = "1.0"
thiserror = "1.0"
uuid = { version = "1.0", features = ["v4"] }
itertools = "0.11"
rayon = "1.7"

[dev-dependencies]
assert_cmd = "2.0"
predicates = "3.0"
tempfile = "3.0"
EOF

# Pre-compile dependencies
RUN cargo build --release

# Create a sample main.rs with common imports
RUN cat > src/main.rs << 'EOF'
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io::{self, Read, Write};
use serde::{Deserialize, Serialize};
use serde_json;
use rand::Rng;
use chrono::{DateTime, Utc};
use regex::Regex;

#[derive(Serialize, Deserialize, Debug)]
struct Example {
    name: String,
    value: i32,
}

fn main() {
    println!("Rust environment ready with common crates!");
    
    // Example usage of common crates
    let mut rng = rand::thread_rng();
    let random_number: i32 = rng.gen_range(1..=100);
    println!("Random number: {}", random_number);
    
    let example = Example {
        name: "Hello".to_string(),
        value: random_number,
    };
    
    if let Ok(json) = serde_json::to_string(&example) {
        println!("JSON: {}", json);
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
