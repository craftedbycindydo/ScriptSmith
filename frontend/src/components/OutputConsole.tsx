import { CheckCircle, XCircle, Clock, Loader2, User } from 'lucide-react';

interface OutputConsoleProps {
  output: string;
  error: string | null;
  isLoading: boolean;
  executionTime?: number;
  lastExecutedBy?: string;
}

export default function OutputConsole({ output, error, isLoading, executionTime, lastExecutedBy }: OutputConsoleProps) {
  const hasOutput = output && output.trim() !== '';
  const hasError = error && error.trim() !== '';
  const hasContent = hasOutput || hasError;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Status and timing info */}
      <div className="ide-console-status px-3 py-1.5 flex items-center justify-between gap-2 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          {lastExecutedBy && hasContent && (
            <span className="status-pill" data-tone="neutral">
              <User className="w-3 h-3" />
              {lastExecutedBy}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {executionTime && executionTime > 0 ? (
            <span className="status-pill" data-tone="neutral">
              <Clock className="w-3 h-3" />
              {executionTime.toFixed(3)}s
            </span>
          ) : null}
          {hasContent && !isLoading && (
            hasError ? (
              <span className="status-pill" data-tone="error">
                <XCircle className="w-3 h-3" />
                Error
              </span>
            ) : (
              <span className="status-pill" data-tone="success">
                <CheckCircle className="w-3 h-3" />
                OK
              </span>
            )
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="console-surface h-full p-4 text-sm overflow-auto">
          {isLoading ? (
            <div className="console-dim flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Running code...</span>
            </div>
          ) : hasContent ? (
            <div className="whitespace-pre-wrap">
              {hasError ? (
                <span className="console-error">{error}</span>
              ) : (
                <span className="console-ok">{output}</span>
              )}
            </div>
          ) : (
            <div className="console-dim flex flex-col items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm">No output yet.</p>
                <p className="text-xs">Run your code to see results.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
