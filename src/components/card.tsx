import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  onClick,
  noPadding = false
}) => {
  return (
    <div 
      className={`bg-white rounded-[20px] shadow-sm border border-slate-100/50 ${noPadding ? '' : 'p-5'} ${className} ${onClick ? 'active:scale-[0.98] active:bg-slate-50/50 transition-all duration-200 cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex justify-between items-center mb-5">
    <h3 className="text-[11px] font-bold text-tertiary uppercase tracking-widest">{title}</h3>
    {action}
  </div>
);