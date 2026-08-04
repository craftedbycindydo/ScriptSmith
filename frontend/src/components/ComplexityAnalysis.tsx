import { Badge } from '@/components/ui/badge';
import { Clock, HardDrive, Info } from 'lucide-react';

interface ComplexityAnalysis {
  time_complexity: string;
  space_complexity: string;
  explanation: string;
  available: boolean;
}

interface ComplexityAnalysisProps {
  complexity: ComplexityAnalysis | null;
  isLoading: boolean;
}

export default function ComplexityAnalysis({ complexity, isLoading }: ComplexityAnalysisProps) {
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Analyzing code complexity...
      </div>
    );
  }

  if (!complexity) {
    return (
      <div className="text-sm text-muted-foreground">
        Complexity analysis not available
      </div>
    );
  }

  if (!complexity.available) {
    return (
      <div className="text-sm text-muted-foreground">
        {complexity.explanation || 'Complexity analysis not available'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center space-x-2">
          <Clock className="w-3 h-3 text-warning" />
          <span className="text-xs text-muted-foreground">Time:</span>
          <Badge variant="outline" className="text-xs">
            {complexity.time_complexity}
          </Badge>
        </div>
        
        <div className="flex items-center space-x-2">
          <HardDrive className="w-3 h-3 text-success" />
          <span className="text-xs text-muted-foreground">Space:</span>
          <Badge variant="outline" className="text-xs">
            {complexity.space_complexity}
          </Badge>
        </div>
      </div>
      
      {complexity.explanation && complexity.explanation !== 'Not Available' && (
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-start space-x-2">
            <Info className="w-3 h-3 text-info mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {complexity.explanation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
