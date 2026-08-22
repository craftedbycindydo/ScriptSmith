import React, { useState, useEffect } from 'react';
import { lockedTail as buildLockedTail, withLockedTail } from '@/lib/labHarness';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
// Note: Using native HTML checkbox since @/components/ui/checkbox might not be available
import { apiService } from '@/services/api';
import { formatDistanceToNow } from 'date-fns';
import CodeEditor from './CodeEditor';
import OutputConsole from './OutputConsole';
import { 
  Send,
  Filter, 
  RefreshCw, 
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Users,
  Brain,
  ChevronDown,
  ChevronUp,
  Play,
  List,
  Table2,
  Loader2
} from 'lucide-react';
import type { TemplateSubmission } from '@/services/api';
import Gradebook from './Gradebook';

// ⚠️  ADMIN ONLY COMPONENT - This component calls admin endpoints
// Only use within AdminDashboard or other admin-protected routes
const TemplateSubmissions: React.FC = () => {
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('matrix');
  const [submissions, setSubmissions] = useState<TemplateSubmission[]>([]);
  // Server-side paging.
  const [page, setPage] = useState(1);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const pageSize = 50;
  const [filteredSubmissions, setFilteredSubmissions] = useState<TemplateSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Data for dropdowns
  const [templates, setTemplates] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [classroomMembers, setClassroomMembers] = useState<any[]>([]);
  
  // Filter states
  const [templateFilter, setTemplateFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [classroomFilter, setClassroomFilter] = useState('all');
  
  // Expanded submission for detailed view
  const [expandedSubmission, setExpandedSubmission] = useState<number | null>(null);
  
  // Run Code functionality
  const [runningSubmissions, setRunningSubmissions] = useState<Set<number>>(new Set());
  
  // AI Grading Modal States
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [useAIGrading, setUseAIGrading] = useState(false);
  const [gradeScale, setGradeScale] = useState<'10' | '50' | '100'>('100');
  const [leniency, setLeniency] = useState([50]); // 0-100 scale
  const [enableRobustness, setEnableRobustness] = useState(false); // Advanced: edge cases, crashes
  const [enableQuality, setEnableQuality] = useState(false); // Advanced: code style, naming
  const [showAdvancedCriteria, setShowAdvancedCriteria] = useState(false); // Control collapsible section
  const [isGrading, setIsGrading] = useState(false);
  const [_aiGrades, setAiGrades] = useState<{[key: string]: number}>({}); // Store AI grades for potential future use
  const [gradingError, setGradingError] = useState<string>(''); // Store error messages for inline display
  
  // Stats
  const [stats, setStats] = useState<{
    total_submissions: number;
    success_submissions: number;
    error_submissions: number;
    success_rate: number;
    submissions_by_language: Array<{ language: string; count: number }>;
  }>({
    total_submissions: 0,
    success_submissions: 0,
    error_submissions: 0,
    success_rate: 0,
    submissions_by_language: []
  });

  const languages = ['python', 'javascript', 'java', 'cpp', 'go', 'rust'];
  const statuses = ['success', 'error', 'pending'];

  useEffect(() => {
    fetchSubmissions();
    fetchStats();
    fetchTemplates();
    fetchUsers();
    fetchClassrooms();
  }, []);

  useEffect(() => {
    fetchSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    applyFilters();
  }, [submissions, templateFilter, userFilter, languageFilter, statusFilter, classroomFilter, classroomMembers]);

  // Fetch classroom members when classroom filter changes
  useEffect(() => {
    if (classroomFilter !== 'all') {
      fetchClassroomMembers(parseInt(classroomFilter));
    } else {
      setClassroomMembers([]);
    }
  }, [classroomFilter]);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const response = await apiService.getAllSubmissions({ page, pageSize });
      setSubmissions(response.submissions);
      setTotalSubmissions(response.total);
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await apiService.getSubmissionsStats();
      setStats(response);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      // Use user endpoint instead of admin endpoint
      const response = await apiService.getUserTemplatesList();
      // /templates endpoint returns array directly (not wrapped in object)
      setTemplates(response || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setTemplates([]); // Fallback to empty array
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await apiService.getUsersList();
      // API returns { "users": [...] }, so we need to extract the users array
      setUsers(response.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]); // Fallback to empty array
    }
  };

  const fetchClassrooms = async () => {
    try {
      const response = await apiService.getMyClassrooms();
      setClassrooms(response || []);
    } catch (error) {
      console.error('Failed to fetch classrooms:', error);
      setClassrooms([]);
    }
  };

  const fetchClassroomMembers = async (classroomId: number) => {
    try {
      const response = await apiService.getClassroomMembers(classroomId);
      setClassroomMembers(response || []);
    } catch (error) {
      console.error('Failed to fetch classroom members:', error);
      setClassroomMembers([]);
    }
  };

  const handleRunCode = async (submissionId: number) => {
    try {
      setRunningSubmissions(prev => new Set(prev).add(submissionId));
      const response = await apiService.rerunSubmission(submissionId);
      
      if (response.success) {
        // Update the submission in the local state
        setSubmissions(prev => prev.map(sub => 
          sub.id === submissionId 
            ? {
                ...sub,
                output: response.output,
                error_message: response.error_message,
                execution_time: response.execution_time,
                status: response.status
              }
            : sub
        ));
      } else {
        console.error(`Failed to run code: ${response.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('Failed to run code:', err.response?.data?.detail || err.message);
    } finally {
      setRunningSubmissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(submissionId);
        return newSet;
      });
    }
  };

  const applyFilters = () => {
    let filtered = submissions;

    if (templateFilter !== 'all') {
      filtered = filtered.filter(s => s.template_name === templateFilter);
    }

    if (userFilter !== 'all') {
      filtered = filtered.filter(s => s.submitted_by_username === userFilter);
    }

    if (languageFilter !== 'all') {
      filtered = filtered.filter(s => s.language === languageFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    // Filter by classroom - show submissions only from users in the selected classroom
    if (classroomFilter !== 'all') {
      if (classroomMembers.length > 0) {
        const classroomUsernames = classroomMembers.map(member => member.username);
        filtered = filtered.filter(s => classroomUsernames.includes(s.submitted_by_username));
      } else {
        // If classroom is selected but members haven't loaded yet, show empty results
        // This prevents showing all submissions while loading
        filtered = [];
      }
    }

    setFilteredSubmissions(filtered);
  };

  const resetFilters = () => {
    setTemplateFilter('all');
    setUserFilter('all');
    setLanguageFilter('all');
    setStatusFilter('all');
    setClassroomFilter('all');
  };

  // Username masking functions - only mask usernames, not code content
  const createUsernameMask = (): string => {
    return `Student_${Math.random().toString(36).substr(2, 8)}`;
  };

  const createUsernameMapping = (usernames: string[]): {[key: string]: string} => {
    const mapping: {[key: string]: string} = {};
    usernames.forEach(username => {
      mapping[username] = createUsernameMask();
    });
    return mapping;
  };

  const demaskUsernames = (grades: {[key: string]: number}, mapping: {[key: string]: string}): {[key: string]: number} => {
    const demaskedGrades: {[key: string]: number} = {};
    const reverseMapping = Object.fromEntries(
      Object.entries(mapping).map(([real, masked]) => [masked, real])
    );
    
    Object.entries(grades).forEach(([maskedUsername, grade]) => {
      const realUsername = reverseMapping[maskedUsername] || maskedUsername;
      demaskedGrades[realUsername] = grade;
    });
    
    return demaskedGrades;
  };

  // AI Grading function with smart batching
  const gradeSubmissionsWithAI = async (
    submissionsToGrade: any[], 
    template: any
  ): Promise<{[key: string]: number}> => {
    if (submissionsToGrade.length === 0) {
      return {};
    }
    
    try {
      setGradingError(''); // Clear any previous errors
      
      // Create username mapping for privacy (but keep code intact)
      const usernames = submissionsToGrade.map(s => s.submitted_by_username);
      const usernameMapping = createUsernameMapping(usernames);
      
      // Prepare submissions with masked usernames only
      const maskedSubmissions = submissionsToGrade.map(submission => ({
        username: usernameMapping[submission.submitted_by_username], // Only mask username
        code: submission.submitted_code || '', // Send code as-is to AI
        output: submission.output || '',
        error_message: submission.error_message || '',
        status: submission.status,
        language: submission.language
      }));
      
      console.log(`Sending ${maskedSubmissions.length} submissions for AI grading`);
      
      const batchRequest = {
        template_info: {
          name: template.name,
          description: template.description || '',
          language: template.language,
          // The grader sees what the student saw: starter code with the locked tests below it
          code_content: template.test_harness
            ? withLockedTail(template.code_content || '', buildLockedTail(template.test_harness, template.language))
            : (template.code_content || '')
        },
        submissions: maskedSubmissions,
        grade_scale: parseInt(gradeScale),
        leniency: leniency[0],
        enable_robustness: enableRobustness,
        enable_quality: enableQuality
      };
      
      const result = await apiService.gradeSubmissionsBatch(batchRequest);
      
      if (result.success && result.grades) {
        console.log(`AI grading completed: ${Object.keys(result.grades).length} grades generated`);
        if (result.errors && result.errors.length > 0) {
          console.warn('Some grading warnings occurred:', result.errors);
        }
        // Demask the usernames in the grades response
        const demaskedGrades = demaskUsernames(result.grades, usernameMapping);
        return demaskedGrades;
      } else {
        console.error('AI grading failed:', result.errors);
        throw new Error(`AI grading failed: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error in AI grading:', error);
      // Re-throw the error instead of providing fallback grades
      throw error;
    }
  };

  const handleExportClick = () => {
    if (classroomFilter === 'all' || templateFilter === 'all') {
      alert('Please select both a classroom and a template to export.');
      return;
    }
    setGradingError(''); // Clear any previous errors when opening modal

    setExportModalOpen(true);
  };

  const exportToCSV = async () => {
    if (classroomFilter === 'all' || templateFilter === 'all') {
      return;
    }

    const selectedClassroom = classrooms.find(c => c.id.toString() === classroomFilter);
    const selectedTemplate = templates.find(t => t.name === templateFilter);
    
    if (!selectedClassroom || !selectedTemplate) {
      alert('Selected classroom or template not found.');
      return;
    }

    // Create CSV data
    const csvRows = [];
    
    // Will be set to false if AI grading fails
    let actuallyUseAI = useAIGrading;
    
    // Start with column headers first (info will be added at the end)
    const headers = [
      'Name',
      'Username', 
      'Email',
      'Submitted Code',
      'Output',
      'Status',
      'Error Message',
      'Execution Time',
      'Submitted At'
    ];

    // Get submissions for this template from classroom members
    const templateSubmissions = submissions.filter(s => 
      s.template_name === templateFilter && 
      classroomMembers.some(member => member.username === s.submitted_by_username)
    );

    // Create a map of submissions by username for quick lookup
    const submissionsByUser = new Map();
    templateSubmissions.forEach(submission => {
      submissionsByUser.set(submission.submitted_by_username, submission);
    });

    // If AI grading is enabled, grade the submissions first
    let currentAiGrades: {[key: string]: number} = {};
    
    if (useAIGrading) {
      setIsGrading(true);
      
      try {
        setGradingError(''); // Clear any previous errors
        
        // Fetch the full template details including code content
        const fullTemplate = await apiService.getTemplateAdmin(selectedTemplate.id);
        
        // Prepare submissions with member data for AI grading (only submitted ones)
        const submissionsForGrading = templateSubmissions.map(submission => ({
          ...submission,
          member: classroomMembers.find(m => m.username === submission.submitted_by_username)
        }));
        
        currentAiGrades = await gradeSubmissionsWithAI(
          submissionsForGrading, 
          fullTemplate // Pass the full template with code content
        );
        setAiGrades(currentAiGrades);
      } catch (error) {
        console.error('AI grading failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'AI grading failed';
        setGradingError(`AI grading failed: ${errorMessage}. Downloading CSV without AI grades.`);
        actuallyUseAI = false; // Disable AI grading for this export
        currentAiGrades = {};
      } finally {
        setIsGrading(false);
      }
    }

    // Add AI grade column if grading succeeded
    if (actuallyUseAI) {
      headers.push('AI Grade');
    }
    
    // Add headers as first row
    csvRows.push(headers);

    // Sort classroom members by name
    const sortedMembers = [...classroomMembers].sort((a, b) => {
      const nameA = (a.full_name || a.username).toLowerCase();
      const nameB = (b.full_name || b.username).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Add data for each classroom member in sorted order
    sortedMembers.forEach(member => {
      const submission = submissionsByUser.get(member.username);
      
      if (submission) {
        // User has submitted - new column order
        const row = [
          member.full_name || member.username, // Name
          member.username, // Username
          member.email, // Email
          submission.submitted_code || 'No code available', // Submitted Code
          submission.output || 'No output', // Output
          submission.status, // Status
          submission.error_message || 'None', // Error Message
          formatExecutionTime(submission.execution_time), // Execution Time
          formatSubmissionDate(submission.submitted_at) // Submitted At
        ];
        
        // Add AI grade if enabled and successful
        if (actuallyUseAI) {
          row.push((currentAiGrades[member.username] || 0).toString());
        }
        
        csvRows.push(row);
      } else {
        // User has not submitted - new column order
        const row = [
          member.full_name || member.username, // Name
          member.username, // Username
          member.email, // Email
          'NOT SUBMITTED', // Submitted Code
          'NOT SUBMITTED', // Output
          'missing', // Status
          'No submission found', // Error Message
          'N/A', // Execution Time
          'N/A' // Submitted At
        ];
        
        // Add default grade of 0 for non-submissions if AI grading successful
        if (actuallyUseAI) {
          row.push('0');
        }
        
        csvRows.push(row);
      }
    });

    // Add template information section at the end (separated from data)
    csvRows.push([]); // Empty row separator
    csvRows.push([]); // Another empty row for clear separation
    csvRows.push(['=== TEMPLATE INFORMATION ===']);
    csvRows.push(['Template:', selectedTemplate.name]);
    csvRows.push(['Classroom:', selectedClassroom.name]);
    csvRows.push(['Language:', selectedTemplate.language]);
    csvRows.push(['Generated:', new Date().toLocaleString()]);
    if (actuallyUseAI) {
      csvRows.push(['AI Grading:', `Grade Scale ${gradeScale}, Leniency ${leniency[0]}%`]);
    }

    // Convert to CSV string
    const csvContent = csvRows.map(row => 
      row.map(cell => `"${cell?.toString().replace(/"/g, '""') || ''}"`).join(',')
    ).join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Generate filename with AI grading indicator
    const filename = actuallyUseAI 
      ? `${selectedClassroom.name}_${selectedTemplate.name}_AI_graded_${gradeScale}_${new Date().toISOString().split('T')[0]}.csv`
      : `${selectedClassroom.name}_${selectedTemplate.name}_submissions_sorted_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Close modal after successful export and clear states
    setExportModalOpen(false);
    setGradingError('');
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      success: 'default',
      error: 'destructive',
      pending: 'secondary'
    };

    const icons = {
      success: <CheckCircle className="w-3 h-3 mr-1" />,
      error: <XCircle className="w-3 h-3 mr-1" />,
      pending: <Clock className="w-3 h-3 mr-1" />
    };

    return (
      <Badge variant={variants[status] || 'secondary'} className="flex items-center">
        {icons[status as keyof typeof icons]}
        {status}
      </Badge>
    );
  };

  const formatExecutionTime = (time?: number) => {
    if (!time) return 'N/A';
    return time < 1 ? `${(time * 1000).toFixed(0)}ms` : `${time.toFixed(2)}s`;
  };

  const formatSubmissionDate = (dateString: string) => {
    try {
      // Ensure the date string is treated as UTC by adding 'Z' if not present
      const utcDateString = dateString.includes('Z') || dateString.includes('+') 
        ? dateString 
        : dateString + 'Z';
      
      const date = new Date(utcDateString);
      return date.toLocaleString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  const formatRelativeTime = (dateString: string) => {
    try {
      // Ensure the date string is treated as UTC by adding 'Z' if not present
      const utcDateString = dateString.includes('Z') || dateString.includes('+') 
        ? dateString 
        : dateString + 'Z';
      
      const date = new Date(utcDateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const toggleExpanded = (submissionId: number) => {
    setExpandedSubmission(expandedSubmission === submissionId ? null : submissionId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Template Submissions</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Monitor and review student template submissions
          </p>
        </div>
        {/* Refresh lives in the admin shell header - not duplicated here. */}
        {/* List = per-submission detail. Matrix = roster x template grid. */}
        <div className="inline-flex rounded-md border overflow-hidden">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none"
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4 mr-1.5" />
            List
          </Button>
          <Button
            variant={viewMode === 'matrix' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none"
            onClick={() => setViewMode('matrix')}
          >
            <Table2 className="w-4 h-4 mr-1.5" />
            Matrix
          </Button>
        </div>
      </div>

      {viewMode === 'matrix' && <Gradebook />}

      {viewMode === 'list' && (
      <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Send className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Submissions</p>
                <p className="text-2xl font-semibold">{stats.total_submissions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Successful</p>
                <p className="text-2xl font-semibold">{stats.success_submissions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <XCircle className="w-8 h-8 text-red-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Errors</p>
                <p className="text-2xl font-semibold">{stats.error_submissions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold">
                %
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
                <p className="text-2xl font-semibold">{stats.success_rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
            <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
              <DialogTrigger asChild>
                <Button 
                  onClick={handleExportClick} 
                  disabled={classroomFilter === 'all' || templateFilter === 'all'} 
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    Export Options
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* AI Grading Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="ai-grading" className="text-base font-medium">
                        Enable AI Grading
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Use AI to automatically grade submissions
                      </p>
                    </div>
                    <input
                      id="ai-grading"
                      type="checkbox"
                      checked={useAIGrading}
                      onChange={(e) => setUseAIGrading(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>

                  {/* AI Grading Options (shown only if AI grading is enabled) */}
                  {useAIGrading && (
                    <>
                      {/* Grade Scale */}
                      <div className="space-y-3">
                        <Label className="text-base font-medium">Grade Scale</Label>
                        <Select value={gradeScale} onValueChange={(value: '10' | '50' | '100') => setGradeScale(value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select grade scale" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">Out of 10</SelectItem>
                            <SelectItem value="50">Out of 50</SelectItem>
                            <SelectItem value="100">Out of 100</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Leniency Slider */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-medium">Leniency</Label>
                          <span className="text-sm text-muted-foreground">{leniency[0]}%</span>
                        </div>
                        <div className="px-2">
                          <Slider
                            value={leniency}
                            onValueChange={setLeniency}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Strict</span>
                          <span>Lenient</span>
                        </div>
                      </div>

                      {/* Advanced Grading Criteria - Collapsible */}
                      <div className="pt-4 border-t">
                        {/* Collapsible Header */}
                        <button
                          type="button"
                          onClick={() => setShowAdvancedCriteria(!showAdvancedCriteria)}
                          className="w-full flex items-center justify-between p-3 text-left bg-orange-50 hover:bg-orange-100 dark:bg-orange-950 dark:hover:bg-orange-900 rounded-lg transition-colors border border-orange-200 dark:border-orange-700"
                        >
                          <div className="flex items-center space-x-2">
                            <Label className="text-base font-medium text-orange-600 dark:text-orange-400 cursor-pointer">
                              Advanced Criteria (Optional)
                            </Label>
                            {(enableQuality || enableRobustness) && (
                              <span className="px-2 py-1 bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 text-xs rounded-full">
                                {[enableQuality && 'Quality', enableRobustness && 'Robustness'].filter(Boolean).join(', ')} enabled
                              </span>
                            )}
                          </div>
                          {showAdvancedCriteria ? (
                            <ChevronUp className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          )}
                        </button>
                        
                        {/* Collapsible Content */}
                        {showAdvancedCriteria && (
                          <div className="space-y-3 mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-muted-foreground">
                              These are advanced concepts - disable for beginners learning basic programming
                            </p>
                            
                            {/* Code Quality Toggle */}
                            <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-600">
                              <div className="flex-1">
                                <Label htmlFor="quality-toggle" className="text-sm font-medium cursor-pointer">
                                  Code Quality Assessment
                                </Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Variable naming, code structure, readability, best practices
                                </p>
                              </div>
                              <input
                                id="quality-toggle"
                                type="checkbox"
                                checked={enableQuality}
                                onChange={(e) => setEnableQuality(e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                            </div>

                            {/* Robustness Toggle */}
                            <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-600">
                              <div className="flex-1">
                                <Label htmlFor="robustness-toggle" className="text-sm font-medium cursor-pointer">
                                  Robustness Assessment
                                </Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Edge case handling, error management, crash prevention
                                </p>
                              </div>
                              <input
                                id="robustness-toggle"
                                type="checkbox"
                                checked={enableRobustness}
                                onChange={(e) => setEnableRobustness(e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Loading message (shown during grading) */}
                  {isGrading && (
                    <div className="flex items-center justify-center space-x-2 py-4">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm text-muted-foreground">Waiting for AI to grade submissions...</span>
                    </div>
                  )}

                  {/* Error Message (shown if grading fails) */}
                  {gradingError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex items-start">
                        <XCircle className="w-5 h-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
                        <div className="text-sm text-red-700">
                          {gradingError}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Export Button */}
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setExportModalOpen(false);
                        setGradingError('');
                      }}
                      disabled={isGrading}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={exportToCSV}
                      disabled={isGrading}
                      className="flex items-center gap-2"
                    >
                      {isGrading ? (
                        <>
                          <Brain className="w-4 h-4 animate-pulse" />
                          {useAIGrading ? 'Grading...' : 'Exporting...'}
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          {useAIGrading ? 'Grade & Export' : 'Export CSV'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.name}>
                    {template.name} ({template.language})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classroomFilter} onValueChange={setClassroomFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Classroom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classrooms</SelectItem>
                {classrooms.map((classroom) => (
                  <SelectItem key={classroom.id} value={classroom.id.toString()}>
                    {classroom.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.username} value={user.username}>
                    {user.display}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {languages.map(lang => (
                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-muted-foreground">
              {classroomFilter !== 'all' && templateFilter !== 'all' && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Users className="w-4 h-4" />
                  CSV export available for selected classroom and template
                </div>
              )}
              {(classroomFilter === 'all' || templateFilter === 'all') && (
                <div className="text-amber-600 dark:text-amber-400">
                  Select both classroom and template to enable CSV export
                </div>
              )}
            </div>
            <Button variant="outline" onClick={resetFilters}>
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Submissions ({totalSubmissions.toLocaleString()})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                Loading submissions...
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No submissions found matching your criteria.
              </div>
            ) : (
              filteredSubmissions.map((submission) => (
                <div key={submission.id} className="border rounded-lg overflow-hidden">
                  {/* Clickable Row */}
                  <div 
                    className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleExpanded(submission.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium">
                            {submission.submitted_by_username || 'Anonymous'}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {submission.language}
                          </Badge>
                          {getStatusBadge(submission.status)}
                        </div>
                        {submission.template_name && (
                          <div className="text-sm text-muted-foreground mb-1">
                            Template: {submission.template_name}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {formatRelativeTime(submission.submitted_at)}
                          {submission.execution_time && (
                            <> • {formatExecutionTime(submission.execution_time)}</>
                          )}
                        </div>
                        {submission.error_message && (
                          <div className="text-xs text-destructive mt-1 bg-destructive/10 p-1 rounded">
                            {submission.error_message.slice(0, 100)}
                            {submission.error_message.length > 100 && '...'}
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(submission.id);
                          }}
                          className="hover:bg-primary/10"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded View */}
                  {expandedSubmission === submission.id && (
                    <div className="border-t bg-muted/20 p-4">
                      <div className="space-y-4">
                        {/* Submission Details Header */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <label className="font-medium text-muted-foreground">User</label>
                            <div>{submission.submitted_by_username}</div>
                          </div>
                          <div>
                            <label className="font-medium text-muted-foreground">Language</label>
                            <div className="capitalize">{submission.language}</div>
                          </div>
                          <div>
                            <label className="font-medium text-muted-foreground">Template</label>
                            <div>{submission.template_name || 'None'}</div>
                          </div>
                          <div>
                            <label className="font-medium text-muted-foreground">Status</label>
                            <div>{getStatusBadge(submission.status)}</div>
                          </div>
                        </div>

                        {/* IDE-like Layout */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-96">
                          {/* Code Editor Panel */}
                          <div className="flex flex-col bg-background border rounded-lg shadow-sm">
                            <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                              <h4 className="text-sm font-medium">Submitted Code</h4>
                            </div>
                            <div className="flex-1 overflow-hidden rounded-b-lg">
                              <CodeEditor
                                language={submission.language || 'plaintext'}
                                value={submission.submitted_code}
                                onChange={() => {}} // Read-only
                                readOnly={true}
                              />
                            </div>
                          </div>

                          {/* Output Panel */}
                          <div className="flex flex-col bg-background border rounded-lg shadow-sm">
                            <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg flex items-center justify-between">
                              <h4 className="text-sm font-medium">Output</h4>
                              <Button
                                onClick={() => handleRunCode(submission.id)}
                                disabled={runningSubmissions.has(submission.id)}
                                className="btn-success flex sm:inline-flex"
                                size="sm"
                              >
                                {runningSubmissions.has(submission.id) ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-1 lg:mr-2 animate-spin" />
                                    <span className="hidden sm:inline">Running...</span>
                                    <span className="sm:hidden">...</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1 lg:mr-2" />
                                    <span className="hidden sm:inline">Run Code</span>
                                    <span className="sm:hidden">Run</span>
                                  </>
                                )}
                              </Button>
                            </div>
                            <div className="flex-1 overflow-hidden rounded-b-lg">
                              <OutputConsole
                                output={submission.output || ''}
                                error={submission.error_message || ''}
                                isLoading={false}
                                executionTime={submission.execution_time || 0}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Additional Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="bg-background border rounded-lg p-3">
                            <label className="font-medium text-muted-foreground">Execution Time</label>
                            <div>{formatExecutionTime(submission.execution_time)}</div>
                          </div>
                          <div className="bg-background border rounded-lg p-3">
                            <label className="font-medium text-muted-foreground">Submitted At</label>
                            <div>{formatSubmissionDate(submission.submitted_at)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {totalSubmissions > pageSize && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalSubmissions)} of{' '}
                {totalSubmissions.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= totalSubmissions || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

    </div>
  );
};

export default TemplateSubmissions;
