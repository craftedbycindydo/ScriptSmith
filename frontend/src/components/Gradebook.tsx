import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  Download,
  Filter,
  MinusCircle,
  Search,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pill } from '@/components/admin/StatusPill';
import { apiService } from '@/services/api';
import type { Gradebook as GradebookData, GradebookCell } from '@/services/api';

type CellState = 'success' | 'error' | 'missing';

const cellKey = (userId: number, templateId: number) => `${userId}:${templateId}`;

/** Students (rows) x templates (columns) execution-status matrix for one classroom.
 *  A cell reflects whether the code RAN, not whether it is correct. */
export default function Gradebook() {
  const [classrooms, setClassrooms] = useState<{ id: number; name: string }[]>([]);
  const [classroomId, setClassroomId] = useState<string>('');
  const [data, setData] = useState<GradebookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const [templateFilter, setTemplateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
  const [openCell, setOpenCell] = useState<GradebookCell | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    apiService
      .getMyClassrooms()
      .then((list) => {
        const mapped = (list || []).map((c: any) => ({ id: c.id, name: c.name }));
        setClassrooms(mapped);
        if (mapped.length > 0) setClassroomId((cur) => cur || mapped[0].id.toString());
      })
      .catch((e) => setError(e?.message || 'Failed to load classrooms'));
  }, []);

  useEffect(() => {
    if (!classroomId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiService
      .getClassroomGradebook(Number(classroomId))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load gradebook');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  const cellMap = useMemo(() => {
    const m = new Map<string, GradebookCell>();
    data?.cells.forEach((c) => m.set(cellKey(c.user_id, c.template_id), c));
    return m;
  }, [data]);

  const stateOf = (userId: number, templateId: number): CellState => {
    const c = cellMap.get(cellKey(userId, templateId));
    if (!c) return 'missing';
    return c.status === 'success' ? 'success' : 'error';
  };

  const templates = useMemo(() => {
    if (!data) return [];
    let list = data.templates;
    if (templateFilter !== 'all') {
      list = list.filter((t) => t.template_id.toString() === templateFilter);
    }
    if (hideEmptyColumns) {
      list = list.filter((t) => t.submitted_count > 0);
    }
    return list;
  }, [data, templateFilter, hideEmptyColumns]);

  const students = useMemo(() => {
    if (!data) return [];
    let list = data.students;
    const q = studentSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((s) =>
        templates.some((t) => stateOf(s.user_id, t.template_id) === statusFilter)
      );
    }
    return list;
  }, [data, studentSearch, statusFilter, templates, cellMap]);

  const totals = useMemo(() => {
    let success = 0;
    let errored = 0;
    students.forEach((s) =>
      templates.forEach((t) => {
        const st = stateOf(s.user_id, t.template_id);
        if (st === 'success') success += 1;
        else if (st === 'error') errored += 1;
      })
    );
    const cells = students.length * templates.length;
    return { success, errored, missing: cells - success - errored, cells };
  }, [students, templates, cellMap]);

  /** One workbook: a Matrix sheet mirroring the grid and a Details sheet that
   *  splits each template into status + output. Built server-side. */
  const exportWorkbook = async () => {
    if (!data) return;
    setExporting(true);
    setError('');
    try {
      const blob = await apiService.downloadClassroomGradebookXlsx(data.classroom_id);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${data.classroom_name.replace(/[^\w]+/g, '_')}_gradebook.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e: any) {
      setError(e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters — mirrors the List view's filter card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
            <Button
              variant="outline"
              onClick={exportWorkbook}
              disabled={!data || exporting}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select classroom" />
              </SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="All templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {data?.templates.map((t) => (
                  <SelectItem key={t.template_id} value={t.template_id.toString()}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Any status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="error">Has an error</SelectItem>
                <SelectItem value="success">Has a success</SelectItem>
                <SelectItem value="missing">Has a gap</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <Input
                className="pl-8 w-[220px]"
                placeholder="Search for a student"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
            </div>

            <Button
              variant={hideEmptyColumns ? 'default' : 'outline'}
              onClick={() => setHideEmptyColumns((v) => !v)}
            >
              Hide empty columns
            </Button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
            Click any submitted cell to read its output.
          </p>
        </CardContent>
      </Card>

      {/* Matrix */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              {data
                ? `${data.classroom_name} — ${students.length} students x ${templates.length} templates`
                : 'Gradebook'}
            </CardTitle>
            {/* Counts inline rather than as full-width tiles - the grid is the point. */}
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-green-500" />
                {totals.success} success
              </span>
              <span className="flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-500" />
                {totals.errored} error
              </span>
              <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <MinusCircle className="w-4 h-4" />
                {totals.missing} not submitted
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">
              Loading gradebook…
            </p>
          )}
          {error && (
            <div className="py-6 text-center">
              <Pill tone="error">{error}</Pill>
            </div>
          )}

          {/* Every student row is rendered - only the template columns scroll
              sideways, with the name and total pinned to the left. */}
          {data && !loading && !error && (
            /* .table-shell sets overflow:hidden (index.css) and, being unlayered,
               beats Tailwind's layered utilities - so the scroll goes on an
               inner element where overflow-x-auto actually takes effect. */
            <div className="table-shell">
              <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 w-[190px] min-w-[190px] bg-card">
                      Student Name
                    </th>
                    <th className="sticky left-[190px] z-20 w-[70px] min-w-[70px] bg-card text-center">
                      Success
                    </th>
                    {templates.map((t) => (
                      <th
                        key={t.template_id}
                        className="w-[46px] min-w-[46px] px-1 text-center align-bottom"
                        title={t.name}
                      >
                        <span className="mx-auto mb-1 block max-h-[96px] overflow-hidden text-ellipsis whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
                          {t.name}
                        </span>
                        <span className="block text-[0.58rem] font-normal">
                          {t.submitted_count} sub
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const ok = templates.filter(
                      (t) => stateOf(s.user_id, t.template_id) === 'success'
                    ).length;
                    return (
                      <tr key={s.user_id}>
                        <td className="sticky left-0 z-10 w-[190px] min-w-[190px] bg-card py-1.5">
                          <div className="font-medium leading-tight">{s.name}</div>
                          <div className="text-xs leading-tight opacity-60">{s.username}</div>
                        </td>
                        <td className="sticky left-[190px] z-10 w-[70px] min-w-[70px] whitespace-nowrap bg-card py-1.5 text-center text-sm">
                          {ok}
                          <span className="opacity-50">/{templates.length}</span>
                        </td>
                        {templates.map((t) => {
                          const st = stateOf(s.user_id, t.template_id);
                          const c = cellMap.get(cellKey(s.user_id, t.template_id));
                          return (
                            <td
                              key={t.template_id}
                              className={`px-1 py-1.5 text-center ${c ? 'cursor-pointer' : ''}`}
                              onClick={() => c && setOpenCell(c)}
                              title={
                                st === 'missing'
                                  ? 'Not submitted'
                                  : `${st === 'success' ? 'Success' : 'Error'} — click for output`
                              }
                            >
                              {st === 'missing' ? (
                                <span className="opacity-30">·</span>
                              ) : (
                                <Pill tone={st === 'success' ? 'success' : 'error'}>
                                  {st === 'success' ? '●' : '▲'}
                                </Pill>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-10 w-[190px] min-w-[190px] bg-card text-xs opacity-70">
                      Submitted
                    </td>
                    <td className="sticky left-[190px] z-10 w-[70px] min-w-[70px] bg-card" />
                    {templates.map((t) => (
                      <td key={t.template_id} className="px-1 text-center text-xs opacity-70">
                        {
                          students.filter((s) => stateOf(s.user_id, t.template_id) !== 'missing')
                            .length
                        }
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openCell} onOpenChange={(open) => !open && setOpenCell(null)}>
        <DialogContent className="max-w-3xl">
          {openCell && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {data?.students.find((s) => s.user_id === openCell.user_id)?.name}
                </DialogTitle>
                <div className="flex items-center gap-2 text-xs opacity-70">
                  <span>
                    {data?.templates.find((t) => t.template_id === openCell.template_id)?.name}
                  </span>
                  <Pill tone={openCell.status === 'success' ? 'success' : 'error'}>
                    {openCell.status}
                  </Pill>
                  {openCell.execution_time != null && (
                    <span>{openCell.execution_time.toFixed(3)}s</span>
                  )}
                </div>
              </DialogHeader>
              {openCell.error_message && (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted/40 p-3 font-mono text-xs text-destructive">
                  {openCell.error_message}
                </pre>
              )}
              <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted/40 p-3 font-mono text-xs">
                {openCell.output || 'No output recorded.'}
              </pre>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
