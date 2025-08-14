import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
// Removed Jackson dependency for simpler deployment

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.security.*;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import javax.tools.*;
import java.util.regex.Pattern;

/**
 * Java Code Execution Microservice
 * Railway.app compatible - no Docker required
 */
public class Main {
    private static final int PORT = Integer.parseInt(System.getenv().getOrDefault("PORT", "8003"));
    private static final JavaExecutor javaExecutor = new JavaExecutor();

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", PORT), 0);
        
        server.createContext("/health", new HealthHandler());
        server.createContext("/execute", new ExecuteHandler());
        server.createContext("/validate", new ValidateHandler());
        server.createContext("/info", new InfoHandler());
        
        server.setExecutor(Executors.newFixedThreadPool(10));
        server.start();
        
        System.out.println("Java executor service running on port " + PORT);
    }

    static class HealthHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String response = "{\"status\":\"healthy\",\"service\":\"java-executor\"}";
            sendResponse(exchange, 200, response);
        }
    }

    static class ExecuteHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
                exchange.sendResponseHeaders(200, 0);
                exchange.getResponseBody().close();
                return;
            }
            
            if (!"POST".equals(exchange.getRequestMethod())) {
                sendResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
                return;
            }

            try {
                String requestBody = readRequestBody(exchange);
                Map<String, Object> request = parseSimpleJson(requestBody);
                
                String code = (String) request.get("code");
                String inputData = (String) request.getOrDefault("inputData", "");
                Integer timeout = request.containsKey("timeout") ? 
                    Integer.parseInt(request.get("timeout").toString()) : null;

                CodeExecutionResult result = javaExecutor.executeCode(code, inputData, timeout);
                String response = toJson(result);
                
                sendResponse(exchange, 200, response);
            } catch (Exception e) {
                String errorResponse = "{\"error\":\"" + e.getMessage().replace("\"", "\\\"") + "\"}";
                sendResponse(exchange, 500, errorResponse);
            }
        }
    }

    static class ValidateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
                exchange.sendResponseHeaders(200, 0);
                exchange.getResponseBody().close();
                return;
            }
            
            if (!"POST".equals(exchange.getRequestMethod())) {
                sendResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
                return;
            }

            try {
                String requestBody = readRequestBody(exchange);
                Map<String, Object> request = parseSimpleJson(requestBody);
                
                String code = (String) request.get("code");
                CodeValidationResult result = javaExecutor.validateSyntax(code);
                String response = toJson(result);
                
                sendResponse(exchange, 200, response);
            } catch (Exception e) {
                String errorResponse = "{\"error\":\"" + e.getMessage().replace("\"", "\\\"") + "\"}";
                sendResponse(exchange, 500, errorResponse);
            }
        }
    }

    static class InfoHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            Map<String, Object> info = new HashMap<>();
            info.put("service", "java-executor");
            info.put("language", "java");
            info.put("version", System.getProperty("java.version"));
            info.put("maxExecutionTime", javaExecutor.maxExecutionTime);
            info.put("maxMemoryMB", javaExecutor.maxMemoryMB);
            info.put("maxCodeSizeKB", javaExecutor.maxCodeSizeKB);
            info.put("availableLibraries", Arrays.asList(
                "java.lang.*", "java.util.*", "java.io.*", "java.math.*",
                "java.text.*", "java.time.*", "java.util.regex.*"
            ));
            
            String response = toJson(info);
            sendResponse(exchange, 200, response);
        }
    }

    private static String readRequestBody(HttpExchange exchange) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(exchange.getRequestBody()))) {
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
            return body.toString();
        }
    }

    private static void sendResponse(HttpExchange exchange, int statusCode, String response) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(statusCode, response.getBytes().length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(response.getBytes());
        }
    }
    
    // Simple JSON parsing for basic request structure
    private static Map<String, Object> parseSimpleJson(String json) {
        Map<String, Object> result = new HashMap<>();
        json = json.trim();
        if (json.startsWith("{") && json.endsWith("}")) {
            json = json.substring(1, json.length() - 1);
            
            // Better parsing that handles commas inside quoted strings
            List<String> pairs = new ArrayList<>();
            StringBuilder current = new StringBuilder();
            boolean inQuotes = false;
            boolean escaped = false;
            
            for (int i = 0; i < json.length(); i++) {
                char c = json.charAt(i);
                
                if (escaped) {
                    current.append(c);
                    escaped = false;
                } else if (c == '\\') {
                    current.append(c);
                    escaped = true;
                } else if (c == '"') {
                    current.append(c);
                    inQuotes = !inQuotes;
                } else if (c == ',' && !inQuotes) {
                    pairs.add(current.toString().trim());
                    current = new StringBuilder();
                } else {
                    current.append(c);
                }
            }
            pairs.add(current.toString().trim());
            
            for (String pair : pairs) {
                String[] keyValue = pair.split(":", 2);
                if (keyValue.length == 2) {
                    String key = keyValue[0].trim().replaceAll("\"", "");
                    String value = keyValue[1].trim();
                    if (value.startsWith("\"") && value.endsWith("\"")) {
                        value = value.substring(1, value.length() - 1);
                        // Handle escaped characters
                        value = value.replace("\\\"", "\"")
                                    .replace("\\n", "\n")
                                    .replace("\\r", "\r")
                                    .replace("\\t", "\t")
                                    .replace("\\\\", "\\");
                    }
                    if (value.matches("\\d+")) {
                        result.put(key, Integer.parseInt(value));
                    } else {
                        result.put(key, value);
                    }
                }
            }
        }
        return result;
    }
    
    // Simple JSON serialization
    private static String toJson(Object obj) {
        if (obj instanceof CodeExecutionResult) {
            CodeExecutionResult result = (CodeExecutionResult) obj;
            return String.format("{\"output\":\"%s\",\"error\":\"%s\",\"executionTime\":%.3f,\"status\":\"%s\"}",
                escapeJson(result.output), escapeJson(result.error), result.executionTime, result.status);
        } else if (obj instanceof CodeValidationResult) {
            CodeValidationResult result = (CodeValidationResult) obj;
            StringBuilder sb = new StringBuilder();
            sb.append("{\"isValid\":").append(result.isValid)
              .append(",\"errors\":[");
            for (int i = 0; i < result.errors.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append("\"").append(escapeJson(result.errors.get(i))).append("\"");
            }
            sb.append("],\"warnings\":[");
            for (int i = 0; i < result.warnings.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append("\"").append(escapeJson(result.warnings.get(i))).append("\"");
            }
            sb.append("]}");
            return sb.toString();
        } else if (obj instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) obj;
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\"").append(entry.getKey()).append("\":");
                if (entry.getValue() instanceof String) {
                    sb.append("\"").append(escapeJson((String) entry.getValue())).append("\"");
                } else if (entry.getValue() instanceof List) {
                    sb.append("[");
                    @SuppressWarnings("unchecked")
                    List<String> list = (List<String>) entry.getValue();
                    for (int i = 0; i < list.size(); i++) {
                        if (i > 0) sb.append(",");
                        sb.append("\"").append(escapeJson(list.get(i))).append("\"");
                    }
                    sb.append("]");
                } else {
                    sb.append(entry.getValue());
                }
            }
            sb.append("}");
            return sb.toString();
        }
        return "{}";
    }
    
    private static String escapeJson(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }
}

