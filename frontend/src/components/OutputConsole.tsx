import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface OutputConsoleProps {
  output: string;
  error: string;
  isLoading: boolean;
  executionTime?: number;
}

export default function OutputConsole({ output, error, isLoading, executionTime }: OutputConsoleProps) {
  const hasOutput = output && output.trim() !== '';
  const hasError = error && error.trim() !== '';

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Running Code...</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 h-full flex items-center justify-center">
          <div className="text-muted-foreground text-sm">Executing your code...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Success Output Section */}
      {hasOutput && (
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-success">Output</span>
              </div>
              {executionTime !== undefined && executionTime > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  Executed in {executionTime.toFixed(3)}s
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="bg-success/10 border border-success/20 rounded-lg p-4">
              <pre className="text-sm text-success-foreground whitespace-pre-wrap overflow-x-auto font-mono">
                {output}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Section */}
      {hasError && (
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center space-x-2">
              <XCircle className="w-4 h-4 text-destructive" />
              <span className="text-destructive">Error</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <pre className="text-sm text-destructive-foreground whitespace-pre-wrap overflow-x-auto font-mono">
                {error}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Default State - No Output or Error */}
      {!hasOutput && !hasError && (
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Output
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="text-sm">No output yet.</div>
              <div className="text-xs mt-1">Run your code to see results.</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
