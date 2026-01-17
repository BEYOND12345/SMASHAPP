import React from 'react';
import { BottomSheet } from './bottomsheet';
import { Mail, MessageSquare, Copy, Share2, Check } from 'lucide-react';
import { DeliveryMethod } from '../lib/utils/deliveryPrefs';

interface DeliveryMethodSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: DeliveryMethod;
  onChange: (method: DeliveryMethod) => void;
  methods: DeliveryMethod[];
}

const meta: Record<DeliveryMethod, { label: string; icon: React.ReactNode }> = {
  email: { label: 'Email', icon: <Mail size={18} /> },
  sms: { label: 'SMS', icon: <MessageSquare size={18} /> },
  copy: { label: 'Copy link', icon: <Copy size={18} /> },
  share: { label: 'Share sheet', icon: <Share2 size={18} /> },
};

export const DeliveryMethodSheet: React.FC<DeliveryMethodSheetProps> = ({
  isOpen,
  onClose,
  title,
  value,
  onChange,
  methods,
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-2">
        {methods.map((m) => {
          const active = value === m;
          return (
            <button
              key={m}
              onClick={() => onChange(m)}
              className={`w-full flex items-center justify-between gap-4 rounded-2xl px-4 py-4 border transition-colors ${
                active ? 'border-accent bg-accent/10' : 'border-slate-100 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3 text-slate-900">
                <span className={`${active ? 'text-accentDark' : 'text-slate-500'}`}>{meta[m].icon}</span>
                <span className="text-[14px] font-bold">{meta[m].label}</span>
              </div>
              {active && <Check size={18} className="text-accentDark" />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
};

