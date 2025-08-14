# Custom C++ image with pre-installed libraries for kids learning programming
FROM gcc:12

# Install essential development tools and libraries
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    cmake \
    make \
    gdb \
    pkg-config \
    libssl-dev \
    && apt-get install -y --no-install-recommends \
    libboost-dev \
    libboost-system-dev \
    libboost-filesystem-dev \
    libjsoncpp-dev \
    libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Set up a basic CMake template
WORKDIR /app
RUN cat > CMakeLists.txt << 'EOF'
cmake_minimum_required(VERSION 3.10)
project(CodeExecution)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find basic packages
find_package(PkgConfig QUIET)

# Add executable
add_executable(main main.cpp)

# Link standard libraries
target_link_libraries(main pthread)
EOF

# Create a basic main.cpp template
RUN cat > main.cpp << 'EOF'
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <queue>
#include <stack>

int main() {
    std::cout << "C++ environment ready with STL!" << std::endl;
    
    // Example STL usage
    std::vector<int> numbers = {1, 2, 3, 4, 5};
    std::cout << "Vector size: " << numbers.size() << std::endl;
    
    return 0;
}
EOF

# Create a non-root user
RUN useradd -m -u 1000 coderunner
RUN chown -R coderunner:coderunner /app
USER coderunner

WORKDIR /app

# Default command
CMD ["g++"]
