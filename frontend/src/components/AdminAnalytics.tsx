import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import StatTile from '@/components/charts/StatTile';
import Meter from '@/components/charts/Meter';
import BarList from '@/components/charts/BarList';
import ShareBar from '@/components/charts/ShareBar';
import TrendChart from '@/components/charts/TrendChart';
import QuadrantScatter from '@/components/charts/QuadrantScatter';
import CompositionStrip from '@/components/charts/CompositionStrip';
import RankedBarList from '@/components/charts/RankedBarList';
import DistributionHistogram from '@/components/charts/DistributionHistogram';
import HourWeekMatrix from '@/components/charts/HourWeekMatrix';
import { STATUS } from '@/lib/chartTheme';
import {
  Users,
  GraduationCap,
  BarChart3,
  School,
  AlertTriangle,
  Target,
  Filter
} from 'lucide-react';
import { apiService } from '@/services/api';

interface AdminAnalyticsData {
  overview: {
    total_students: number;
    total_classrooms: number;
    total_submissions: number;
    class_success_rate: number;
    active_languages: number;
  };
  language_performance: Record<string, {
    total: number;
    successful: number;
    success_rate: number;
  }>;
  student_performance: Array<{
    user_id: number;
    username: string;
    full_name?: string;
    email: string;
    total_submissions: number;
    successful_submissions: number;
    success_rate: number;
    risk_level: 'low' | 'medium' | 'high';
    last_active?: string;
    /** Code runs (executions), not submissions. Optional: older backends omit it. */
    total_runs?: number;
    /** Share of runs that succeeded, 0–100. Optional: older backends omit it. */
    run_success_rate?: number;
  }>;
  classrooms: Array<{
    id: number;
    name: string;
    classroom_key: string;
    member_count: number;
  }>;
  /* Fields below are newer than the rest of this payload — every read guards. */
  error_breakdown?: Array<{ type: string; count: number }>;
  template_difficulty?: Array<{
    name: string;
    attempts: number;
    students: number;
    success_rate: number;
  }>;
  /** dow follows Postgres convention: 0 = Sunday … 6 = Saturday. */
  activity_by_weekday_hour?: Array<{ dow: number; hour: number; runs: number }>;
  execution_time_buckets?: Array<{ label: string; count: number }>;
}

