import { Fragment } from 'react';
import { ChevronLeft, ChevronRight, Eye, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import CodeEditor from '@/components/CodeEditor';
import OutputConsole from '@/components/OutputConsole';
import { formatDate } from '@/lib/dateUtils';
import { StatusPill } from './StatusPill';
import type { TemplateExecution } from './types';

interface ExecutionsTabProps {
  executions: TemplateExecution[];
  executionsTotal: number;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  pageSize: number;
  templateNameFilter: string;
  setTemplateNameFilter: (v: string) => void;
  templateUserFilter: string;
  setTemplateUserFilter: (v: string) => void;
  templateLanguageFilter: string;
  setTemplateLanguageFilter: (v: string) => void;
  templateStatusFilter: string;
  setTemplateStatusFilter: (v: string) => void;
  templates: any[];
  combinedUsers: any[];
  expandedExecution: number | null;
  setExpandedExecution: (id: number | null) => void;
}

export default function ExecutionsTab({
  executions,
  executionsTotal,
  page,
  setPage,
  totalPages,
  pageSize,
  templateNameFilter,
  setTemplateNameFilter,
  templateUserFilter,
  setTemplateUserFilter,
  templateLanguageFilter,
  setTemplateLanguageFilter,
  templateStatusFilter,
  setTemplateStatusFilter,
  templates,
  combinedUsers,
  expandedExecution,
  setExpandedExecution,
}: ExecutionsTabProps) {
  return (
    <div>
      <div className="control-row">
        <h2 className="section-title mr-auto flex items-center gap-2">
          <Play className="h-4 w-4" />
          Executions
          <span className="pane-label">{executionsTotal} shown</span>
        </h2>
        <Select
          value={templateNameFilter}
          onValueChange={(v) => {
            setTemplateNameFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All templates</SelectItem>
            {templates.map((template: any) => (
              <SelectItem key={template.id} value={template.name}>
                {template.name} ({template.language})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={templateUserFilter}
          onValueChange={(v) => {
            setTemplateUserFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {combinedUsers.map((u: any) => (
              <SelectItem key={u.username} value={u.username}>
                {u.display}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={templateLanguageFilter}
          onValueChange={(v) => {
            setTemplateLanguageFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All languages</SelectItem>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="javascript">JavaScript</SelectItem>
            <SelectItem value="java">Java</SelectItem>
            <SelectItem value="cpp">C++</SelectItem>
            <SelectItem value="go">Go</SelectItem>
            <SelectItem value="rust">Rust</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={templateStatusFilter}
          onValueChange={(v) => {
            setTemplateStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="table-shell anim-enter overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Template</th>
              <th>User</th>
              <th>Language</th>
              <th>Status</th>
              <th>Time</th>
              <th className="w-10" aria-label="Expand" />
            </tr>
          </thead>
          <tbody>
            {executions.map((execution) => {
              const expanded = expandedExecution === execution.id;
              return (
                <Fragment key={execution.id}>
                  <tr
                    className={`cursor-pointer ${execution.status === 'error' ? 'row-error' : ''}`}
                    onClick={() => setExpandedExecution(expanded ? null : execution.id)}
                  >
                    <td className="font-medium">
                      {execution.template_name || 'None'}
                      {execution.error_message && (
                        <span className="mt-1 block max-w-[28rem] truncate text-xs font-normal text-destructive">
                          {execution.error_message.slice(0, 100)}
                          {execution.error_message.length > 100 && '…'}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="min-w-0">
                        <div className="truncate">{execution.username || 'Anonymous'}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {execution.email}
                        </div>
                      </div>
                    </td>
                    <td className="capitalize">{execution.language}</td>
                    <td>
                      <StatusPill status={execution.status} />
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {formatDate(execution.created_at)}
                      {execution.execution_time && (
                        <span className="block text-xs">
                          {execution.execution_time.toFixed(3)}s
                        </span>
                      )}
                    </td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedExecution(expanded ? null : execution.id);
                        }}
                        title={expanded ? 'Collapse' : 'View execution'}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="expand-row">
                      <td colSpan={6}>
                        <div className="space-y-4 py-2">
                          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                            <div>
                              <div className="pane-label">User</div>
                              <div>
                                {execution.username} ({execution.email})
                              </div>
                            </div>
                            <div>
                              <div className="pane-label">Language</div>
                              <div className="capitalize">{execution.language}</div>
                            </div>
                            <div>
                              <div className="pane-label">Template</div>
                              <div>{execution.template_name || 'None'}</div>
                            </div>
                            <div>
                              <div className="pane-label">Status</div>
                              <div className="mt-0.5">
                                <StatusPill status={execution.status} />
                              </div>
                            </div>
                          </div>

                          {execution.error_message && (
                            <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                              {execution.error_message.slice(0, 200)}
                              {execution.error_message.length > 200 && '…'}
                            </div>
                          )}

                          {/* Embedded read-only IDE */}
                          <div className="grid h-96 grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="panel flex flex-col overflow-hidden">
                              <div className="border-b border-border px-4 py-2">
                                <span className="pane-label">Code</span>
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <CodeEditor
                                  language={execution.language}
                                  value={execution.code}
                                  onChange={() => {}}
                                  readOnly={true}
                                />
                              </div>
                            </div>
                            <div className="panel flex flex-col overflow-hidden">
                              <div className="flex-1 overflow-hidden">
                                <OutputConsole
                                  output={execution.output || ''}
                                  error={execution.error_message || ''}
                                  isLoading={false}
                                  executionTime={execution.execution_time || 0}
                                  testResults={execution.test_results || null}
                                />
                              </div>
                            </div>
                          </div>

                          {execution.input_data && (
                            <div className="panel overflow-hidden">
                              <div className="border-b border-border px-4 py-2">
                                <span className="pane-label">Input Data</span>
                              </div>
                              <div className="p-4">
                                <pre className="overflow-x-auto rounded bg-muted/50 p-3 text-sm">
                                  <code>{execution.input_data}</code>
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {executions.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="py-8 text-center text-muted-foreground">
                    <Play className="mx-auto mb-3 h-8 w-8 opacity-50" />
                    <p className="mb-1 text-sm font-medium text-foreground">No executions found</p>
                    <p className="text-xs">
                      Template executions will appear here once users start running code
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="table-foot">
            <span>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, executionsTotal)} of{' '}
              {executionsTotal}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
