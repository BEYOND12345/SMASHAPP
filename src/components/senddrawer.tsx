import React, { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from './bottomsheet';
import { Send, Mail, MessageSquare, Copy, Share2, FileDown, ShieldCheck, X } from 'lucide-react';
import { buildPublicQuoteUrl } from '../lib/utils/publicLinks';
import { Estimate } from '../types';
import { UserProfile } from '../types';

type SendIntent = 'estimate' | 'approval';
type DeliveryMethod = 'share' | 'copy' | 'email' | 'sms';

const LAST_METHOD_KEY = 'smash:last_delivery_method:v1';

function setLastMethod(method: DeliveryMethod) {
  try {
    window.localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    // ignore
  }
}

interface SendDrawerProps {
  isOpen: boolean;
  estimate: Estimate;
  type?: 'estimate' | 'invoice';
  userProfile?: UserProfile;
  shortCode?: string | null;
  customerName?: string;
  onClose: () => void;
  // One-tap primary send is handled by parent (background email / secure link).
  onPrimarySend: (intent: SendIntent) => Promise<void> | void;
}

export const SendDrawer: React.FC<SendDrawerProps> = ({
  isOpen,
  estimate,
  type = 'estimate',
  shortCode,
  customerName,
  onClose,
  onPrimarySend
}) => {
  const [isWorking, setIsWorking] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const isInvoice = type === 'invoice';
  const noun = isInvoice ? 'invoice' : 'estimate';

  const shareUrl = useMemo(() => (shortCode ? buildPublicQuoteUrl(shortCode, type) : ''), [shortCode, type]);
  // We still persist the last method on send, but we don't auto-send with it.

  useEffect(() => {
    if (!isOpen) return;
    // reset each open
    setIsWorking(false);
    setSendError(null);
  }, [isOpen]);

  const runPrimarySend = async (intent: SendIntent) => {
    if (isWorking) return;
    setSendError(null);
    setIsWorking(true);
    try {
      // Close immediately so the global overlay + success confirmation can show.
      onClose();
      await onPrimarySend(intent);
    } finally {
      setIsWorking(false);
    }
  };

  const runOtherOption = async (via: DeliveryMethod) => {
    setSendError(null);
    setLastMethod(via);
    try {
      if (!shareUrl) throw new Error('Link not ready yet. Try again.');
      const navAny = navigator as any;

      if (via === 'share') {
        await navAny.share?.({
          title: isInvoice ? 'View invoice' : 'Approve estimate',
          text: isInvoice ? 'Please view your invoice:' : 'Please review and approve this estimate:',
          url: shareUrl
        });
      } else if (via === 'copy') {
        await navigator.clipboard.writeText(shareUrl);
      } else if (via === 'email') {
        const subject = encodeURIComponent(isInvoice ? 'Invoice link' : 'Estimate for approval');
        const body = encodeURIComponent(`${isInvoice ? 'View invoice:' : 'Review and approve:'}\n\n${shareUrl}`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      } else if (via === 'sms') {
        const body = encodeURIComponent(`${isInvoice ? 'View invoice:' : 'Review and approve:'} ${shareUrl}`);
        window.location.href = `sms:&body=${body}`;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setSendError(e?.message || 'Failed. Try again.');
    }
  };

  const disabled = isWorking;

  return (
    <BottomSheet isOpen={isOpen} onClose={disabled ? () => {} : onClose} title="" contained hideHeader>
      <div className="bg-[#0b0f17] -mx-6 -my-6 px-6 py-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
              <Send size={20} className="text-white/80" />
            </div>
            <div className="flex-1">
              <h3 className="text-[18px] font-black tracking-tighter uppercase leading-tight">
                Send {noun}
              </h3>
              <p className="text-[11px] font-black text-white/50 uppercase tracking-widest mt-1">
                {customerName ? `To ${customerName}` : `${isInvoice ? 'Invoice' : 'Estimate'} #${estimate.id.substring(0, 6).toUpperCase()}`}
              </p>
            </div>
          </div>
          <button
            onClick={disabled ? undefined : onClose}
            className={`w-10 h-10 rounded-full bg-white/10 flex items-center justify-center transition-colors ${disabled ? 'opacity-40' : 'hover:bg-white/15'}`}
            aria-label="Close"
            disabled={disabled}
          >
            <X size={18} />
          </button>
        </div>

        <>
          <div className="mt-6">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.35em] mb-3">
              Choose what you want to do
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                disabled={disabled}
                onClick={() => runPrimarySend('estimate')}
                className="w-full rounded-[18px] px-5 py-4 border transition-colors text-left bg-white/6 border-white/10 hover:bg-white/10 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <FileDown size={18} className="text-white/80" />
                    <div>
                      <div className="text-[12px] font-black uppercase tracking-widest">Send {isInvoice ? 'Invoice' : 'Estimate'}</div>
                      <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-1">Sends a PDF</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">PDF</span>
                </div>
              </button>

              <button
                disabled={disabled}
                onClick={() => runPrimarySend('approval')}
                className="w-full rounded-[18px] px-5 py-4 border transition-colors text-left bg-white/6 border-white/10 hover:bg-white/10 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {isInvoice ? <Share2 size={18} className="text-white/80" /> : <ShieldCheck size={18} className="text-white/80" />}
                    <div>
                      <div className="text-[12px] font-black uppercase tracking-widest">Send {isInvoice ? 'Share Link' : 'for Approval'}</div>
                      <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-1">Sends {isInvoice ? 'view link' : 'approval link'}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">LINK</span>
                </div>
              </button>
            </div>
          </div>

          {/* Secondary utility options - always available for quick access */}
          <div className="mt-6 pt-5 border-t border-white/5">
            <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.35em] mb-3">
              Other options
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={disabled}
                onClick={() => runOtherOption('share')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <Share2 size={14} className="text-white/50" />
                <span className="text-[11px] font-bold text-white/50">Share</span>
              </button>

              <button
                disabled={disabled}
                onClick={() => runOtherOption('email')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <Mail size={14} className="text-white/50" />
                <span className="text-[11px] font-bold text-white/50">Email</span>
              </button>

              <button
                disabled={disabled}
                onClick={() => runOtherOption('sms')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <MessageSquare size={14} className="text-white/50" />
                <span className="text-[11px] font-bold text-white/50">SMS</span>
              </button>

              <button
                disabled={disabled}
                onClick={() => runOtherOption('copy')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <Copy size={14} className="text-white/50" />
                <span className="text-[11px] font-bold text-white/50">Copy link</span>
              </button>
            </div>

            {sendError && (
              <p className="mt-3 text-[11px] font-bold text-white/60">
                {sendError}
              </p>
            )}
          </div>
        </>

        {isWorking && (
          <div className="mt-6 rounded-2xl bg-white/10 border border-white/10 p-5 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-[11px] font-black uppercase tracking-widest text-white/70">Sending…</span>
          </div>
        )}
      </div>
    </BottomSheet>
  );
};

