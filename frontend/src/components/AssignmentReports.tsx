import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  XCircle,
  Download
} from 'lucide-react';
import { formatDateOnly } from '@/lib/dateUtils';
import CodeEditor from '@/components/CodeEditor';
import OutputConsole from '@/components/OutputConsole';

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
  execution_output?: string;
  execution_error?: string;
  execution_time?: number;
  created_at: string;
  executed_at?: string;
  is_flagged: boolean;
  similarity_scores?: Record<string, number>;
  code_files?: string[];
  grade?: number;
  max_grade?: number;
  grading_notes?: string;
}

interface AssignmentReportsProps {
  refreshTrigger?: number; // Used to trigger external refreshes
}

export default function AssignmentReports({ refreshTrigger }: AssignmentReportsProps = {}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [assignmentReport, setAssignmentReport] = useState<any>(null);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<string>('all');

  // Grading configuration
  const [gradeOutOf, setGradeOutOf] = useState<number>(100);
  const [leniency, setLeniency] = useState<number>(50);

  // Expanded submissions tracking
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<number>>(new Set());
  const [submissionDetails, setSubmissionDetails] = useState<Record<number, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<number>>(new Set());

  // Refs to track current assignments and polling state
  const assignmentsRef = useRef<Assignment[]>([]);
  const pollingStateRef = useRef<{[key: number]: {status: string, plagiarism_status: string, count: number}}>({});
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Smart polling functions
  const startPolling = () => {
    if (pollingIntervalRef.current) {
      return; // Already polling
    }
    
    console.log('▶️ Starting assignment polling');
    pollingIntervalRef.current = setInterval(() => {
      const currentAssignments = assignmentsRef.current;
      
      // More detailed filtering with better logging and stuck detection
      const processingAssignments = currentAssignments.filter(assignment => {
        const isProcessing = assignment.status === 'processing';
        const isPlagiarismProcessing = assignment.plagiarism_status === 'processing';
        const isStillProcessing = isProcessing || isPlagiarismProcessing;
        
        if (isStillProcessing) {
          // Track polling state to detect stuck assignments
          const previousState = pollingStateRef.current[assignment.id];
          
          if (previousState && previousState.status === assignment.status && 
              previousState.plagiarism_status === assignment.plagiarism_status) {
            previousState.count += 1;
            
            // If an assignment has been in the same state for more than 24 polls (2 minutes), warn about it
            if (previousState.count > 24) {
              console.warn(`⚠️ Assignment "${assignment.name}" may be stuck in processing state for ${previousState.count * 5} seconds:`, {
                status: assignment.status,
                plagiarism_status: assignment.plagiarism_status,
                total_students: assignment.total_students,
                processed_students: assignment.processed_students
              });
              
              // Stop polling this assignment after 60 polls (5 minutes) to prevent infinite polling
              if (previousState.count > 60) {
                console.error(`❌ Stopping polling for assignment "${assignment.name}" - appears to be stuck`);
                return false;
              }
            }
          } else {
            // State changed or first time seeing this assignment
            pollingStateRef.current[assignment.id] = {
              status: assignment.status,
              plagiarism_status: assignment.plagiarism_status,
              count: 1
            };
            
            console.log(`🔄 Assignment "${assignment.name}" processing:`, {
              status: assignment.status,
              plagiarism_status: assignment.plagiarism_status,
              total_students: assignment.total_students,
              processed_students: assignment.processed_students
            });
          }
        } else {
          // Assignment is no longer processing, remove from polling state
          delete pollingStateRef.current[assignment.id];
        }
        
        return isStillProcessing;
      });
      
      if (processingAssignments.length > 0) {
        console.log(`🔄 Polling ${processingAssignments.length} processing assignments`);
        loadAssignments();
      } else {
        // No more processing assignments, stop polling
        console.log('⏹️ No processing assignments found, stopping polling');
        stopPolling();
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      console.log('⏸️ Stopping assignment polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Update ref and check for processing assignments whenever assignments change
  useEffect(() => {
    assignmentsRef.current = assignments;
    
    // Check if we have any processing assignments and start/stop polling accordingly
    const hasProcessingAssignments = assignments.some(assignment => 
      assignment.status === 'processing' || assignment.plagiarism_status === 'processing'
    );
    
    if (hasProcessingAssignments && !pollingIntervalRef.current) {
      console.log('📋 Detected processing assignments, starting polling');
      startPolling();
    } else if (!hasProcessingAssignments && pollingIntervalRef.current) {
      console.log('✅ All assignments completed, stopping polling');
      stopPolling();
    }
  }, [assignments]);

  // Initial load
  useEffect(() => {
    loadAssignments();
    
    // Clean up polling on unmount
    return () => {
      stopPolling();
    };
  }, []); // Empty dependency array - only runs once

  // Refresh when external trigger changes (e.g., after assignment upload)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      console.log(`🔄 External refresh triggered: ${refreshTrigger}`);
      loadAssignments(true); // Force fresh data on external trigger
    }
  }, [refreshTrigger]);

  const loadAssignments = async (forceFresh = false) => {
    try {
      setLoading(true);
      
      // Add cache-busting timestamp when forcing fresh data
      const cacheParams = forceFresh ? { _t: Date.now() } : {};
      const data = await apiService.getAssignments(0, 50, cacheParams);
      
      setAssignments(data);
      setError(null); // Clear any previous errors on successful load
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const loadAssignmentDetails = async (assignment: Assignment, forceFresh = false) => {
    try {
      setSelectedAssignment(assignment);
      
      // Clear previous data when changing assignments
      setExpandedSubmissions(new Set());
      setSubmissionDetails({});
      setLoadingDetails(new Set());
      
      // Add cache-busting for assignment details when forcing fresh
      const cacheParam = forceFresh ? `?_t=${Date.now()}` : '';
      
      // Load report and submissions in parallel with cache-busting
      const [reportData, submissionsData] = await Promise.all([
        apiService.getAssignmentReport(assignment.id, cacheParam),
        apiService.getAssignmentSubmissions(assignment.id, cacheParam)
      ]);
      
      setAssignmentReport(reportData);
      setSubmissions(submissionsData);
      setError(null); // Clear errors on successful load
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load assignment details');
    }
  };


  const handleReprocess = async (assignmentId: number) => {
    try {
      // Pass grading configuration to the API
      const gradingConfig = {
        gradeOutOf: gradeOutOf,
        leniency: leniency
      };
      
      await apiService.reprocessAssignment(assignmentId, gradingConfig);
      // Force refresh assignments to show updated status
      await loadAssignments(true);
      if (selectedAssignment?.id === assignmentId) {
        const updatedAssignment = assignments.find(a => a.id === assignmentId);
        if (updatedAssignment) {
          await loadAssignmentDetails(updatedAssignment, true); // Force fresh assignment details
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to reprocess assignment');
    }
  };

  const handleDelete = async (assignmentId: number) => {
    if (!window.confirm('Are you sure you want to delete this assignment? This action cannot be undone.')) {
      return;
    }
    
    try {
      await apiService.deleteAssignment(assignmentId);
      await loadAssignments(true); // Force refresh after deletion
      
      // Clear selected assignment if it was deleted
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment(null);
        setAssignmentReport(null);
        setSubmissions([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete assignment');
    }
  };

  const handleExportCSV = async (assignmentId: number) => {
    try {
      await apiService.exportAssignmentCSV(assignmentId);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to export CSV');
    }
  };

  const loadSubmissionDetails = async (submissionId: number) => {
    if (!selectedAssignment || submissionDetails[submissionId] || loadingDetails.has(submissionId)) {
      return;
    }
    
    setLoadingDetails(prev => new Set(prev.add(submissionId)));
    
    try {
      const details = await apiService.getSubmissionDetails(selectedAssignment.id, submissionId);
      setSubmissionDetails(prev => ({
        ...prev,
        [submissionId]: details
      }));
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load submission details');
    } finally {
      setLoadingDetails(prev => {
        const newSet = new Set(prev);
        newSet.delete(submissionId);
        return newSet;
      });
    }
  };

  const toggleSubmissionExpansion = async (submissionId: number) => {
    const newExpanded = new Set(expandedSubmissions);
    if (newExpanded.has(submissionId)) {
      newExpanded.delete(submissionId);
    } else {
      newExpanded.add(submissionId);
      // Load submission details when expanding
      await loadSubmissionDetails(submissionId);
    }
    setExpandedSubmissions(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case 'uploaded':
        return <Badge className="bg-gray-100 text-gray-800">Uploaded</Badge>;
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
            Assignment Reports
          </h2>
          <p className="text-muted-foreground text-sm">Monitor and analyze student submissions</p>
        </div>
        <Button onClick={() => loadAssignments(true)} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center space-x-2 p-3 border border-red-200 rounded-lg bg-red-50">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 flex-1">{error}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setError(null)}
            className="flex-shrink-0"
          >
            ×
          </Button>
        </div>
      )}

      {/* Assignment Selector and Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex-1">
              <Select 
                value={selectedAssignment?.id.toString() || ''} 
                onValueChange={(value) => {
                  const assignment = assignments.find(a => a.id === parseInt(value));
                  if (assignment) {
                    loadAssignmentDetails(assignment);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an assignment to analyze">
                    {selectedAssignment && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{selectedAssignment.name}</span>
                        {getStatusBadge(selectedAssignment.status)}
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((assignment) => (
                    <SelectItem key={assignment.id} value={assignment.id.toString()}>
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <div className="font-medium">{assignment.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {assignment.total_students} students • {formatDateOnly(assignment.created_at)}
                          </div>
                        </div>
                        <div className="ml-2">
                          {getStatusBadge(assignment.status)}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input
                placeholder="Search assignments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Assignment Details */}
      {selectedAssignment ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Assignment Overview */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="flex items-center min-w-0">
                  <Code className="w-5 h-5 mr-2 flex-shrink-0" />
                  <span className="truncate">{selectedAssignment.name}</span>
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {/* Grading Configuration */}
                  <div className="flex items-center gap-2 text-sm">
                    <span>Grade out of:</span>
                    <Select 
                      value={gradeOutOf.toString()} 
                      onValueChange={(value) => setGradeOutOf(parseInt(value))}
                    >
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span>Leniency:</span>
                    <Input
                      type="number"
                      value={leniency}
                      onChange={(e) => setLeniency(Number(e.target.value) || 50)}
                      className="w-16 h-8"
                      min="0"
                      max="100"
                    />
                    <span>%</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportCSV(selectedAssignment.id)}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReprocess(selectedAssignment.id)}
                    disabled={selectedAssignment.status === 'processing'}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Reprocess
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(selectedAssignment.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{selectedAssignment.total_students}</div>
                  <div className="text-sm text-muted-foreground">Students</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {selectedAssignment.execution_summary?.success || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {selectedAssignment.execution_summary?.error || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {selectedAssignment?.plagiarism_report?.flagged_submissions || 
                     assignmentReport?.flagged_submissions || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Flagged</div>
                </div>
              </div>
              
              {selectedAssignment.status === 'processing' && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-muted-foreground mb-1">
                    <span>Processing Progress</span>
                    <span>{selectedAssignment.processed_students} / {selectedAssignment.total_students}</span>
                  </div>
                  <Progress 
                    value={selectedAssignment.total_students > 0 ? 
                      (selectedAssignment.processed_students / selectedAssignment.total_students) * 100 : 0} 
                    className="h-2"
                  />
                </div>
              )}
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
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filter submissions" />
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
            <CardContent className="p-0">
              <div className="space-y-2 p-4">
                {filteredSubmissions.map((submission) => {
                  const isExpanded = expandedSubmissions.has(submission.id);
                  return (
                    <div key={submission.id} className="border rounded-lg overflow-hidden">
                      {/* Clickable Row */}
                      <div 
                        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleSubmissionExpansion(submission.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium">
                                {submission.student_name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {submission.execution_time?.toFixed(3) || '0.000'}s
                              </Badge>
                              {(submission.grade !== undefined && submission.grade !== null) && (
                                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                                  {submission.grade}/{submission.max_grade || 100}
                                </Badge>
                              )}
                              {submission.is_flagged && (
                                <Badge variant="destructive" className="text-xs">
                                  <Shield className="w-3 h-3 mr-1" />
                                  Flagged
                                </Badge>
                              )}
                              <div className="flex items-center">
                                {getExecutionStatusIcon(submission.execution_status)}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {submission.executed_at ? formatDateOnly(submission.executed_at) : 'Not executed'}
                              {submission.code_files && (
                                <> • {submission.code_files.length} files</>
                              )}
                            </div>
                            {submission.execution_error && (
                              <div className="text-xs text-destructive mt-1 bg-destructive/10 p-1 rounded">
                                {submission.execution_error.slice(0, 100)}
                                {submission.execution_error.length > 100 && '...'}
                              </div>
                            )}
                          </div>
                          <div className="flex space-x-1">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSubmissionExpansion(submission.id);
                              }}
                              className="hover:bg-primary/10"
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="border-t bg-muted/20 p-4">
                          <div className="space-y-4">
                            {/* Submission Details Header */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <label className="font-medium text-muted-foreground">Student</label>
                                <div>{submission.student_name}</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Status</label>
                                <div className="flex items-center gap-2">
                                  {getExecutionStatusIcon(submission.execution_status)}
                                  <span className="capitalize">{submission.execution_status}</span>
                                </div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Runtime</label>
                                <div>{submission.execution_time?.toFixed(3) || '0.000'}s</div>
                              </div>
                              <div>
                                <label className="font-medium text-muted-foreground">Files</label>
                                <div>{submission.code_files?.length || 0} files</div>
                              </div>
                            </div>

                            {/* Tabs for different views */}
                            <Tabs defaultValue="code-execution" className="w-full">
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="code-execution">Code & Execution</TabsTrigger>
                                <TabsTrigger value="plagiarism">Plagiarism</TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="code-execution" className="mt-4">
                                {(() => {
                                  const details = submissionDetails[submission.id];
                                  const isLoadingDetails = loadingDetails.has(submission.id);
                                  const codeContent = details?.code_content || {};
                                  const mainFile = Object.keys(codeContent)[0] || 'main.py';
                                  const codeValue = codeContent[mainFile] || '';
                                  
                                  if (isLoadingDetails) {
                                    return (
                                      <div className="flex items-center justify-center h-96">
                                        <div className="text-center">
                                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                                          <p className="text-muted-foreground">Loading code...</p>
                                        </div>
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-96">
                                        {/* Code Editor Panel */}
                                        <div className="flex flex-col bg-background border rounded-lg shadow-sm">
                                          <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                                            <h4 className="text-sm font-medium">Code</h4>
                                            <div className="text-xs text-muted-foreground mt-1">
                                              Files: {submission.code_files?.join(', ') || 'No files available'}
                                            </div>
                                          </div>
                                          <div className="flex-1 overflow-hidden rounded-b-lg">
                                            <CodeEditor
                                              language={selectedAssignment?.language || 'python'}
                                              value={codeValue}
                                              onChange={() => {}} // Read-only
                                              readOnly={true}
                                            />
                                          </div>
                                        </div>

                                        {/* Output Panel */}
                                        <div className="flex flex-col bg-background border rounded-lg shadow-sm">
                                          <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                                            <h4 className="text-sm font-medium">Output</h4>
                                          </div>
                                          <div className="flex-1 overflow-hidden rounded-b-lg">
                                            <OutputConsole
                                              output={details?.submission?.execution_output || ''}
                                              error={details?.submission?.execution_error || null}
                                              isLoading={false}
                                              executionTime={details?.submission?.execution_time || 0}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* AI Grading Panel */}
                                      {(submission.grade !== undefined && submission.grade !== null) && (
                                        <div className="bg-background border rounded-lg shadow-sm p-4">
                                          <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-medium flex items-center">
                                              <span className="mr-2">🤖</span>
                                              AI Grading
                                            </h4>
                                            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                              {submission.grade}/{submission.max_grade || 100} points
                                            </Badge>
                                          </div>
                                          {submission.grading_notes && (
                                            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                                              <div className="font-medium mb-1">Feedback:</div>
                                              <div>{submission.grading_notes}</div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TabsContent>
                              
                              <TabsContent value="plagiarism" className="mt-4">
                                {submission.is_flagged ? (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-destructive">
                                      <Shield className="w-4 h-4" />
                                      <span className="font-medium">Similarity Detected</span>
                                    </div>
                                    {submission.similarity_scores && Object.keys(submission.similarity_scores).length > 0 && (
                                      <div className="space-y-2">
                                        <div className="text-sm font-medium">Similar to:</div>
                                        {Object.entries(submission.similarity_scores).map(([student, score]) => (
                                          <div key={student} className="flex justify-between items-center p-2 bg-destructive/10 rounded">
                                            <span className="text-sm">{student}</span>
                                            <Badge variant="destructive">{(score * 100).toFixed(1)}%</Badge>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-green-600">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>No plagiarism detected</span>
                                  </div>
                                )}
                              </TabsContent>
                            </Tabs>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {filteredSubmissions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2" />
                    <p>No submissions found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Select an Assignment</h3>
            <p className="text-muted-foreground">
              Choose an assignment from the dropdown above to view detailed reports and student submissions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}