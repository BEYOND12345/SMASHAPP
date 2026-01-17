import React from 'react';
import { Layout } from '../components/layout';
import { Button } from '../components/button';
import { Estimate, JobStatus, UserProfile } from '../types';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { DocumentTemplate } from '../components/document/documenttemplate';

interface PublicQuoteViewProps {
  estimate: Estimate;
  onApprove: () => void;
  onViewInvoice?: () => void;
  businessName: string;
  userProfile?: UserProfile;
}

export const PublicQuoteView: React.FC<PublicQuoteViewProps> = ({ estimate, onApprove, onViewInvoice, businessName, userProfile }) => {
  const showViewInvoice = estimate.status === JobStatus.APPROVED || estimate.status === JobStatus.INVOICED;

  return (
    <Layout showNav={false} className="bg-slate-100 pb-48">
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-1">
              <span className="text-[14px] font-black tracking-tighter text-slate-900 uppercase">SMASH</span>
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5 shadow-[0_0_8px_rgba(212,255,0,0.5)]"></div>
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Formal Quote</span>
      </header>

      <div className="flex-1 overflow-x-hidden pt-8 px-0 sm:px-6">
          <div className="max-w-[800px] mx-auto shadow-2xl mb-12">
            <DocumentTemplate 
              estimate={estimate} 
              userProfile={userProfile || { id: '', email: '', businessName, tradeType: '', phone: '' }} 
              type="estimate"
            />
          </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[450px] p-6 bg-white/95 backdrop-blur-xl border-t border-slate-200 z-50 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-[32px]">
        <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Secure Document Approval</p>
            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
          </div>
          {showViewInvoice ? (
            <Button
              variant="primary"
              fullWidth
              onClick={onViewInvoice || onApprove}
              className="h-16 rounded-[20px] font-black uppercase tracking-widest text-[15px] bg-slate-900 text-white shadow-xl shadow-slate-900/10 active:scale-[0.98]"
            >
              View Invoice
              <ArrowRight size={20} className="ml-2" />
            </Button>
          ) : estimate.status === JobStatus.DECLINED ? (
            <Button
              variant="secondary"
              fullWidth
              disabled
              className="h-16 rounded-[20px] font-black uppercase tracking-widest text-[15px]"
            >
              Quote Declined
            </Button>
          ) : estimate.status === JobStatus.EXPIRED ? (
            <Button
              variant="secondary"
              fullWidth
              disabled
              className="h-16 rounded-[20px] font-black uppercase tracking-widest text-[15px]"
            >
              Quote Expired
            </Button>
          ) : (
            <Button
              variant="success"
              fullWidth
              onClick={onApprove}
              className="h-16 rounded-[20px] font-black uppercase tracking-widest text-[15px] bg-slate-900 text-white shadow-xl shadow-slate-900/10 active:scale-[0.98]"
            >
              <CheckCircle2 size={20} className="mr-2" />
              Approve Quote
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
};
