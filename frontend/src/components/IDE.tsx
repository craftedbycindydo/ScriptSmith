import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CodeEditor from './CodeEditor';
import LanguageSelector from './LanguageSelector';
import OutputConsole from './OutputConsole';
import ComplexityAnalysis from './ComplexityAnalysis';
import ResizablePanels from './ResizablePanels';

import { useCodeStore } from '@/store/codeStore';
import { useAuthStore } from '@/store/authStore';
import { useAdminSettingsStore } from '@/store/adminSettingsStore';
import { apiService } from '@/services/api';
import { Play, Save, Download, Share2, Users, Send, CheckCircle } from 'lucide-react';

export default function IDE() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const {
    settings: adminSettings,
    loadSettings: loadAdminSettings,
    initializeWebSocket,
    disconnectWebSocket
  } = useAdminSettingsStore();
  const {
    code,
    language,
    languages,
    output,
    error,
    isLoading,
    executionTime,
    complexity,
    setCode,
    setLanguage,
    loadLanguages,
    executeCode,
    setSelectedTemplate
  } = useCodeStore();

  const [showShareForm, setShowShareForm] = useState(false);
  const [shareLink, setShareLink] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  
  // Download form state
  const [showDownloadForm, setShowDownloadForm] = useState(false);
  const [downloadFilename, setDownloadFilename] = useState('code');

  // Template state
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  
  // User template state
  const [userTemplates, setUserTemplates] = useState<any[]>([]);
  const [loadingUserTemplates, setLoadingUserTemplates] = useState(false);
  
  // Selected template tracking state
  const [selectedAdminTemplate, setSelectedAdminTemplate] = useState<string>('');
  const [selectedUserTemplate, setSelectedUserTemplate] = useState<string>('');
  const [selectedAdminTemplateName, setSelectedAdminTemplateName] = useState<string>('');
  const [selectedUserTemplateName, setSelectedUserTemplateName] = useState<string>('');
  
  // Submit functionality state
  const [canSubmit, setCanSubmit] = useState<boolean>(false);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [showRunFirstModal, setShowRunFirstModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [hasExecutedCode, setHasExecutedCode] = useState<boolean>(false);
  const [lastExecutionResult, setLastExecutionResult] = useState<any>(null);
  
  // Save template inline form state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Load languages and admin settings on component mount
  useEffect(() => {
    loadLanguages();
    loadAdminSettings(isAuthenticated);
    
    // Initialize WebSocket for all authenticated users with classroom context
    if (isAuthenticated && user) {
      const classroomIds = user.classroom_context?.classrooms?.map((c: any) => c.id) || [];
      initializeWebSocket(user.id, classroomIds);
    }
    
    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [loadLanguages, isAuthenticated, user]);

  // Load templates when language changes (for authenticated users only)
  useEffect(() => {
    if (isAuthenticated && language) {
      loadTemplatesForLanguage(language);
      loadUserTemplatesForLanguage(language);
      // Clear selected templates when language changes
      setSelectedAdminTemplate('');
      setSelectedAdminTemplateName('');
      setSelectedUserTemplate('');
      setSelectedUserTemplateName('');
    }
  }, [language, isAuthenticated]);

  // Reset execution state when code changes or template changes
  useEffect(() => {
    // Reset execution tracking when code changes
    setHasExecutedCode(false);
    setLastExecutionResult(null);
  }, [code, selectedAdminTemplate, selectedUserTemplate]);

  // Load templates for current language
  const loadTemplatesForLanguage = async (lang: string) => {
    setLoadingTemplates(true);
    try {
      const templateList = await apiService.getTemplates(lang);
      setTemplates(Array.isArray(templateList) ? templateList : []);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Load user templates for current language
  const loadUserTemplatesForLanguage = async (lang: string) => {
    setLoadingUserTemplates(true);
    try {
      const userTemplateList = await apiService.getUserTemplates(lang);
      setUserTemplates(Array.isArray(userTemplateList) ? userTemplateList : []);
    } catch (error) {
      console.error('Failed to load user templates:', error);
      setUserTemplates([]);
    } finally {
      setLoadingUserTemplates(false);
    }
  };

  // Handle template selection
  const handleTemplateSelect = async (templateId: string) => {
    if (templateId === 'clear-admin' || templateId === '' || !templateId || templateId === 'no-templates') {
      setSelectedTemplate(null);
      setSelectedAdminTemplate('');
      setSelectedAdminTemplateName('');
      setCanSubmit(false);
      setHasSubmitted(false);
      // Only clear user template if this is a clear action, not if there are no templates
      if (templateId === 'clear-admin') {
        setSelectedUserTemplate('');
        setSelectedUserTemplateName('');
      }
      return;
    }
    
    try {
      const template = await apiService.getTemplate(parseInt(templateId));
      if (template && template.code_content) {
        setCode(template.code_content);
        setSelectedTemplate(parseInt(templateId));
        setSelectedAdminTemplate(templateId);
        setSelectedAdminTemplateName(template.name || 'Untitled Template');
        // Clear user template selection
        setSelectedUserTemplate('');
        setSelectedUserTemplateName('');
        
        // Check submission status
        setCanSubmit(template.can_submit || false);
        setHasSubmitted(!!template.user_submission);
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      setSelectedTemplate(null);
      setCanSubmit(false);
      setHasSubmitted(false);
    }
  };

  // Handle user template selection
  const handleUserTemplateSelect = async (templateId: string) => {
    if (templateId === 'clear-user' || templateId === '' || !templateId || templateId === 'no-user-templates') {
      setSelectedUserTemplate('');
      setSelectedUserTemplateName('');
      return;
    }
    
    try {
      const template = await apiService.getUserTemplate(parseInt(templateId));
      if (template && template.code_content) {
        setCode(template.code_content);
        setSelectedUserTemplate(templateId);
        setSelectedUserTemplateName(template.name || 'Untitled Template');
        // Clear admin template selection and submission state
        setSelectedAdminTemplate('');
        setSelectedAdminTemplateName('');
        setCanSubmit(false);
        setHasSubmitted(false);
      }
    } catch (error) {
      console.error('Failed to load user template:', error);
    }
  };

  const handleRunCode = async () => {
    try {
      await executeCode();
      // Mark that code has been executed and capture the result
      setHasExecutedCode(true);
      setLastExecutionResult({
        output,
        error,
        execution_time: executionTime,
        status: error ? 'error' : 'success'
      });
    } catch (err) {
      setHasExecutedCode(true);
      setLastExecutionResult({
        output: '',
        error: String(err),
        execution_time: 0,
        status: 'error'
      });
    }
  };

  const handleSubmitTemplate = () => {
    if (!selectedAdminTemplate) return;
    
    // Check if code has been executed
    if (!hasExecutedCode) {
      setShowRunFirstModal(true);
      return;
    }
    
    setShowSubmitModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedAdminTemplate || !hasExecutedCode) return;
    
    setSubmitting(true);
    try {
      await apiService.submitTemplate(parseInt(selectedAdminTemplate), {
        code_content: code,
        execution_output: lastExecutionResult?.output || output,
        execution_status: lastExecutionResult?.status || (error ? 'error' : 'success'),
        execution_time: lastExecutionResult?.execution_time || executionTime,
        error_message: lastExecutionResult?.error || error
      });
      
      // Refresh template data to get updated submission status
      const refreshedTemplate = await apiService.getTemplate(parseInt(selectedAdminTemplate));
      if (refreshedTemplate) {
        setCanSubmit(refreshedTemplate.can_submit || false);
        setHasSubmitted(!!refreshedTemplate.user_submission);
      }
      setShowSubmitModal(false);
    } catch (error) {
      console.error('Failed to submit template:', error);
      alert('Failed to submit template. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = () => {
    setShowSubmitModal(false);
  };

  const handleCloseRunFirstModal = () => {
    setShowRunFirstModal(false);
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      console.log('User must be authenticated to save templates');
      return;
    }
    // Close other forms if open, then toggle save form
    if (showShareForm) {
      setShowShareForm(false);
      setShareLink('');
      setLinkCopied(false);
    }
    if (showDownloadForm) {
      setShowDownloadForm(false);
      setDownloadFilename('code');
    }
    setShowSaveForm(!showSaveForm);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !code.trim()) {
      console.error('Template name and code are required');
      return;
    }

    setSaving(true);
    try {
      await apiService.createUserTemplate({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        language: language,
        code_content: code
      });
      
      // Reload user templates
      await loadUserTemplatesForLanguage(language);
      
      // Close form and reset
      setShowSaveForm(false);
      setTemplateName('');
      setTemplateDescription('');
      
      console.log('Template saved successfully');
    } catch (error: any) {
      console.error('Failed to save template:', error.response?.data?.detail || error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSave = () => {
    setShowSaveForm(false);
    setTemplateName('');
    setTemplateDescription('');
  };

  const handleDownload = () => {
    // Close other forms if open
    if (showSaveForm) {
      setShowSaveForm(false);
    }
    if (showShareForm) {
      setShowShareForm(false);
      setShareLink('');
      setLinkCopied(false);
    }
    
    // Reset filename to default and show form
    setDownloadFilename('code');
    setShowDownloadForm(!showDownloadForm);
  };

  const handleDownloadFile = () => {
    const filename = downloadFilename.trim() || 'code';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${getFileExtension(language)}`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Close form after download
    setShowDownloadForm(false);
  };

  const handleCancelDownload = () => {
    setShowDownloadForm(false);
    setDownloadFilename('code');
  };

  const handleCreateShare = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Close other forms if open
    if (showSaveForm) {
      setShowSaveForm(false);
    }
    if (showDownloadForm) {
      setShowDownloadForm(false);
      setDownloadFilename('code');
    }

    setCreating(true);
    try {
      console.log('🔄 Creating collaboration session with code:', { 
        language, 
        codeLength: code.length,
        codePreview: code.substring(0, 100)
      });
      
      const session = await apiService.createSession({
        title: `${user?.username || 'Anonymous'}'s ${language} session`,
        description: `Collaborative coding session`,
        language: language,
        is_public: false,
        max_collaborators: 10,
        initial_code: code
      });
      
      console.log('✅ Session created:', session);

      const url = `${window.location.origin}/collab/${session.share_id}`;
      setShareLink(url);
      setShowShareForm(true);
    } catch (error) {
      console.error('Failed to create collaborative session:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleCancelShare = () => {
    setShowShareForm(false);
    setShareLink('');
    setLinkCopied(false);
  };



  const getFileExtension = (lang: string): string => {
    const extensions: Record<string, string> = {
      python: 'py',
      javascript: 'js',
      typescript: 'ts',
      java: 'java',
      cpp: 'cpp',
      go: 'go',
      rust: 'rs',
    };
    return extensions[lang] || 'txt';
  };

  // Check if copy-paste should be disabled for this user
  // Use server-validated admin status from user object (no API call needed)
  const userIsAdmin = user?.is_admin || false;

  // Determine if copy-paste should be disabled
  const copyPasteDisabled = !adminSettings.copy_paste_enabled && !userIsAdmin;



  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b bg-card flex-shrink-0">
        <div className="px-4 py-3 md:px-6 lg:px-8">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between space-y-3 xl:space-y-0 xl:space-x-6">
            {/* Language and Template selectors */}
            <div className="w-full lg:w-auto">
              {/* Mobile: Compact grid layout */}
              <div className="grid grid-cols-3 gap-1.5 lg:hidden">
                {/* Language selector */}
                <div className="col-span-1">
                  <LanguageSelector
                    selectedLanguage={language}
                    languages={languages}
                    onLanguageChange={setLanguage}
                  />
                </div>
                
                {/* Template selectors - only for authenticated users */}
                {isAuthenticated && (
                  <>
                    <div className="col-span-1">
                      <Select onValueChange={handleTemplateSelect} value={selectedAdminTemplate}>
                        <SelectTrigger 
                          size="sm" 
                          disabled={loadingTemplates}
                          className="w-full"
                        >
                          <SelectValue placeholder={loadingTemplates ? "Loading..." : selectedAdminTemplateName || "Professor Templates"} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedAdminTemplateName && (
                            <SelectItem value="clear-admin">
                              <span className="text-muted-foreground">Clear selection</span>
                            </SelectItem>
                          )}
                          {!templates || templates.length === 0 ? (
                            <SelectItem value="no-templates" disabled>
                              No professor templates available
                            </SelectItem>
                          ) : (
                            templates.map((template) => template && template.id ? (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name || 'Untitled Template'}
                                {template.description && (
                                  <span className="text-muted-foreground text-xs ml-1">
                                    - {template.description}
                                  </span>
                                )}
                              </SelectItem>
                            ) : null)
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="col-span-1">
                      <Select onValueChange={handleUserTemplateSelect} value={selectedUserTemplate}>
                        <SelectTrigger 
                          size="sm" 
                          disabled={loadingUserTemplates}
                          className="w-full"
                        >
                          <SelectValue placeholder={loadingUserTemplates ? "Loading..." : selectedUserTemplateName || "My Templates"} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedUserTemplateName && (
                            <SelectItem value="clear-user">
                              <span className="text-muted-foreground">Clear selection</span>
                            </SelectItem>
                          )}
                          {!userTemplates || userTemplates.length === 0 ? (
                            <SelectItem value="no-user-templates" disabled>
                              No personal templates saved
                            </SelectItem>
                          ) : (
                            userTemplates.map((template) => template && template.id ? (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name || 'Untitled Template'}
                                {template.description && (
                                  <span className="text-muted-foreground text-xs ml-1">
                                    - {template.description}
                                  </span>
                                )}
                              </SelectItem>
                            ) : null)
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                
                {/* Fill empty space when not authenticated */}
                {!isAuthenticated && (
                  <>
                    <div className="col-span-1"></div>
                    <div className="col-span-1"></div>
                  </>
                )}
              </div>

              {/* Desktop: Original horizontal layout */}
              <div className="hidden lg:flex lg:items-center lg:space-x-4">
                {/* Language selector */}
                <div className="min-w-[200px]">
                  <LanguageSelector
                    selectedLanguage={language}
                    languages={languages}
                    onLanguageChange={setLanguage}
                  />
                </div>
                
                {/* Template selector - only for authenticated users */}
                {isAuthenticated && (
                  <div className="flex items-center gap-4">
                    <div className="max-w-[220px]">
                      <Select onValueChange={handleTemplateSelect} value={selectedAdminTemplate}>
                        <SelectTrigger 
                          size="sm" 
                          disabled={loadingTemplates}
                          className="w-full"
                        >
                          <SelectValue placeholder={loadingTemplates ? "Loading..." : selectedAdminTemplateName || "Professor Templates"} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedAdminTemplateName && (
                            <SelectItem value="clear-admin">
                              <span className="text-muted-foreground">Clear selection</span>
                            </SelectItem>
                          )}
                          {!templates || templates.length === 0 ? (
                            <SelectItem value="no-templates" disabled>
                              No professor templates available
                            </SelectItem>
                          ) : (
                            templates.map((template) => template && template.id ? (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name || 'Untitled Template'}
                                {template.description && (
                                  <span className="text-muted-foreground text-xs ml-1">
                                    - {template.description}
                                  </span>
                                )}
                              </SelectItem>
                            ) : null)
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="max-w-[220px]">
                      <Select onValueChange={handleUserTemplateSelect} value={selectedUserTemplate}>
                        <SelectTrigger 
                          size="sm" 
                          disabled={loadingUserTemplates}
                          className="w-full"
                        >
                          <SelectValue placeholder={loadingUserTemplates ? "Loading..." : selectedUserTemplateName || "My Templates"} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedUserTemplateName && (
                            <SelectItem value="clear-user">
                              <span className="text-muted-foreground">Clear selection</span>
                            </SelectItem>
                          )}
                          {!userTemplates || userTemplates.length === 0 ? (
                            <SelectItem value="no-user-templates" disabled>
                              No personal templates saved
                            </SelectItem>
                          ) : (
                            userTemplates.map((template) => template && template.id ? (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name || 'Untitled Template'}
                                {template.description && (
                                  <span className="text-muted-foreground text-xs ml-1">
                                    - {template.description}
                                  </span>
                                )}
                              </SelectItem>
                            ) : null)
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center space-x-2 lg:space-x-3 xl:space-x-4 flex-wrap gap-1 sm:gap-0 lg:gap-0">
              <Button
                onClick={handleRunCode}
                disabled={isLoading}
                className="btn-success flex sm:inline-flex"
                size="sm"
              >
                <Play className="w-4 h-4 mr-1 lg:mr-2" />
                <span className="hidden sm:inline">{isLoading ? 'Running...' : 'Run'}</span>
                <span className="sm:hidden">{isLoading ? '...' : 'Run'}</span>
              </Button>

              {/* Submit button for admin templates */}
              {isAuthenticated && selectedAdminTemplate && (
                <Button
                  onClick={handleSubmitTemplate}
                  disabled={!canSubmit}
                  variant={hasSubmitted && !canSubmit ? "secondary" : "default"}
                  size="sm"
                  className="flex sm:inline-flex"
                  title={(hasSubmitted && canSubmit) ? 'You can submit once more (you have an exclusion)' : ''}
                >
                  {hasSubmitted && !canSubmit ? (
                    <CheckCircle className="w-4 h-4 mr-1 sm:mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-1 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">
                    {hasSubmitted && !canSubmit ? 'Submitted' : 
                     hasSubmitted && canSubmit ? 'Submit Again' : 'Submit'}
                  </span>
                  <span className="sm:hidden">
                    {hasSubmitted && !canSubmit ? 'Done' : 
                     hasSubmitted && canSubmit ? 'Again' : 'Submit'}
                  </span>
                </Button>
              )}

              {/* Authenticated user features */}
              {isAuthenticated && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCreateShare}
                  disabled={creating}
                  className="flex sm:inline-flex"
                >
                  <Share2 className="w-4 h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{creating ? 'Creating...' : 'Share'}</span>
                  <span className="sm:hidden">Share</span>
                </Button>
              )}

              {/* Save button - visible on mobile with text */}
              {isAuthenticated && (
                <Button variant="outline" onClick={handleSave} size="sm" className="flex sm:inline-flex">
                  <Save className="w-4 h-4 mr-2" />
                  <span>Save</span>
                </Button>
              )}
              
              {/* Download button - visible on mobile with text */}
              <Button variant="outline" onClick={handleDownload} size="sm" className="flex sm:inline-flex">
                <Download className="w-4 h-4 mr-2" />
                <span>Download</span>
              </Button>
            </div>
          </div>
        </div>
        
        {/* Save Template Form - Collapsible section between toolbar and content */}
        {showSaveForm && (
          <div className="bg-muted/20 border-b border-border/50 overflow-hidden animate-in slide-in-from-top-2 duration-300">
            <div className="px-4 py-3 md:px-6 lg:px-8">
              <div className="relative">
                {/* Chat bubble arrow pointing up - positioned within the section to avoid overlap */}
                <div className="absolute -top-1 right-20 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-muted/20"></div>
                
                <div className="bg-card border border-border/50 rounded-lg shadow-sm">
                  <div className="px-4 py-4 md:px-6 lg:px-8">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
                      <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                        <Save className="w-4 h-4" />
                        Save as Template
                      </div>
                      
                      <div className="flex flex-col sm:flex-row lg:flex-row items-start sm:items-center lg:items-center gap-3 sm:gap-4 lg:gap-6 w-full lg:flex-1">
                        <div className="w-full sm:flex-1 lg:flex-1 max-w-xs lg:max-w-sm">
                          <Input
                            type="text"
                            placeholder="Template name"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="h-9 text-sm w-full"
                            autoFocus
                          />
                        </div>
                        
                        <div className="w-full sm:flex-1 lg:flex-1 max-w-xs lg:max-w-md">
                          <Input
                            type="text"
                            placeholder="Description (optional)"
                            value={templateDescription}
                            onChange={(e) => setTemplateDescription(e.target.value)}
                            className="h-9 text-sm w-full"
                          />
                        </div>
                        
                        <div className="flex items-center justify-center text-xs text-muted-foreground px-3 py-2 bg-muted/50 rounded-md min-w-[80px] lg:min-w-[100px]">
                          <span className="font-medium">{language}</span>
                        </div>
                        
                        <div className="flex items-center gap-3 w-full sm:w-auto lg:w-auto">
                          <Button 
                            onClick={handleSaveTemplate} 
                            disabled={saving || !templateName.trim()}
                            size="sm"
                            className="h-9 px-6 flex-1 sm:flex-none lg:flex-none"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </Button>
                          
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleCancelSave}
                            className="h-9 w-9 p-0"
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Share Form - Collapsible section for sharing collaborative sessions */}
        {showShareForm && (
          <div className="bg-muted/20 border-b border-border/50 overflow-hidden animate-in slide-in-from-top-2 duration-300">
            <div className="px-4 py-3 md:px-6 lg:px-8">
              <div className="relative">
                {/* Chat bubble arrow pointing up */}
                <div className="absolute -top-1 right-20 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-muted/20"></div>
                
                <div className="bg-card border border-border/50 rounded-lg shadow-sm">
                  <div className="px-4 py-4 md:px-6 lg:px-8">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
                      <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                        <Share2 className="w-4 h-4" />
                        Share Collaborative Session
                      </div>
                      
                      <div className="flex flex-col sm:flex-row lg:flex-row items-start sm:items-center lg:items-center gap-3 sm:gap-4 lg:gap-6 w-full lg:flex-1">
                        <div className="w-full sm:flex-1 lg:flex-1">
                          <Input
                            type="text"
                            value={shareLink}
                            readOnly
                            className="h-9 text-sm w-full font-mono text-xs"
                            placeholder="Share link will appear here..."
                          />
                        </div>
                        
                        <div className="flex items-center gap-3 w-full sm:w-auto lg:w-auto">
                          <Button 
                            onClick={handleCopyShareLink} 
                            disabled={!shareLink}
                            size="sm"
                            className="h-9 px-6 flex-1 sm:flex-none lg:flex-none"
                          >
                            {linkCopied ? 'Copied!' : 'Copy Link'}
                          </Button>
                          
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleCancelShare}
                            className="h-9 w-9 p-0"
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <div className="text-xs text-muted-foreground">
                        <div className="flex items-center space-x-2 mb-2">
                          <Users className="w-4 h-4" />
                          <span className="font-medium">Collaboration Features:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 ml-6 text-xs">
                          <li>Real-time collaborative editing</li>
                          <li>Live cursor tracking with usernames</li>
                          <li>Shared code execution</li>
                          <li>Up to 10 collaborators</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Download Form - Collapsible section for custom filename download */}
        {showDownloadForm && (
          <div className="bg-muted/20 border-b border-border/50 overflow-hidden animate-in slide-in-from-top-2 duration-300">
            <div className="px-4 py-3 md:px-6 lg:px-8">
              <div className="relative">
                {/* Chat bubble arrow pointing up */}
                <div className="absolute -top-1 right-20 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-muted/20"></div>
                
                <div className="bg-card border border-border/50 rounded-lg shadow-sm">
                  <div className="px-4 py-4 md:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                      <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                        <Download className="w-4 h-4" />
                        Download Code
                      </div>
                      
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="text"
                          placeholder="Enter filename"
                          value={downloadFilename}
                          onChange={(e) => setDownloadFilename(e.target.value)}
                          className="h-9 text-sm flex-1"
                          autoFocus
                        />
                        
                        <div className="flex items-center justify-center text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded text-nowrap">
                          <span className="font-medium">.{getFileExtension(language)}</span>
                        </div>
                        
                        <Button 
                          onClick={handleDownloadFile} 
                          disabled={!downloadFilename.trim()}
                          size="sm"
                          className="h-9 px-4"
                        >
                          Download
                        </Button>
                        
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleCancelDownload}
                          className="h-9 w-9 p-0"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content - Full Width Resizable Panels */}
      <div className="flex-1 overflow-hidden p-2 md:p-4 bg-muted/5">
        <ResizablePanels
          defaultLeftWidth={65}
          minLeftWidth={40}
          minRightWidth={25}
          leftPanel={
            <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm md:mr-2">
              <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Code Editor</h3>
                  {copyPasteDisabled && (
                    <div className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded">
                      Copy-paste disabled
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-hidden rounded-b-lg">
                <CodeEditor
                  language={language}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  copyPasteDisabled={copyPasteDisabled}
                />
              </div>
            </div>
          }
          rightPanel={
            <div className="h-full md:ml-2">
              <ResizablePanels
                orientation="vertical"
                defaultLeftWidth={50}
                minLeftWidth={25}
                minRightWidth={25}
                leftPanel={
                  <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm">
                    <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                      <h3 className="text-sm font-medium">Output</h3>
                    </div>
                    <div className="flex-1 overflow-hidden rounded-b-lg">
                      <OutputConsole
                        output={output}
                        error={error}
                        isLoading={isLoading}
                        executionTime={executionTime}
                      />
                    </div>
                  </div>
                }
                rightPanel={
                  <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm">
                    <div className="border-b px-4 py-2 bg-muted/30 rounded-t-lg">
                      <h3 className="text-sm font-medium">Complexity Analysis</h3>
                    </div>
                    <div className="flex-1 p-4 overflow-hidden rounded-b-lg">
                      <ComplexityAnalysis
                        complexity={complexity}
                        isLoading={isLoading}
                      />
                    </div>
                  </div>
                }
              />
            </div>
          }
        />
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <Send className="w-6 h-6 mr-3 text-blue-500" />
                <h2 className="text-lg font-semibold">Submit Template</h2>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Are you sure you want to submit your code for "<strong>{selectedAdminTemplateName}</strong>"?
                </p>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 mb-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Execution Results:</strong> Your code execution results 
                    ({lastExecutionResult?.status || (error ? 'error' : 'success')}) 
                    will be saved with this submission.
                  </p>
                </div>
                
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {hasSubmitted ? (
                      <>
                        <strong>Note:</strong> You have an exclusion that allows you to submit once more. This will replace your previous submission.
                      </>
                    ) : (
                      <>
                        <strong>Note:</strong> Once submitted, you cannot submit again for this template unless your instructor provides an exclusion.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={handleCancelSubmit}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmSubmit}
                  disabled={submitting}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {submitting ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Submitting...
                    </div>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Code
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Run Code First Modal */}
      {showRunFirstModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-6 h-6 mr-3 text-amber-500">
                  ⚠️
                </div>
                <h2 className="text-lg font-semibold">Run Code Required</h2>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  You must run your code before submitting it.
                </p>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>💡 Tip:</strong> Click the green "Run" button to execute your code, then try submitting again.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleCloseRunFirstModal}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Got it!
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
