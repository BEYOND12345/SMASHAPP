import React from 'react';
import { JobStatus } from '../types';

interface PillProps {
  status: JobStatus;
}

export const Pill: React.FC<PillProps> = ({ status }) => {
  const styles = {
    [JobStatus.DRAFT]: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      dot: 'bg-gray-400'
    },
    [JobStatus.SENT]: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      dot: 'bg-gray-500'
    },
    [JobStatus.APPROVED]: {
      bg: 'bg-accent/20',
      text: 'text-accentDark',
      dot: 'bg-accent'
    },
    [JobStatus.PAID]: {
      bg: 'bg-accent/20',
      text: 'text-accentDark',
      dot: 'bg-accent'
    }
  };

  const style = styles[status];

  return (
    <div className={`flex items-center gap-1.5 ${style.bg} px-3 py-1.5 rounded-full`}>
      <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      <span className={`text-[11px] font-bold ${style.text} tracking-wide uppercase`}>{status}</span>
    </div>
  );
};
