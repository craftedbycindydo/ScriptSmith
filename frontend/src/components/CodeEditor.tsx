import { Editor } from '@monaco-editor/react';
import { Card } from '@/components/ui/card';

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
  onMount?: (editor: any, monaco: any) => void;
  theme?: string;
}

export default function CodeEditor({ language, value, onChange, onMount, theme = 'vs-dark' }: CodeEditorProps) {
  return (
    <Card className="h-full">
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={onChange}
        onMount={onMount}
        theme={theme}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          readOnly: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
        }}
      />
    </Card>
  );
}
