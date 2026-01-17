import React from 'react';
import { Button } from './button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />
      <div className="relative bg-white w-full max-w-[320px] rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        <h3 className="text-[20px] font-black text-slate-900 tracking-tight text-center mb-2 uppercase">
          {title}
        </h3>
        <p className="text-[14px] font-bold text-slate-400 text-center leading-relaxed mb-8 uppercase tracking-wide">
          {message}
        </p>
        <div className="flex flex-col gap-3">
          <Button 
            variant={variant === 'danger' ? 'danger' : 'primary'} 
            fullWidth 
            onClick={onConfirm}
            className="h-14 uppercase tracking-widest text-[11px] font-black"
          >
            {confirmLabel}
          </Button>
          <Button 
            variant="secondary" 
            fullWidth 
            onClick={onCancel}
            className="h-14 border-none uppercase tracking-widest text-[11px] font-black text-slate-400"
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
