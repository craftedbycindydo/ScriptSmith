import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import CodeEditor from './CodeEditor';
import { apiService } from '@/services/api';
import type { TemplateCreate, TemplateUpdate, TemplateListItem, TemplateStats, ClassroomInfo, UserInfo } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { parseDate, formatDate as formatDateTime } from '@/lib/dateUtils';
import { 
  Plus, 
  Save, 
  X, 
  Edit,
  Trash2,
  Upload,
  File,
  Download,
  Copy,
  Check,
  Code2,
  Clock,
  KeyRound,
  Search,
  UserPlus,
  UserMinus,
  Users
} from 'lucide-react';


interface TemplateManagerProps {
  onTemplateCreated?: () => void;
}

type EditingTemplate = {
  id: number | null;
  name: string;
  description: string;
  language: string;
  code_content: string;
  classroom_ids: number[];
  visible_from: Date | undefined;
  submission_deadline: Date | undefined;
  exclusions: Array<{ user_id: number; deadline: string; username?: string }>;
};

const defaultTemplate: EditingTemplate = {
  id: null,
  name: '',
  description: '',
  language: 'python',
  code_content: '',
  classroom_ids: [],
  visible_from: undefined,
  submission_deadline: undefined,
  exclusions: []
};

const supportedLanguages = [
  { value: 'python', label: 'Python', extension: '.py' },
  { value: 'javascript', label: 'JavaScript', extension: '.js' },
  { value: 'typescript', label: 'TypeScript', extension: '.ts' },
  { value: 'java', label: 'Java', extension: '.java' },
  { value: 'cpp', label: 'C++', extension: '.cpp' },
  { value: 'go', label: 'Go', extension: '.go' },
  { value: 'rust', label: 'Rust', extension: '.rs' }
];

