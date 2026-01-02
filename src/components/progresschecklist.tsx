import React from 'react';
import { Circle, CircleDot, CheckCircle2 } from 'lucide-react';

export type ChecklistItemState = 'waiting' | 'in_progress' | 'complete';

export interface ChecklistItem {
  id: string;
  label: string;
  state: ChecklistItemState;
}

interface ProgressChecklistProps {
  items: ChecklistItem[];
  className?: string;
}

export const ProgressChecklist: React.FC<ProgressChecklistProps> = ({ items, className = '' }) => {
  return (
    <div className={`bg-white/50 backdrop-blur-sm rounded-lg p-4 ${className}`}>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            {item.state === 'waiting' && (
              <Circle size={20} className="text-tertiary opacity-60 flex-shrink-0" />
            )}
            {item.state === 'in_progress' && (
              <CircleDot
                size={20}
                className="text-secondary flex-shrink-0 animate-pulse-slow"
              />
            )}
            {item.state === 'complete' && (
              <CheckCircle2
                size={20}
                className="text-brand flex-shrink-0 animate-scale-in"
              />
            )}
            <span
              className={`text-[14px] transition-colors ${
                item.state === 'waiting'
                  ? 'text-tertiary opacity-60'
                  : item.state === 'in_progress'
                  ? 'text-secondary'
                  : 'text-primary font-normal'
              }`}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