class JavaExecutor {
    public final int maxExecutionTime = 30; // seconds
    public final int maxMemoryMB = 128;
    public final int maxCodeSizeKB = 50;

    public CodeExecutionResult executeCode(String code, String inputData, Integer timeout) {
        if (timeout != null) {
            timeout = Math.min(timeout, 60); // Max 60 seconds
        } else {
            timeout = maxExecutionTime;
        }

        // Validate code size
        double codeSizeKB = code.getBytes().length / 1024.0;
        if (codeSizeKB > maxCodeSizeKB) {
            return new CodeExecutionResult("", 
                String.format("Code size (%.1fKB) exceeds maximum allowed size (%dKB)", codeSizeKB, maxCodeSizeKB),
                0, "error");
        }

        long startTime = System.currentTimeMillis();
        Path tempDir = null;

        try {
            // Create temporary directory
            tempDir = Files.createTempDirectory("java_exec_");
            
            // Create restricted code
            String restrictedCode = createRestrictedCode(code);
            
            // Write code to file
            Path javaFile = tempDir.resolve("Main.java");
            Files.write(javaFile, restrictedCode.getBytes());

            // Compile and execute
            CodeExecutionResult result = compileAndRun(tempDir, inputData, timeout);
            
            double executionTime = (System.currentTimeMillis() - startTime) / 1000.0;
            result.executionTime = executionTime;
            
            return result;

        } catch (Exception e) {
            return new CodeExecutionResult("", 
                "Execution failed: " + e.getMessage(),
                (System.currentTimeMillis() - startTime) / 1000.0, "error");
        } finally {
            // Clean up
            if (tempDir != null) {
                try {
                    deleteDirectory(tempDir);
                } catch (Exception e) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    private String createRestrictedCode(String userCode) {
        // Check if user code already contains a complete class definition
        if (userCode.trim().contains("class ") && userCode.trim().contains("public static void main")) {
            // User provided complete class - add imports and minimal security
            StringBuilder sb = new StringBuilder();
            sb.append("import java.io.*;\n");
            sb.append("import java.util.*;\n");
            sb.append("import java.lang.*;\n");
            sb.append("import java.math.*;\n");
            sb.append("import java.text.*;\n");
            sb.append("import java.time.*;\n");
            sb.append("import java.util.regex.*;\n");
            sb.append("\n");
            sb.append(userCode);
            return sb.toString();
        } else {
            // User provided code snippet - wrap in template with security
            StringBuilder sb = new StringBuilder();
            sb.append("import java.io.*;\n");
            sb.append("import java.util.*;\n");
            sb.append("import java.lang.*;\n");
            sb.append("import java.math.*;\n");
            sb.append("import java.text.*;\n");
            sb.append("import java.time.*;\n");
            sb.append("import java.util.regex.*;\n");
            sb.append("\n");
            sb.append("public class Main {\n");
            sb.append("    // Security manager to restrict dangerous operations\n");
            sb.append("    static {\n");
            sb.append("        System.setSecurityManager(new SecurityManager() {\n");
            sb.append("            @Override\n");
            sb.append("            public void checkPermission(java.security.Permission perm) {\n");
            sb.append("                // Allow most operations but restrict dangerous ones\n");
            sb.append("                String name = perm.getName();\n");
            sb.append("                if (name != null) {\n");
            sb.append("                    if (name.startsWith(\"setSecurityManager\") ||\n");
            sb.append("                        name.startsWith(\"createSecurityManager\") ||\n");
            sb.append("                        name.startsWith(\"exitVM\") ||\n");
            sb.append("                        name.startsWith(\"shutdownHooks\") ||\n");
            sb.append("                        name.contains(\"reflect\") ||\n");
            sb.append("                        name.contains(\"accessDeclaredMembers\")) {\n");
            sb.append("                        throw new SecurityException(\"Operation not permitted: \" + name);\n");
            sb.append("                    }\n");
            sb.append("                }\n");
            sb.append("            }\n");
            sb.append("            \n");
            sb.append("            @Override\n");
            sb.append("            public void checkExec(String cmd) {\n");
            sb.append("                throw new SecurityException(\"Execution of external processes not allowed\");\n");
            sb.append("            }\n");
            sb.append("            \n");
            sb.append("            @Override\n");
            sb.append("            public void checkDelete(String file) {\n");
            sb.append("                throw new SecurityException(\"File deletion not allowed\");\n");
            sb.append("            }\n");
            sb.append("            \n");
            sb.append("            @Override\n");
            sb.append("            public void checkWrite(String file) {\n");
            sb.append("                if (!file.startsWith(System.getProperty(\"java.io.tmpdir\"))) {\n");
            sb.append("                    throw new SecurityException(\"File writing outside temp directory not allowed\");\n");
            sb.append("                }\n");
            sb.append("            }\n");
            sb.append("        });\n");
            sb.append("    }\n");
            sb.append("\n");
            sb.append("    public static void main(String[] args) {\n");
            sb.append("        try {\n");
            sb.append("            // Set memory limit\n");
            sb.append("            Runtime runtime = Runtime.getRuntime();\n");
            sb.append("            long maxMemory = ").append(maxMemoryMB * 1024 * 1024).append("L;\n");
            sb.append("            \n");
            sb.append("            // User code starts here\n");
            sb.append(userCode).append("\n");
            sb.append("            \n");
            sb.append("        } catch (Exception e) {\n");
            sb.append("            System.err.println(\"Error: \" + e.getMessage());\n");
            sb.append("            System.exit(1);\n");
            sb.append("        }\n");
            sb.append("    }\n");
            sb.append("}\n");
            
            return sb.toString();
        }
    }

    private CodeExecutionResult compileAndRun(Path tempDir, String inputData, int timeout) {
        try {
            // Compile
            JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
            if (compiler == null) {
                return new CodeExecutionResult("", "Java compiler not available", 0, "error");
            }

            StandardJavaFileManager fileManager = compiler.getStandardFileManager(null, null, null);
            
            Iterable<? extends JavaFileObject> compilationUnits = 
                fileManager.getJavaFileObjectsFromFiles(Arrays.asList(tempDir.resolve("Main.java").toFile()));
            
            StringWriter compilerOutput = new StringWriter();
            JavaCompiler.CompilationTask task = compiler.getTask(
                compilerOutput, fileManager, null, 
                Arrays.asList("-cp", tempDir.toString()), null, compilationUnits);
            
            boolean compilationSuccess = task.call();
            fileManager.close();

            if (!compilationSuccess) {
                return new CodeExecutionResult("", "Compilation error: " + compilerOutput.toString(), 0, "error");
            }

            // Run
            return runJavaProgram(tempDir, inputData, timeout);

        } catch (Exception e) {
            return new CodeExecutionResult("", "Compilation failed: " + e.getMessage(), 0, "error");
        }
    }

    private CodeExecutionResult runJavaProgram(Path tempDir, String inputData, int timeout) {
        try {
            ProcessBuilder pb = new ProcessBuilder(
                "java", "-Xmx" + maxMemoryMB + "m", "-cp", tempDir.toString(), "Main"
            );
            pb.directory(tempDir.toFile());
            pb.redirectErrorStream(false);

            Process process = pb.start();

            // Send input
            if (inputData != null && !inputData.isEmpty()) {
                try (OutputStreamWriter writer = new OutputStreamWriter(process.getOutputStream())) {
                    writer.write(inputData);
                    writer.flush();
                }
            }

            // Wait for completion with timeout
            boolean finished = process.waitFor(timeout, TimeUnit.SECONDS);

            String stdout = readStream(process.getInputStream());
            String stderr = readStream(process.getErrorStream());

            if (!finished) {
                process.destroyForcibly();
                return new CodeExecutionResult("", 
                    "Code execution timed out after " + timeout + " seconds", 0, "timeout");
            }

            int exitCode = process.exitValue();
            String status = (exitCode == 0) ? "success" : "error";

            return new CodeExecutionResult(stdout.trim(), stderr.trim(), 0, status);

        } catch (Exception e) {
            return new CodeExecutionResult("", "Execution error: " + e.getMessage(), 0, "error");
        }
    }

    private String readStream(InputStream stream) throws IOException {
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
            String line;
            while ((line = reader.readLine()) != null) {
                result.append(line).append("\n");
            }
        }
        return result.toString();
    }

    public CodeValidationResult validateSyntax(String code) {
        Path tempDir = null;
        try {
            // Create temporary directory
            tempDir = Files.createTempDirectory("java_validate_");
            
            // Create restricted code
            String restrictedCode = createRestrictedCode(code);
            
            // Write code to file
            Path javaFile = tempDir.resolve("Main.java");
            Files.write(javaFile, restrictedCode.getBytes());

            // Try to compile
            JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
            if (compiler == null) {
                return new CodeValidationResult(false, 
                    Arrays.asList("Java compiler not available"), new ArrayList<>());
            }

            StandardJavaFileManager fileManager = compiler.getStandardFileManager(null, null, null);
            
            Iterable<? extends JavaFileObject> compilationUnits = 
                fileManager.getJavaFileObjectsFromFiles(Arrays.asList(javaFile.toFile()));
            
            StringWriter compilerOutput = new StringWriter();
            JavaCompiler.CompilationTask task = compiler.getTask(
                compilerOutput, fileManager, null, 
                Arrays.asList("-cp", tempDir.toString()), null, compilationUnits);
            
            boolean compilationSuccess = task.call();
            fileManager.close();

            if (compilationSuccess) {
                return new CodeValidationResult(true, new ArrayList<>(), new ArrayList<>());
            } else {
                return new CodeValidationResult(false, 
                    Arrays.asList(compilerOutput.toString()), new ArrayList<>());
            }

        } catch (Exception e) {
            return new CodeValidationResult(false, 
                Arrays.asList("Validation error: " + e.getMessage()), new ArrayList<>());
        } finally {
            // Clean up
            if (tempDir != null) {
                try {
                    deleteDirectory(tempDir);
                } catch (Exception e) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    private void deleteDirectory(Path directory) throws IOException {
        Files.walk(directory)
            .sorted(Comparator.reverseOrder())
            .map(Path::toFile)
            .forEach(File::delete);
    }
}

class CodeExecutionResult {
    public String output;
    public String error;
    public double executionTime;
    public String status;

    public CodeExecutionResult(String output, String error, double executionTime, String status) {
        this.output = output;
        this.error = error;
        this.executionTime = executionTime;
        this.status = status;
    }
}

class CodeValidationResult {
    public boolean isValid;
    public List<String> errors;
    public List<String> warnings;

    public CodeValidationResult(boolean isValid, List<String> errors, List<String> warnings) {
        this.isValid = isValid;
        this.errors = errors;
        this.warnings = warnings;
    }
}
