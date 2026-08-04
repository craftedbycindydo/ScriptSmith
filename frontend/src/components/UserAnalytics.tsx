import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp,
  Target,
  Award,
  BarChart3,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ListChecks,
  Repeat,
  Users,
  CalendarClock,
  Play,
  Code,
  PieChart
} from 'lucide-react';
import StatTile from '@/components/charts/StatTile';
import Meter from '@/components/charts/Meter';
import BarList from '@/components/charts/BarList';
import ShareBar from '@/components/charts/ShareBar';
import TrendChart from '@/components/charts/TrendChart';
import RankedBarList from '@/components/charts/RankedBarList';
import HourWeekMatrix from '@/components/charts/HourWeekMatrix';
import { STATUS } from '@/lib/chartTheme';
import { apiService } from '@/services/api';

interface UserAnalyticsData {
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
  activity_heatmap: Record<string, number>;
  recent_submissions: number;
  // Added by a newer backend — every one of these is optional so an older
  // deployment (which omits them entirely) still renders.
  error_breakdown?: Array<{ type: string; count: number }>;
  assignment_history?: Array<{
    name: string;
    status: string;
    passed: boolean;
    submitted_at: string | null;
    execution_time: number | null;
  }>;
  activity_by_weekday_hour?: Array<{ dow: number; hour: number; runs: number }>;
  runs_per_submission?: number;
  class_comparison?: {
    class_average_success_rate: number;
    student_vs_class: number;
    peers: number;
    /** Volume comparison — older backends omit these. */
    class_average_submissions?: number;
    your_submissions?: number;
  } | null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Plain-language next step per error type. Keyed on the backend's own bucket
 * names (`_classify_error` emits the exception class, plus "Timeout" and
 * "Platform error"), with a generic fallback for anything unlisted.
 */
const ERROR_HINTS: Record<string, string> = {
  SyntaxError: 'check indentation, colons and matching brackets before running.',
  NameError: "a name is used before it exists — check spelling, and that it's defined above.",
  IndentationError: 'Python counts spaces — keep every line in a block indented the same way.',
  TypeError: 'a value is the wrong kind for the operation — print it to see what it holds.',
  AttributeError: "that method or field doesn't exist on the object — print it to see what it offers.",
  Timeout: 'the code ran too long — look for a loop that never reaches its end.',
  'Platform error': "these are on the platform, not on you — just run it again.",
};

const errorHint = (type: string) =>
  ERROR_HINTS[type] ?? 'open the run output and read the last line of the traceback first.';

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'not submitted';

export default function UserAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<UserAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getPersonalAnalytics();
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!analyticsData) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No analytics data available. Start coding to see your progress!
        </AlertDescription>
      </Alert>
    );
  }

  const overview = analyticsData.overview;

  // Newer-backend fields — always guarded, never assumed present.
  const errorBreakdown = analyticsData.error_breakdown ?? [];
  const assignmentHistory = analyticsData.assignment_history ?? [];
  const weekdayHour = analyticsData.activity_by_weekday_hour ?? [];
  const runsPerSubmission = analyticsData.runs_per_submission ?? 0;
  const classComparison = analyticsData.class_comparison ?? null;

  // --- Assignment history -------------------------------------------------
  // The API sends it oldest-first; the student's current state belongs at the
  // top, so the rendered list is reversed.
  const historyNewestFirst = [...assignmentHistory].reverse();
  const historyPassed = assignmentHistory.filter((a) => a.passed).length;

  // Trailing run of passes, counted from the most recent submission backwards.
  let passStreak = 0;
  for (const item of historyNewestFirst) {
    if (!item.passed) break;
    passStreak += 1;
  }

  // --- Errors -------------------------------------------------------------
  const totalErrors = errorBreakdown.reduce((sum, e) => sum + e.count, 0);
  const topError = errorBreakdown.reduce<typeof errorBreakdown[number] | null>(
    (top, e) => (top === null || e.count > top.count ? e : top),
    null
  );
  const topErrorShare =
    topError && totalErrors > 0 ? Math.round((topError.count / totalErrors) * 100) : 0;

  // --- When you work ------------------------------------------------------
  const busiestSlot = weekdayHour.reduce<typeof weekdayHour[number] | null>(
    (best, cell) => (best === null || cell.runs > best.runs ? cell : best),
    null
  );
  const slotLabel = (dow: number, hour: number) =>
    `${DAY_NAMES[dow] ?? '?'} ${String(hour).padStart(2, '0')}:00`;
  const weekdayRuns = weekdayHour.reduce((sum, c) => sum + c.runs, 0);

  // --- Conditional cards --------------------------------------------------
  // Both of these come back empty on a finished term (the backend windows the
  // trend to 30 days), and a single-language install has nothing to compare.
  // Render nothing rather than an empty canvas.
  const showTrend = analyticsData.performance_trend.length > 1;
  const languageData = Object.entries(analyticsData.language_performance)
    .map(([language, stats]) => ({
      name: language.charAt(0).toUpperCase() + language.slice(1),
      success_rate: Math.round(stats.success_rate),
      total: stats.total,
      successful: stats.successful
    }))
    .sort((a, b) => b.total - a.total);
  const showLanguages = languageData.length > 1;

  const trendLabels = analyticsData.performance_trend.map((p) =>
    new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  );
  const latestTrend = analyticsData.performance_trend[analyticsData.performance_trend.length - 1];

  const languageTotal = languageData.reduce((sum, l) => sum + l.total, 0);
  const bestLanguage = languageData.reduce<typeof languageData[number] | null>(
    (best, l) => (best === null || l.success_rate > best.success_rate ? l : best),
    null
  );
  const topLanguage = languageData[0];

  return (
    <div className="space-y-6">
      {/* Row 1 — KPI strip */}
      <Card>
        <CardContent className="pt-6">
          <div className="stat-row">
            <StatTile
              label={`Success rate · ${overview.successful_submissions}/${overview.total_submissions} passed`}
              value={overview.success_rate.toFixed(1)}
              unit="%"
              delta={classComparison ? classComparison.student_vs_class : undefined}
              deltaLabel="vs class average"
              hint={`${overview.successful_submissions} of ${overview.total_submissions} assignments passed`}
              icon={<Target className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Assignments submitted"
              value={overview.total_submissions}
              hint={`${overview.successful_submissions} passed · ${Math.max(
                overview.total_submissions - overview.successful_submissions,
                0
              )} still open`}
              icon={<Code className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Code runs"
              value={overview.total_executions}
              hint={`${overview.execution_success_rate.toFixed(1)}% of these ran clean`}
              icon={<Play className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Runs per submission"
              value={runsPerSubmission.toFixed(1)}
              hint="runs before each submission"
              icon={<Repeat className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Current streak"
              value={overview.current_streak}
              hint="assignments passed in a row"
              icon={<Award className="h-3.5 w-3.5" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Row 2 — the record itself, and what keeps tripping it up */}
      <div className="analytics-grid">
        <Card className="col-8">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <ListChecks className="w-4 h-4 mr-2" />
              Your assignment history
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="chart-card-head">
              <div>
                <div className="chart-card-metric">
                  {historyPassed}/{assignmentHistory.length}
                </div>
                <div className="chart-card-sub">
                  assignments passed · newest first
                  {passStreak > 0 &&
                    ` · your last ${passStreak} in a row passed`}
                </div>
              </div>
            </div>

            {historyNewestFirst.length > 0 ? (
              <div className="panel-scroll flex flex-col gap-1.5">
                {historyNewestFirst.map((item, index) => (
                  <div
                    key={`${item.name}-${item.submitted_at ?? index}`}
                    className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2"
                  >
                    <span
                      className="flex shrink-0 items-center gap-1.5"
                      style={{ color: item.passed ? STATUS.good : STATUS.critical }}
                    >
                      {item.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" aria-hidden />
                      )}
                      <span className="text-[0.68rem] font-semibold uppercase tracking-wide">
                        {item.passed ? 'Passed' : 'Not yet'}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.name}
                    </span>
                    {item.execution_time !== null && (
                      <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                        {item.execution_time.toFixed(1)}s
                      </span>
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDate(item.submitted_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="chart-empty">
                <ListChecks className="w-5 h-5" />
                <span>Submit your first assignment to start your record.</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-4">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Where you get stuck
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="chart-card-head">
              <div>
                <div className="chart-card-metric">{totalErrors.toLocaleString()}</div>
                <div className="chart-card-sub">
                  errors across {overview.total_executions.toLocaleString()} code runs ·{' '}
                  {errorBreakdown.length} type{errorBreakdown.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {errorBreakdown.length > 0 ? (
              <>
                <RankedBarList
                  data={errorBreakdown.map((e) => ({ label: e.type, value: e.count }))}
                  topN={5}
                  tone="critical"
                />
                {topError && (
                  <p className="chart-card-sub mt-3">
                    {topErrorShare}% of your errors ({topError.count} of {totalErrors}) are{' '}
                    {topError.type} — {errorHint(topError.type)}
                  </p>
                )}
              </>
            ) : (
              <div className="chart-empty">
                <CheckCircle2 className="w-5 h-5" />
                <span>No errors recorded yet — nice.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — where you stand, and when you work */}
      <div className="analytics-grid">
        <Card className="col-6">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <Users className="w-4 h-4 mr-2" />
              You vs your class
            </CardTitle>
          </CardHeader>
          <CardContent>
            {classComparison ? (
              <>
                <div className="chart-card-head">
                  <div>
                    <div className="chart-card-metric">
                      {classComparison.student_vs_class > 0 ? '+' : ''}
                      {classComparison.student_vs_class.toFixed(1)} pts
                    </div>
                    <div className="chart-card-sub">
                      {classComparison.student_vs_class >= 0 ? 'above' : 'below'} the class average
                      of {classComparison.class_average_success_rate.toFixed(1)}% · compared with{' '}
                      {classComparison.peers} classmate
                      {classComparison.peers === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>

                <Meter
                  label="Your success rate"
                  value={overview.success_rate}
                  benchmark={classComparison.class_average_success_rate}
                  benchmarkLabel="Class average"
                  caption={`${overview.successful_submissions}/${overview.total_submissions} passed`}
                />

                {/* Quality beside volume: submitting as much as the class but
                    passing less is a different story from not submitting. */}
                {classComparison.class_average_submissions !== undefined && (
                  <table className="compare-table">
                    <thead>
                      <tr>
                        <th />
                        <th>You</th>
                        <th>Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Success rate</td>
                        <td>{overview.success_rate.toFixed(1)}%</td>
                        <td>{classComparison.class_average_success_rate.toFixed(1)}%</td>
                      </tr>
                      <tr>
                        <td>Assignments submitted</td>
                        <td>{classComparison.your_submissions ?? overview.total_submissions}</td>
                        <td>{classComparison.class_average_submissions}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <>
                <div className="chart-card-head">
                  <div>
                    <div className="chart-card-metric">—</div>
                    <div className="chart-card-sub">no class benchmark available</div>
                  </div>
                </div>
                <div className="chart-empty">
                  <Users className="w-5 h-5" />
                  <span>Join a classroom to compare</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="col-6">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <CalendarClock className="w-4 h-4 mr-2" />
              When you work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="chart-card-head">
              <div>
                <div className="chart-card-metric">
                  {busiestSlot ? busiestSlot.runs.toLocaleString() : '—'}
                </div>
                <div className="chart-card-sub">
                  {busiestSlot
                    ? `runs in your busiest hour · ${slotLabel(busiestSlot.dow, busiestSlot.hour)}`
                    : 'no code runs recorded yet'}
                </div>
              </div>
            </div>

            {weekdayHour.length > 0 ? (
              <>
                {/* Short matrix: this is often only a handful of live cells, and a
                    tall grid of empty ones reads as a broken chart. */}
                <HourWeekMatrix data={weekdayHour} height={150} />
                {/* With a sparse week the matrix alone is hard to read exactly, so
                    the same hours are also listed with their counts and shares. */}
                <div className="mt-4">
                  <div className="chart-card-sub mb-2">
                    {weekdayRuns.toLocaleString()} run{weekdayRuns === 1 ? '' : 's'} across{' '}
                    {weekdayHour.length} hour{weekdayHour.length === 1 ? '' : 's'} of the week
                  </div>
                  <RankedBarList
                    data={weekdayHour.map((cell) => ({
                      label: slotLabel(cell.dow, cell.hour),
                      value: cell.runs
                    }))}
                    unit=" runs"
                    topN={4}
                  />
                </div>
              </>
            ) : (
              <div className="chart-empty">
                <CalendarClock className="w-5 h-5" />
                <span>Run some code to see the hours you work best in.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — only rendered when there is actually something to plot */}
      {(showTrend || showLanguages) && (
        <div className="analytics-grid">
          {showTrend && (
            <Card className="col-12">
              <CardHeader>
                <CardTitle className="flex items-center text-base">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Success rate over time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="chart-card-head">
                  <div>
                    <div className="chart-card-metric">
                      {Math.round(latestTrend.success_rate)}%
                    </div>
                    <div className="chart-card-sub">
                      latest week · {latestTrend.total_submissions} submission
                      {latestTrend.total_submissions === 1 ? '' : 's'} that week ·{' '}
                      {analyticsData.performance_trend.length} weeks tracked
                    </div>
                  </div>
                </div>
                <TrendChart
                  labels={trendLabels}
                  series={[
                    {
                      label: 'Success rate',
                      points: analyticsData.performance_trend.map((p) => p.success_rate)
                    }
                  ]}
                  height={240}
                  unit="%"
                />
              </CardContent>
            </Card>
          )}

          {showLanguages && (
            <>
              <Card className="col-6">
                <CardHeader>
                  <CardTitle className="flex items-center text-base">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Success rate by language
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="chart-card-head">
                    <div>
                      <div className="chart-card-metric">
                        {bestLanguage ? `${bestLanguage.success_rate}%` : '—'}
                      </div>
                      <div className="chart-card-sub">
                        {bestLanguage
                          ? `best: ${bestLanguage.name} · ${bestLanguage.successful}/${bestLanguage.total} passed`
                          : 'no languages yet'}
                      </div>
                    </div>
                  </div>
                  <BarList
                    data={languageData.map((lang) => ({
                      label: lang.name,
                      value: lang.success_rate,
                      caption: `${lang.successful}/${lang.total}`
                    }))}
                    unit="%"
                    max={100}
                  />
                </CardContent>
              </Card>

              <Card className="col-6">
                <CardHeader>
                  <CardTitle className="flex items-center text-base">
                    <PieChart className="w-4 h-4 mr-2" />
                    Language usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="chart-card-head">
                    <div>
                      <div className="chart-card-metric">{languageTotal}</div>
                      <div className="chart-card-sub">
                        {topLanguage
                          ? `submissions · ${topLanguage.name} leads with ${topLanguage.total}/${languageTotal}`
                          : 'submissions'}
                      </div>
                    </div>
                  </div>
                  <ShareBar
                    data={languageData.map((lang) => ({ label: lang.name, value: lang.total }))}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
