import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Clock
} from 'lucide-react';
import type { TemplateSubmission } from '@/services/api';

const TemplateSubmissions: React.FC = () => {
  const [submissions, setSubmissions] = useState<TemplateSubmission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<TemplateSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Data for dropdowns
  const [templates, setTemplates] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  // Filter states
  const [templateFilter, setTemplateFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Expanded submission for detailed view
  const [expandedSubmission, setExpandedSubmission] = useState<number | null>(null);
  
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
  }, []);

  useEffect(() => {
    applyFilters();
  }, [submissions, templateFilter, userFilter, languageFilter, statusFilter]);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const response = await apiService.getAllSubmissions();
      setSubmissions(response);
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
      const response = await apiService.getTemplatesList();
      // API returns { "templates": [...] }, so we need to extract the templates array
      setTemplates(response.templates || []);
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

    setFilteredSubmissions(filtered);
  };

  const resetFilters = () => {
    setTemplateFilter('all');
    setUserFilter('all');
    setLanguageFilter('all');
    setStatusFilter('all');
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
        <Button onClick={fetchSubmissions} disabled={loading} className="flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

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
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
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
          
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={resetFilters}>
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Submissions ({filteredSubmissions.length})</CardTitle>
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
                            <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                              <h4 className="text-sm font-medium">Output</h4>
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
        </CardContent>
      </Card>

    </div>
  );
};

export default TemplateSubmissions;