export default function TemplateManager({ onTemplateCreated }: TemplateManagerProps) {
  
  // Auth store
  const { user: currentUser } = useAuthStore();
  
  // State
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  // Filters run client-side over what is loaded, so load a page at a time and
  // show how much of the total is in hand.
  const [templatesTotal, setTemplatesTotal] = useState(0);
  const templatePageSize = 200;
  const [templateStats, setTemplateStats] = useState<TemplateStats | null>(null);
  const [availableClassrooms, setAvailableClassrooms] = useState<ClassroomInfo[]>([]);
  const [classroomUsers, setClassroomUsers] = useState<{[classroomId: number]: UserInfo[]}>({});
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Editing state
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EditingTemplate>(defaultTemplate);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  
  // File upload state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLanguage, setUploadLanguage] = useState('python');
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);
  
  // Templates list filters
  const [filterQuery, setFilterQuery] = useState('');
  const [filterClassroom, setFilterClassroom] = useState('all');
  const [filterLanguage, setFilterLanguage] = useState('all');
  const [filterVisibility, setFilterVisibility] = useState('all');

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<TemplateListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadTemplates();
    loadTemplateStats();
    loadAvailableClassrooms();
  }, []);



  const loadTemplates = async (page: number = 1) => {
    setLoading(true);
    try {
      const data = await apiService.getAllTemplatesAdmin({ page, pageSize: templatePageSize });
      setTemplates(prev =>
        page === 1 ? (data.templates ?? []) : [...prev, ...(data.templates ?? [])]
      );
      setTemplatesTotal(data.total ?? 0);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      if (page === 1) setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateStats = async () => {
    try {
      const stats = await apiService.getTemplateStats();
      setTemplateStats(stats);
    } catch (err: any) {
      console.error('Failed to load template stats:', err);
    }
  };

  const loadAvailableClassrooms = async () => {
    try {
      const classrooms = await apiService.getAvailableClassrooms();
      setAvailableClassrooms(classrooms);
    } catch (err: any) {
      console.error('Failed to load available classrooms:', err);
    }
  };



  const handleStartCreating = () => {
    setEditingTemplate(defaultTemplate);
    setEditingId(null);
    setIsCreating(true);
    setError(null);
  };

  const handleStartEditing = async (template: TemplateListItem) => {
    try {
      // If already editing this template, cancel editing
      if (editingId === template.id) {
        handleCancelEditing();
        return;
      }
      
      // Load full template data
      const fullTemplate = await apiService.getTemplateAdmin(template.id);
      
      setEditingTemplate({
        id: fullTemplate.id,
        name: fullTemplate.name,
        description: fullTemplate.description || '',
        language: fullTemplate.language,
        code_content: fullTemplate.code_content,
        classroom_ids: fullTemplate.classrooms.map(c => c.id),
        visible_from: fullTemplate.visible_from ?
          parseDate(fullTemplate.visible_from) || undefined : undefined,
        submission_deadline: fullTemplate.submission_deadline ?
          parseDate(fullTemplate.submission_deadline) || undefined : undefined,
        exclusions: (fullTemplate.exclusions || [])
          .filter(exclusion => exclusion.user_id !== currentUser?.id) // Filter out admin user
          .map(exclusion => ({
            ...exclusion,
            username: (exclusion as any).username || `User ${exclusion.user_id}` // fallback if username not provided
          }))
      });
      setEditingId(template.id);
      setIsCreating(false);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load template');
    }
  };

  const handleCancelEditing = () => {
    setEditingTemplate(defaultTemplate);
    setEditingId(null);
    setIsCreating(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!editingTemplate.name.trim() || !editingTemplate.code_content.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (
      editingTemplate.visible_from &&
      editingTemplate.submission_deadline &&
      editingTemplate.visible_from >= editingTemplate.submission_deadline
    ) {
      setError('Visible time must be before the submission deadline');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isCreating) {
        // Create new template
        const templateData: TemplateCreate = {
          name: editingTemplate.name.trim(),
          description: editingTemplate.description.trim() || undefined,
          language: editingTemplate.language,
          code_content: editingTemplate.code_content,
          classroom_ids: editingTemplate.classroom_ids.length > 0 ? editingTemplate.classroom_ids : undefined,
          visible_from: editingTemplate.visible_from ? editingTemplate.visible_from.toISOString() : undefined,
          submission_deadline: editingTemplate.submission_deadline ? editingTemplate.submission_deadline.toISOString() : undefined,
          exclusions: editingTemplate.exclusions.length > 0 ? editingTemplate.exclusions.map(e => ({
            user_id: e.user_id,
            deadline: e.deadline
          })) : undefined
        };
        await apiService.createTemplate(templateData);
      } else if (editingId) {
        // Update existing template
        const updateData: TemplateUpdate = {
          name: editingTemplate.name.trim(),
          description: editingTemplate.description.trim() || undefined,
          code_content: editingTemplate.code_content,
          classroom_ids: editingTemplate.classroom_ids.length > 0 ? editingTemplate.classroom_ids : undefined,
          // null (not undefined) so clearing a picker unschedules / removes the deadline
          visible_from: editingTemplate.visible_from ? editingTemplate.visible_from.toISOString() : null,
          submission_deadline: editingTemplate.submission_deadline ? editingTemplate.submission_deadline.toISOString() : null,
          // Always sent, so removing every exclusion actually removes them
          exclusions: editingTemplate.exclusions.map(e => ({
            user_id: e.user_id,
            deadline: e.deadline
          }))
        };
        await apiService.updateTemplate(editingId, updateData);
      }

      await loadTemplates();
      await loadTemplateStats();
      handleCancelEditing();
      onTemplateCreated?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (template: TemplateListItem) => {
    setTemplateToDelete(template);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!templateToDelete) return;

    setDeleting(true);
    setError(null);
    
    try {
      await apiService.deleteTemplate(templateToDelete.id);
      await loadTemplates();
      await loadTemplateStats();
      setShowDeleteDialog(false);
      setTemplateToDelete(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
    setTemplateToDelete(null);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadFile(file);
      // Auto-detect language from file extension
      const extension = file.name.toLowerCase().split('.').pop();
      const langFromExt = supportedLanguages.find(lang => 
        lang.extension.slice(1) === extension
      );
      if (langFromExt) {
        setUploadLanguage(langFromExt.value);
      }
    }
  };

  const handleUploadTemplate = async () => {
    if (!uploadFile) return;

    setUploading(true);
    setError(null);
    try {
      // Read file content and load into editor (no backend call yet)
      const fileContent = await uploadFile.text();
      const fileName = uploadFile.name.replace(/\.[^/.]+$/, ""); // Remove extension
      
      // Load content into the editing template
      setEditingTemplate({
        id: null,
        name: fileName,
        description: `Uploaded from ${uploadFile.name}`,
        language: uploadLanguage,
        code_content: fileContent,
        classroom_ids: [],
        visible_from: undefined,
        submission_deadline: undefined,
        exclusions: []
      });
      
      // Switch to creation mode with the uploaded content
      setIsCreating(true);
      setShowUploadDialog(false);
      setUploadFile(null);
      
    } catch (err: any) {
      setError('Failed to read file content');
    } finally {
      setUploading(false);
    }
  };

  const handleCopyTemplate = async (template: TemplateListItem) => {
    try {
      const fullTemplate = await apiService.getTemplateAdmin(template.id);
      setEditingTemplate({
        id: null,
        name: `${fullTemplate.name} (Copy)`,
        description: fullTemplate.description || '',
        language: fullTemplate.language,
        code_content: fullTemplate.code_content,
        classroom_ids: fullTemplate.classrooms.map(c => c.id),
        visible_from: fullTemplate.visible_from ?
          parseDate(fullTemplate.visible_from) || undefined : undefined,
        submission_deadline: fullTemplate.submission_deadline ?
          parseDate(fullTemplate.submission_deadline) || undefined : undefined,
        exclusions: (fullTemplate.exclusions || [])
          .filter(exclusion => exclusion.user_id !== currentUser?.id) // Filter out admin user
          .map(exclusion => ({
            ...exclusion,
            username: (exclusion as any).username || `User ${exclusion.user_id}` // fallback if username not provided
          }))
      });
      setIsCreating(true);
      setCopied(template.id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err: any) {
      setError('Failed to copy template');
    }
  };

  const handleDownloadTemplate = async (template: TemplateListItem) => {
    try {
      const fullTemplate = await apiService.getTemplateAdmin(template.id);
      const langConfig = supportedLanguages.find(l => l.value === template.language);
      const extension = langConfig?.extension || '.txt';
      
      const blob = new Blob([fullTemplate.code_content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name}${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('Failed to download template');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Newest first, by creation date
  const createdAt = (template: TemplateListItem) =>
    parseDate(template.created_at)?.getTime() ?? 0;

  // Classrooms that currently have templates, for the classroom filter
  const classroomFilterOptions = (): Array<{ id: number; name: string }> => {
    const options = new Map<number, string>();
    templates.forEach(template => {
      (template.classrooms || []).forEach(classroom => {
        if (classroom?.id) options.set(classroom.id, classroom.name);
      });
    });
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const filtersActive =
    filterQuery.trim() !== '' ||
    filterClassroom !== 'all' ||
    filterLanguage !== 'all' ||
    filterVisibility !== 'all';

  const clearFilters = () => {
    setFilterQuery('');
    setFilterClassroom('all');
    setFilterLanguage('all');
    setFilterVisibility('all');
  };

  const filteredTemplates = (): TemplateListItem[] => {
    const query = filterQuery.trim().toLowerCase();

    return templates.filter(template => {
      if (query) {
        const haystack = `${template.name} ${template.description || ''} ${template.creator_username || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (filterLanguage !== 'all' && template.language !== filterLanguage) return false;

      if (filterClassroom !== 'all') {
        const classroomIds = (template.classrooms || []).map(classroom => classroom.id);
        if (filterClassroom === 'global') {
          if (classroomIds.length > 0) return false;
        } else if (!classroomIds.includes(Number(filterClassroom))) {
          return false;
        }
      }

      if (filterVisibility === 'scheduled' && !isScheduled(template)) return false;
      if (filterVisibility === 'visible' && isScheduled(template)) return false;

      return true;
    });
  };

  // Split templates into sections by the classroom(s) they are assigned to.
  // A template shared by several classrooms gets one section naming all of them,
  // so each template is rendered exactly once (one edit form, one delete button).
  // Sections and the templates inside them are ordered newest-created first.
  const templatesByClassroom = (): Array<{ label: string; items: TemplateListItem[] }> => {
    const groups = new Map<string, { label: string; items: TemplateListItem[] }>();

    filteredTemplates().forEach((template) => {
      const names = (template.classrooms || [])
        .map(classroom => classroom?.name)
        .filter(Boolean)
        .sort();
      const key = names.join('|');
      if (!groups.has(key)) {
        groups.set(key, { label: names.length ? names.join(' · ') : 'Global access', items: [] });
      }
      groups.get(key)!.items.push(template);
    });

    // Newest template first inside each section, and the section holding the
    // newest template first overall
    return [...groups.values()]
      .map(group => ({
        ...group,
        items: [...group.items].sort((a, b) => createdAt(b) - createdAt(a)),
      }))
      .sort((a, b) => createdAt(b.items[0]) - createdAt(a.items[0]));
  };

  // Copy a lab's submission code so it can be read out or pasted into slides
  const handleCopyCode = async (code: string, templateId: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(templateId);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setError('Failed to copy submission code');
    }
  };

  // Template is scheduled if its visible time is still in the future
  const isScheduled = (template: TemplateListItem) => {
    const visibleFrom = template.visible_from ? parseDate(template.visible_from) : null;
    return !!visibleFrom && visibleFrom > new Date();
  };

  const getLanguageLabel = (language: string) => {
    return supportedLanguages.find(l => l.value === language)?.label || language;
  };

  // Load users from selected classrooms
  const loadClassroomUsers = async () => {
    if (editingTemplate.classroom_ids.length === 0) {
      setClassroomUsers({});
      return;
    }

    setLoadingUsers(true);
    try {
      const allUsers: {[classroomId: number]: UserInfo[]} = {};
      
      // Load users from each selected classroom
      await Promise.all(
        editingTemplate.classroom_ids.map(async (classroomId) => {
          try {
            const users = await apiService.getClassroomUsers(classroomId);
            allUsers[classroomId] = users;
          } catch (err) {
            console.error(`Failed to load users for classroom ${classroomId}:`, err);
            allUsers[classroomId] = [];
          }
        })
      );

      setClassroomUsers(allUsers);
    } catch (err) {
      console.error('Failed to load classroom users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Get all available users from selected classrooms (deduplicated, excluding current admin)
  const getAvailableUsers = () => {
    const allUsers: UserInfo[] = [];
    const seenUserIds = new Set<number>();

    Object.values(classroomUsers).forEach(users => {
      users.forEach(user => {
        // Filter out the current admin user and avoid duplicates
        if (!seenUserIds.has(user.id) && user.id !== currentUser?.id) {
          seenUserIds.add(user.id);
          allUsers.push(user);
        }
      });
    });

    return allUsers.sort((a, b) => a.username.localeCompare(b.username));
  };

  // Add user to exclusion list
  const addUserToExclusions = (user: UserInfo) => {
    const isAlreadyAdded = editingTemplate.exclusions.some(e => e.user_id === user.id);
    if (isAlreadyAdded) return;

    const newExclusion = {
      user_id: user.id,
      username: user.username,
      deadline: editingTemplate.submission_deadline ? editingTemplate.submission_deadline.toISOString() : new Date().toISOString()
    };

    setEditingTemplate(prev => ({
      ...prev,
      exclusions: [...prev.exclusions, newExclusion]
    }));
  };

  // Remove user from exclusion list
  const removeUserFromExclusions = (userId: number) => {
    setEditingTemplate(prev => ({
      ...prev,
      exclusions: prev.exclusions.filter(e => e.user_id !== userId)
    }));
  };

  // Update exclusion deadline
  const updateExclusionDeadline = (userId: number, deadline: Date) => {
    setEditingTemplate(prev => ({
      ...prev,
      exclusions: prev.exclusions.map(e => 
        e.user_id === userId 
          ? { ...e, deadline: deadline.toISOString() }
          : e
      )
    }));
  };

  // Load users when classroom selection changes
  useEffect(() => {
    if (editingTemplate.classroom_ids.length > 0) {
      loadClassroomUsers();
    } else {
      setClassroomUsers({});
      // Only clear exclusions when no classrooms are selected and we're creating a new template
      // When editing, preserve existing exclusions as they may be valid
      if (isCreating) {
        setEditingTemplate(prev => ({
          ...prev,
          exclusions: []
        }));
      }
    }
  }, [editingTemplate.classroom_ids, isCreating]);



  return (
    <div className="space-y-6">
      {/* Header with Create and Upload buttons */}
      <Card>
        <CardHeader>
                        <div className="flex flex-col gap-4">
                <div className="min-w-0">
                  <CardTitle className="flex items-center">
                    <Code2 className="w-5 h-5 mr-2 shrink-0" />
                    <span className="truncate">Template Management</span>
                  </CardTitle>
                  <p className="text-muted-foreground text-sm mt-2">
                    Create and manage code templates with full editor support
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    <Upload className="w-4 h-4 mr-2" />
                    <span className="hidden xs:inline">Load from </span>File
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Load Code from File</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Upload a code file to load its content into the template editor. You can review and edit the code before saving.
                    </p>
                    <div>
                      <Label htmlFor="file-upload">Select Code File</Label>
                      <div className="mt-2">
                        <input
                          id="file-upload"
                          type="file"
                          accept=".py,.js,.ts,.java,.cpp,.c,.h,.go,.rs,.txt"
                          onChange={handleFileUpload}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
                        />
                      </div>
                    </div>
                    
                    {uploadFile && (
                      <>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <File className="w-4 h-4" />
                          <span>{uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        
                        <div>
                          <Label htmlFor="upload-language">Language</Label>
                          <Select value={uploadLanguage} onValueChange={setUploadLanguage}>
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {supportedLanguages.map((lang) => (
                                <SelectItem key={lang.value} value={lang.value}>
                                  {lang.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleUploadTemplate} 
                        disabled={!uploadFile || uploading}
                      >
                        {uploading ? 'Loading...' : 'Load File'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button onClick={handleStartCreating} size="sm" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden xs:inline">Create </span>Template
              </Button>
                </div>
              </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      {templateStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{templateStats.total_templates}</div>
              <p className="text-xs text-muted-foreground">Total Templates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{templateStats.recent_templates}</div>
              <p className="text-xs text-muted-foreground">Recent (7 days)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{templateStats.templates_by_language.length}</div>
              <p className="text-xs text-muted-foreground">Languages</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="text-destructive text-sm">{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Create Template Form - Only shown when creating */}
      {isCreating && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Create New Template</CardTitle>
              <Button variant="outline" size="sm" onClick={handleCancelEditing}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="template-name">Name *</Label>
                <Input
                  id="template-name"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate(prev => ({...prev, name: e.target.value}))}
                  placeholder="Enter template name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="template-language">Language *</Label>
                <Select 
                  value={editingTemplate.language} 
                  onValueChange={(value) => setEditingTemplate(prev => ({...prev, language: value}))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={editingTemplate.description}
                  onChange={(e) => setEditingTemplate(prev => ({...prev, description: e.target.value}))}
                  placeholder="Enter description (optional)"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Visible time */}
            <div>
              <Label htmlFor="visible-from">Visible Time (Optional)</Label>
              <div className="mt-1">
                <DateTimePicker
                  value={editingTemplate.visible_from}
                  onChange={(date) => setEditingTemplate(prev => ({...prev, visible_from: date}))}
                  placeholder="Pick when students can see this template"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Students see this template only from the selected date and time. Leave empty to make it visible immediately.
              </p>
              {editingTemplate.visible_from && editingTemplate.visible_from > new Date() && (
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1">
                  Scheduled — students will not see this lab until {editingTemplate.visible_from.toLocaleString()}. It stays listed here for you.
                </p>
              )}
            </div>

            {/* Submission deadline */}
            <div>
              <Label htmlFor="submission-deadline">Submission Deadline (Optional)</Label>
              <div className="mt-1">
                <DateTimePicker
                  value={editingTemplate.submission_deadline}
                  onChange={(date) => setEditingTemplate(prev => ({...prev, submission_deadline: date}))}
                  placeholder="Pick a submission deadline"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Set a deadline for when students can submit this template. Leave empty for no deadline.
                {editingTemplate.classroom_ids.length > 0 && !editingTemplate.submission_deadline && (
                  <span className="font-medium text-blue-600 dark:text-blue-400"> Setting a deadline will enable student-specific exclusions.</span>
                )}
              </p>
            </div>

            {/* Classroom Selection */}
            <div>
              <Label htmlFor="classroom-selection">Classroom Access</Label>
              <div className="mt-2 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Select classrooms that can access this template. Leave empty for global access.
                </p>
                <div className="space-y-2">
                  {availableClassrooms.map((classroom) => (
                    <div key={classroom.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`classroom-${classroom.id}`}
                        checked={editingTemplate.classroom_ids.includes(classroom.id)}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setEditingTemplate(prev => ({
                            ...prev,
                            classroom_ids: isChecked
                              ? [...prev.classroom_ids, classroom.id]
                              : prev.classroom_ids.filter(id => id !== classroom.id)
                          }));
                        }}
                        className="rounded border-gray-300"
                      />
                      <Label 
                        htmlFor={`classroom-${classroom.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {classroom.name} <span className="text-muted-foreground">({classroom.classroom_key})</span>
                      </Label>
                    </div>
                  ))}
                  {availableClassrooms.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      No classrooms available. This template will be globally accessible.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Show warning if exclusions exist but no classrooms selected */}
            {editingTemplate.classroom_ids.length === 0 && editingTemplate.exclusions.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Warning:</strong> This template has {editingTemplate.exclusions.length} student exclusion(s) but no classrooms are selected. 
                  Select classrooms to manage exclusions or they will be removed when saved.
                </p>
              </div>
            )}

            {/* Exclusion List (User-specific deadlines) */}
            {editingTemplate.classroom_ids.length > 0 && (
              <div>
                <Label>Exclusion List (Optional)</Label>
                <div className="mt-2 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Give specific students custom submission deadlines that override the general deadline.
                    {!editingTemplate.submission_deadline && (
                      <span className="font-medium text-amber-600 dark:text-amber-400"> Set a submission deadline above to add new exclusions.</span>
                    )}
                  </p>

                  {/* Current exclusions */}
                  {editingTemplate.exclusions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center">
                        <Users className="w-4 h-4 mr-2" />
                        Students with Custom Deadlines ({editingTemplate.exclusions.length})
                      </h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                        {editingTemplate.exclusions.map((exclusion) => (
                          <div key={exclusion.user_id} className="flex items-center gap-3 p-2 bg-white dark:bg-gray-800 rounded border">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{exclusion.username}</p>
                            </div>
                            <div className="flex-shrink-0">
                              <DateTimePicker
                                value={parseDate(exclusion.deadline) || new Date()}
                                onChange={(date) => date && updateExclusionDeadline(exclusion.user_id, date)}
                                placeholder="Custom deadline"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeUserFromExclusions(exclusion.user_id)}
                              className="flex-shrink-0"
                            >
                              <UserMinus className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add user to exclusions - Only show if deadline is set */}
                  {editingTemplate.submission_deadline && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Add Student to Exclusion List</h4>
                      {loadingUsers ? (
                        <p className="text-sm text-muted-foreground">Loading students...</p>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {getAvailableUsers()
                            .filter(user => !editingTemplate.exclusions.some(e => e.user_id === user.id))
                            .map((user) => (
                              <div key={user.id} className="flex items-center justify-between p-1.5 border rounded">
                                <div>
                                  <p className="text-sm font-medium">{user.username}</p>
                                  {user.first_name && user.last_name && (
                                    <p className="text-xs text-muted-foreground">{user.first_name} {user.last_name}</p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addUserToExclusions(user)}
                                >
                                  <UserPlus className="w-4 h-4 mr-1" />
                                  Add
                                </Button>
                              </div>
                            ))
                          }
                          {getAvailableUsers().filter(user => !editingTemplate.exclusions.some(e => e.user_id === user.id)).length === 0 && (
                            <p className="text-sm text-muted-foreground italic p-2">
                              {getAvailableUsers().length === 0 
                                ? "No students found in selected classrooms"
                                : "All students from selected classrooms have been added to exclusions"
                              }
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show notice when deadline is needed for adding new exclusions */}
                  {!editingTemplate.submission_deadline && editingTemplate.exclusions.length === 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>Note:</strong> Set a submission deadline above to add student-specific exclusions.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Code editor */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Code Content *</Label>
                {editingTemplate.description.includes('Uploaded from') && (
                  <Badge variant="secondary" className="text-xs">
                    <Upload className="w-3 h-3 mr-1" />
                    Loaded from file - Review and edit as needed
                  </Badge>
                )}
              </div>
              <div className="mt-2 border rounded-lg overflow-hidden">
                <div className="h-96">
                  <CodeEditor
                    language={editingTemplate.language}
                    value={editingTemplate.code_content}
                    onChange={(value) => setEditingTemplate(prev => ({...prev, code_content: value || ''}))}
                    theme="vs-dark"
                  />
                </div>
              </div>
            </div>

            {/* Save/Cancel buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
              {error && <p className="text-sm text-destructive sm:mr-auto">{error}</p>}
              <Button variant="outline" onClick={handleCancelEditing}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates list */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Templates</CardTitle>
            <div className="flex items-center gap-3">
              {filtersActive && (
                <span className="text-sm text-muted-foreground">
                  {filteredTemplates().length} of {templates.length} shown
                </span>
              )}
              {templatesTotal > templates.length && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {templates.length} of {templatesTotal} loaded
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() =>
                      loadTemplates(Math.floor(templates.length / templatePageSize) + 1)
                    }
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search name, description or author"
                className="pl-8"
              />
            </div>

            <Select value={filterClassroom} onValueChange={setFilterClassroom}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="All classrooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classrooms</SelectItem>
                {classroomFilterOptions().map(classroom => (
                  <SelectItem key={classroom.id} value={classroom.id.toString()}>
                    {classroom.name}
                  </SelectItem>
                ))}
                <SelectItem value="global">Global access</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterLanguage} onValueChange={setFilterLanguage}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="All languages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {supportedLanguages.map(lang => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterVisibility} onValueChange={setFilterVisibility}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Any visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any visibility</SelectItem>
                <SelectItem value="visible">Visible now</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No templates found. Create your first template to get started.
            </div>
          ) : filteredTemplates().length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No templates match these filters.
            </div>
          ) : (
            <div className="space-y-8">
              {templatesByClassroom().map((group) => (
                <div key={group.label} className="space-y-3">
                  {/* Classroom section heading */}
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {group.items.length}
                    </Badge>
                  </div>
                  <div className="space-y-4">
              {group.items.map((template) => (
                <div key={template.id} className="border rounded-lg">
                  {/* Template Header - Always visible */}
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-sm text-muted-foreground">
                          <Badge variant="secondary" className="shrink-0">{getLanguageLabel(template.language)}</Badge>
                          <span className="truncate">By: {template.creator_username}</span>
                          <span className="shrink-0">Created: {formatDate(template.created_at)}</span>
                          {template.submission_code && (
                            <button
                              type="button"
                              onClick={() => handleCopyCode(template.submission_code!, template.id)}
                              className="shrink-0 inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                              title="Submission code students need for their first hand-in — click to copy"
                            >
                              <KeyRound className="w-3 h-3" />
                              {template.submission_code}
                              {copiedCode === template.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-60" />
                              )}
                            </button>
                          )}
                          {isScheduled(template) && (
                            <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                              <Clock className="w-3 h-3 mr-1" />
                              Visible {formatDateTime(template.visible_from)}
                            </Badge>
                          )}
                          {template.submission_deadline && (
                            <Badge variant="outline" className="shrink-0">
                              <Clock className="w-3 h-3 mr-1" />
                              Due {formatDateTime(template.submission_deadline)}
                            </Badge>
                          )}
                        </div>
                        {/* Classroom assignment is shown by the section heading above */}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyTemplate(template)}
                          title="Copy template"
                        >
                          {copied === template.id ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadTemplate(template)}
                          title="Download template"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant={editingId === template.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleStartEditing(template)}
                          title={editingId === template.id ? "Cancel editing" : "Edit template"}
                        >
                          {editingId === template.id ? (
                            <X className="w-4 h-4" />
                          ) : (
                            <Edit className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteClick(template)}
                          title="Delete template"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Inline Edit Form - Only shown when editing this specific template */}
                  {editingId === template.id && (
                    <div className="border-t bg-muted/20 p-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium">Edit Template</h4>
                          <Button variant="ghost" size="sm" onClick={handleCancelEditing}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        {/* Template metadata - simplified for inline editing */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`edit-name-${template.id}`}>Name *</Label>
                            <Input
                              id={`edit-name-${template.id}`}
                              value={editingTemplate.name}
                              onChange={(e) => setEditingTemplate(prev => ({...prev, name: e.target.value}))}
                              placeholder="Enter template name"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`edit-description-${template.id}`}>Description</Label>
                            <Input
                              id={`edit-description-${template.id}`}
                              value={editingTemplate.description}
                              onChange={(e) => setEditingTemplate(prev => ({...prev, description: e.target.value}))}
                              placeholder="Enter description (optional)"
                              className="mt-1"
                            />
                          </div>
                        </div>

                        {/* Language Selection */}
                        <div>
                          <Label htmlFor={`edit-language-${template.id}`}>Language *</Label>
                          <Select 
                            value={editingTemplate.language} 
                            onValueChange={(value) => setEditingTemplate(prev => ({...prev, language: value}))}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {supportedLanguages.map((lang) => (
                                <SelectItem key={lang.value} value={lang.value}>
                                  {lang.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Visible time */}
                        <div>
                          <Label htmlFor={`edit-visible-from-${template.id}`}>Visible Time (Optional)</Label>
                          <div className="mt-1">
                            <DateTimePicker
                              value={editingTemplate.visible_from}
                              onChange={(date) => setEditingTemplate(prev => ({...prev, visible_from: date}))}
                              placeholder="Pick when students can see this template"
                            />
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Students see this template only from the selected date and time. Leave empty to make it visible immediately.
                          </p>
                          {editingTemplate.visible_from && editingTemplate.visible_from > new Date() && (
                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1">
                              Scheduled — students will not see this lab until {editingTemplate.visible_from.toLocaleString()}. It stays listed here for you.
                            </p>
                          )}
                        </div>

                        {/* Submission deadline */}
                        <div>
                          <Label htmlFor={`edit-deadline-${template.id}`}>Submission Deadline (Optional)</Label>
                          <div className="mt-1">
                            <DateTimePicker
                              value={editingTemplate.submission_deadline}
                              onChange={(date) => setEditingTemplate(prev => ({...prev, submission_deadline: date}))}
                              placeholder="Pick a submission deadline"
                            />
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Set a deadline for when students can submit this template. Leave empty for no deadline.
                            {editingTemplate.classroom_ids.length > 0 && !editingTemplate.submission_deadline && (
                              <span className="font-medium text-blue-600 dark:text-blue-400"> Setting a deadline will enable student-specific exclusions.</span>
                            )}
                          </p>
                        </div>

                        {/* Classroom Selection */}
                        <div>
                          <Label htmlFor={`edit-classrooms-${template.id}`}>Classroom Access</Label>
                          <div className="mt-2 space-y-2">
                            <p className="text-sm text-muted-foreground">
                              Select classrooms that can access this template. Leave empty for global access.
                            </p>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {availableClassrooms.map((classroom) => (
                                <div key={classroom.id} className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    id={`edit-classroom-${template.id}-${classroom.id}`}
                                    checked={editingTemplate.classroom_ids.includes(classroom.id)}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      setEditingTemplate(prev => ({
                                        ...prev,
                                        classroom_ids: isChecked
                                          ? [...prev.classroom_ids, classroom.id]
                                          : prev.classroom_ids.filter(id => id !== classroom.id)
                                      }));
                                    }}
                                    className="rounded border-gray-300"
                                  />
                                  <Label 
                                    htmlFor={`edit-classroom-${template.id}-${classroom.id}`}
                                    className="text-sm font-normal cursor-pointer"
                                  >
                                    {classroom.name} <span className="text-muted-foreground">({classroom.classroom_key})</span>
                                  </Label>
                                </div>
                              ))}
                              {availableClassrooms.length === 0 && (
                                <p className="text-sm text-muted-foreground italic">
                                  No classrooms available. This template will be globally accessible.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Show warning if exclusions exist but no classrooms selected */}
                        {editingTemplate.classroom_ids.length === 0 && editingTemplate.exclusions.length > 0 && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                              <strong>Warning:</strong> This template has {editingTemplate.exclusions.length} student exclusion(s) but no classrooms are selected. 
                              Select classrooms to manage exclusions or they will be removed when saved.
                            </p>
                          </div>
                        )}

                        {/* Exclusion List (User-specific deadlines) */}
                        {editingTemplate.classroom_ids.length > 0 && (
                          <div>
                            <Label>Exclusion List (Optional)</Label>
                            <div className="mt-2 space-y-3">
                              <p className="text-sm text-muted-foreground">
                                Give specific students custom submission deadlines that override the general deadline.
                                {!editingTemplate.submission_deadline && (
                                  <span className="font-medium text-amber-600 dark:text-amber-400"> Set a submission deadline above to add new exclusions.</span>
                                )}
                              </p>

                              {/* Current exclusions */}
                              {editingTemplate.exclusions.length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium flex items-center">
                                    <Users className="w-4 h-4 mr-2" />
                                    Students with Custom Deadlines ({editingTemplate.exclusions.length})
                                  </h4>
                                  <div className="space-y-1.5 max-h-56 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    {editingTemplate.exclusions.map((exclusion) => (
                                      <div key={exclusion.user_id} className="flex items-center gap-3 p-1.5 bg-white dark:bg-gray-800 rounded border">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{exclusion.username}</p>
                                        </div>
                                        <div className="flex-shrink-0">
                                          <DateTimePicker
                                            value={parseDate(exclusion.deadline) || new Date()}
                                            onChange={(date) => date && updateExclusionDeadline(exclusion.user_id, date)}
                                            placeholder="Custom deadline"
                                          />
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => removeUserFromExclusions(exclusion.user_id)}
                                          className="flex-shrink-0"
                                        >
                                          <UserMinus className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Add user to exclusions - Only show if deadline is set */}
                              {editingTemplate.submission_deadline && (
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium">Add Student to Exclusion List</h4>
                                  {loadingUsers ? (
                                    <p className="text-sm text-muted-foreground">Loading students...</p>
                                  ) : (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {getAvailableUsers()
                                        .filter(user => !editingTemplate.exclusions.some(e => e.user_id === user.id))
                                        .map((user) => (
                                          <div key={user.id} className="flex items-center justify-between p-1.5 border rounded">
                                            <div>
                                              <p className="text-sm font-medium">{user.username}</p>
                                              {user.first_name && user.last_name && (
                                                <p className="text-xs text-muted-foreground">{user.first_name} {user.last_name}</p>
                                              )}
                                            </div>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => addUserToExclusions(user)}
                                            >
                                              <UserPlus className="w-4 h-4 mr-1" />
                                              Add
                                            </Button>
                                          </div>
                                        ))
                                      }
                                      {getAvailableUsers().filter(user => !editingTemplate.exclusions.some(e => e.user_id === user.id)).length === 0 && (
                                        <p className="text-sm text-muted-foreground italic p-2">
                                          {getAvailableUsers().length === 0 
                                            ? "No students found in selected classrooms"
                                            : "All students from selected classrooms have been added to exclusions"
                                          }
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Show notice when deadline is needed for adding new exclusions */}
                              {!editingTemplate.submission_deadline && editingTemplate.exclusions.length === 0 && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                  <p className="text-sm text-blue-800 dark:text-blue-200">
                                    <strong>Note:</strong> Set a submission deadline above to add student-specific exclusions.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Code Editor */}
                        <div>
                          <Label>Code Content *</Label>
                          <div className="mt-2 border rounded-lg overflow-hidden">
                            <div className="h-64">
                              <CodeEditor
                                language={editingTemplate.language}
                                value={editingTemplate.code_content}
                                onChange={(value) => setEditingTemplate(prev => ({...prev, code_content: value || ''}))}
                                theme="vs-dark"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Save/Cancel buttons */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-4 border-t">
                          {error && <p className="text-sm text-destructive sm:mr-auto">{error}</p>}
                          <Button variant="outline" onClick={handleCancelEditing}>
                            Cancel
                          </Button>
                          <Button onClick={handleSave} disabled={saving}>
                            <Save className="w-4 h-4 mr-2" />
                            {saving ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete the template "{templateToDelete?.name}"? This action cannot be undone.
            </p>
            
            {templateToDelete && (
              <div className="bg-muted p-3 rounded-lg">
                <div className="text-sm">
                  <div className="font-medium">{templateToDelete.name}</div>
                  <div className="text-muted-foreground mt-1">
                    <Badge variant="secondary" className="mr-2">{getLanguageLabel(templateToDelete.language)}</Badge>
                    Created by {templateToDelete.creator_username}
                  </div>
                  {templateToDelete.description && (
                    <div className="text-muted-foreground text-xs mt-2 line-clamp-2">
                      {templateToDelete.description}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={handleCancelDelete}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete Template'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
