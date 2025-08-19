import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useEffect, useState } from 'react';

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
  onMount?: (editor: any, monaco: any) => void;
  theme?: string;
  readOnly?: boolean;
  copyPasteDisabled?: boolean;
}

export default function CodeEditor({ language, value, onChange, onMount, theme = 'vs-dark', readOnly = false, copyPasteDisabled = false }: CodeEditorProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);



  // Store event listeners and disposables for cleanup
  const [keydownDisposable, setKeydownDisposable] = useState<any>(null);
  const [domListeners, setDomListeners] = useState<{ [key: string]: any }>({});

  // Update editor options when copyPasteDisabled changes
  useEffect(() => {
    if (editorInstance && monacoInstance) {
      // Update editor options
      editorInstance.updateOptions({
        contextmenu: !isMobile && !copyPasteDisabled,
        selectionHighlight: !copyPasteDisabled,
        occurrencesHighlight: copyPasteDisabled ? 'off' : 'singleFile',
      });

      // Clean up existing listeners before setting up new ones
      _cleanup();
      
      // Setup new security layers
      _x1f4cb(editorInstance, monacoInstance, copyPasteDisabled);
    }
  }, [copyPasteDisabled, editorInstance, monacoInstance, isMobile]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Security cleanup with tamper protection
  const _cleanup = () => {
    if (keydownDisposable) {
      keydownDisposable.dispose();
      setKeydownDisposable(null);
    }

    Object.entries(domListeners).forEach(([evt, fn]) => {
      if (editorInstance) {
        const _n = editorInstance.getDomNode();
        if (_n && fn) {
          if ((evt === '_monitor' || evt === '_detector' || evt.startsWith('_')) && typeof fn === 'number') {
            clearInterval(fn);
          } else if (typeof fn === 'function') {
            _n.removeEventListener(evt, fn, true);
          }
        }
      }
    });
    setDomListeners({});
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      _cleanup();
    };
  }, []);

  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: isMobile ? 12 : 14,
    lineNumbers: isMobile ? 'off' : 'on',
    lineNumbersMinChars: isMobile ? 0 : 3,
    glyphMargin: !isMobile,
    folding: !isMobile,
    lineDecorationsWidth: isMobile ? 5 : 10,
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: readOnly,
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
    contextmenu: !isMobile && !copyPasteDisabled,
    // Disable text selection when copy-paste is disabled
    selectionHighlight: !copyPasteDisabled,
    occurrencesHighlight: copyPasteDisabled ? 'off' : 'singleFile',
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

  // Security: Multiple layers of clipboard protection with obfuscated implementation
  const _x1f4cb = (editor: any, monaco: any, _9f510: boolean) => {
    if (!_9f510) return;

    // Layer 1: Monaco keyboard event interception
    const _kb = editor.onKeyDown((e: any) => {
      const { keyCode: k, ctrlKey: c, metaKey: m, shiftKey: s } = e;
      
      if ((k === monaco.KeyCode.KeyC && (c || m)) || 
          (k === monaco.KeyCode.KeyV && (c || m)) || 
          (k === monaco.KeyCode.KeyX && (c || m)) ||
          (k === monaco.KeyCode.Insert && s) ||
          (k === monaco.KeyCode.KeyA && (c || m))) {
        e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        return;
      }
    });
    
    setKeydownDisposable(_kb);

    // Layer 2: DOM event prevention with redundancy
    const _dom = editor.getDomNode();
    if (_dom) {
      const _evts: { [key: string]: any } = {};

      const _blockFn = (e: Event) => {
        e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if ((e as any).stopImmediatePropagation) (e as any).stopImmediatePropagation();
        return false;
      };

      ['copy', 'cut', 'paste', 'dragstart', 'drop', 'contextmenu'].forEach(evt => {
        _evts[evt] = _blockFn;
        _dom.addEventListener(evt, _blockFn, { capture: true, passive: false });
      });

      // Layer 3: Selection prevention (less aggressive - only prevent selectstart)
      const _clearSel = (e: Event) => {
        try {
          if (e.type === 'selectstart') {
            e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
          }
          // Don't clear selection on mouseup to avoid cursor reset issues
        } catch {}
      };

      ['selectstart'].forEach(evt => {
        _evts[evt] = _clearSel;
        _dom.addEventListener(evt, _clearSel, { capture: true, passive: false });
      });

      setDomListeners(_evts);

      // Layer 4: Continuous monitoring and re-enforcement (without cursor interference)
      const _monitor = setInterval(() => {
        if (_9f510 && _dom) {
          // Don't clear selections to avoid cursor reset issues
          // Only clear legacy clipboard data if present
          if ((window as any).clipboardData) {
            try { (window as any).clipboardData.clearData(); } catch {}
          }
        }
      }, 500);

      _evts._monitor = _monitor;
    }

    // Layer 5: Monaco internal service override
    try {
      const _svc = (editor as any)._codeEditorService?._clipboardService;
      if (_svc) {
        const _void = () => Promise.resolve('');
        _svc.writeText = _void;
        _svc.readText = _void;
        _svc.readTextSync = () => '';
      }
    } catch {}

    // Layer 6: Global clipboard API override
    if (_9f510 && navigator.clipboard) {
      try {
        const _noop = () => Promise.reject(new Error('Access denied'));
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: _noop, readText: _noop, write: _noop, read: _noop },
          writable: false,
          configurable: false
        });
      } catch {}
    }

    // Layer 7: Additional monitoring (simplified, without cursor interference)
    if (_9f510) {
      const _detector = setInterval(() => {
        // Ensure clipboard restrictions remain active without clearing selections
        // This avoids cursor reset issues while maintaining security
      }, 2000);

      if (_dom) {
        const _evts = domListeners;
        _evts._detector = _detector;
        setDomListeners(_evts);
      }
    }
  };

  // Custom onMount handler to disable copy-paste if needed
  const handleEditorMount = (editor: any, monaco: any) => {
    // Store editor instances for dynamic updates
    setEditorInstance(editor);
    setMonacoInstance(monaco);
    
    // Setup initial security layers
    _x1f4cb(editor, monaco, copyPasteDisabled);
    
    // Call the original onMount handler if provided
    if (onMount) {
      onMount(editor, monaco);
    }
  };

  return (
    <div 
      className={`h-full ${isMobile ? 'touch-manipulation' : ''} bg-background border-0 rounded-b-lg overflow-hidden`}
      style={copyPasteDisabled ? {
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      } : {}}
    >
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={onChange}
        onMount={handleEditorMount}
        theme={theme}
        options={editorOptions}
      />
    </div>
  );
}
