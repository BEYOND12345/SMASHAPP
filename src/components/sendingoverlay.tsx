import React from 'react';
import { Check } from 'lucide-react';

export const SendingOverlay: React.FC<{
  isOpen: boolean;
  message: string;
  variant?: 'loading' | 'success';
}> = ({ isOpen, message, variant = 'loading' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 animate-in fade-in duration-150">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-[340px] rounded-[32px] bg-[#0b0f17] border border-white/10 p-8 shadow-2xl text-white animate-in zoom-in duration-200">
        {variant === 'success' ? (
          <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mx-auto mb-6">
            <Check size={22} className="text-accent" />
          </div>
        ) : (
          <div className="w-10 h-10 border-4 border-white/15 border-t-accent rounded-full animate-spin mx-auto mb-6" />
        )}
        <p className="text-center text-[11px] font-black text-white/55 uppercase tracking-[0.35em]">
          {message}
        </p>
      </div>
    </div>
  );
};

