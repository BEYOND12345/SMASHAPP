import React from 'react';
import { BottomSheet } from './bottomsheet';
import { CheckCircle2 } from 'lucide-react';

interface SendSuccessSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type?: 'estimate' | 'invoice';
  customerName?: string;
  onApproveToInvoice: () => void;
  onViewEstimate: () => void;
  intent: 'estimate' | 'approval';
}

export const SendSuccessSheet: React.FC<SendSuccessSheetProps> = ({
  isOpen,
  onClose,
  type = 'estimate',
  customerName,
  onApproveToInvoice,
  onViewEstimate,
  intent
}) => {
  // Impactful titles for both intents and types
  const isInvoice = type === 'invoice';
  const bigTitle = isInvoice 
    ? (intent === 'approval' ? 'LINK SENT' : 'INVOICE SENT')
    : (intent === 'approval' ? 'SENT FOR APPROVAL' : 'ESTIMATE SENT');
  
  // Cleaner customer name handling
  const hasValidName = customerName && customerName !== 'Not Provided' && customerName !== 'No Customer';
  const safeName = hasValidName ? customerName : 'YOUR CUSTOMER';

  // Estimates: required subtitle copy
  const estimateSubtitle =
    intent === 'approval'
      ? `APPROVAL LINK SENT TO ${safeName}`
      : `PDF SENT TO ${safeName}`;

  // Invoices: keep existing subtitle style (not in scope to change)
  const invoiceSubtitle = hasValidName ? `TO ${customerName}` : 'TO YOUR CUSTOMER';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="" contained hideHeader>
      <div className="bg-[#0b0f17] -mx-6 -my-6 px-6 py-10 text-white text-center">
        {/* Success Icon Animation Container */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center animate-in zoom-in duration-500">
            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center shadow-[0_0_30px_rgba(212,255,0,0.4)]">
              <CheckCircle2 size={32} className="text-black" />
            </div>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-[32px] font-black tracking-tighter uppercase leading-none mb-2 italic">
            {bigTitle}
          </h2>
          <p className="text-[14px] font-black text-white/40 uppercase tracking-[0.25em]">
            {isInvoice ? invoiceSubtitle : estimateSubtitle}
          </p>
        </div>

        {/* Auto-dismiss only (no actions) */}
      </div>
    </BottomSheet>
  );
};
