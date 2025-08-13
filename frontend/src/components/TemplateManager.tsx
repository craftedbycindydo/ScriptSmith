import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import CodeEditor from './CodeEditor';
import { apiService } from '@/services/api';
import type { TemplateCreate, TemplateUpdate, TemplateListItem, TemplateStats } from '@/services/api';
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
  MoreHorizontal
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
};

const defaultTemplate: EditingTemplate = {
  id: null,
  name: '',
  description: '',
  language: 'python',
  code_content: ''
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
  
  // State
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [templateStats, setTemplateStats] = useState<TemplateStats | null>(null);
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

  useEffect(() => {
    loadTemplates();
    loadTemplateStats();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await apiService.getAllTemplatesAdmin();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      setTemplates([]);
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

  const handleStartCreating = () => {
    setEditingTemplate(defaultTemplate);
    setEditingId(null);
    setIsCreating(true);
    setError(null);
  };

  const handleStartEditing = async (template: TemplateListItem) => {
    try {
      // Load full template data
      const fullTemplate = await apiService.getTemplateAdmin(template.id);
      setEditingTemplate({
        id: fullTemplate.id,
        name: fullTemplate.name,
        description: fullTemplate.description || '',
        language: fullTemplate.language,
        code_content: fullTemplate.code_content
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

    setSaving(true);
    setError(null);

    try {
      if (isCreating) {
        // Create new template
        const templateData: TemplateCreate = {
          name: editingTemplate.name.trim(),
          description: editingTemplate.description.trim() || undefined,
          language: editingTemplate.language,
          code_content: editingTemplate.code_content
        };
        await apiService.createTemplate(templateData);
      } else if (editingId) {
        // Update existing template
        const updateData: TemplateUpdate = {
          name: editingTemplate.name.trim(),
          description: editingTemplate.description.trim() || undefined,
          code_content: editingTemplate.code_content
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

  const handleDelete = async (templateId: number) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      await apiService.deleteTemplate(templateId);
      await loadTemplates();
      await loadTemplateStats();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete template');
    }
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
        code_content: fileContent
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
        code_content: fullTemplate.code_content
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

  const getLanguageLabel = (language: string) => {
    return supportedLanguages.find(l => l.value === language)?.label || language;
  };

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

      {/* Editor section - shown when creating or editing */}
      {(isCreating || editingId !== null) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {isCreating ? 'Create New Template' : 'Edit Template'}
              </CardTitle>
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

            {/* Code editor */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Code Content *</Label>
                {isCreating && editingTemplate.description.includes('Uploaded from') && (
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
            <div className="flex justify-end gap-2">
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
        <CardHeader>
          <CardTitle>Templates</CardTitle>
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
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <div key={template.id} className="border rounded-lg p-4">
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
                      </div>
                    </div>
                    
                    {/* Desktop Actions */}
                    <div className="hidden sm:flex gap-1 shrink-0">
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
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartEditing(template)}
                        title="Edit template"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                        title="Delete template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Mobile Actions Dropdown */}
                    <div className="flex sm:hidden">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleCopyTemplate(template)}>
                            {copied === template.id ? (
                              <Check className="w-4 h-4 mr-2" />
                            ) : (
                              <Copy className="w-4 h-4 mr-2" />
                            )}
                            Copy Template
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadTemplate(template)}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStartEditing(template)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Template
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(template.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Template
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
