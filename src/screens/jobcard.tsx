import React from 'react';
import { Layout, Header } from '../components/layout';
import { Button } from '../components/button';
import { Pill } from '../components/pill';
import { Estimate, JobStatus } from '../types';
import { ChevronLeft, FileText, FileCheck, Phone, CheckCircle2, ArrowRight, Lock, Calendar } from 'lucide-react';
import { getInitials, formatCurrency, calculateEstimateTotals } from '../lib/utils/calculations';

interface JobCardProps {
  estimate: Estimate;
  onBack: () => void;
  onViewEstimate: () => void;
  onViewInvoice: () => void;
  onSendInvoice: () => void;
  onStatusChange?: (newStatus: JobStatus) => void;
}

export const JobCard: React.FC<JobCardProps> = ({ 
  estimate, 
  onBack, 
  onViewEstimate, 
  onViewInvoice, 
  onStatusChange 
}) => {
  
  const totals = calculateEstimateTotals(estimate);

  const getSmartAction = () => {
    switch (estimate.status) {
      case JobStatus.DRAFT:
        return (
          <Button variant="primary" fullWidth onClick={onViewEstimate} className="shadow-float h-[64px] text-[17px]">
            <span className="mr-2 text-white">Review Quote</span>
            <ArrowRight size={20} className="text-white" />
          </Button>
        );
      case JobStatus.SENT:
        return (
          <div className="flex gap-3 w-full">
             <Button variant="secondary" className="flex-1 h-[64px]" onClick={onViewEstimate}>Resend</Button>
             <Button variant="success" className="flex-[2] h-[64px] text-[17px]" onClick={() => onStatusChange?.(JobStatus.APPROVED)}>
               <CheckCircle2 size={20} className="mr-2" />
               Approve to Invoice
             </Button>
          </div>
        );
      case JobStatus.APPROVED:
        return (
          <Button variant="primary" fullWidth onClick={onViewInvoice} className="shadow-float h-[64px] text-[17px]">
            <span className="mr-2 text-white">Review Invoice</span>
            <ArrowRight size={20} className="text-white" />
          </Button>
        );
      case JobStatus.PAID:
         return (
           <div className="flex items-center justify-center w-full h-[64px] bg-slate-50 border border-slate-100 rounded-[20px] text-slate-500 font-bold">
              <CheckCircle2 size={20} className="mr-2 text-green-500" />
              Job Completed
           </div>
         );
      default:
        return null;
    }
  };

  const hasInvoice = estimate.status === JobStatus.APPROVED || estimate.status === JobStatus.PAID;

  return (
    <Layout showNav={false} activeTab="estimates" className="bg-[#FAFAFA] relative">
      <Header 
        left={
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        }
      />

      <div className="px-6 flex flex-col gap-10 pb-48">
        
        {/* Minimal Hero */}
        <div className="flex flex-col items-center w-full pt-4">
           <div className="w-24 h-24 rounded-full flex items-center justify-center shrink-0 text-[28px] font-black tracking-tight mb-6 bg-white border border-slate-100 text-slate-900 shadow-sm">
              {getInitials(estimate.clientName)}
           </div>
           <h1 className="text-[32px] font-black text-slate-900 tracking-tight leading-[1.1] mb-3 w-full text-center line-clamp-2">{estimate.jobTitle}</h1>
           <div className="flex items-center gap-3 max-w-full px-4 min-w-0">
             <span className="text-slate-500 text-[16px] font-bold min-w-0 flex-shrink truncate">{estimate.clientName}</span>
             <span className="w-1.5 h-1.5 rounded-full bg-slate-200 flex-shrink-0" />
             <div className="flex-shrink-0 scale-110">
               <Pill status={estimate.status} />
             </div>
           </div>
        </div>

        {/* Timeline Flow */}
        <div className="relative px-2">
          {/* Vertical Connector Line */}
          <div className="absolute left-[36px] top-10 bottom-10 w-[2px] bg-slate-100 z-0" />

          <div className="flex flex-col gap-8 relative z-10">
            
            {/* 1. Estimate Step */}
            <div 
              onClick={onViewEstimate}
              className="group bg-white rounded-[28px] p-5 flex items-center gap-5 shadow-sm border border-slate-100/50 cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="w-14 h-14 rounded-[20px] bg-slate-50 border border-slate-100 text-slate-900 flex items-center justify-center shrink-0">
                <FileText size={26} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Estimate</h3>
                <p className="text-[14px] text-slate-400 font-medium mt-0.5">Created {estimate.date}</p>
              </div>
              <div className="pr-2 text-right">
                 <span className="text-[17px] font-black text-slate-900 tabular-nums tracking-tight">{formatCurrency(totals.total)}</span>
              </div>
            </div>

            {/* 2. Invoice Step */}
            <div 
              onClick={hasInvoice ? onViewInvoice : undefined}
              className={`rounded-[28px] p-5 flex items-center gap-5 transition-all
                ${hasInvoice 
                  ? 'bg-white shadow-sm border border-slate-100/50 cursor-pointer active:scale-[0.98]' 
                  : 'bg-slate-50/50 border-2 border-dashed border-slate-100 opacity-60'
                }`}
            >
              <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center shrink-0 border-2 ${hasInvoice ? 'bg-accent text-accentText border-accent shadow-sm' : 'bg-transparent text-slate-300 border-slate-100'}`}>
                {hasInvoice ? <FileCheck size={26} strokeWidth={2.5} /> : <Lock size={22} />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-[17px] font-bold tracking-tight ${hasInvoice ? 'text-slate-900' : 'text-slate-400'}`}>{hasInvoice ? 'Invoice #001' : 'Invoice'}</h3>
                <p className="text-[14px] text-slate-400 font-medium mt-0.5">{hasInvoice ? 'Ready to send' : 'Unlock by approving quote'}</p>
              </div>
              {hasInvoice && (
                <div className="pr-2 text-right">
                  <span className="text-[17px] font-black text-slate-900 tabular-nums tracking-tight">{formatCurrency(totals.total)}</span>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Quick Actions / Info */}
        <div className="grid grid-cols-2 gap-4 px-2">
            {estimate.clientPhone && (
               <a href={`tel:${estimate.clientPhone}`} className="bg-white border border-slate-100/50 p-5 rounded-[24px] shadow-sm flex flex-col items-center justify-center gap-3 hover:bg-slate-50 transition-all active:scale-[0.95]">
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center">
                    <Phone size={20} className="text-slate-600" />
                  </div>
                  <span className="text-[14px] font-bold text-slate-900">Call Client</span>
               </a>
            )}
             <div className="bg-white border border-slate-100/50 p-5 rounded-[24px] shadow-sm flex flex-col items-center justify-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center">
                   <Calendar size={20} className="text-slate-600" />
                 </div>
                 <span className="text-[14px] font-bold text-slate-900">{estimate.timeline}</span>
             </div>
        </div>

      </div>

      {/* Smart Action Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-6 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-50 pb-safe">
         <div className="animate-in slide-in-from-bottom-4 duration-500">
           {getSmartAction()}
         </div>
      </div>

    </Layout>
  );
};
