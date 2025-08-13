import { Editor } from '@monaco-editor/react';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';

interface ReadOnlyCodeViewerProps {
  language: string;
  value: string;
  height?: string | number;
  showLineNumbers?: boolean;
  className?: string;
}

export default function ReadOnlyCodeViewer({ 
  language, 
  value, 
  height = 200,
  showLineNumbers = true,
  className = ""
}: ReadOnlyCodeViewerProps) {
  const { resolvedTheme } = useTheme();
  
  // Map our theme to Monaco themes
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs';

  return (
    <Card className={`overflow-hidden ${className}`}>
      <Editor
        height={height}
        language={language}
        value={value}
        theme={monacoTheme}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: showLineNumbers ? 'on' : 'off',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          folding: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 3,
          renderLineHighlight: 'none',
          selectionHighlight: false,
          occurrencesHighlight: "off",
          matchBrackets: 'never',
          contextmenu: false,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            verticalSliderSize: 8,
            horizontalSliderSize: 8,
          },
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          glyphMargin: false,
          padding: { top: 12, bottom: 12 },
        }}
      />
    </Card>
  );
}