interface StudentAnalyticsDetails {
  overview: {
    total_submissions: number;
    successful_submissions: number;
    success_rate: number;
    total_executions: number;
    execution_success_rate: number;
    average_execution_time: number;
    current_streak: number;
    languages_used: number;
  };
  student_info: {
    id: number;
    username: string;
    full_name?: string;
    email: string;
  };
  class_comparison: {
    class_average_success_rate: number;
    student_vs_class: number;
  };
  language_performance: Record<string, {
    total: number;
    successful: number;
    success_rate: number;
  }>;
  performance_trend: Array<{
    date: string;
    success_rate: number;
    total_submissions: number;
  }>;
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Runs below this and a pass rate is noise, not a signal. */
const MIN_RUNS_TO_RANK = 5;

/** Attempts below this and a template success rate is noise, not a signal. */
const MIN_ATTEMPTS_TO_RANK = 5;

/**
 * Median, matching QuadrantScatter's own split so the "Needs attention" list
 * names exactly the students tinted in the plot beside it.
 */
const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const riskBadgeVariant = (risk: 'low' | 'medium' | 'high') =>
  risk === 'high' ? 'destructive' : risk === 'medium' ? 'outline' : 'secondary';

export default function AdminAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedClassroom, setSelectedClassroom] = useState<string>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('all');

  // Simplified filtering handlers (classroom-student relationship needs backend enhancement)
  const handleClassroomChange = (classroomId: string) => {
    setSelectedClassroom(classroomId);
    // For now, keep student selection as is - we'll enhance this when backend provides student-classroom mapping
  };

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
  };

  // Selected student analytics data
  const [selectedStudentAnalytics, setSelectedStudentAnalytics] = useState<StudentAnalyticsDetails | null>(null);
  const [studentDetailsLoading, setStudentDetailsLoading] = useState(false);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getAdminAnalyticsOverview();
      if (response.success) {
        setAnalyticsData(response.data);
      } else {
        setError('Failed to load analytics data');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const loadStudentDetails = async (studentId: number) => {
    try {
      setStudentDetailsLoading(true);
      const response = await apiService.getStudentAnalyticsForAdmin(studentId);
      if (response.success) {
        setSelectedStudentAnalytics(response.data);
      } else {
        setError('Failed to load student details');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load student details');
    } finally {
      setStudentDetailsLoading(false);
    }
  };

  // Load student details when dropdown selection changes
  useEffect(() => {
    if (selectedStudentId !== 'all' && analyticsData) {
      const studentId = parseInt(selectedStudentId);
      loadStudentDetails(studentId);
    } else {
      setSelectedStudentAnalytics(null);
    }
  }, [selectedStudentId, analyticsData]);

  const applyFilters = () => {
    if (!analyticsData) return [];

    // For now, return all students since we only have basic dropdown filtering
    // Future enhancement: filter students by selected classroom when backend provides the relationship
    return analyticsData.student_performance;
  };

  // For now, return all students (will enhance when backend provides student-classroom mapping)
  const getStudentsForDropdown = () => {
    if (!analyticsData) return [];
    return analyticsData.student_performance;
  };


  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!analyticsData) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>No analytics data available.</AlertDescription>
      </Alert>
    );
  }

  const filteredStudents = applyFilters();
  const languageData = Object.entries(analyticsData.language_performance).map(([language, stats]) => ({
    key: language,
    name: titleCase(language),
    success_rate: Math.round(stats.success_rate),
    total: stats.total,
    successful: stats.successful
  })).sort((a, b) => b.total - a.total);

  const languageRuns = languageData.reduce((sum, lang) => sum + lang.total, 0);
  const topLanguage = languageData[0];

  // Ordered scale — keep low → medium → high, never re-sorted by count.
  const riskBuckets = [
    { key: 'low' as const, label: 'Low risk (≥80%)' },
    { key: 'medium' as const, label: 'Medium risk (60–79%)' },
    { key: 'high' as const, label: 'High risk (<60%)' },
  ].map((bucket) => ({
    label: bucket.label,
    value: filteredStudents.filter((s) => s.risk_level === bucket.key).length,
  }));
  const atRiskCount = filteredStudents.filter((s) => s.risk_level !== 'low').length;

  /* ---- Effort vs outcome ------------------------------------------------ */
  const runsOf = (s: (typeof filteredStudents)[number]) => s.total_runs ?? 0;
  const runRateOf = (s: (typeof filteredStudents)[number]) => Math.round(s.run_success_rate ?? 0);

  const activeStudents = filteredStudents.filter((s) => runsOf(s) > 0);
  const scatterPoints = activeStudents.map((s) => ({
    id: s.user_id,
    label: s.username,
    x: runsOf(s),
    y: runRateOf(s),
    size: s.total_submissions,
  }));

  // Same median split the scatter draws, so both cards agree on who is stuck.
  const medianRuns = median(scatterPoints.map((p) => p.x));
  const medianRunRate = median(scatterPoints.map((p) => p.y));
  const concernStudents = activeStudents
    .filter((s) => runRateOf(s) < medianRunRate && runsOf(s) >= medianRuns)
    .sort((a, b) => runRateOf(a) - runRateOf(b));

  /* ---- Where the class gets stuck --------------------------------------- */
  const errorBreakdown = (analyticsData.error_breakdown ?? []).map((e) => ({
    label: e.type,
    value: e.count,
  }));
  const totalErrors = errorBreakdown.reduce((sum, e) => sum + e.value, 0);

  /* ---- Hardest assignments ---------------------------------------------- */
  // Low-attempt templates are dropped outright: one attempt at 0% would top the
  // list and make the whole card untrustworthy.
  const hardestTemplates = (analyticsData.template_difficulty ?? [])
    .filter((t) => t.attempts >= MIN_ATTEMPTS_TO_RANK)
    .sort((a, b) => a.success_rate - b.success_rate)
    .slice(0, 6);

  /* ---- When the class works --------------------------------------------- */
  const weekdayHourActivity = analyticsData.activity_by_weekday_hour ?? [];
  const peakCell = weekdayHourActivity.reduce<
    { dow: number; hour: number; runs: number } | null
  >((peak, cell) => (peak === null || cell.runs > peak.runs ? cell : peak), null);

  /* ---- Run duration ------------------------------------------------------ */
  const durationBuckets = analyticsData.execution_time_buckets ?? [];
  const totalRunsTimed = durationBuckets.reduce((sum, b) => sum + b.count, 0);
  const modalBucket = durationBuckets.reduce<{ label: string; count: number } | null>(
    (top, bucket) => (top === null || bucket.count > top.count ? bucket : top),
    null
  );
  const slowBucket = durationBuckets.find((b) => b.label.startsWith('>'));

  /* ---- Students table ---------------------------------------------------- */
  // Concerning students lead: ascending run pass rate among students with enough
  // runs to judge, then everyone too quiet to rank at all.
  const rankedStudents = [
    ...filteredStudents
      .filter((s) => runsOf(s) >= MIN_RUNS_TO_RANK)
      .sort((a, b) => runRateOf(a) - runRateOf(b)),
    ...filteredStudents
      .filter((s) => runsOf(s) < MIN_RUNS_TO_RANK)
      .sort((a, b) => b.total_submissions - a.total_submissions),
  ];

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <Card>
        <CardContent>
          <div className="stat-row">
            <StatTile
              label="Total students"
              value={analyticsData.overview.total_students}
              hint={`${atRiskCount} needing attention`}
              icon={<Users className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Classrooms"
              value={analyticsData.overview.total_classrooms}
              icon={<School className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Total submissions"
              value={analyticsData.overview.total_submissions}
              hint={
                analyticsData.overview.total_students > 0
                  ? `${Math.round(
                      analyticsData.overview.total_submissions / analyticsData.overview.total_students
                    )} per student`
                  : undefined
              }
              icon={<GraduationCap className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Class success rate"
              value={Math.round(analyticsData.overview.class_success_rate)}
              unit="%"
              icon={<Target className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Active languages"
              value={analyticsData.overview.active_languages}
              hint={topLanguage ? `${topLanguage.name} leads` : undefined}
              icon={<BarChart3 className="h-3.5 w-3.5" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Student Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Student Analytics Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Student Dropdown - More space for long names */}
            <div className="md:col-span-1">
              <Label htmlFor="student">Select Student</Label>
              <Select value={selectedStudentId} onValueChange={handleStudentChange}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="All Students" />
                </SelectTrigger>
                <SelectContent className="max-w-[400px]">
                  <SelectItem value="all">All Students</SelectItem>
                  {getStudentsForDropdown().map((student) => (
                    <SelectItem key={student.user_id} value={student.user_id.toString()}>
                      {student.full_name || student.username} (@{student.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Classroom Dropdown - More space for long classroom names */}
            <div className="md:col-span-1">
              <Label htmlFor="classroom">Classroom</Label>
              <Select value={selectedClassroom} onValueChange={handleClassroomChange}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="All Classrooms" />
                </SelectTrigger>
                <SelectContent className="max-w-[350px]">
                  <SelectItem value="all">All Classrooms</SelectItem>
                  {analyticsData.classrooms.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id.toString()}>
                      {classroom.name} ({classroom.member_count} students)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters Button */}
            <div className="md:col-span-1 flex items-end">
              <button
                onClick={() => {
                  setSelectedStudentId('all');
                  setSelectedClassroom('all');
                }}
                className="mt-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/40 rounded-md transition-colors w-full"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics */}
      {selectedStudentId === 'all' ? (
        /* Class overview */
        <div className="analytics-grid">
          {/* Effort vs outcome — the one plot that separates students */}
          <Card className="col-8">
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">Effort vs outcome</CardTitle>
                  <div className="chart-card-sub">
                    One dot per student · split at the class median · click to drill in
                  </div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">{concernStudents.length}</div>
                  <div className="chart-card-sub">working hard but stuck</div>
                </div>
              </div>
              {scatterPoints.length > 0 ? (
                <QuadrantScatter
                  xClamp={{ min: 0 }}
                  yClamp={{ min: 0, max: 100 }}
                  points={scatterPoints}
                  xLabel="Code runs"
                  yLabel="Run success rate %"
                  quadrantLabels={{
                    topRight: 'Productive',
                    topLeft: 'Efficient',
                    bottomLeft: 'Disengaged',
                    bottomRight: 'Working hard, stuck',
                  }}
                  concernQuadrant="bottomRight"
                  onSelect={(id) => handleStudentChange(String(id))}
                  selectedId={selectedStudentId === 'all' ? null : Number(selectedStudentId)}
                />
              ) : (
                <div className="chart-empty">No code runs recorded yet.</div>
              )}
            </CardContent>
          </Card>

          {/* Needs attention — the scatter's concern corner, named */}
          <Card className="col-4">
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">Needs attention</CardTitle>
                  <div className="chart-card-sub">Lowest run pass rate first</div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">{concernStudents.length}</div>
                  <div className="chart-card-sub">
                    student{concernStudents.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
              {concernStudents.length > 0 ? (
                <div className="panel-scroll flex flex-col gap-1.5">
                  {concernStudents.map((student) => (
                    <button
                      key={student.user_id}
                      type="button"
                      onClick={() => handleStudentChange(String(student.user_id))}
                      className="w-full rounded-md border border-border px-2.5 py-2 text-left transition-colors hover:border-foreground/40"
                    >
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: STATUS.critical }}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-medium">
                          {student.full_name || student.username}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                          {runsOf(student).toLocaleString()} runs · {runRateOf(student)}% pass
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                          {student.successful_submissions}/{student.total_submissions} submitted
                        </span>
                      </div>
                    </button>
                  ))}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Signals, not judgments — a student with many runs may simply be working
                    hardest.
                  </p>
                </div>
              ) : (
                <div className="chart-empty">
                  Nobody sits in the high-effort, low-result corner right now.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Where the class gets stuck */}
          <Card className="col-6">
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">Where the class gets stuck</CardTitle>
                  <div className="chart-card-sub">Failed runs by error type</div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">
                    {totalErrors > 0 ? totalErrors.toLocaleString() : '—'}
                  </div>
                  <div className="chart-card-sub">errors recorded</div>
                </div>
              </div>
              {errorBreakdown.length > 0 ? (
                <>
                  <CompositionStrip data={errorBreakdown} maxSegments={5} />
                  <div className="mt-3">
                    <RankedBarList data={errorBreakdown} topN={6} tone="critical" />
                  </div>
                </>
              ) : (
                <div className="chart-empty">No errors recorded yet.</div>
              )}
            </CardContent>
          </Card>

          {/* Hardest assignments — ascending, and never without its denominator */}
          <Card className="col-6">
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">Hardest assignments</CardTitle>
                  <div className="chart-card-sub">
                    Lowest success rate first · {MIN_ATTEMPTS_TO_RANK}+ attempts only
                  </div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">
                    {hardestTemplates.length > 0
                      ? `${Math.round(hardestTemplates[0].success_rate)}%`
                      : '—'}
                  </div>
                  <div className="chart-card-sub">hardest assignment</div>
                </div>
              </div>
              {hardestTemplates.length > 0 ? (
                <BarList
                  data={hardestTemplates.map((template) => ({
                    label: template.name,
                    value: Math.round(template.success_rate),
                    caption: `${template.attempts} attempts · ${template.students} students`,
                  }))}
                  unit="%"
                  max={100}
                />
              ) : (
                <div className="chart-empty">
                  No assignment has {MIN_ATTEMPTS_TO_RANK} attempts yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* When the class works */}
          <Card className="col-8">
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">When the class works</CardTitle>
                  <div className="chart-card-sub">Code runs by weekday and hour</div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">
                    {peakCell ? peakCell.runs.toLocaleString() : '—'}
                  </div>
                  <div className="chart-card-sub">
                    {peakCell
                      ? `${DAY_NAMES[peakCell.dow]} ${String(peakCell.hour).padStart(2, '0')}:00 · busiest hour`
                      : 'no activity yet'}
                  </div>
                </div>
              </div>
              {weekdayHourActivity.length > 0 ? (
                <HourWeekMatrix data={weekdayHourActivity} />
              ) : (
                <div className="chart-empty">No activity recorded yet.</div>
              )}
            </CardContent>
          </Card>

          {/* Run duration */}
          <Card className="col-4">
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">Run duration</CardTitle>
                  <div className="chart-card-sub">Execution time per run</div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">{modalBucket ? modalBucket.label : '—'}</div>
                  <div className="chart-card-sub">
                    {modalBucket
                      ? `${modalBucket.count.toLocaleString()} of ${totalRunsTimed.toLocaleString()} runs`
                      : 'no runs timed yet'}
                  </div>
                </div>
              </div>
              {durationBuckets.length > 0 ? (
                <>
                  <DistributionHistogram
                    bins={durationBuckets.map((bucket) => ({
                      label: bucket.label,
                      count: bucket.count,
                    }))}
                  />
                  {slowBucket && slowBucket.count > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {slowBucket.count.toLocaleString()} runs took over 1 second.
                    </p>
                  )}
                </>
              ) : (
                <div className="chart-empty">No run timings recorded yet.</div>
              )}
            </CardContent>
          </Card>

          {/* Language cards only earn their space once there is more than one
              language — with a single language they say nothing. */}
          {languageData.length > 1 && (
            <>
              <Card className="col-4">
                <CardContent>
                  <div className="chart-card-head">
                    <div>
                      <CardTitle className="text-sm">Language usage</CardTitle>
                      <div className="chart-card-sub">Share of all submissions</div>
                    </div>
                    <div className="text-right">
                      <div className="chart-card-metric">{languageRuns}</div>
                      <div className="chart-card-sub">{languageData.length} languages</div>
                    </div>
                  </div>
                  <ShareBar
                    data={languageData.map((lang) => ({ label: lang.name, value: lang.total }))}
                  />
                </CardContent>
              </Card>

              <Card className="col-4">
                <CardContent>
                  <div className="chart-card-head">
                    <div>
                      <CardTitle className="text-sm">Success rate by language</CardTitle>
                      <div className="chart-card-sub">Passing submissions</div>
                    </div>
                    <div className="text-right">
                      <div className="chart-card-metric">
                        {Math.round(analyticsData.overview.class_success_rate)}%
                      </div>
                      <div className="chart-card-sub">class average</div>
                    </div>
                  </div>
                  <BarList
                    data={languageData.map((lang) => ({
                      label: lang.name,
                      value: lang.success_rate,
                      caption: `${lang.successful}/${lang.total}`,
                    }))}
                    unit="%"
                    max={100}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* Risk distribution */}
          <Card className={languageData.length > 1 ? 'col-4' : 'col-12'}>
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">Performance distribution</CardTitle>
                  <div className="chart-card-sub">Students by risk band</div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">{atRiskCount}</div>
                  <div className="chart-card-sub">need attention</div>
                </div>
              </div>
              {filteredStudents.length > 0 ? (
                <BarList data={riskBuckets} unit=" students" />
              ) : (
                <div className="chart-empty">No students to score yet.</div>
              )}
            </CardContent>
          </Card>

          {/* Per-student detail — a table, not a chart */}
          <Card className="col-12">
            <CardContent>
              <div className="chart-card-head">
                <div>
                  <CardTitle className="text-sm">Students</CardTitle>
                  <div className="chart-card-sub">
                    Lowest run pass rate first · click a row to drill in
                  </div>
                </div>
                <div className="text-right">
                  <div className="chart-card-metric">{filteredStudents.length}</div>
                  <div className="chart-card-sub">in view</div>
                </div>
              </div>
              {rankedStudents.length > 0 ? (
                <div className="max-h-[28rem] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 pr-4 text-left font-medium">Student</th>
                        <th className="py-2 pr-4 text-right font-medium">Submissions</th>
                        <th className="py-2 pr-4 text-right font-medium">Successful</th>
                        <th className="py-2 pr-4 text-left font-medium">Success rate</th>
                        <th className="py-2 pr-4 text-right font-medium">Runs</th>
                        <th className="py-2 pr-4 text-right font-medium">Run pass %</th>
                        <th className="py-2 text-right font-medium">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedStudents.map((student) => {
                        const runs = student.total_runs;
                        const rankable = (runs ?? 0) >= MIN_RUNS_TO_RANK;
                        return (
                          <tr
                            key={student.user_id}
                            onClick={() => handleStudentChange(String(student.user_id))}
                            className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                          >
                            <td className="py-2 pr-4">
                              <div className="font-medium">{student.full_name || student.username}</div>
                              <div className="text-xs text-muted-foreground">@{student.username}</div>
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">{student.total_submissions}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{student.successful_submissions}</td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, student.success_rate))}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums">
                                  {Math.round(student.success_rate)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {runs === undefined ? '—' : runs.toLocaleString()}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {rankable ? (
                                <span className="tabular-nums">{runRateOf(student)}%</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Not enough data
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              <Badge variant={riskBadgeVariant(student.risk_level)} className="capitalize">
                                {student.risk_level}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="chart-empty">No students match the current filters.</div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : selectedStudentAnalytics ? (
        /* Individual student */
        <div className="space-y-6">
          {/* Student Info Header */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">
                    {selectedStudentAnalytics.student_info.full_name || selectedStudentAnalytics.student_info.username}
                  </h3>
                  <p className="text-muted-foreground">@{selectedStudentAnalytics.student_info.username} • {selectedStudentAnalytics.student_info.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{Math.round(selectedStudentAnalytics.overview.success_rate)}%</p>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Student KPI strip */}
          <Card>
            <CardContent>
              <div className="stat-row">
                <StatTile
                  label="Success rate"
                  value={Math.round(selectedStudentAnalytics.overview.success_rate)}
                  unit="%"
                  delta={selectedStudentAnalytics.class_comparison.student_vs_class}
                  deltaLabel="vs class average"
                  icon={<Target className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Class average"
                  value={Math.round(selectedStudentAnalytics.class_comparison.class_average_success_rate)}
                  unit="%"
                  hint="All students"
                  icon={<Users className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Submissions"
                  value={selectedStudentAnalytics.overview.total_submissions}
                  hint={`${selectedStudentAnalytics.overview.successful_submissions} successful`}
                  icon={<GraduationCap className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Executions"
                  value={selectedStudentAnalytics.overview.total_executions}
                  hint={`${Math.round(selectedStudentAnalytics.overview.execution_success_rate)}% succeeded`}
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Avg execution time"
                  value={selectedStudentAnalytics.overview.average_execution_time.toFixed(1)}
                  unit="s"
                />
                <StatTile
                  label="Current streak"
                  value={selectedStudentAnalytics.overview.current_streak}
                  hint={`${selectedStudentAnalytics.overview.languages_used} languages used`}
                />
              </div>
            </CardContent>
          </Card>

          <div className="analytics-grid">
            {/* Student vs class — one ratio against a benchmark */}
            <Card className="col-6">
              <CardContent>
                <div className="chart-card-head">
                  <div>
                    <CardTitle className="text-sm">Performance vs class average</CardTitle>
                    <div className="chart-card-sub">Submission success rate</div>
                  </div>
                  <div className="text-right">
                    <div className="chart-card-metric">
                      {Math.round(selectedStudentAnalytics.overview.success_rate)}%
                    </div>
                    <div className="chart-card-sub">
                      class {Math.round(selectedStudentAnalytics.class_comparison.class_average_success_rate)}%
                    </div>
                  </div>
                </div>
                <Meter
                  label={
                    selectedStudentAnalytics.student_info.full_name ||
                    selectedStudentAnalytics.student_info.username
                  }
                  value={selectedStudentAnalytics.overview.success_rate}
                  benchmark={selectedStudentAnalytics.class_comparison.class_average_success_rate}
                  benchmarkLabel="Class average"
                  caption={`${selectedStudentAnalytics.overview.successful_submissions}/${selectedStudentAnalytics.overview.total_submissions} submissions`}
                />
                <Meter
                  label="Execution success rate"
                  value={selectedStudentAnalytics.overview.execution_success_rate}
                  caption={`${selectedStudentAnalytics.overview.total_executions} runs`}
                />
              </CardContent>
            </Card>

            {/* Language breakdown vs class */}
            <Card className="col-6">
              <CardContent>
                <div className="chart-card-head">
                  <div>
                    <CardTitle className="text-sm">Language performance</CardTitle>
                    <div className="chart-card-sub">Success rate per language</div>
                  </div>
                  <div className="text-right">
                    <div className="chart-card-metric">
                      {Object.keys(selectedStudentAnalytics.language_performance).length}
                    </div>
                    <div className="chart-card-sub">languages</div>
                  </div>
                </div>
                {Object.keys(selectedStudentAnalytics.language_performance).length > 0 ? (
                  <BarList
                    data={Object.entries(selectedStudentAnalytics.language_performance).map(
                      ([language, stats]) => ({
                        label: titleCase(language),
                        value: Math.round(stats.success_rate),
                        benchmark: analyticsData.language_performance[language]
                          ? Math.round(analyticsData.language_performance[language].success_rate)
                          : undefined,
                        caption: `${stats.successful}/${stats.total}`,
                      })
                    )}
                    unit="%"
                    max={100}
                    valueLabel="Student"
                    benchmarkLabel="Class average"
                  />
                ) : (
                  <div className="chart-empty">No language activity for this student yet.</div>
                )}
              </CardContent>
            </Card>

            {/* Trend over time — the one full-width chart */}
            <Card className="col-12">
              <CardContent>
                <div className="chart-card-head">
                  <div>
                    <CardTitle className="text-sm">Performance trend</CardTitle>
                    <div className="chart-card-sub">
                      Last {Math.min(10, selectedStudentAnalytics.performance_trend.length)} sessions
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="chart-card-metric">
                      {selectedStudentAnalytics.performance_trend.length > 0
                        ? `${Math.round(
                            selectedStudentAnalytics.performance_trend[
                              selectedStudentAnalytics.performance_trend.length - 1
                            ].success_rate
                          )}%`
                        : '—'}
                    </div>
                    <div className="chart-card-sub">latest session</div>
                  </div>
                </div>
                {selectedStudentAnalytics.performance_trend.length > 0 ? (
                  <TrendChart
                    labels={selectedStudentAnalytics.performance_trend
                      .slice(-10)
                      .map((session) => new Date(session.date).toLocaleDateString())}
                    series={[
                      {
                        label: 'Success rate',
                        points: selectedStudentAnalytics.performance_trend
                          .slice(-10)
                          .map((session) => Math.round(session.success_rate)),
                      },
                    ]}
                    unit="%"
                  />
                ) : (
                  <div className="chart-empty">No sessions recorded yet.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : selectedStudentId !== 'all' && studentDetailsLoading ? (
        /* Loading State */
        <Card>
          <CardContent>
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p>Loading student analytics...</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
