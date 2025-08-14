// Environment Configuration
// ALL REQUIRED, NO FALLBACKS PROVIDED

interface EnvironmentConfig {
  // API Configuration
  apiBaseUrl: string;
  apiTimeout: number;
  
  // WebSocket Configuration
  websocketUrl: string;
  
  // Application Configuration
  appName: string;
  appVersion: string;
  environment: string;
  
  // Feature Flags
  enableAnalytics: boolean;
  enableDebugLogs: boolean;
  
  // Code Editor Configuration
  defaultLanguage: string;
  autoSaveInterval: number;
  codeExecutionTimeout: number;
  
  // UI Configuration
  theme: string;
  enableDarkMode: boolean;
  
  // Security Configuration
  enableCSP: boolean;
  secureCookies: boolean;
  
  // Optional Analytics
  analyticsId?: string;
  sentryDsn?: string;
}

function validateRequiredEnvVar(key: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not provided`);
  }
  return value;
}

function parseBoolean(value: string | undefined, defaultValue?: boolean): boolean {
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error('Boolean environment variable is required but not provided');
  }
  return value.toLowerCase() === 'true';
}

function parseNumber(key: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not provided`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
  }
  return parsed;
}

// Load and validate all environment variables
export const config: EnvironmentConfig = {
  // API Configuration
  apiBaseUrl: validateRequiredEnvVar('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  apiTimeout: parseNumber('VITE_API_TIMEOUT', import.meta.env.VITE_API_TIMEOUT),
  
  // WebSocket Configuration
  websocketUrl: validateRequiredEnvVar('VITE_WEBSOCKET_URL', import.meta.env.VITE_WEBSOCKET_URL),
  
  // Application Configuration
  appName: validateRequiredEnvVar('VITE_APP_NAME', import.meta.env.VITE_APP_NAME),
  appVersion: validateRequiredEnvVar('VITE_APP_VERSION', import.meta.env.VITE_APP_VERSION),
  environment: validateRequiredEnvVar('VITE_ENVIRONMENT', import.meta.env.VITE_ENVIRONMENT),
  
  // Feature Flags
  enableAnalytics: parseBoolean(import.meta.env.VITE_ENABLE_ANALYTICS),
  enableDebugLogs: parseBoolean(import.meta.env.VITE_ENABLE_DEBUG_LOGS),
  
  // Code Editor Configuration
  defaultLanguage: validateRequiredEnvVar('VITE_DEFAULT_LANGUAGE', import.meta.env.VITE_DEFAULT_LANGUAGE),
  autoSaveInterval: parseNumber('VITE_AUTO_SAVE_INTERVAL', import.meta.env.VITE_AUTO_SAVE_INTERVAL),
  codeExecutionTimeout: parseNumber('VITE_CODE_EXECUTION_TIMEOUT', import.meta.env.VITE_CODE_EXECUTION_TIMEOUT),
  
  // UI Configuration
  theme: validateRequiredEnvVar('VITE_THEME', import.meta.env.VITE_THEME),
  enableDarkMode: parseBoolean(import.meta.env.VITE_ENABLE_DARK_MODE),
  
  // Security Configuration
  enableCSP: parseBoolean(import.meta.env.VITE_ENABLE_CSP),
  secureCookies: parseBoolean(import.meta.env.VITE_SECURE_COOKIES),
  
  // Optional Analytics (can be empty)
  analyticsId: import.meta.env.VITE_ANALYTICS_ID || undefined,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN || undefined,
};

// Log configuration in development
if (config.enableDebugLogs) {
  console.log('Environment Configuration:', {
    ...config,
    // Don't log sensitive values
    analyticsId: config.analyticsId ? '[REDACTED]' : undefined,
    sentryDsn: config.sentryDsn ? '[REDACTED]' : undefined,
  });
}

export default config;
