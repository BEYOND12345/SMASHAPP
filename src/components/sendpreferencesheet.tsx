import React from 'react';
import { BottomSheet } from './bottomsheet';
import { Mail, MessageSquare, Copy, Share2, Check, X, Settings2 } from 'lucide-react';
import { DeliveryMethod } from '../lib/utils/deliveryPrefs';

const methodMeta: Record<DeliveryMethod, { label: string; icon: React.ReactNode }> = {
  email: { label: 'Email', icon: <Mail size={18} /> },
  sms: { label: 'SMS', icon: <MessageSquare size={18} /> },
  copy: { label: 'Copy link', icon: <Copy size={18} /> },
  share: { label: 'Share sheet', icon: <Share2 size={18} /> },
};

interface SendPreferenceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pdfValue: DeliveryMethod;
  linkValue: DeliveryMethod;
  onChangePdf: (m: DeliveryMethod) => void;
  onChangeLink: (m: DeliveryMethod) => void;
}

export const SendPreferenceSheet: React.FC<SendPreferenceSheetProps> = ({
  isOpen,
  onClose,
  title,
  pdfValue,
  linkValue,
  onChangePdf,
  onChangeLink,
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="" contained hideHeader>
      <div className="bg-[#0b0f17] -mx-6 -my-6 px-6 py-6 text-white animate-in fade-in duration-200">
        <div className="flex items-start justify-between gap-4 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shrink-0 animate-in zoom-in duration-300">
              <Settings2 size={20} className="text-black" />
            </div>
            <div className="flex-1">
              <h3 className="text-[18px] font-black tracking-tighter uppercase leading-tight">
                {title}
              </h3>
              <p className="text-[11px] font-black text-white/50 uppercase tracking-widest mt-1">
                Defaults for one-tap sending
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center transition-colors hover:bg-white/15"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 animate-in slide-in-from-bottom-2 duration-300 delay-75">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.35em] mb-3">
            PDF delivery
          </p>
          <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/10">
            {(['email'] as DeliveryMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => onChangePdf(m)}
                className={`w-full flex items-center justify-between gap-3 px-5 py-4 transition-colors ${
                  pdfValue === m ? 'bg-white/12' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-white/70">{methodMeta[m].icon}</span>
                  <span className="text-[12px] font-black uppercase tracking-wider">{methodMeta[m].label}</span>
                </div>
                {pdfValue === m && <Check size={18} className="text-accent" />}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] font-bold text-white/50">
            PDFs are emailed automatically (no share sheet).
          </p>
        </div>

        <div className="mt-6 animate-in slide-in-from-bottom-2 duration-300 delay-150">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.35em] mb-3">
            Link delivery
          </p>
          <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/10">
            {(['email', 'sms', 'copy', 'share'] as DeliveryMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => onChangeLink(m)}
                className={`w-full flex items-center justify-between gap-3 px-5 py-4 transition-colors ${
                  linkValue === m ? 'bg-white/12' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-white/70">{methodMeta[m].icon}</span>
                  <span className="text-[12px] font-black uppercase tracking-wider">{methodMeta[m].label}</span>
                </div>
                {linkValue === m && <Check size={18} className="text-accent" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};

