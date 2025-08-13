import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useEffect, useState } from 'react';

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
  onMount?: (editor: any, monaco: any) => void;
  theme?: string;
}

export default function CodeEditor({ language, value, onChange, onMount, theme = 'vs-dark' }: CodeEditorProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const mobileOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: isMobile ? 12 : 14,
    lineNumbers: isMobile ? 'off' : 'on',
    lineNumbersMinChars: isMobile ? 0 : 3,
    glyphMargin: !isMobile,
    folding: !isMobile,
    lineDecorationsWidth: isMobile ? 5 : 10,
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    scrollbar: {
      verticalScrollbarSize: isMobile ? 8 : 17,
      horizontalScrollbarSize: isMobile ? 8 : 17,
      useShadows: !isMobile,
    },
    overviewRulerLanes: isMobile ? 0 : 3,
    hideCursorInOverviewRuler: isMobile,
    quickSuggestions: !isMobile,
    parameterHints: { enabled: !isMobile },
    suggestOnTriggerCharacters: !isMobile,
    acceptSuggestionOnEnter: isMobile ? 'off' : 'on',
    tabCompletion: isMobile ? 'off' : 'on',
    hover: { enabled: !isMobile },
    contextmenu: !isMobile,
    mouseWheelZoom: !isMobile,
    cursorBlinking: 'smooth',
    smoothScrolling: !isMobile,
    selectOnLineNumbers: !isMobile,
    links: !isMobile,
    colorDecorators: !isMobile,
    codeLens: !isMobile,
    renderWhitespace: isMobile ? 'none' : 'selection',
    renderControlCharacters: !isMobile,
    fontLigatures: !isMobile,
    // Mobile-specific optimizations
    ...(isMobile && {
      wordBasedSuggestions: 'off',
      quickSuggestionsDelay: 500,
      suggestSelection: 'first',
      tabIndex: 0,
      padding: { top: 8, bottom: 8 },
      rulers: [],
      renderLineHighlight: 'none',
      matchBrackets: 'never',
      renderIndentGuides: false,
    }),
  };

  return (
    <div className={`h-full ${isMobile ? 'touch-manipulation' : ''} bg-background border-0 rounded-b-lg overflow-hidden`}>
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={onChange}
        onMount={onMount}
        theme={theme}
        options={mobileOptions}
      />
    </div>
  );
}
