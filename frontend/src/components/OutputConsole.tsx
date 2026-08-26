import { useState } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, User } from 'lucide-react';
import type { TestReport } from '@/services/api';

// The raw output with the failed cases' blocks marked, so they render red.
// Which cases failed comes only from the server's test_results; this walk just
// locates those blocks in the text for coloring.
function outputSegments(output: string, report: TestReport | null): Array<{ text: string; failed: boolean }> {
  const failedNames = new Set((report?.cases || []).filter((c) => !c.passed).map((c) => c.test));
  if (failedNames.size === 0) return [{ text: output, failed: false }];
  const segments: Array<{ text: string; failed: boolean }> = [];
  let inFailBlock = false;
  for (const line of output.split('\n')) {
    const caseLine = /^\s*(PASS|FAIL)\s+(.+?)\s*$/.exec(line);
    if (caseLine) inFailBlock = caseLine[1] === 'FAIL' && failedNames.has(caseLine[2]);
    else if (inFailBlock && !/^\s+(got|expected):/.test(line)) inFailBlock = false;
    const last = segments[segments.length - 1];
    if (last && last.failed === inFailBlock) last.text += '\n' + line;
    else segments.push({ text: line, failed: inFailBlock });
  }
  return segments;
}

interface OutputConsoleProps {
  output: string;
  error: string | null;
  isLoading: boolean;
  executionTime?: number;
  lastExecutedBy?: string;
  // Parsed server-side from the lab harness's output; null/absent for
  // non-lab runs, so the harness stays the only source of test cases
  testResults?: TestReport | null;
}

export default function OutputConsole({ output, error, isLoading, executionTime, lastExecutedBy, testResults }: OutputConsoleProps) {
  const [activeTab, setActiveTab] = useState<'output' | 'tests'>('output');
  const hasOutput = output && output.trim() !== '';
  const hasError = error && error.trim() !== '';
  const hasContent = hasOutput || hasError;
  const report = !isLoading ? testResults ?? null : null;
  const caseTally = report && report.cases.length > 0
    ? { passed: report.cases.filter((c) => c.passed).length, total: report.cases.length }
    : null;
  const badge = report ? (report.tally ?? (hasError ? caseTally : null)) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Heading divided 50/50: Output | Test Cases */}
      <div className="console-tabs">
        <button
          type="button"
          className="console-tab"
          data-active={activeTab === 'output'}
          onClick={() => setActiveTab('output')}
        >
          <span className="pane-label">Output</span>
        </button>
        <button
          type="button"
          className="console-tab"
          data-active={activeTab === 'tests'}
          onClick={() => setActiveTab('tests')}
        >
          <span className="pane-label">Test Cases</span>
          {badge && (
            <span
              className="status-pill"
              data-tone={badge.passed >= badge.total && !hasError ? 'success' : 'error'}
            >
              {badge.passed}/{badge.total}
            </span>
          )}
        </button>
      </div>

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
          ) : activeTab === 'tests' ? (
            !report ? (
              <div className="console-dim flex flex-col items-center justify-center h-full">
                <p className="text-sm">No test cases for this run.</p>
              </div>
            ) : (
            <div className="flex flex-col gap-1.5">
              {report.cases.length === 0 && (
                <span className="console-dim">No per-case detail printed. See Output.</span>
              )}
              {report.cases.map((testCase, index) => (
                <div key={index}>
                  <div
                    className={`flex items-center gap-2 ${testCase.passed ? 'console-ok' : 'console-error'}`}
                  >
                    {testCase.passed ? (
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="whitespace-pre-wrap">{testCase.test}</span>
                  </div>
                  {!testCase.passed && (testCase.got || testCase.expected) && (
                    <div className="console-dim pl-6 whitespace-pre-wrap">
                      {testCase.got && <div>got: {testCase.got}</div>}
                      {testCase.expected && <div>expected: {testCase.expected}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            )
          ) : hasContent ? (
            <div className="whitespace-pre-wrap">
              {/* Both, in order: what the program printed, then what went wrong.
                  A lab's PASS/FAIL lines are stdout even when the run is an error. */}
              {hasOutput && outputSegments(output, report).map((segment, index) => (
                <span key={index} className={segment.failed ? 'console-error' : 'console-ok'}>
                  {index > 0 ? '\n' : ''}{segment.text}
                </span>
              ))}
              {hasOutput && hasError && '\n'}
              {hasError && <span className="console-error">{error}</span>}
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
