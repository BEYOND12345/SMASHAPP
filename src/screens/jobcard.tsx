import React from 'react';
import { Layout, Header } from '../components/layout';
import { Button } from '../components/button';
import { Pill } from '../components/pill';
import { Estimate, JobStatus } from '../types';
import { ChevronLeft, FileText, FileCheck, Phone, CheckCircle2, ArrowRight, Lock, Calendar } from 'lucide-react';
import { getInitials } from '../lib/utils/calculations';

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
  
  const getSmartAction = () => {
    switch (estimate.status) {
      case JobStatus.DRAFT:
        return (
          <Button variant="primary" fullWidth onClick={onViewEstimate} className="shadow-float">
            <span className="mr-2">Review Quote</span>
            <ArrowRight size={18} />
          </Button>
        );
      case JobStatus.SENT:
        return (
          <div className="flex gap-3 w-full">
             <Button variant="secondary" className="flex-1" onClick={onViewEstimate}>Resend</Button>
             <Button variant="success" className="flex-[2]" onClick={() => onStatusChange?.(JobStatus.APPROVED)}>
               <CheckCircle2 size={18} className="mr-2" />
               Approve to Invoice
             </Button>
          </div>
        );
      case JobStatus.APPROVED:
        return (
          <Button variant="primary" fullWidth onClick={onViewInvoice} className="shadow-lg shadow-brand/20">
            <span className="mr-2">Review Invoice</span>
            <ArrowRight size={18} />
          </Button>
        );
      case JobStatus.PAID:
         return (
           <div className="flex items-center justify-center w-full h-[56px] bg-white border border-border rounded-2xl text-secondary font-semibold">
              <CheckCircle2 size={18} className="mr-2 text-[#65a30d]" /> {/* Lime 600 */}
              Job Completed
           </div>
         );
      default:
        return null;
    }
  };

  const hasInvoice = estimate.status === JobStatus.APPROVED || estimate.status === JobStatus.PAID;

  return (
    <Layout showNav={false} activeTab="estimates" className="bg-surface relative">
      <Header 
        left={
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-primary hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        }
      />

      <div className="px-6 flex flex-col gap-8 pb-40">
        
        {/* Minimal Hero */}
        <div className="flex flex-col items-center">
           <div className="w-20 h-20 rounded-full flex items-center justify-center shrink-0 text-[24px] font-bold tracking-tight mb-5 bg-white border border-border text-brand shadow-sm">
              {getInitials(estimate.clientName)}
           </div>
           <h1 className="text-[28px] font-bold text-primary tracking-tighter text-center leading-tight mb-2">{estimate.jobTitle}</h1>
           <div className="flex items-center gap-3">
             <span className="text-secondary text-[15px] font-medium">{estimate.clientName}</span>
             <span className="w-1 h-1 rounded-full bg-tertiary" />
             <Pill status={estimate.status} />
           </div>
        </div>

        {/* Timeline Flow */}
        <div className="relative">
          {/* Vertical Connector Line */}
          <div className="absolute left-[28px] top-8 bottom-8 w-[2px] bg-border z-0" />

          <div className="flex flex-col gap-6 relative z-10">
            
            {/* 1. Estimate Step */}
            <div 
              onClick={onViewEstimate}
              className="group bg-white rounded-[24px] p-4 flex items-center gap-4 shadow-card border border-white/50 cursor-pointer hover:border-border transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-surface border border-border text-primary flex items-center justify-center shrink-0">
                <FileText size={24} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-primary tracking-tight">Estimate</h3>
                <p className="text-[13px] text-secondary mt-0.5">Created {estimate.date}</p>
              </div>
              <div className="px-4">
                 <span className="text-[15px] font-bold text-primary tabular-nums font-mono">$4,850</span>
              </div>
            </div>

            {/* 2. Invoice Step */}
            <div 
              onClick={hasInvoice ? onViewInvoice : undefined}
              className={`rounded-[24px] p-4 flex items-center gap-4 transition-all
                ${hasInvoice 
                  ? 'bg-white shadow-card border border-white/50 cursor-pointer hover:border-border' 
                  : 'bg-surface/50 border-2 border-dashed border-border opacity-70'
                }`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${hasInvoice ? 'bg-accent text-accentText border-accent' : 'bg-surface text-tertiary border-border'}`}>
                {hasInvoice ? <FileCheck size={24} strokeWidth={1.5} /> : <Lock size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-primary tracking-tight">{hasInvoice ? 'Invoice #001' : 'Invoice'}</h3>
                <p className="text-[13px] text-secondary mt-0.5">{hasInvoice ? 'Ready to send' : 'Unlock by approving quote'}</p>
              </div>
              {hasInvoice && (
                <div className="px-4">
                  <span className="text-[15px] font-bold text-primary tabular-nums font-mono">$4,850</span>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Quick Actions / Info */}
        <div className="grid grid-cols-2 gap-3">
            {estimate.clientPhone && (
               <a href={`tel:${estimate.clientPhone}`} className="bg-white border border-white/50 p-4 rounded-2xl shadow-card flex flex-col items-center justify-center gap-2 hover:bg-surface transition-colors active:scale-[0.98]">
                  <Phone size={20} className="text-secondary" />
                  <span className="text-[13px] font-bold text-primary">Call Client</span>
               </a>
            )}
             <div className="bg-white border border-white/50 p-4 rounded-2xl shadow-card flex flex-col items-center justify-center gap-2">
                 <Calendar size={20} className="text-secondary" />
                 <span className="text-[13px] font-bold text-primary">{estimate.timeline}</span>
             </div>
        </div>

      </div>

      {/* Smart Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-xl border-t border-border z-50 max-w-[390px] mx-auto pb-8">
         {getSmartAction()}
      </div>

    </Layout>
  );
};