import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
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
  }>;
  classrooms: Array<{
    id: number;
    name: string;
    classroom_key: string;
    member_count: number;
  }>;
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

export default function AdminAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedClassroom, setSelectedClassroom] = useState<string>('all');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('all');
  const [minSuccessRate, setMinSuccessRate] = useState<string>('');
  const [maxSuccessRate, setMaxSuccessRate] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('all');

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

    let filteredStudents = [...analyticsData.student_performance];

    // Apply risk level filter
    if (selectedRiskLevel !== 'all') {
      filteredStudents = filteredStudents.filter(student => 
        student.risk_level === selectedRiskLevel
      );
    }

    // Apply success rate filters
    if (minSuccessRate) {
      const min = parseFloat(minSuccessRate);
      if (!isNaN(min)) {
        filteredStudents = filteredStudents.filter(student => 
          student.success_rate >= min
        );
      }
    }

    if (maxSuccessRate) {
      const max = parseFloat(maxSuccessRate);
      if (!isNaN(max)) {
        filteredStudents = filteredStudents.filter(student => 
          student.success_rate <= max
        );
      }
    }

    return filteredStudents;
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
    name: language.charAt(0).toUpperCase() + language.slice(1),
    success_rate: Math.round(stats.success_rate),
    total: stats.total,
    successful: stats.successful
  })).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.total_students}</p>
                <p className="text-sm text-muted-foreground">Total Students</p>
              </div>
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.total_classrooms}</p>
                <p className="text-sm text-muted-foreground">Classrooms</p>
              </div>
              <School className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.total_submissions}</p>
                <p className="text-sm text-muted-foreground">Total Submissions</p>
              </div>
              <GraduationCap className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.class_success_rate}%</p>
                <p className="text-sm text-muted-foreground">Class Success Rate</p>
              </div>
              <Target className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{analyticsData.overview.active_languages}</p>
                <p className="text-sm text-muted-foreground">Active Languages</p>
              </div>
              <BarChart3 className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Language Performance */}
      {languageData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              Language Performance Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                success_rate: {
                  label: "Success Rate %",
                  color: "hsl(262, 83%, 58%)",
                },
              }}
              className="h-[300px]"
            >
              <BarChart data={languageData.map(lang => ({
                language: lang.name,
                success_rate: lang.success_rate,
                total: lang.total,
                successful: lang.successful
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="language" />
                <YAxis 
                  label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 100]}
                />
                <ChartTooltip 
                  content={<ChartTooltipContent />}
                  formatter={(value, _, props) => [
                    `${value}%`,
                    "Success Rate",
                    `${props.payload.successful}/${props.payload.total} submissions`
                  ]}
                />
                <Bar 
                  dataKey="success_rate" 
                  fill="hsl(262, 83%, 58%)"
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Student Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Student Analytics Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="student">Select Student</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  {analyticsData?.student_performance.map((student) => (
                    <SelectItem key={student.user_id} value={student.user_id.toString()}>
                      {student.full_name || student.username} (@{student.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="classroom">Classroom</Label>
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classrooms</SelectItem>
                  {analyticsData.classrooms.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id.toString()}>
                      {classroom.name} ({classroom.member_count} students)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="riskLevel">Risk Level</Label>
              <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="low">Low Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="minSuccess">Min Success Rate %</Label>
              <Input
                id="minSuccess"
                type="number"
                placeholder="0"
                min="0"
                max="100"
                value={minSuccessRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinSuccessRate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="maxSuccess">Max Success Rate %</Label>
              <Input
                id="maxSuccess"
                type="number"
                placeholder="100"
                min="0"
                max="100"
                value={maxSuccessRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxSuccessRate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Charts */}
      {selectedStudentId === 'all' ? (
        /* Class Overview Charts */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Class Performance Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Class Performance Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  students: {
                    label: "Students",
                  },
                  low: {
                    label: "Low Risk (≥80%)",
                    color: "hsl(142, 76%, 36%)",
                  },
                  medium: {
                    label: "Medium Risk (60-79%)",
                    color: "hsl(48, 96%, 53%)",
                  },
                  high: {
                    label: "High Risk (<60%)",
                    color: "hsl(0, 84%, 60%)",
                  },
                }}
                className="h-[300px]"
              >
                <BarChart
                  data={[
                    {
                      category: "Low Risk",
                      students: filteredStudents.filter(s => s.risk_level === 'low').length,
                      fill: "hsl(142, 76%, 36%)"
                    },
                    {
                      category: "Medium Risk", 
                      students: filteredStudents.filter(s => s.risk_level === 'medium').length,
                      fill: "hsl(48, 96%, 53%)"
                    },
                    {
                      category: "High Risk",
                      students: filteredStudents.filter(s => s.risk_level === 'high').length,
                      fill: "hsl(0, 84%, 60%)"
                    }
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="students" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Student Success Rate Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Student Success Rate Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  success_rate: {
                    label: "Success Rate %",
                    color: "hsl(221, 83%, 53%)",
                  },
                }}
                className="h-[300px]"
              >
                <BarChart
                  data={filteredStudents
                    .sort((a, b) => b.success_rate - a.success_rate)
                    .slice(0, 8)  // Top 8 students
                    .map(student => ({
                      name: (student.full_name || student.username).length > 12 
                        ? (student.full_name || student.username).substring(0, 12) + "..." 
                        : (student.full_name || student.username),
                      success_rate: student.success_rate,
                      submissions: student.total_submissions
                    }))
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                  />
                  <YAxis 
                    label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent />}
                    formatter={(value, _, props) => [
                      `${value}%`,
                      "Success Rate",
                      `${props.payload.submissions} submissions`
                    ]}
                  />
                  <Bar 
                    dataKey="success_rate" 
                    fill="hsl(221, 83%, 53%)"
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      ) : selectedStudentAnalytics ? (
        /* Individual Student Charts */
        <div className="space-y-6">
          {/* Student Info Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">
                    {selectedStudentAnalytics.student_info.full_name || selectedStudentAnalytics.student_info.username}
                  </h3>
                  <p className="text-muted-foreground">@{selectedStudentAnalytics.student_info.username} • {selectedStudentAnalytics.student_info.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{selectedStudentAnalytics.overview.success_rate}%</p>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Comparison Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Performance vs Class Average</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  student: {
                    label: "Student Performance",
                    color: "hsl(221, 83%, 53%)",
                  },
                  class_average: {
                    label: "Class Average",
                    color: "hsl(210, 40%, 60%)",
                  },
                }}
                className="h-[250px]"
              >
                <BarChart
                  data={[
                    {
                      metric: "Success Rate",
                      student: selectedStudentAnalytics.overview.success_rate,
                      class_average: selectedStudentAnalytics.class_comparison.class_average_success_rate
                    }
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="metric" />
                  <YAxis 
                    label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }}
                    domain={[0, 100]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="student" fill="hsl(221, 83%, 53%)" name="Student" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="class_average" fill="hsl(210, 40%, 60%)" name="Class Average" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Language Performance Chart */}
          {Object.keys(selectedStudentAnalytics.language_performance).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Language Performance Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    success_rate: {
                      label: "Success Rate %",
                      color: "hsl(142, 76%, 36%)",
                    },
                  }}
                  className="h-[300px]"
                >
                  <BarChart
                    data={Object.entries(selectedStudentAnalytics.language_performance).map(([language, stats]) => ({
                      language: language.charAt(0).toUpperCase() + language.slice(1),
                      success_rate: Math.round(stats.success_rate),
                      total: stats.total,
                      successful: stats.successful
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="language" />
                    <YAxis 
                      label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      formatter={(value, _, props) => [
                        `${value}%`,
                        "Success Rate",
                        `${props.payload.successful}/${props.payload.total} submissions`
                      ]}
                    />
                    <Bar 
                      dataKey="success_rate" 
                      fill="hsl(142, 76%, 36%)"
                      radius={[4, 4, 0, 0]} 
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Performance Trend Chart */}
          {selectedStudentAnalytics.performance_trend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Performance Trend Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    success_rate: {
                      label: "Success Rate %",
                      color: "hsl(217, 91%, 60%)",
                    },
                  }}
                  className="h-[300px]"
                >
                  <LineChart
                    data={selectedStudentAnalytics.performance_trend.slice(-10).map((session) => ({
                      date: new Date(session.date).toLocaleDateString(),
                      success_rate: session.success_rate,
                      submissions: session.total_submissions
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      formatter={(value, _, props) => [
                        `${value}%`,
                        "Success Rate",
                        `${props.payload.submissions} submissions`
                      ]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="success_rate" 
                      stroke="hsl(217, 91%, 60%)"
                      strokeWidth={3}
                      dot={{ r: 6, fill: "hsl(217, 91%, 60%)" }}
                      activeDot={{ r: 8, fill: "hsl(217, 91%, 60%)" }}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </div>
      ) : selectedStudentId !== 'all' && studentDetailsLoading ? (
        /* Loading State */
        <Card>
          <CardContent className="pt-6">
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
