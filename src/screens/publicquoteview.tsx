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
    <Layout showNav={false} className="bg-[#FAFAFA] pb-48">
      <div className="h-[80px] flex items-center justify-center bg-white border-b border-slate-100 mb-6 sticky top-0 z-30">
        <h1 className="font-black text-2xl tracking-tighter text-slate-900 uppercase">SMASH<span className="text-accent">.</span></h1>
      </div>

      <div className="px-8 py-6 bg-white border-b border-slate-100 mb-8">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-[16px] bg-slate-900 flex items-center justify-center shrink-0 shadow-lg shadow-slate-900/10">
            <Building2 size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-[18px] font-black text-slate-900 tracking-tight leading-none">{businessName}</h2>
            <p className="text-[13px] text-slate-400 font-bold uppercase tracking-widest mt-1">Estimate Sent</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-2 px-2">
        <div className="px-6 flex flex-col gap-4 mb-10">
          <h2 className="text-[13px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Job Summary</h2>
          <Card className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-[32px] font-black text-slate-900 tracking-tighter leading-[1.1]">{estimate.jobTitle}</h2>
              <p className="text-[17px] font-bold text-slate-600 truncate">{estimate.clientName}</p>
              {estimate.clientAddress && <p className="text-[14px] text-slate-400 font-medium leading-relaxed">{estimate.clientAddress}</p>}
            </div>
            <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 rounded-[20px] w-fit border border-slate-100">
              <Calendar size={18} className="text-slate-900" />
              <span className="text-[14px] font-black text-slate-900 uppercase tracking-wider">
                Timeline: <span className="text-slate-500">{estimate.timeline}</span>
              </span>
            </div>
          </Card>
        </div>

        <div className="px-6 flex flex-col gap-4 mb-10">
          <h2 className="text-[13px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Scope of Work</h2>
          <Card className="p-8">
            <ul className="space-y-6">
              {estimate.scopeOfWork.map((item, idx) => (
                <li key={idx} className="flex gap-5 text-[16px] text-slate-900 leading-relaxed font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent mt-2 shrink-0 shadow-sm" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="px-6 flex flex-col gap-4 mb-10">
          <h2 className="text-[13px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Breakdown</h2>
          <Card noPadding className="overflow-hidden border-2 border-slate-100 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    <th className="px-8 py-5">Line Item</th>
                    <th className="px-8 py-5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50">
                    <td colSpan={2} className="px-8 py-4">
                      <span className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Materials</span>
                    </td>
                  </tr>
                  {estimate.materials.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50">
                      <td className="px-8 py-6">
                        <div className="text-[16px] font-black text-slate-900 mb-1">{item.name}</div>
                        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">{item.quantity} {item.unit} × {formatCurrency(item.rate)}</div>
                      </td>
                      <td className="px-8 py-6 text-right text-[16px] font-black text-slate-900 tabular-nums tracking-tight">
                        {formatCurrency(item.quantity * item.rate)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/50">
                    <td colSpan={2} className="px-8 py-4">
                      <span className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Labour</span>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-8 py-6">
                      <div className="text-[16px] font-black text-slate-900 mb-1">Labour Charges</div>
                      <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">{estimate.labour.hours} hrs × {formatCurrency(estimate.labour.rate)}/hr</div>
                    </td>
                    <td className="px-8 py-6 text-right text-[16px] font-black text-slate-900 tabular-nums tracking-tight">
                      {formatCurrency(labourTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="px-6 flex flex-col gap-4 mb-10">
          <h2 className="text-[13px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Total Quote</h2>
          <Card className="!p-0 overflow-hidden border-2 border-slate-900 shadow-2xl">
            <div className="p-8 bg-white flex flex-col gap-4">
              <div className="flex justify-between text-[15px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Subtotal</span>
                <span className="text-slate-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-bold text-slate-400 uppercase tracking-widest">
                <span>GST (10%)</span>
                <span className="text-slate-900">{formatCurrency(gst)}</span>
              </div>
            </div>
            <div className="bg-slate-900 p-8 flex justify-between items-center">
                <span className="text-[14px] font-black text-slate-400 uppercase tracking-[0.2em]">Total</span>
                <span className="text-[36px] font-black text-white tracking-tighter tabular-nums leading-none">{formatCurrency(total)}</span>
            </div>
          </Card>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-6 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-50 pb-safe">
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <Button variant="success" fullWidth onClick={onApprove} className="h-[64px] text-[17px]">
            <CheckCircle2 size={20} className="mr-2" />
            Approve Quote
          </Button>
        </div>
      </div>
    </Layout>
  );
};
