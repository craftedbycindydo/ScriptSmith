import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  Code, 
  Clock, 
  Target,
  Award,
  BarChart3,
  Activity,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
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
}


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

  // Prepare data for display
  const languageData = Object.entries(analyticsData.language_performance).map(([language, stats]) => ({
    name: language.charAt(0).toUpperCase() + language.slice(1),
    success_rate: Math.round(stats.success_rate),
    total: stats.total,
    successful: stats.successful
  })).sort((a, b) => b.total - a.total);

  // Create activity calendar data (last 30 days)
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 29);

  const activityCalendarData = [];
  for (let d = new Date(thirtyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toISOString().split('T')[0];
    activityCalendarData.push({
      date: dateKey,
      day: d.getDate(),
      activity: analyticsData.activity_heatmap[dateKey] || 0
    });
  }

  // Calculate trend (comparing first half vs second half of performance data)
  const getTrend = () => {
    if (analyticsData.performance_trend.length < 4) return { direction: 'stable', percentage: 0 };
    
    const midPoint = Math.floor(analyticsData.performance_trend.length / 2);
    const firstHalf = analyticsData.performance_trend.slice(0, midPoint);
    const secondHalf = analyticsData.performance_trend.slice(midPoint);
    
    const firstHalfAvg = firstHalf.reduce((sum, item) => sum + item.success_rate, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, item) => sum + item.success_rate, 0) / secondHalf.length;
    
    const diff = secondHalfAvg - firstHalfAvg;
    
    if (Math.abs(diff) < 5) return { direction: 'stable', percentage: Math.abs(diff) };
    return { 
      direction: diff > 0 ? 'up' : 'down', 
      percentage: Math.abs(diff) 
    };
  };

  const trend = getTrend();

  // Get risk level based on success rate
  const getRiskLevel = (successRate: number) => {
    if (successRate >= 80) return { level: 'excellent', color: 'bg-green-500', text: 'Excellent' };
    if (successRate >= 60) return { level: 'good', color: 'bg-blue-500', text: 'Good' };
    if (successRate >= 40) return { level: 'fair', color: 'bg-yellow-500', text: 'Fair' };
    return { level: 'needs-improvement', color: 'bg-red-500', text: 'Needs Improvement' };
  };

  const performanceLevel = getRiskLevel(analyticsData.overview.success_rate);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <p className="text-2xl font-bold">{analyticsData.overview.success_rate}%</p>
                  <div className="flex items-center">
                    {trend.direction === 'up' && <ArrowUp className="w-4 h-4 text-green-500" />}
                    {trend.direction === 'down' && <ArrowDown className="w-4 h-4 text-red-500" />}
                    {trend.direction === 'stable' && <Minus className="w-4 h-4 text-gray-500" />}
                    <span className="text-sm text-muted-foreground">
                      {trend.percentage > 0 && `${trend.percentage.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
              </div>
              <div className={`w-3 h-3 rounded-full ${performanceLevel.color}`}></div>
            </div>
            <Badge 
              variant={performanceLevel.level === 'excellent' ? 'default' : 'secondary'}
              className="mt-2"
            >
              {performanceLevel.text}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.total_submissions}</p>
                <p className="text-sm text-muted-foreground">Total Submissions</p>
              </div>
              <Code className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.current_streak}</p>
                <p className="text-sm text-muted-foreground">Current Streak</p>
              </div>
              <Award className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.average_execution_time.toFixed(1)}s</p>
                <p className="text-sm text-muted-foreground">Avg Execution Time</p>
              </div>
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Trend */}
      {analyticsData.performance_trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Performance Trend (Last {analyticsData.performance_trend.length} sessions)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Trend</span>
                <div className="flex items-center space-x-2">
                  {trend.direction === 'up' && (
                    <div className="flex items-center text-green-600">
                      <ArrowUp className="w-4 h-4 mr-1" />
                      <span className="text-sm">+{trend.percentage.toFixed(1)}%</span>
                    </div>
                  )}
                  {trend.direction === 'down' && (
                    <div className="flex items-center text-red-600">
                      <ArrowDown className="w-4 h-4 mr-1" />
                      <span className="text-sm">-{trend.percentage.toFixed(1)}%</span>
                    </div>
                  )}
                  {trend.direction === 'stable' && (
                    <div className="flex items-center text-gray-600">
                      <Minus className="w-4 h-4 mr-1" />
                      <span className="text-sm">Stable</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Recent performance bars */}
              <div className="space-y-2">
                {analyticsData.performance_trend.slice(-5).map((session, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{new Date(session.date).toLocaleDateString()}</span>
                      <span>{session.success_rate}% ({session.total_submissions} submissions)</span>
                    </div>
                    <Progress value={session.success_rate} className="h-2" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Language Performance and Activity Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Language Performance */}
        {languageData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="w-5 h-5 mr-2" />
                Language Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {languageData.map((lang) => (
                  <div key={lang.name} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{lang.name}</span>
                      <div className="text-right text-sm text-muted-foreground">
                        <div>{lang.success_rate}% success</div>
                        <div className="text-xs">{lang.successful}/{lang.total} submissions</div>
                      </div>
                    </div>
                    <Progress 
                      value={lang.success_rate} 
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Language Usage Distribution */}
        {languageData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Language Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {languageData.map((lang, index) => {
                  const totalSubmissions = languageData.reduce((sum, l) => sum + l.total, 0);
                  const percentage = Math.round((lang.total / totalSubmissions) * 100);
                  const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-red-500', 'bg-indigo-500', 'bg-pink-500'];
                  
                  return (
                    <div key={lang.name} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`}></div>
                        <span className="text-sm font-medium">{lang.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{percentage}%</div>
                        <div className="text-xs text-muted-foreground">{lang.total} submissions</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Activity Heatmap */}
      {activityCalendarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Activity Heatmap (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-10 gap-1">
              {activityCalendarData.map((day, index) => {
                const intensity = Math.min(day.activity / 5, 1); // Normalize to 0-1
                const opacity = intensity > 0 ? 0.2 + (intensity * 0.8) : 0.1;
                
                return (
                  <div
                    key={index}
                    className={`w-6 h-6 rounded-sm border flex items-center justify-center text-xs transition-all hover:scale-110 ${
                      day.activity > 0 ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                    style={{ opacity }}
                    title={`${day.date}: ${day.activity} submissions`}
                  >
                    {day.day}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>Less active</span>
              <div className="flex items-center space-x-1">
                {[0.1, 0.3, 0.5, 0.7, 1].map((opacity, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 bg-blue-500 rounded-sm"
                    style={{ opacity }}
                  />
                ))}
              </div>
              <span>More active</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{analyticsData.overview.languages_used}</p>
              <p className="text-sm text-muted-foreground">Languages Used</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{analyticsData.overview.execution_success_rate.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Execution Success Rate</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{analyticsData.recent_submissions}</p>
              <p className="text-sm text-muted-foreground">Recent Submissions (30 days)</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
