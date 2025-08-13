import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CodeEditor from './CodeEditor';
import LanguageSelector from './LanguageSelector';
import OutputConsole from './OutputConsole';
import ResizablePanels from './ResizablePanels';

import { useCodeStore } from '@/store/codeStore';
import { useAuthStore } from '@/store/authStore';
import { apiService } from '@/services/api';
import { Play, Save, Download, Share2, Users } from 'lucide-react';

export default function IDE() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const {
    code,
    language,
    languages,
    output,
    error,
    isLoading,
    executionTime,
    setCode,
    setLanguage,
    loadLanguages,
    executeCode
  } = useCodeStore();

  const [showShare, setShowShare] = useState(false);
  const [shareLink, setShareLink] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Load languages on component mount
  useEffect(() => {
    loadLanguages();
  }, [loadLanguages]);

  // Load templates when language changes (for authenticated users only)
  useEffect(() => {
    if (isAuthenticated && language) {
      loadTemplatesForLanguage(language);
    }
  }, [language, isAuthenticated]);

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

  // Handle template selection
  const handleTemplateSelect = async (templateId: string) => {
    if (templateId === '' || !templateId || templateId === 'no-templates') return;
    
    try {
      const template = await apiService.getTemplate(parseInt(templateId));
      if (template && template.code_content) {
        setCode(template.code_content);
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      // Could show a toast notification here if desired
    }
  };

  const handleRunCode = async () => {
    await executeCode();
  };

  const handleSave = () => {
    // TODO: Implement save functionality
    console.log('Save functionality to be implemented');
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${getFileExtension(language)}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateShare = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setCreating(true);
    try {
      const session = await apiService.createSession({
        title: `${user?.username || 'Anonymous'}'s ${language} session`,
        description: `Collaborative coding session`,
        language: language,
        is_public: false,
        max_collaborators: 10,
        initial_code: code
      });

      const url = `${window.location.origin}/collab/${session.share_id}`;
      setShareLink(url);
      setShowShare(true);
    } catch (error) {
      console.error('Failed to create collaborative session:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b bg-card flex-shrink-0">
        <div className="px-4 py-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 sm:space-x-4">
            {/* Language and Template selectors */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
              {/* Language selector */}
              <div className="w-full sm:w-auto">
                <LanguageSelector
                  selectedLanguage={language}
                  languages={languages}
                  onLanguageChange={setLanguage}
                />
              </div>
              
              {/* Template selector - only for authenticated users */}
              {isAuthenticated && (
                <div className="w-full sm:w-auto sm:min-w-[200px]">
                  <Select onValueChange={handleTemplateSelect} value="">
                    <SelectTrigger size="sm" disabled={loadingTemplates}>
                      <SelectValue placeholder={loadingTemplates ? "Loading..." : "Load Template"} />
                    </SelectTrigger>
                    <SelectContent>
                      {!templates || templates.length === 0 ? (
                        <SelectItem value="no-templates" disabled>
                          No templates available
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
              )}
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center space-x-2 flex-wrap gap-1 sm:gap-0">
              <Button
                onClick={handleRunCode}
                disabled={isLoading}
                className="btn-success flex-1 sm:flex-none"
                size="sm"
              >
                <Play className="w-4 h-4 mr-1 lg:mr-2" />
                <span className="hidden sm:inline">{isLoading ? 'Running...' : 'Run'}</span>
                <span className="sm:hidden">{isLoading ? '...' : 'Run'}</span>
              </Button>

              {/* Authenticated user features */}
              {isAuthenticated && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCreateShare}
                  disabled={creating}
                  className="flex-1 sm:flex-none"
                >
                  <Share2 className="w-4 h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{creating ? 'Creating...' : 'Share'}</span>
                  <span className="sm:hidden">Share</span>
                </Button>
              )}

              <Button variant="outline" onClick={handleSave} size="sm" className="hidden md:flex">
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={handleDownload} size="sm" className="hidden lg:flex">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              
              {/* Mobile dropdown for extra actions */}
              <div className="block md:hidden">
                <Button variant="outline" size="sm" className="px-2">
                  ⋯
                </Button>
              </div>
            </div>
          </div>
        </div>
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
                <h3 className="text-sm font-medium">Code Editor</h3>
              </div>
              <div className="flex-1 overflow-hidden rounded-b-lg">
                <CodeEditor
                  language={language}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                />
              </div>
            </div>
          }
          rightPanel={
            <div className="h-full flex flex-col bg-background border rounded-lg shadow-sm md:ml-2">
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
        />
      </div>

      {/* Share Dialog */}
      <Dialog open={showShare} onOpenChange={setShowShare}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Collaborative Code Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with others to collaborate in real-time:
            </p>
            <div className="flex items-center space-x-2">
              <Input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1"
              />
              <Button onClick={handleCopyShareLink} size="sm">
                Copy
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="w-4 h-4" />
                <span>Features:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 ml-6">
                <li>Real-time collaborative editing</li>
                <li>Live cursor tracking with usernames</li>
                <li>Shared code execution</li>
                <li>Up to 10 collaborators</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
