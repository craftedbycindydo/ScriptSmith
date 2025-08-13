import { useState, useRef, useCallback, useEffect } from 'react';

interface ResizablePanelsProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  className?: string;
}

export default function ResizablePanels({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 60,
  minLeftWidth = 30,
  minRightWidth = 25,
  className = '',
}: ResizablePanelsProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if screen is mobile size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint in Tailwind
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // Enforce min/max constraints
      const clampedWidth = Math.max(
        minLeftWidth,
        Math.min(100 - minRightWidth, newLeftWidth)
      );

      setLeftWidth(clampedWidth);
    },
    [isDragging, minLeftWidth, minRightWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const rightWidth = 100 - leftWidth;

  // Mobile layout: Stack vertically
  if (isMobile) {
    return (
      <div ref={containerRef} className={`flex flex-col h-full ${className}`}>
        {/* Top Panel (Code Editor) */}
        <div className="flex-1 overflow-hidden mb-1">
          {leftPanel}
        </div>
        
        {/* Bottom Panel (Output) */}
        <div className="flex-1 overflow-hidden mt-1">
          {rightPanel}
        </div>
      </div>
    );
  }

  // Desktop layout: Side by side with resizable handle
  return (
    <div ref={containerRef} className={`flex h-full ${className}`}>
      {/* Left Panel */}
      <div 
        className="flex-shrink-0 overflow-hidden"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>

      {/* Resize Handle */}
      <div
        className={`flex-shrink-0 w-0 bg-transparent cursor-col-resize relative group transition-colors z-10 ${
          isDragging ? '' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        {/* Larger hit area for easier grabbing */}
        <div className="absolute inset-y-0 -left-3 -right-3 w-6 flex items-center justify-center">
          <div className={`w-1 h-8 bg-muted-foreground/20 group-hover:bg-blue-500 rounded-full transition-colors ${
            isDragging ? 'bg-blue-500' : ''
          }`}></div>
        </div>
      </div>

      {/* Right Panel */}
      <div 
        className="flex-1 overflow-hidden"
        style={{ width: `${rightWidth}%` }}
      >
        {rightPanel}
      </div>
    </div>
  );
}
