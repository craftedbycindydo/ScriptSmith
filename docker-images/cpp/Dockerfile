# Custom C++ image with pre-installed libraries for kids learning programming
FROM gcc:12

# Install essential development tools and libraries
RUN apt-get update && apt-get install -y \
    cmake \
    make \
    gdb \
    valgrind \
    pkg-config \
    libboost-all-dev \
    libeigen3-dev \
    libgtest-dev \
    libgmock-dev \
    libjsoncpp-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Build and install Google Test
WORKDIR /usr/src/gtest
RUN cmake CMakeLists.txt && \
    make && \
    cp lib/*.a /usr/lib/ && \
    mkdir -p /usr/local/lib && \
    cp lib/*.a /usr/local/lib/

# Set up a basic CMake template
WORKDIR /app
RUN cat > CMakeLists.txt << 'EOF'
cmake_minimum_required(VERSION 3.10)
project(CodeExecution)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find packages
find_package(Boost REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(JSONCPP jsoncpp)

# Include directories
include_directories(${Boost_INCLUDE_DIRS})
include_directories(/usr/include/eigen3)

# Add executable
add_executable(main main.cpp)

# Link libraries
target_link_libraries(main ${Boost_LIBRARIES})
target_link_libraries(main ${JSONCPP_LIBRARIES})
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
#include <boost/algorithm/string.hpp>

int main() {
    std::cout << "C++ environment ready with STL and Boost!" << std::endl;
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
