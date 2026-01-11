import React from 'react';
import { Layout, Header } from '../components/layout';
import { Card } from '../components/card';
import { Button } from '../components/button';
import { Estimate } from '../types';
import { Calendar, CheckCircle2, Building2 } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency } from '../lib/utils/calculations';

interface PublicQuoteViewProps {
  estimate: Estimate;
  onApprove: () => void;
  businessName: string;
}

export const PublicQuoteView: React.FC<PublicQuoteViewProps> = ({ estimate, onApprove, businessName }) => {
  const { materialsTotal, labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);

  return (
    <Layout showNav={false} className="bg-white pb-48">
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-50 sticky top-0 z-30">
          <div className="flex items-center gap-1">
              <span className="text-[14px] font-black tracking-tighter text-slate-900 uppercase">SMASH</span>
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5 shadow-[0_0_8px_rgba(212,255,0,0.5)]"></div>
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quote View</span>
      </header>

      <div className="flex-1 p-6 space-y-8">
          <div className="bg-slate-50 p-8 flex flex-col items-center text-center rounded-[24px]">
              <div className="w-20 h-20 bg-white border-2 border-slate-100 flex items-center justify-center mb-4 text-slate-900 font-black text-2xl rounded-2xl">
                {businessName.substring(0, 2).toUpperCase()}
              </div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{businessName}</h2>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">Estimate Sent</p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Estimate Summary</span>
            <h1 className="text-[28px] font-black text-slate-900 leading-tight tracking-tighter uppercase">{estimate.jobTitle}</h1>
          </div>

          <div className="bg-white border-2 border-slate-50 overflow-hidden shadow-sm rounded-[24px]">
              <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center text-[12px] font-black uppercase tracking-widest text-slate-400">
                      <span>Subtotal</span>
                      <span className="text-slate-900">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[12px] font-black uppercase tracking-widest text-slate-400">
                      <span>{estimate.currency === 'GBP' ? 'VAT' : estimate.currency === 'USD' ? 'Sales Tax' : 'GST'} ({(estimate.gstRate * 100).toFixed(0)}%)</span>
                      <span className="text-slate-900">{formatCurrency(gst)}</span>
                  </div>
                  <div className="h-px bg-slate-50"></div>
                  <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase tracking-widest text-slate-900">Total Quote</span>
                      <span className="text-2xl font-black text-slate-900 tracking-tighter">{formatCurrency(total)}</span>
                  </div>
              </div>
              <div className="p-6 bg-primary">
                  <button 
                    onClick={onApprove}
                    className="w-full h-14 rounded-xl font-black uppercase tracking-widest text-xs bg-accent text-black active:scale-[0.98] transition-all shadow-lg shadow-accent/10"
                  >
                      Approve Quote
                  </button>
              </div>
          </div>

          {/* Scope of Work */}
          <div className="space-y-4">
            <h2 className="text-[13px] font-black text-slate-400 uppercase tracking-widest ml-1">Scope of Work</h2>
            <div className="bg-slate-50 rounded-[24px] p-8">
              <ul className="space-y-6">
                {estimate.scopeOfWork.map((item, idx) => (
                  <li key={idx} className="flex gap-5 text-[15px] text-slate-900 leading-relaxed font-black uppercase tracking-tight">
                    <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0 shadow-sm" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-6 bg-white/95 backdrop-blur-xl border-t border-slate-50 z-50 pb-safe">
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <Button variant="success" fullWidth onClick={onApprove} className="h-16 rounded-[20px] font-black uppercase tracking-widest text-[15px] bg-accent text-black shadow-lg shadow-accent/10">
            <CheckCircle2 size={20} className="mr-2" />
            Approve Quote
          </Button>
        </div>
      </div>
    </Layout>
  );
};
