import React from 'react';
import { CheckCircle2 } from 'lucide-react';

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
      <div className="space-y-2.5">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`
              bg-white rounded-[14px] p-3.5 flex items-center gap-3 transition-all duration-200
              ${item.state === 'waiting' ? 'shadow-sm border border-gray-100' : ''}
              ${item.state === 'in_progress' ? 'shadow-md border-2 border-[#10b981] scale-[1.02]' : ''}
              ${item.state === 'complete' ? 'shadow-sm border border-gray-100' : ''}
            `}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200">
              {item.state === 'waiting' && (
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="text-[13px] font-bold text-tertiary">{index + 1}</span>
                </div>
              )}
              {item.state === 'in_progress' && (
                <div className="w-7 h-7 rounded-full bg-[#10b981] flex items-center justify-center">
                  <span className="text-[13px] font-bold text-white">{index + 1}</span>
                </div>
              )}
              {item.state === 'complete' && (
                <div className="w-7 h-7 rounded-full bg-[#10b981] flex items-center justify-center">
                  <CheckCircle2
                    size={18}
                    className="text-white"
                    strokeWidth={2.5}
                  />
                </div>
              )}
            </div>
            <div className="flex-1 flex items-center justify-between">
              <span
                className={`text-[15px] font-medium transition-colors duration-200 ${
                  item.state === 'waiting'
                    ? 'text-tertiary'
                    : item.state === 'in_progress'
                    ? 'text-primary font-semibold'
                    : 'text-secondary'
                }`}
              >
                {item.label.replace(/^\d+\.\s*/, '')}
              </span>
              {item.state === 'in_progress' && (
                <div className="bg-[#10b981]/10 px-2.5 py-1 rounded-full">
                  <span className="text-[11px] font-semibold text-[#10b981]">Detecting</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
