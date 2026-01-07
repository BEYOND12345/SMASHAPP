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
    <div className={`${className}`}>
      <div className="space-y-2 text-left">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            {item.state === 'waiting' && (
              <Circle size={16} className="text-[#94a3b8] flex-shrink-0" strokeWidth={2} />
            )}
            {item.state === 'in_progress' && (
              <CircleDot
                size={16}
                className="text-[#10b981] flex-shrink-0 animate-pulse"
                strokeWidth={2}
              />
            )}
            {item.state === 'complete' && (
              <CheckCircle2
                size={16}
                className="text-[#10b981] flex-shrink-0"
                strokeWidth={2}
              />
            )}
            <span
              className={`text-[14px] transition-colors duration-300 ${
                item.state === 'waiting'
                  ? 'text-[#94a3b8]'
                  : item.state === 'in_progress'
                  ? 'text-[#0f172a] font-medium'
                  : 'text-[#0f172a]'
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
