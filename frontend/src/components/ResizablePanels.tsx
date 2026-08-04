import { useState, useRef, useCallback, useEffect } from 'react';

interface ResizablePanelsProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export default function ResizablePanels({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 60,
  minLeftWidth = 30,
  minRightWidth = 25,
  className = '',
  orientation = 'horizontal',
}: ResizablePanelsProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const isVertical = orientation === 'vertical';

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      
      const newLeftWidth = isVertical 
        ? ((e.clientY - containerRect.top) / containerRect.height) * 100
        : ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // Enforce min/max constraints
      const clampedWidth = Math.max(
        minLeftWidth,
        Math.min(100 - minRightWidth, newLeftWidth)
      );

      setLeftWidth(clampedWidth);
    },
    [isDragging, minLeftWidth, minRightWidth, isVertical]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      
      const newLeftWidth = isVertical 
        ? ((touch.clientY - containerRect.top) / containerRect.height) * 100
        : ((touch.clientX - containerRect.left) / containerRect.width) * 100;

      // Enforce min/max constraints
      const clampedWidth = Math.max(
        minLeftWidth,
        Math.min(100 - minRightWidth, newLeftWidth)
      );

      setLeftWidth(clampedWidth);
    },
    [isDragging, minLeftWidth, minRightWidth, isVertical]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd, isVertical]);

  const rightWidth = 100 - leftWidth;

  // Mobile layout: Resizable vertical stack for better usability
  if (isMobile) {
    return (
      <div ref={containerRef} className={`flex flex-col h-full ${className}`}>
        {/* Top Panel */}
        <div 
          className="flex-shrink-0 overflow-hidden"
          style={{ height: `${leftWidth}%` }}
        >
          {leftPanel}
        </div>

        {/* Mobile-friendly Resize Handle */}
        <div
          className={`flex-shrink-0 h-0 bg-transparent relative group transition-colors z-10 ${
            isDragging ? '' : ''
          }`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Larger touch-friendly hit area */}
          <div className="absolute inset-x-0 -top-4 -bottom-4 h-8 flex items-center justify-center touch-manipulation">
            <div className={`h-1 w-12 bg-muted-foreground/30 group-hover:bg-primary group-active:bg-primary rounded-full transition-colors ${
              isDragging ? 'bg-primary' : ''
            }`}></div>
          </div>
        </div>

        {/* Bottom Panel */}
        <div 
          className="flex-1 overflow-hidden"
          style={{ height: `${rightWidth}%` }}
        >
          {rightPanel}
        </div>
      </div>
    );
  }

  // Desktop layout: Resizable panels
  if (isVertical) {
    // Vertical orientation - Top/Bottom split
    return (
      <div ref={containerRef} className={`flex flex-col h-full ${className}`}>
        {/* Top Panel */}
        <div 
          className="flex-shrink-0 overflow-hidden"
          style={{ height: `${leftWidth}%` }}
        >
          {leftPanel}
        </div>

        {/* Resize Handle */}
        <div
          className={`flex-shrink-0 h-0 bg-transparent cursor-row-resize relative group transition-colors z-10 ${
            isDragging ? '' : ''
          }`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Larger hit area for easier grabbing */}
          <div className="absolute inset-x-0 -top-3 -bottom-3 h-6 flex items-center justify-center touch-manipulation">
            <div className={`h-1 w-8 bg-muted-foreground/20 group-hover:bg-primary group-active:bg-primary rounded-full transition-colors ${
              isDragging ? 'bg-primary' : ''
            }`}></div>
          </div>
        </div>

        {/* Bottom Panel */}
        <div 
          className="flex-1 overflow-hidden"
          style={{ height: `${rightWidth}%` }}
        >
          {rightPanel}
        </div>
      </div>
    );
  } else {
    // Horizontal orientation - Left/Right split
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
          onTouchStart={handleTouchStart}
        >
          {/* Larger hit area for easier grabbing */}
          <div className="absolute inset-y-0 -left-3 -right-3 w-6 flex items-center justify-center touch-manipulation">
            <div className={`w-1 h-8 bg-muted-foreground/20 group-hover:bg-primary group-active:bg-primary rounded-full transition-colors ${
              isDragging ? 'bg-primary' : ''
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
}
