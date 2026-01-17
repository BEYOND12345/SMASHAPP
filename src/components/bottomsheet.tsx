import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  contained?: boolean;
  hideHeader?: boolean;
  variant?: 'light' | 'dark';
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  contained = false,
  hideHeader = false,
  variant = 'light',
}) => {
  if (!isOpen) return null;

  const content = (
    <>
      <div className={`${contained ? 'absolute' : 'fixed'} inset-x-0 bottom-0 z-50 animate-sheet-up`}>
        <div
          className={`rounded-t-3xl shadow-xl max-h-[85vh] overflow-hidden flex flex-col ${
            variant === 'dark' ? 'bg-[#0b0f17] text-white' : 'bg-white'
          }`}
        >
          {!hideHeader && (
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${
                variant === 'dark' ? 'border-white/10' : 'border-divider'
              }`}
            >
              <h3 className={`text-[18px] font-bold ${variant === 'dark' ? 'text-white' : 'text-primary'}`}>{title}</h3>
              <button
                onClick={onClose}
                className={`p-2 -mr-2 transition-colors ${
                  variant === 'dark' ? 'text-white/60 hover:text-white' : 'text-secondary hover:text-primary'
                }`}
              >
                <X size={24} />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {children}
          </div>
        </div>
      </div>
    </>
  );

  if (!contained) return content;

  const root = document.getElementById('app-overlay-root');
  return root ? createPortal(content, root) : content;
};
