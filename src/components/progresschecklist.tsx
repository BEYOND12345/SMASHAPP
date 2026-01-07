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
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-2 py-2 min-h-[56px]"
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ease-out">
              {item.state === 'waiting' && (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-tertiary">{item.label.charAt(0)}</span>
                </div>
              )}
              {item.state === 'in_progress' && (
                <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center animate-pulse-slow">
                  <span className="text-[11px] font-bold text-white">{item.label.charAt(0)}</span>
                </div>
              )}
              {item.state === 'complete' && (
                <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center">
                  <CheckCircle2
                    size={14}
                    className="text-white"
                    strokeWidth={3}
                  />
                </div>
              )}
            </div>
            <span
              className={`text-[15px] font-medium transition-colors duration-200 ease-out ${
                item.state === 'waiting'
                  ? 'text-tertiary'
                  : item.state === 'in_progress'
                  ? 'text-primary font-semibold'
                  : 'text-secondary'
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
