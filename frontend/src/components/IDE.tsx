import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import CodeEditor from './CodeEditor';
import LanguageSelector from './LanguageSelector';
import OutputConsole from './OutputConsole';

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

  // Load languages on component mount
  useEffect(() => {
    loadLanguages();
  }, [loadLanguages]);

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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b bg-card">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0 sm:space-x-4">
            {/* Language selector */}
            <div className="w-full sm:w-auto">
              <LanguageSelector
                selectedLanguage={language}
                languages={languages}
                onLanguageChange={setLanguage}
              />
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center space-x-2 flex-wrap">
              <Button
                onClick={handleRunCode}
                disabled={isLoading}
                className="btn-success"
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
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">{creating ? 'Creating...' : 'Share'}</span>
                  <span className="sm:hidden">Share</span>
                </Button>
              )}

              <Button variant="outline" onClick={handleSave} size="sm" className="hidden md:flex">
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={handleDownload} size="sm" className="hidden md:flex">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Code Editor */}
        <div className="flex-1 p-4 min-h-0 lg:min-h-full">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Code Editor</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 h-full pb-6">
              <div className="h-full min-h-[300px] lg:min-h-0">
                <CodeEditor
                  language={language}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Output Panel */}
        <div className="w-full lg:w-96 xl:w-[420px] p-4 lg:pl-0 flex-shrink-0">
          <div className="h-full max-h-[400px] lg:max-h-full">
            <OutputConsole
              output={output}
              error={error}
              isLoading={isLoading}
              executionTime={executionTime}
            />
          </div>
        </div>
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
