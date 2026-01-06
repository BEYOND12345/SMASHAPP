import React from 'react';
import { useJobProgress } from '../hooks/useJobProgress';
import './ExtractionChecklist.css';

interface ChecklistItem {
  id: string;
  label: string;
  icon: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'location', label: 'Job location', icon: '📍' },
  { id: 'customer', label: 'Customer name', icon: '👤' },
  { id: 'scope', label: 'Scope of work', icon: '🔨' },
  { id: 'materials', label: 'Materials & quantities', icon: '📦' },
  { id: 'labour', label: 'Time estimate', icon: '⏱️' },
  { id: 'fees', label: 'Additional fees', icon: '💰' }
];

export const ExtractionChecklist: React.FC<{ jobId: string }> = ({ jobId }) => {
  const { progress, currentStep, stepsCompleted } = useJobProgress(jobId);

  return (
    <div className="extraction-checklist">
      <h3 className="checklist-title">Extracting Details...</h3>

      <div className="checklist-items">
        {CHECKLIST_ITEMS.map((item) => {
          const isComplete = stepsCompleted.includes(item.id);
          const isCurrent = currentStep === item.id;

          return (
            <div
              key={item.id}
              className={`checklist-item ${isComplete ? 'complete' : ''} ${isCurrent ? 'active' : ''}`}
            >
              <div className="check-icon">
                {isComplete ? '✓' : isCurrent ? '⏳' : '○'}
              </div>
              <span className="item-icon">{item.icon}</span>
              <span className="item-label">{item.label}</span>
            </div>
          );
        })}
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="progress-text">{progress}% complete</div>
    </div>
  );
};
