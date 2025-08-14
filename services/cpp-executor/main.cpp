#include <iostream>
#include <string>
#include <fstream>
#include <sstream>
#include <cstdlib>
#include <chrono>
#include <thread>
#include <vector>
#include <memory>
#include <cstring>
#include <unistd.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/resource.h>

// Simple HTTP server for C++ code execution
class HttpServer {
private:
    int port;
    int maxExecutionTime = 30;
    int maxMemoryMB = 128;
    int maxCodeSizeKB = 50;

public:
    HttpServer(int p) : port(p) {}

    std::string executeCode(const std::string& code, const std::string& inputData = "", int timeout = 0) {
        if (timeout > 0) {
            maxExecutionTime = std::min(timeout, 60);
        }

        // Validate code size
        double codeSizeKB = code.size() / 1024.0;
        if (codeSizeKB > maxCodeSizeKB) {
            return "{\"output\":\"\",\"error\":\"Code size exceeds maximum allowed size\",\"executionTime\":0,\"status\":\"error\"}";
        }

        auto startTime = std::chrono::high_resolution_clock::now();
        
        // Create temporary file
        std::string tempFile = "/tmp/cpp_code_" + std::to_string(getpid()) + "_" + std::to_string(time(nullptr)) + ".cpp";
        std::string executableFile = tempFile.substr(0, tempFile.find_last_of('.'));

        try {
            // Write code to file
            std::ofstream codeFile(tempFile);
            if (!codeFile) {
                return "{\"output\":\"\",\"error\":\"Failed to create temporary file\",\"executionTime\":0,\"status\":\"error\"}";
            }
            
            codeFile << "#include <iostream>\n";
            codeFile << "#include <string>\n";
            codeFile << "#include <vector>\n";
            codeFile << "#include <algorithm>\n";
            codeFile << "#include <cmath>\n";
            codeFile << "#include <cstdlib>\n";
            codeFile << "#include <climits>\n";
            codeFile << "#include <ctime>\n";
            codeFile << "using namespace std;\n\n";
            codeFile << code;
            codeFile.close();

            // Compile
            std::string compileCmd = "g++ -std=c++17 -O2 -Wall -o " + executableFile + " " + tempFile + " 2>&1";
            std::string compileOutput = execCommand(compileCmd);
            
            if (system(("test -f " + executableFile).c_str()) != 0) {
                // Compilation failed
                cleanup(tempFile, executableFile);
                std::string escapedOutput = escapeJson(compileOutput);
                return "{\"output\":\"\",\"error\":\"Compilation error: " + escapedOutput + "\",\"executionTime\":0,\"status\":\"error\"}";
            }

            // Execute
            std::string executeCmd = "timeout " + std::to_string(maxExecutionTime) + " " + executableFile;
            std::string output = execCommand(executeCmd, inputData);
            
            auto endTime = std::chrono::high_resolution_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime);
            double executionTime = duration.count() / 1000.0;

            cleanup(tempFile, executableFile);

            std::string status = "success";
            if (output.find("timeout") != std::string::npos) {
                status = "timeout";
                output = "Code execution timed out after " + std::to_string(maxExecutionTime) + " seconds";
            }

            std::string escapedOutput = escapeJson(output);
            return "{\"output\":\"" + escapedOutput + "\",\"error\":\"\",\"executionTime\":" + 
                   std::to_string(executionTime) + ",\"status\":\"" + status + "\"}";

        } catch (const std::exception& e) {
            cleanup(tempFile, executableFile);
            std::string error = escapeJson(std::string("Execution failed: ") + e.what());
            return "{\"output\":\"\",\"error\":\"" + error + "\",\"executionTime\":0,\"status\":\"error\"}";
        }
    }

    std::string validateSyntax(const std::string& code) {
        std::string tempFile = "/tmp/cpp_validate_" + std::to_string(getpid()) + "_" + std::to_string(time(nullptr)) + ".cpp";
        
        try {
            std::ofstream codeFile(tempFile);
            if (!codeFile) {
                return "{\"isValid\":false,\"errors\":[\"Failed to create temporary file\"],\"warnings\":[]}";
            }
            
            codeFile << "#include <iostream>\n";
            codeFile << "#include <string>\n";
            codeFile << "#include <vector>\n";
            codeFile << "#include <algorithm>\n";
            codeFile << "using namespace std;\n\n";
            codeFile << code;
            codeFile.close();

            std::string compileCmd = "g++ -std=c++17 -fsyntax-only " + tempFile + " 2>&1";
            std::string output = execCommand(compileCmd);
            
            cleanup(tempFile, "");
            
            if (output.empty()) {
                return "{\"isValid\":true,\"errors\":[],\"warnings\":[]}";
            } else {
                std::string escapedOutput = escapeJson(output);
                return "{\"isValid\":false,\"errors\":[\"" + escapedOutput + "\"],\"warnings\":[]}";
            }

        } catch (const std::exception& e) {
            cleanup(tempFile, "");
            std::string error = escapeJson(std::string("Validation error: ") + e.what());
            return "{\"isValid\":false,\"errors\":[\"" + error + "\"],\"warnings\":[]}";
        }
    }

private:
    std::string execCommand(const std::string& cmd, const std::string& input = "") {
        std::string fullCmd = cmd;
        if (!input.empty()) {
            fullCmd = "echo '" + input + "' | " + cmd;
        }
        
        FILE* pipe = popen(fullCmd.c_str(), "r");
        if (!pipe) return "Error executing command";
        
        std::string result;
        char buffer[128];
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        return result;
    }

    void cleanup(const std::string& codeFile, const std::string& execFile) {
        if (!codeFile.empty()) {
            unlink(codeFile.c_str());
        }
        if (!execFile.empty()) {
            unlink(execFile.c_str());
        }
    }

    std::string escapeJson(const std::string& str) {
        std::string escaped;
        for (char c : str) {
            switch (c) {
                case '"': escaped += "\\\""; break;
                case '\\': escaped += "\\\\"; break;
                case '\n': escaped += "\\n"; break;
                case '\r': escaped += "\\r"; break;
                case '\t': escaped += "\\t"; break;
                default: escaped += c; break;
            }
        }
        return escaped;
    }

public:
    void run() {
        // Simple HTTP server implementation
        std::cout << "C++ executor service running on port " << port << std::endl;
        
        // For simplicity, using a basic approach
        // In production, you'd use a proper HTTP library
        std::string cmd = "while true; do echo -e \"HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\nAccess-Control-Allow-Origin: *\\r\\n\\r\\n{\\\"status\\\":\\\"healthy\\\",\\\"service\\\":\\\"cpp-executor\\\"}\" | nc -l -p " + std::to_string(port) + "; done";
        system(cmd.c_str());
    }
};

int main() {
    int port = 8004;
    const char* portEnv = std::getenv("PORT");
    if (portEnv) {
        port = std::atoi(portEnv);
    }

    HttpServer server(port);
    server.run();
    
    return 0;
}
