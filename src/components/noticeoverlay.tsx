import React from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const NoticeOverlay: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'error' | 'success' | 'info';
  onClose: () => void;
}> = ({ isOpen, title, message, variant = 'info', onClose }) => {
  if (!isOpen) return null;

  const Icon = variant === 'error' ? AlertTriangle : CheckCircle2;
  const iconBg = variant === 'error' ? 'bg-red-500/15' : 'bg-accent/20';
  const iconFg = variant === 'error' ? 'text-red-300' : 'text-accent';

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 animate-in fade-in duration-150">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[360px] rounded-[28px] bg-[#0b0f17] border border-white/10 p-6 shadow-2xl text-white animate-in zoom-in duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-2xl ${iconBg} flex items-center justify-center shrink-0`}>
              <Icon size={20} className={iconFg} />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-black uppercase tracking-widest">{title}</div>
              <div className="mt-2 text-[13px] text-white/70 leading-relaxed">{message}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/15 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

