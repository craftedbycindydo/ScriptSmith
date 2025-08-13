import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

interface OutputConsoleProps {
  output: string;
  error: string | null;
  isLoading: boolean;
  executionTime?: number;
}

export default function OutputConsole({ output, error, isLoading, executionTime }: OutputConsoleProps) {
  const hasOutput = output && output.trim() !== '';
  const hasError = error && error.trim() !== '';
  const hasContent = hasOutput || hasError;

  return (
    <div className="h-full flex flex-col bg-background rounded-b-lg overflow-hidden">
      {/* Status and timing info in top right */}
      <div className="px-4 py-2 flex items-center justify-end border-b bg-muted/10">
        <div className="flex items-center space-x-2">
          {executionTime && executionTime > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {executionTime.toFixed(3)}s
            </Badge>
          )}
          {hasContent && !isLoading && (
            <div className="flex items-center space-x-1">
              {hasError ? (
                <XCircle className="w-4 h-4 text-destructive" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full bg-zinc-950 p-4 font-mono text-sm overflow-auto rounded-b-lg">
          {isLoading ? (
            <div className="flex items-center space-x-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Running code...</span>
            </div>
          ) : hasContent ? (
            <div className="whitespace-pre-wrap">
              {hasError ? (
                <span className="text-red-400">{error}</span>
              ) : (
                <span className="text-green-400">{output}</span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <div className="text-2xl mb-2">⚡</div>
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
