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
      <div className="space-y-3.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            {item.state === 'waiting' && (
              <Circle size={18} className="text-tertiary opacity-40 flex-shrink-0" strokeWidth={2} />
            )}
            {item.state === 'in_progress' && (
              <CircleDot
                size={18}
                className="text-secondary flex-shrink-0 animate-pulse-slow"
                strokeWidth={2}
              />
            )}
            {item.state === 'complete' && (
              <CheckCircle2
                size={18}
                className="text-brand flex-shrink-0 animate-scale-in"
                strokeWidth={2}
              />
            )}
            <span
              className={`text-[14px] transition-colors duration-300 ${
                item.state === 'waiting'
                  ? 'text-tertiary opacity-50'
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
