import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPreset } from '@/lib/designMotion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CodeEditor from './CodeEditor';
import { parseDate } from '../lib/dateUtils';
import LanguageSelector from './LanguageSelector';
import OutputConsole from './OutputConsole';
import ComplexityAnalysis from './ComplexityAnalysis';
import ResizablePanels from './ResizablePanels';

import { useCodeStore } from '@/store/codeStore';
import { useAuthStore } from '@/store/authStore';
import { useAdminSettingsStore } from '@/store/adminSettingsStore';
import { apiService } from '@/services/api';
import type { MissedTemplate, TemplateSubmission } from '@/services/api';
import { lockedTail as buildLockedTail, withLockedTail, stripHarness } from '@/lib/labHarness';
import { Play, Save, Download, Share2, Users, Send, CheckCircle, XCircle, Clock, ChevronDown, FileText } from 'lucide-react';

export default function IDE() {
  const navigate = useNavigate();
  const { enter: enterMotion } = useMotionPreset();
  const { user, isAuthenticated } = useAuthStore();
  // Server-validated admin status from the user object (no API call needed)
  const userIsAdmin = user?.is_admin || false;
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
    setResult,
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

  // Submissions state (the student's own submitted + missed work)
  const [mySubmissions, setMySubmissions] = useState<TemplateSubmission[]>([]);
  const [missedTemplates, setMissedTemplates] = useState<MissedTemplate[]>([]);
  const [loadingMyWork, setLoadingMyWork] = useState(false);
  const [reviewSubmission, setReviewSubmission] = useState<TemplateSubmission | null>(null);
  
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
  
  // Submission error state
  const [showSubmissionErrorModal, setShowSubmissionErrorModal] = useState<boolean>(false);
  const [submissionErrorMessage, setSubmissionErrorMessage] = useState<string>('');
  // In-class code, only asked for on a student's first submission of a lab
  const [submissionCode, setSubmissionCode] = useState<string>('');
  const [submitCodeError, setSubmitCodeError] = useState<string>('');
  // Set when the server insists on a code even though we thought one wasn't needed
  const [codeRequired, setCodeRequired] = useState<boolean>(false);
  const needsSubmissionCode = !hasSubmitted || codeRequired;
  const [hasExecutedCode, setHasExecutedCode] = useState<boolean>(false);
  const [lastExecutionResult, setLastExecutionResult] = useState<any>(null);
  const [lastExecutedCodeHash, setLastExecutedCodeHash] = useState<string>("");  // Track hash of last executed code
  const [codeHasChanged, setCodeHasChanged] = useState<boolean>(false);  // Track if code has changed since last execution
  
  // Secure hash function using browser's built-in crypto API
  const hashCode = async (text: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };
  
  // Get current code hash for comparison
  const getCurrentCodeHash = async () => await hashCode(code);
  
  // Save template inline form state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Draft save functionality state
  const [lastDraftSave, setLastDraftSave] = useState<string>('');
  const [showDraftChoice, setShowDraftChoice] = useState(false);
  const [draftChoiceData, setDraftChoiceData] = useState<{
    template: any;
    draft: any;
    templateId: string;
  } | null>(null);

  // The lab's test harness as shown (and locked) at the bottom of the editor;
  // null for scratch code and personal templates. The server appends its own
  // copy on every run, so this is display only (lib/labHarness.ts).
  const [lockedTail, setLockedTail] = useState<string | null>(null);
  type LabLike = { test_harness?: string | null; language?: string } | null | undefined;
  const labTail = (template: LabLike): string | null =>
    template?.test_harness ? buildLockedTail(template.test_harness, template.language) : null;
  // A lab's buffer: the student's code with the locked tests below it
  const labBuffer = (template: LabLike, studentCode: string): string => {
    const tail = labTail(template);
    return tail ? withLockedTail(studentCode, tail) : studentCode;
  };

  // Format template name to add leading zeros to dates
  const formatTemplateName = (name: string): string => {
    // Match date pattern at the start: M/D/YYYY or MM/DD/YYYY etc
    const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(.+)$/;
    const match = name.match(datePattern);
    
    if (match) {
      const [, month, day, year, title] = match;
      const formattedMonth = month.padStart(2, '0');
      const formattedDay = day.padStart(2, '0');
      return `${formattedMonth}/${formattedDay}/${year} - ${title}`;
    }
    
    return name;
  };

  // A submission counts as clean only when it ran without errors.
  const passedSubmissions = mySubmissions.filter(
    (s) => s.status === 'success' && !s.error_message
  );
  const erroredSubmissions = mySubmissions.filter(
    (s) => s.status !== 'success' || !!s.error_message
  );

  // Absolute date + time - students compare these against deadlines
  const formatSubmittedAt = (dateString?: string): string => {
    const date = parseDate(dateString || '');
    if (!date) return 'unknown';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleSubmissionSelect = (value: string) => {
    if (!value.startsWith('sub-')) return;  // missed rows are disabled, nothing to review
    const submission = mySubmissions.find((s) => s.id === parseInt(value.slice(4), 10));
    if (submission) setReviewSubmission(submission);
  };

  // Format date consistently for row 2 display
  const formatDate = (template: any): string => {
    const date = template.created_at ? parseDate(template.created_at) : null;

    if (!date) return '';
    
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${month}/${day}/${year}`;
  };

  // Split labs into sections by the classroom(s) they are assigned to.
  // A lab shared by several classrooms gets one section naming all of them, so
  // every lab is listed exactly once.
  const templatesByClassroom = (): Array<{ label: string; items: any[] }> => {
    const groups = new Map<string, { label: string; items: any[] }>();

    // Newest lab first within each section
    const newestFirst = [...(templates || [])].sort(
      (a, b) => (parseDate(b?.created_at)?.getTime() ?? 0) - (parseDate(a?.created_at)?.getTime() ?? 0)
    );

    newestFirst.forEach((template) => {
      if (!template || !template.id) return;
      const names = (template.classrooms || [])
        .map((classroom: any) => classroom?.name)
        .filter(Boolean)
        .sort();
      const key = names.join('|');
      if (!groups.has(key)) {
        groups.set(key, { label: names.length ? names.join(' · ') : 'All classrooms', items: [] });
      }
      groups.get(key)!.items.push(template);
    });

    // Sections appear in the order their newest lab was met, so the newest lab
    // overall is at the top whichever classroom (or none) it belongs to
    return [...groups.values()];
  };

  // Labs scheduled for a later visible time only reach admins - flag them clearly
  const scheduledVisibleAt = (template: any): Date | null => {
    const visibleFrom = template?.visible_from ? parseDate(template.visible_from) : null;
    return visibleFrom && visibleFrom > new Date() ? visibleFrom : null;
  };

  // Format draft save time for display using existing date utilities
  const formatDraftTime = (dateString: string): string => {
    const date = parseDate(dateString);
    
    if (!date) {
      return 'unknown';
    }
    
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    
    // Handle edge case of future dates (shouldn't happen with proper UTC parsing)
    if (diffInMs < 0) {
      return 'just now';
    }
    
    // Relative time formatting
    if (diffInSeconds < 30) return 'just now';
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours}h ago`;
    }
    
    // For dates older than a day
    const days = Math.floor(diffInMinutes / 1440);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    
    return date.toLocaleDateString();
  };

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

  // Submissions are not language-scoped, so load them once per auth change
  useEffect(() => {
    loadMyWork();
  }, [isAuthenticated, userIsAdmin]);

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
      setLockedTail(null);
    }
  }, [language, isAuthenticated]);

  // Reset execution state when code changes or template changes
  useEffect(() => {
    // Reset execution tracking when code changes
    setHasExecutedCode(false);
    setLastExecutionResult(null);
    setLastExecutedCodeHash("");  // Reset last executed code hash tracking
    setCodeHasChanged(false);  // Reset change tracking
  }, [code, selectedAdminTemplate, selectedUserTemplate]);

  // Check if current code matches last executed code
  useEffect(() => {
    if (!hasExecutedCode || !lastExecutedCodeHash) {
      setCodeHasChanged(false);
      return;
    }
    
    const checkCodeChange = async () => {
      const currentHash = await getCurrentCodeHash();
      setCodeHasChanged(currentHash !== lastExecutedCodeHash);
    };
    
    checkCodeChange();
  }, [code, lastExecutedCodeHash, hasExecutedCode]);

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

  // Load the student's own submitted + missed work for the Submissions dropdown.
  // Not language-filtered: students expect to see everything they've handed in.
  const loadMyWork = async () => {
    // Admins never submit, so the Submissions dropdown is hidden for them
    if (!isAuthenticated || userIsAdmin) {
      setMySubmissions([]);
      setMissedTemplates([]);
      return;
    }
    setLoadingMyWork(true);
    try {
      const [submissions, missed] = await Promise.all([
        apiService.getUserSubmissions({ pageSize: 100 }),
        apiService.getMissedTemplates(),
      ]);
      setMySubmissions(submissions?.submissions ?? []);
      setMissedTemplates(Array.isArray(missed) ? missed : []);
    } catch (error) {
      console.error('Failed to load submissions:', error);
      setMySubmissions([]);
      setMissedTemplates([]);
    } finally {
      setLoadingMyWork(false);
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
      setLastDraftSave('');
      setLockedTail(null);
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
        setSelectedTemplate(parseInt(templateId));
        setSelectedAdminTemplate(templateId);
        setSelectedAdminTemplateName(formatTemplateName(template.name || 'Untitled Template'));
        // Clear user template selection
        setSelectedUserTemplate('');
        setSelectedUserTemplateName('');
        
        // Check submission status
        setCanSubmit(template.can_submit || false);
        setHasSubmitted(!!template.user_submission);
        // The lab's tests, shown locked under whatever code is loaded below
        setLockedTail(labTail(template));
        
        // Clear any existing draft state to avoid cross-template issues
        setShowDraftChoice(false);
        setDraftChoiceData(null);
        
        // Try to load any existing draft first
        try {
          const draft = await apiService.getTemplateDraft(parseInt(templateId));
          if (draft && draft.code_content) {
            // Compare draft content with template content
            // Drafts hold the student's part only; older ones may still carry a harness
            const draftContent = stripHarness(draft.code_content).trim();
            const templateContent = template.code_content.trim();
            
            if (draftContent !== templateContent) {
              // Draft is different from template, show choice dialog
              console.log('Draft differs from template, showing choice modal');
              setDraftChoiceData({
                template,
                draft,
                templateId
              });
              setShowDraftChoice(true);
              // Don't set code yet, wait for user choice
            } else {
              // Draft is same as template, just load template
              console.log('Draft is identical to template, loading template directly');
              setCode(labBuffer(template, template.code_content));
              setLastDraftSave(formatDraftTime(draft.updated_at));
            }
          } else {
            // No draft found, use template's original code
            console.log('No draft found, loading template');
            setCode(labBuffer(template, template.code_content));
            setLastDraftSave('');
          }
        } catch (error) {
          console.error('Failed to load draft, using template code:', error);
          setCode(labBuffer(template, template.code_content));
          setLastDraftSave('');
        }
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      setSelectedTemplate(null);
      setLockedTail(null);
      setCanSubmit(false);
      setHasSubmitted(false);
      setLastDraftSave('');
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
        setLockedTail(null);
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
      const codeHash = await hashCode(code);
      setHasExecutedCode(true);
      setLastExecutedCodeHash(codeHash);  // Store hash of the executed code
      setCodeHasChanged(false);  // Mark code as not changed since execution
      setLastExecutionResult({
        output,
        error,
        execution_time: executionTime,
        status: error ? 'error' : 'success'
      });
    } catch (err) {
      const codeHash = await hashCode(code);
      setHasExecutedCode(true);
      setLastExecutedCodeHash(codeHash);  // Store hash of the executed code even on error
      setCodeHasChanged(false);  // Mark code as not changed since execution
      setLastExecutionResult({
        output: '',
        error: String(err),
        execution_time: 0,
        status: 'error'
      });
    }
  };

  // Cmd/Ctrl+Enter runs the code (guarded against modals + in-flight runs).
  // A ref keeps the guards fresh for the Monaco editor command, which is
  // registered once at editor mount: Monaco swallows Cmd/Ctrl+Enter when the
  // editor has focus (it maps to insertLineAfter), so the shortcut must be
  // registered on the editor itself — the window listener only covers focus
  // outside the editor.
  const runShortcutRef = useRef<() => void>(() => {});
  runShortcutRef.current = () => {
    if (isLoading || showSubmitModal || showRunFirstModal || showSubmissionErrorModal || showDraftChoice) return;
    handleRunCode();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      e.preventDefault();
      runShortcutRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmitTemplate = async () => {
    if (!selectedAdminTemplate) return;
    
    // Check if code has been executed so user can see results before submitting
    if (!hasExecutedCode) {
      setShowRunFirstModal(true);
      return;
    }
    
    // Check if current code matches last executed code using hash comparison
    if (codeHasChanged) {
      setShowRunFirstModal(true);
      return;
    }
    
    setShowSubmitModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedAdminTemplate || !hasExecutedCode || !lastExecutionResult) return;
    // First submission of a lab needs the 4-digit code handed out in class
    if (needsSubmissionCode && submissionCode.trim().length !== 4) {
      setSubmitCodeError('Enter the 4-digit code from your instructor.');
      return;
    }

    setSubmitting(true);
    setSubmitCodeError('');
    try {
      // The server runs the submitted code itself, against the lab's own
      // tests, and records that run; nothing from the browser's last run is sent.
      
      const submission = await apiService.submitTemplate(parseInt(selectedAdminTemplate), {
        code_content: code, // Current code in editor
        submission_code: needsSubmissionCode ? submissionCode.trim() : undefined
      });
      // Show the graded run in the console: this is what was recorded
      setResult({
        output: submission.output || '',
        error: submission.error_message || '',
        executionTime: submission.execution_time || 0,
      });
      
      // Refresh template data to get updated submission status
      const refreshedTemplate = await apiService.getTemplate(parseInt(selectedAdminTemplate));
      if (refreshedTemplate) {
        setCanSubmit(refreshedTemplate.can_submit || false);
        setHasSubmitted(!!refreshedTemplate.user_submission);
      }
      loadMyWork();  // keep the Submissions dropdown current
      setShowSubmitModal(false);
      setSubmissionCode('');
      setCodeRequired(false);
    } catch (error: any) {
      console.error('Failed to submit template:', error);
      const status = error.response?.status;
      const detail = error.response?.data?.detail;

      // Wrong / missing / exhausted code: stay in the dialog so they can retry
      const isCodeProblem =
        (status === 403 && typeof detail === 'string' && detail.includes('submission code')) ||
        (status === 400 && typeof detail === 'string' && detail.includes('submission code')) ||
        status === 429;
      if (isCodeProblem) {
        setSubmitCodeError(detail || 'Incorrect submission code.');
        setCodeRequired(true);  // keep the input on screen so they can retry
      } else if (status === 403 && typeof detail === 'string' && detail.includes('Submission denied')) {
        // Deadline passed
        setSubmissionErrorMessage(detail);
        setShowSubmissionErrorModal(true);
        setShowSubmitModal(false);
      } else if ((status === 503 || status === 400) && typeof detail === 'string') {
        // The runner was unavailable, or the code was refused before it ran
        setSubmissionErrorMessage(detail);
        setShowSubmissionErrorModal(true);
        setShowSubmitModal(false);
      } else {
        // Generic error message for other failures
        setSubmissionErrorMessage('Failed to submit template. Please try again.');
        setShowSubmissionErrorModal(true);
        setShowSubmitModal(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = () => {
    setShowSubmitModal(false);
    setSubmissionCode('');
    setSubmitCodeError('');
    setCodeRequired(false);
  };

  const handleCloseRunFirstModal = () => {
    setShowRunFirstModal(false);
  };

  const handleSaveAsTemplate = () => {
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

  const handleSaveDraftOption = () => {
    if (!isAuthenticated) {
      console.log('User must be authenticated to save drafts');
      return;
    }
    
    if (selectedAdminTemplate) {
      // Save as draft for current template
      handleSaveDraft();
    } else {
      // No template selected, show message or handle differently
      console.log('No template selected to save draft for');
      // Could show a notification here
    }
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

  // Handle draft save
  const handleSaveDraft = async () => {
    if (!selectedAdminTemplate || !code.trim()) {
      console.log('No template selected or no code to save');
      return;
    }

    try {
      const draft = await apiService.saveTemplateDraft(parseInt(selectedAdminTemplate), {
        code_content: code,
        is_auto_save: false
      });
      
      setLastDraftSave(formatDraftTime(draft.updated_at));
      console.log('Draft saved successfully');
    } catch (error: any) {
      console.error('Failed to save draft:', error.response?.data?.detail || error.message);
      // Could show a toast notification here in the future
    }
  };

  // Refresh draft data when modal opens - use a ref to avoid dependency loop
  useEffect(() => {
    const refreshDraftData = async () => {
      if (showDraftChoice && draftChoiceData && draftChoiceData.templateId) {
        try {
          const latestDraft = await apiService.getTemplateDraft(parseInt(draftChoiceData.templateId));
          if (latestDraft && latestDraft.code_content) {
            // Update the draftChoiceData with fresh draft data
            setDraftChoiceData(prev => prev ? {
              ...prev,
              draft: latestDraft
            } : null);
            console.log('Refreshed draft data in modal with latest:', latestDraft.updated_at);
          }
        } catch (error) {
          console.error('Failed to refresh draft data:', error);
        }
      }
    };

    // Only refresh when modal first opens, not when data changes
    if (showDraftChoice) {
      refreshDraftData();
    }
  }, [showDraftChoice]); // Remove draftChoiceData dependency to avoid loop

  // Handle user choice for loading draft or fresh template
  const handleLoadFreshTemplate = () => {
    if (draftChoiceData) {
      setCode(labBuffer(draftChoiceData.template, draftChoiceData.template.code_content));
      setLastDraftSave('');
      setShowDraftChoice(false);
      setDraftChoiceData(null);
      console.log('Loaded fresh template');
    }
  };

  const handleLoadDraft = async () => {
    if (draftChoiceData) {
      try {
        // Always fetch the latest draft from backend to ensure we have the most recent save
        const latestDraft = await apiService.getTemplateDraft(parseInt(draftChoiceData.templateId));
        if (latestDraft && latestDraft.code_content) {
          setCode(labBuffer(draftChoiceData.template, latestDraft.code_content));
          setLastDraftSave(formatDraftTime(latestDraft.updated_at));
          console.log('Loaded latest saved draft from backend');
        } else {
          // Fallback to cached version if API call fails
          setCode(labBuffer(draftChoiceData.template, draftChoiceData.draft.code_content));
          setLastDraftSave(formatDraftTime(draftChoiceData.draft.updated_at));
          console.log('Loaded cached draft (API call failed)');
        }
      } catch (error) {
        console.error('Failed to fetch latest draft, using cached version:', error);
        // Fallback to cached version
        setCode(draftChoiceData.draft.code_content);
        setLastDraftSave(formatDraftTime(draftChoiceData.draft.updated_at));
      }
      
      setShowDraftChoice(false);
      setDraftChoiceData(null);
    }
  };

  // Handle modal close - clear template selection and reset state
  const handleDraftChoiceClose = () => {
    setShowDraftChoice(false);
    setDraftChoiceData(null);
    // Clear template selection and reset states
    setSelectedTemplate(null);
    setSelectedAdminTemplate('');
    setSelectedAdminTemplateName('');
    setCanSubmit(false);
    setHasSubmitted(false);
    setLastDraftSave('');
    setLockedTail(null);
    console.log('Draft choice modal closed - template selection cleared');
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

  // Determine if copy-paste should be disabled
  // Logic:
  // 1. Not authenticated → copy-paste ENABLED (no restrictions for guests)
  // 2. Authenticated but admin → copy-paste ENABLED (admins always have access)
  // 3. Authenticated, not admin → use backend setting (checks ALL classrooms)
  //    - If user has no classrooms → enabled (backend returns true)
  //    - If ANY classroom has it disabled → disabled
  const copyPasteDisabled = isAuthenticated && !userIsAdmin && !adminSettings.copy_paste_enabled;



  return (
    <div className="screen-h flex flex-col">
      {/* Toolbar */}
      <div className="toolbar flex-wrap">
        {/* Language + template selectors */}
        <div className="w-[130px] sm:w-auto">
          <LanguageSelector
            selectedLanguage={language}
            languages={languages}
            onLanguageChange={setLanguage}
          />
        </div>

        {isAuthenticated && (
          <>
            <Select onValueChange={handleTemplateSelect} value={selectedAdminTemplate}>
              <SelectTrigger size="sm" disabled={loadingTemplates} className="w-[150px] lg:w-[200px]">
                <SelectValue placeholder={loadingTemplates ? "Loading..." : "In-class labs"}>
                  {selectedAdminTemplateName || "In-class labs"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[480px] overflow-y-auto">
                {selectedAdminTemplateName && (
                  <SelectItem value="clear-admin">
                    <span className="text-muted-foreground">Clear selection</span>
                  </SelectItem>
                )}
                {!templates || templates.length === 0 ? (
                  <SelectItem value="no-templates" disabled>
                    No in-class labs available
                  </SelectItem>
                ) : (
                  templatesByClassroom().map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.items.map((template) => (
                        <SelectItem
                          key={template.id}
                          value={template.id.toString()}
                          textValue={formatTemplateName(template.name || 'Untitled Template')}
                        >
                          <div className="flex flex-col gap-1.5 w-80 min-w-80">
                            {/* Row 1: Template name, plus the deadline while submissions are open */}
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="font-medium text-sm truncate min-w-0">
                                {formatTemplateName(template.name || 'Untitled Template')}
                              </span>
                              {template.can_submit !== false && template.deadline_info && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  Due {formatSubmittedAt(template.deadline_info)}
                                </span>
                              )}
                            </div>
                            {/* Row 2: Date and status */}
                            <div className="flex items-center justify-between text-xs w-80">
                              <span className="text-muted-foreground font-mono text-xs">
                                {formatDate(template)}
                              </span>
                              {scheduledVisibleAt(template) ? (
                                <span className="status-pill" data-tone="warning">
                                  Visible {scheduledVisibleAt(template)!.toLocaleString()}
                                </span>
                              ) : (
                                <span
                                  className="status-pill"
                                  data-tone={template.can_submit === false ? "error" : "success"}
                                >
                                  {template.can_submit === false ? "Submissions Closed" : "Submissions Open"}
                                </span>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* Admins do not submit work, so they get no Submissions dropdown */}
            {!userIsAdmin && (
            <Select onValueChange={handleSubmissionSelect} value="">
              <SelectTrigger size="sm" disabled={loadingMyWork} className="w-[130px] lg:w-[170px]">
                <SelectValue placeholder={loadingMyWork ? "Loading..." : "Submissions"} />
              </SelectTrigger>
              <SelectContent className="max-h-[480px] overflow-y-auto">
                {passedSubmissions.length === 0 && erroredSubmissions.length === 0 && missedTemplates.length === 0 ? (
                  <SelectItem value="no-work" disabled>
                    Nothing submitted yet
                  </SelectItem>
                ) : (
                  <>
                    {passedSubmissions.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Submitted &middot; no errors</SelectLabel>
                        {passedSubmissions.map((s) => (
                          <SelectItem
                            key={s.id}
                            value={`sub-${s.id}`}
                            textValue={s.template_name || 'Untitled'}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-2 shrink-0 text-emerald-600" aria-hidden="true" />
                            <div className="flex flex-col">
                              <span>{s.template_name || 'Untitled'}</span>
                              <span className="text-muted-foreground text-xs">
                                {formatSubmittedAt(s.submitted_at)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    {erroredSubmissions.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Submitted &middot; with errors</SelectLabel>
                        {erroredSubmissions.map((s) => (
                          <SelectItem
                            key={s.id}
                            value={`sub-${s.id}`}
                            textValue={s.template_name || 'Untitled'}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-2 shrink-0 text-red-600" aria-hidden="true" />
                            <div className="flex flex-col">
                              <span>{s.template_name || 'Untitled'}</span>
                              <span className="text-muted-foreground text-xs">
                                {formatSubmittedAt(s.submitted_at)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    {missedTemplates.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Missed</SelectLabel>
                        {missedTemplates.map((m) => (
                          <SelectItem
                            key={m.template_id}
                            value={`missed-${m.template_id}`}
                            disabled
                            textValue={m.template_name}
                          >
                            <Clock className="w-3.5 h-3.5 mr-2 shrink-0 text-amber-600" aria-hidden="true" />
                            <div className="flex flex-col">
                              <span>{m.template_name}</span>
                              <span className="text-muted-foreground text-xs">
                                Due {formatSubmittedAt(m.deadline)} &middot; not submitted
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </>
                )}
              </SelectContent>
            </Select>
            )}
          </>
        )}

        {isAuthenticated && selectedAdminTemplate && lastDraftSave && (
          <span className="status-pill hidden md:inline-flex" data-tone="neutral">
            Draft saved {lastDraftSave}
          </span>
        )}

        <div className="toolbar-sep hidden sm:block" />
        <div className="flex-1" />

        {/* Action cluster: quiet icon actions, then Submit, then Run */}
        <div className="flex items-center gap-1.5">
          {isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              className="press h-8 w-8 p-0"
              onClick={handleCreateShare}
              disabled={creating}
              title={creating ? 'Creating share link...' : 'Share collaborative session'}
            >
              <Share2 className="w-4 h-4" />
            </Button>
          )}

          {isAuthenticated && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="press h-8 px-1.5" title="Save options">
                  <Save className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {selectedAdminTemplate && (
                  <DropdownMenuItem onClick={handleSaveDraftOption} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    <div className="flex flex-col">
                      <span>Save Draft</span>
                      <span className="text-xs text-muted-foreground">Save progress for this template</span>
                    </div>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleSaveAsTemplate} className="cursor-pointer">
                  <Save className="w-4 h-4 mr-2" />
                  <div className="flex flex-col">
                    <span>Save as My Template</span>
                    <span className="text-xs text-muted-foreground">Create personal template</span>
                  </div>
                </DropdownMenuItem>

                {/* Loading personal templates lives here now that the toolbar slot shows Submissions */}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  My Templates
                </DropdownMenuLabel>
                {loadingUserTemplates ? (
                  <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
                ) : !userTemplates || userTemplates.length === 0 ? (
                  <DropdownMenuItem disabled>No personal templates saved</DropdownMenuItem>
                ) : (
                  <>
                    {selectedUserTemplateName && (
                      <DropdownMenuItem
                        onClick={() => handleUserTemplateSelect('clear-user')}
                        className="cursor-pointer text-muted-foreground"
                      >
                        Clear selection
                      </DropdownMenuItem>
                    )}
                    {userTemplates.map((template) => template && template.id ? (
                      <DropdownMenuItem
                        key={template.id}
                        onClick={() => handleUserTemplateSelect(template.id.toString())}
                        className="cursor-pointer"
                      >
                        <FileText className="w-4 h-4 mr-2 shrink-0" />
                        <span className="truncate">{template.name || 'Untitled Template'}</span>
                      </DropdownMenuItem>
                    ) : null)}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="press h-8 w-8 p-0"
            onClick={handleDownload}
            title="Download code"
          >
            <Download className="w-4 h-4" />
          </Button>

          {isAuthenticated && selectedAdminTemplate && (
            <button
              type="button"
              className="cta-quiet press"
              onClick={handleSubmitTemplate}
              disabled={!canSubmit}
              title={
                !hasExecutedCode ? 'Run your code first before submitting' :
                codeHasChanged ? 'You changed your code after running it. Run again to submit current code.' :
                (hasSubmitted && canSubmit) ? 'You can resubmit until the deadline' :
                !canSubmit ? 'Submissions are closed for this lab' :
                'Ready to submit — you will need the code from your instructor'
              }
            >
              {hasSubmitted && !canSubmit ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (!hasExecutedCode || codeHasChanged) ? (
                <span aria-hidden="true">⚠️</span>
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>
                {hasSubmitted && !canSubmit ? 'Submitted' :
                 (!hasExecutedCode || codeHasChanged) ? 'Run First' :
                 hasSubmitted && canSubmit ? 'Submit Again' : 'Submit'}
              </span>
            </button>
          )}

          <button
            type="button"
            className="cta press"
            onClick={handleRunCode}
            disabled={isLoading}
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isLoading ? 'Running...' : 'Run'}</span>
            <span className="kbd-hint">⌘↵</span>
          </button>
        </div>
      </div>

      {/* Collapsible strips: save / share / download */}
      <AnimatePresence initial={false}>
        {showSaveForm && (
          <motion.div
            key="save-form"
            className="ide-form-strip"
            initial={enterMotion.initial}
            animate={enterMotion.animate}
            exit={enterMotion.exit}
            transition={enterMotion.transition}
          >
            <div className="panel px-3 py-2.5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <span className="pane-label whitespace-nowrap">Save as template</span>
                <Input
                  type="text"
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="h-8 text-sm w-full sm:max-w-xs"
                  autoFocus
                />
                <Input
                  type="text"
                  placeholder="Description (optional)"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="h-8 text-sm w-full sm:max-w-sm"
                />
                <span className="status-pill" data-tone="neutral">{language}</span>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <Button
                    onClick={handleSaveTemplate}
                    disabled={saving || !templateName.trim()}
                    size="sm"
                    className="press h-8 px-4"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelSave}
                    className="press h-8 w-8 p-0"
                    title="Close"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {showShareForm && (
          <motion.div
            key="share-form"
            className="ide-form-strip"
            initial={enterMotion.initial}
            animate={enterMotion.animate}
            exit={enterMotion.exit}
            transition={enterMotion.transition}
          >
            <div className="panel px-3 py-2.5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <span className="pane-label whitespace-nowrap">Share session</span>
                <Input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="h-8 w-full sm:flex-1 font-mono text-xs"
                  placeholder="Share link will appear here..."
                />
                <div className="flex items-center gap-2 sm:ml-auto">
                  <Button
                    onClick={handleCopyShareLink}
                    disabled={!shareLink}
                    size="sm"
                    className="press h-8 px-4"
                  >
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelShare}
                    className="press h-8 w-8 p-0"
                    title="Close"
                  >
                    ✕
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span>Real-time editing · live cursors · shared execution · up to 10 collaborators</span>
              </div>
            </div>
          </motion.div>
        )}

        {showDownloadForm && (
          <motion.div
            key="download-form"
            className="ide-form-strip"
            initial={enterMotion.initial}
            animate={enterMotion.animate}
            exit={enterMotion.exit}
            transition={enterMotion.transition}
          >
            <div className="panel px-3 py-2.5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                <span className="pane-label whitespace-nowrap">Download code</span>
                <Input
                  type="text"
                  placeholder="Enter filename"
                  value={downloadFilename}
                  onChange={(e) => setDownloadFilename(e.target.value)}
                  className="h-8 text-sm w-full sm:max-w-xs"
                  autoFocus
                />
                <span className="status-pill" data-tone="neutral">.{getFileExtension(language)}</span>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <Button
                    onClick={handleDownloadFile}
                    disabled={!downloadFilename.trim()}
                    size="sm"
                    className="press h-8 px-4"
                  >
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelDownload}
                    className="press h-8 w-8 p-0"
                    title="Close"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content: resizable panes */}
      <div className="ide-stage anim-enter">
        <ResizablePanels
          defaultLeftWidth={65}
          minLeftWidth={40}
          minRightWidth={25}
          leftPanel={
            <div className="ide-split-l">
              <div className="panel h-full flex flex-col overflow-hidden">
                <div className="ide-pane-head">
                  <span className="pane-label">Editor</span>
                  {copyPasteDisabled && (
                    <span className="status-pill" data-tone="warning">
                      Copy-paste disabled
                    </span>
                  )}
                  {lockedTail && (
                    <span
                      className="status-pill"
                      data-tone="info"
                      title="The lab's tests are locked. The server runs its own copy of them on every run."
                    >
                      Tests locked
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeEditor
                    language={language}
                    value={code}
                    onChange={(value) => setCode(value || '')}
                    onMount={(editor, monaco) => {
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
                        runShortcutRef.current()
                      );
                    }}
                    copyPasteDisabled={copyPasteDisabled}
                    lockedTail={lockedTail}
                  />
                </div>
              </div>
            </div>
          }
          rightPanel={
            <div className="ide-split-r">
              <ResizablePanels
                orientation="vertical"
                defaultLeftWidth={50}
                minLeftWidth={25}
                minRightWidth={25}
                leftPanel={
                  <div className="ide-split-t">
                    <div className="panel ide-pane-dark h-full flex flex-col overflow-hidden">
                      <div className="ide-pane-head">
                        <span className="pane-label">Output</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <OutputConsole
                          output={output}
                          error={error}
                          isLoading={isLoading}
                          executionTime={executionTime}
                        />
                      </div>
                    </div>
                  </div>
                }
                rightPanel={
                  <div className="ide-split-b">
                    <div className="panel h-full flex flex-col overflow-hidden">
                      <div className="ide-pane-head">
                        <span className="pane-label">Complexity</span>
                      </div>
                      <div className="flex-1 p-4 overflow-auto">
                        <ComplexityAnalysis
                          complexity={complexity}
                          isLoading={isLoading}
                        />
                      </div>
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
                <h2 className="text-lg font-semibold">Submit lab</h2>
              </div>

              <p className="text-gray-600 dark:text-gray-300">
                Do you want to submit "<strong>{selectedAdminTemplateName}</strong>"?
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your code is run on the server against the lab's tests, and that run is what gets recorded.
              </p>

              {/* Only the first submission needs the in-class code */}
              {needsSubmissionCode && (
                <div className="mt-4">
                  <label htmlFor="submission-code" className="text-sm font-medium">
                    Submission code
                  </label>
                  <Input
                    id="submission-code"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    maxLength={4}
                    placeholder="0000"
                    value={submissionCode}
                    onChange={(e) => {
                      setSubmissionCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                      if (submitCodeError) setSubmitCodeError('');
                    }}
                    className="mt-1 w-32 text-center tracking-[0.4em] font-mono"
                    disabled={submitting}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter the 4-digit code your instructor gave out in class.
                  </p>
                </div>
              )}

              {submitCodeError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{submitCodeError}</p>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={handleCancelSubmit}
                  disabled={submitting}
                >
                  No
                </Button>
                <Button
                  onClick={handleConfirmSubmit}
                  disabled={submitting || (needsSubmissionCode && submissionCode.length !== 4)}
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
                      Yes
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 mr-3 text-amber-500 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                  ⚠️
                </div>
                <h2 className="text-xl font-semibold">Must Run Code Before Submit</h2>
              </div>
              
              <div className="mb-6 space-y-3">
                {!hasExecutedCode ? (
                  <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200 font-medium">
                      🚫 No code has been executed yet
                    </p>
                    <p className="text-red-600 dark:text-red-300 text-sm mt-1">
                      You must run your code at least once before submitting.
                    </p>
                  </div>
                ) : (
                  <div className="bg-orange-50 dark:bg-orange-900 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
                    <p className="text-orange-800 dark:text-orange-200 font-medium">
                      📝 Code has been modified since last run
                    </p>
                    <p className="text-orange-600 dark:text-orange-300 text-sm mt-1">
                      You've changed your code after running it. Run it again so you see the result before you hand it in.
                    </p>
                  </div>
                )}
                
                <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <p className="text-blue-800 dark:text-blue-200 font-medium">
                    💡 Why is this required?
                  </p>
                  <p className="text-blue-600 dark:text-blue-300 text-sm mt-1">
                    So you always know what your code does before it is handed in. The server runs your submitted code itself, so what it records is what you see when you press Run.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  onClick={handleCloseRunFirstModal}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    setShowRunFirstModal(false);
                    await handleRunCode();
                  }}
                  className="bg-green-500 hover:bg-green-600 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? "Running..." : "🏃 Run Code Now"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submission Error Modal */}
      {showSubmissionErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 mr-3 text-red-500 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                  🚫
                </div>
                <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Submission Failed</h2>
              </div>
              
              <div className="mb-6">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                  <p className="text-sm text-red-800 dark:text-red-200 font-mono">
                    {submissionErrorMessage}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setShowSubmissionErrorModal(false);
                    setSubmissionErrorMessage('');
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Choice Modal */}
      <Dialog open={showDraftChoice} onOpenChange={(open) => {
        if (!open) handleDraftChoiceClose();
      }}>
        <DialogContent className="!max-w-none w-[95vw] h-[85vh] max-h-[85vh] overflow-hidden sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[80vw] sm:h-[80vh] md:h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center text-blue-600 text-base sm:text-lg">
              <div className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 text-blue-500 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-sm sm:text-base">
                📄
              </div>
              Load Original or Saved Code?
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex flex-col py-2 sm:py-4 overflow-hidden">
            <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
              You have saved code for this template. Choose which version to load:
            </p>
            
            {/* Two choice options - responsive to modal size */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 flex-1 min-h-0">
              {/* Original Code Option */}
              <div className="border-2 border-green-200 dark:border-green-700 rounded-lg overflow-hidden flex flex-col h-full">
                {/* Header */}
                <div className="p-3 sm:p-4 border-b border-green-200 dark:border-green-700">
                  <div className="mb-2">
                    <h3 className="text-sm sm:text-base font-semibold text-green-600 dark:text-green-400">
                      🔄 Original Code
                    </h3>
                  </div>
                  
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Load the original code (your changes will be lost)
                  </p>
                </div>

                {/* Scrollable code preview */}
                <div className="flex-1 bg-muted/20 p-2 sm:p-3 overflow-hidden flex flex-col">
                  <div className="text-xs text-muted-foreground mb-2">Original Code:</div>
                  <div className="flex-1 overflow-y-auto mb-3">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                      {draftChoiceData?.template.code_content || 'No code available'}
                    </pre>
                  </div>
                  
                  {/* Action button */}
                  <Button
                    onClick={handleLoadFreshTemplate}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    Load Original Code
                  </Button>
                </div>
              </div>

              {/* Saved Code Option */}
              <div className="border-2 border-blue-200 dark:border-blue-700 rounded-lg overflow-hidden flex flex-col h-full">
                {/* Header */}
                <div className="p-3 sm:p-4 border-b border-blue-200 dark:border-blue-700">
                  <div className="mb-2">
                    <h3 className="text-sm sm:text-base font-semibold text-blue-600 dark:text-blue-400">
                      💾 Saved Code
                    </h3>
                  </div>
                  
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Continue working on your saved code
                  </p>
                </div>

                {/* Scrollable code preview */}
                <div className="flex-1 bg-muted/20 p-2 sm:p-3 overflow-hidden flex flex-col">
                  <div className="text-xs text-muted-foreground mb-2">Saved Code:</div>
                  <div className="flex-1 overflow-y-auto mb-3">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                      {draftChoiceData?.draft.code_content || 'No code available'}
                    </pre>
                  </div>
                  
                  {/* Action button */}
                  <Button
                    onClick={handleLoadDraft}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Load Saved Code
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Read-only review of a past submission - never touches the live editor */}
      <Dialog open={!!reviewSubmission} onOpenChange={(open) => !open && setReviewSubmission(null)}>
        <DialogContent className="!max-w-none w-[95vw] lg:w-[80vw] h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              {reviewSubmission && (reviewSubmission.status === 'success' && !reviewSubmission.error_message ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
              ))}
              <span>{reviewSubmission?.template_name || 'Submission'}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Submitted {formatSubmittedAt(reviewSubmission?.submitted_at)}</span>
            {reviewSubmission?.language && <span>&middot; {reviewSubmission.language}</span>}
            {typeof reviewSubmission?.execution_time === 'number' && (
              <span>&middot; {reviewSubmission.execution_time.toFixed(3)}s</span>
            )}
          </div>

          <div className="flex-1 min-h-0 grid gap-4 md:grid-cols-2 mt-3">
            <div className="flex flex-col min-h-0">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                Submitted code
              </div>
              <pre className="flex-1 min-h-0 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                {reviewSubmission?.submitted_code || 'No code recorded'}
              </pre>
            </div>

            <div className="flex flex-col min-h-0 gap-4">
              <div className="flex flex-col min-h-0 flex-1">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Output
                </div>
                <pre className="flex-1 min-h-0 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                  {reviewSubmission?.output || 'No output'}
                </pre>
              </div>

              {reviewSubmission?.error_message && (
                <div className="flex flex-col min-h-0 flex-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-red-600 mb-1">
                    Error
                  </div>
                  <pre className="flex-1 min-h-0 overflow-auto rounded-md border border-red-300 p-3 text-xs whitespace-pre-wrap text-red-700">
                    {reviewSubmission.error_message}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
