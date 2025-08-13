import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiService } from '@/services/api';
import { 
  FileText, 
  Users, 
  Code, 
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  RefreshCw,
  Trash2,
  Search,
  Filter,
  Download,
  TrendingUp,
  XCircle
} from 'lucide-react';

interface Assignment {
  id: number;
  name: string;
  description?: string;
  status: string;
  plagiarism_status: string;
  total_students: number;
  processed_students: number;
  execution_summary?: {
    success: number;
    error: number;
    timeout: number;
  };
  plagiarism_report?: any;
  language?: string;
  timeout_seconds: number;
  plagiarism_threshold: number;
  created_at: string;
  processing_started_at?: string;
  processing_completed_at?: string;
}

interface StudentSubmission {
  id: number;
  student_name: string;
  execution_status: string;
  execution_time?: number;
  has_output: boolean;
  has_error: boolean;
  is_flagged: boolean;
  similarity_scores?: Record<string, number>;
  code_files?: string[];
}

export default function AssignmentReports() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [assignmentReport, setAssignmentReport] = useState<any>(null);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<string>('all');

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const data = await apiService.getAssignments();
      setAssignments(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const loadAssignmentDetails = async (assignment: Assignment) => {
    try {
      setSelectedAssignment(assignment);
      
      // Load report and submissions in parallel
      const [reportData, submissionsData] = await Promise.all([
        apiService.getAssignmentReport(assignment.id),
        apiService.getAssignmentSubmissions(assignment.id)
      ]);
      
      setAssignmentReport(reportData);
      setSubmissions(submissionsData);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load assignment details');
    }
  };

  const loadSubmissionDetails = async (assignmentId: number, submissionId: number) => {
    try {
      const details = await apiService.getSubmissionDetails(assignmentId, submissionId);
      setSelectedSubmission(details);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load submission details');
    }
  };

  const handleReprocess = async (assignmentId: number) => {
    try {
      await apiService.reprocessAssignment(assignmentId);
      await loadAssignments();
      if (selectedAssignment?.id === assignmentId) {
        await loadAssignmentDetails(selectedAssignment);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to reprocess assignment');
    }
  };

  const handleDelete = async (assignmentId: number) => {
    if (!confirm('Are you sure you want to delete this assignment? This action cannot be undone.')) {
      return;
    }
    
    try {
      await apiService.deleteAssignment(assignmentId);
      await loadAssignments();
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment(null);
        setAssignmentReport(null);
        setSubmissions([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete assignment');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case 'uploaded':
        return <Badge className="bg-yellow-100 text-yellow-800">Uploaded</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPlagiarismBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Complete</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Analyzing</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getExecutionStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'timeout':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const filteredAssignments = assignments.filter(assignment => {
    const matchesStatus = statusFilter === 'all' || assignment.status === statusFilter;
    const matchesSearch = assignment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (assignment.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const filteredSubmissions = submissions.filter(submission => {
    switch (submissionFilter) {
      case 'flagged':
        return submission.is_flagged;
      case 'success':
        return submission.execution_status === 'success';
      case 'error':
        return submission.execution_status === 'error';
      case 'timeout':
        return submission.execution_status === 'timeout';
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p>Loading assignments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            <FileText className="w-6 h-6 mr-2" />
            Assignment Reports
          </h2>
          <p className="text-muted-foreground">Monitor and analyze student submissions</p>
        </div>
        <Button onClick={loadAssignments} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center space-x-2 p-3 border border-red-200 rounded-lg bg-red-50">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setError(null)}
            className="ml-auto"
          >
            ×
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Assignments List */}
        <div className="xl:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Assignments</span>
                <Badge variant="outline">{assignments.length}</Badge>
              </CardTitle>
              
              {/* Filters */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Search assignments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 min-w-0"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="uploaded">Uploaded</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-64 xl:max-h-96 overflow-y-auto">
                {filteredAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedAssignment?.id === assignment.id ? 'bg-muted' : ''
                    }`}
                    onClick={() => loadAssignmentDetails(assignment)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-sm">{assignment.name}</h3>
                      <div className="flex space-x-1">
                        {getStatusBadge(assignment.status)}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{assignment.total_students} students</span>
                      <span>{new Date(assignment.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    {assignment.status === 'processing' && (
                      <div className="mt-2">
                        <Progress 
                          value={(assignment.processed_students / assignment.total_students) * 100} 
                          className="h-1"
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          {assignment.processed_students} / {assignment.total_students} processed
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {filteredAssignments.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2" />
                    <p>No assignments found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assignment Details */}
        <div className="xl:col-span-2">
          {selectedAssignment ? (
            <div className="space-y-6">
              {/* Assignment Overview */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="flex items-center min-w-0">
                      <Code className="w-5 h-5 mr-2 shrink-0" />
                      <span className="truncate">{selectedAssignment.name}</span>
                    </CardTitle>
                    <div className="flex space-x-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReprocess(selectedAssignment.id)}
                        disabled={selectedAssignment.status === 'processing'}
                        className="hidden sm:flex"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Reprocess
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReprocess(selectedAssignment.id)}
                        disabled={selectedAssignment.status === 'processing'}
                        className="sm:hidden"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(selectedAssignment.id)}
                        disabled={selectedAssignment.status === 'processing'}
                        className="hidden sm:flex"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(selectedAssignment.id)}
                        disabled={selectedAssignment.status === 'processing'}
                        className="sm:hidden"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {selectedAssignment.description && (
                    <p className="text-sm text-muted-foreground">
                      {selectedAssignment.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{selectedAssignment.total_students}</div>
                      <div className="text-xs text-muted-foreground">Students</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {selectedAssignment.execution_summary?.success || 0}
                      </div>
                      <div className="text-xs text-green-600">Successful</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {selectedAssignment.execution_summary?.error || 0}
                      </div>
                      <div className="text-xs text-red-600">Errors</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {assignmentReport?.plagiarism_stats?.total_flagged || 0}
                      </div>
                      <div className="text-xs text-yellow-600">Flagged</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="flex space-x-4">
                      {getStatusBadge(selectedAssignment.status)}
                      {getPlagiarismBadge(selectedAssignment.plagiarism_status)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedAssignment.language && (
                        <span className="mr-4">Language: {selectedAssignment.language}</span>
                      )}
                      Threshold: {(selectedAssignment.plagiarism_threshold * 100).toFixed(0)}%
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Student Submissions */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="flex items-center">
                      <Users className="w-5 h-5 mr-2" />
                      Student Submissions
                    </CardTitle>
                    <Select value={submissionFilter} onValueChange={setSubmissionFilter}>
                      <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Submissions</SelectItem>
                        <SelectItem value="success">Successful</SelectItem>
                        <SelectItem value="error">Errors</SelectItem>
                        <SelectItem value="timeout">Timeouts</SelectItem>
                        <SelectItem value="flagged">Flagged</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 xl:max-h-96 overflow-y-auto">
                    {filteredSubmissions.map((submission) => (
                      <div key={submission.id} className="border rounded-lg p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            {getExecutionStatusIcon(submission.execution_status)}
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{submission.student_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {submission.execution_time && (
                                  <span>{submission.execution_time.toFixed(3)}s • </span>
                                )}
                                {submission.code_files?.length || 0} files
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 shrink-0">
                            {submission.is_flagged && (
                              <Badge variant="destructive" className="text-xs">
                                <Shield className="w-3 h-3 mr-1" />
                                <span className="hidden sm:inline">Flagged</span>
                              </Badge>
                            )}
                            
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => loadSubmissionDetails(selectedAssignment.id, submission.id)}
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="submission-details-description">
                                <DialogHeader>
                                  <DialogTitle className="truncate">
                                    {submission.student_name} - Submission Details
                                  </DialogTitle>
                                </DialogHeader>
                                <div id="submission-details-description" className="sr-only">
                                  Detailed information about the student's code submission including execution results and plagiarism analysis
                                </div>
                                
                                {selectedSubmission && (
                                  <Tabs defaultValue="execution" className="w-full">
                                    <TabsList className="grid w-full grid-cols-3">
                                      <TabsTrigger value="execution">Execution</TabsTrigger>
                                      <TabsTrigger value="code">Code Files</TabsTrigger>
                                      <TabsTrigger value="plagiarism">Plagiarism</TabsTrigger>
                                    </TabsList>
                                    
                                    <TabsContent value="execution" className="space-y-4">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                          <label className="text-sm font-medium">Status</label>
                                          <div className="flex items-center space-x-2 mt-1">
                                            {getExecutionStatusIcon(selectedSubmission.submission.execution_status)}
                                            <span>{selectedSubmission.submission.execution_status}</span>
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-sm font-medium">Execution Time</label>
                                          <div className="mt-1">
                                            {selectedSubmission.submission.execution_time?.toFixed(3)}s
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {selectedSubmission.submission.execution_output && (
                                        <div>
                                          <label className="text-sm font-medium">Output</label>
                                          <pre className="mt-1 p-3 bg-muted rounded-lg text-sm overflow-x-auto">
                                            {selectedSubmission.submission.execution_output}
                                          </pre>
                                        </div>
                                      )}
                                      
                                      {selectedSubmission.submission.execution_error && (
                                        <div>
                                          <label className="text-sm font-medium">Error</label>
                                          <pre className="mt-1 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 overflow-x-auto">
                                            {selectedSubmission.submission.execution_error}
                                          </pre>
                                        </div>
                                      )}
                                    </TabsContent>
                                    
                                    <TabsContent value="code" className="space-y-4">
                                      {Object.entries(selectedSubmission.code_files || {}).map(([filename, content]) => (
                                        <div key={filename}>
                                          <label className="text-sm font-medium">{filename}</label>
                                          <pre className="mt-1 p-3 bg-muted rounded-lg text-sm overflow-x-auto max-h-64">
                                            {content as string}
                                          </pre>
                                        </div>
                                      ))}
                                    </TabsContent>
                                    
                                    <TabsContent value="plagiarism" className="space-y-4">
                                      {selectedSubmission.submission.is_flagged ? (
                                        <div>
                                          <div className="flex items-center space-x-2 mb-4">
                                            <AlertTriangle className="w-5 h-5 text-red-500" />
                                            <span className="font-medium text-red-700">
                                              This submission has been flagged for potential plagiarism
                                            </span>
                                          </div>
                                          
                                          {selectedSubmission.submission.similarity_scores && (
                                            <div>
                                              <label className="text-sm font-medium">Similarity Scores</label>
                                              <div className="mt-2 space-y-2">
                                                {Object.entries(selectedSubmission.submission.similarity_scores).map(([student, score]) => (
                                                  <div key={student} className="flex items-center justify-between p-2 border rounded">
                                                    <span>{student}</span>
                                                    <div className="flex items-center space-x-2">
                                                      <Progress value={(score as number) * 100} className="w-20 h-2" />
                                                      <span className="text-sm">{((score as number) * 100).toFixed(1)}%</span>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-center py-4">
                                          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                          <p className="text-green-700">No plagiarism detected</p>
                                        </div>
                                      )}
                                    </TabsContent>
                                  </Tabs>
                                )}
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <div className="text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Select an assignment to view details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
