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
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={`
              flex items-center gap-3 px-4 rounded-lg min-h-[56px] transition-all duration-200 ease-out
              ${item.state === 'in_progress' ? 'bg-[#10b981]/10 animate-pulse-slow' : ''}
              ${item.state === 'complete' ? 'bg-[#d4ff00]' : ''}
            `}
          >
            {item.state === 'waiting' && (
              <Circle size={20} className="text-[#94a3b8] flex-shrink-0" strokeWidth={2} />
            )}
            {item.state === 'in_progress' && (
              <CircleDot
                size={20}
                className="text-[#10b981] flex-shrink-0"
                strokeWidth={2}
              />
            )}
            {item.state === 'complete' && (
              <CheckCircle2
                size={20}
                className="text-[#1a2e05] flex-shrink-0"
                strokeWidth={2.5}
              />
            )}
            <span
              className={`text-[15px] font-medium transition-colors duration-200 ${
                item.state === 'waiting'
                  ? 'text-[#94a3b8]'
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
