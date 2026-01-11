import React, { useState } from 'react';
import { Layout, Header } from '../components/layout';
import { Card } from '../components/card';
import { Button } from '../components/button';
import { Estimate } from '../types';
import { Calendar, FileCheck, Building2, CreditCard, Download } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency } from '../lib/utils/calculations';
import { generateEstimatePDF } from '../lib/utils/pdfGenerator';

interface PublicInvoiceViewProps {
  estimate: Estimate;
  onPaymentClick: () => void;
  businessName: string;
  businessPhone?: string;
  invoiceNumber: string;
  businessInfo?: {
    businessAddress?: string;
    email?: string;
    abn?: string;
    website?: string;
    logoUrl?: string;
    bankName?: string;
    accountName?: string;
    bsbRouting?: string;
    accountNumber?: string;
    paymentTerms?: string;
    paymentInstructions?: string;
  };
}

export const PublicInvoiceView: React.FC<PublicInvoiceViewProps> = ({
  estimate,
  onPaymentClick,
  businessName,
  businessPhone,
  invoiceNumber,
  businessInfo
}) => {
  const { materialsTotal, labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const isPaid = estimate.status === 'Paid';

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      const userProfile = businessInfo ? {
        businessName,
        phone: businessPhone || '',
        tradeType: '',
        businessAddress: businessInfo.businessAddress,
        email: businessInfo.email || '',
        abn: businessInfo.abn,
        website: businessInfo.website,
        logoUrl: businessInfo.logoUrl,
        bankName: businessInfo.bankName,
        accountName: businessInfo.accountName,
        bsbRouting: businessInfo.bsbRouting,
        accountNumber: businessInfo.accountNumber,
        paymentTerms: businessInfo.paymentTerms,
        paymentInstructions: businessInfo.paymentInstructions,
      } : undefined;

      const pdfBlob = await generateEstimatePDF(estimate, userProfile as any, 'invoice');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('[PublicInvoiceView] PDF error:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <Layout showNav={false} className="bg-white pb-48">
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-50 sticky top-0 z-30">
          <div className="flex items-center gap-1">
              <span className="text-[14px] font-black tracking-tighter text-slate-900 uppercase">SMASH</span>
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5 shadow-[0_0_8px_rgba(212,255,0,0.5)]"></div>
          </div>
          <button 
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
          >
            {downloadingPdf ? '...' : 'Download PDF'}
          </button>
      </header>

      <div className="flex-1 p-6 space-y-8">
          <div className="bg-slate-50 p-8 flex flex-col items-center text-center rounded-[24px]">
              {businessInfo?.logoUrl ? (
                <img src={businessInfo.logoUrl} alt={businessName} className="w-20 h-20 rounded-2xl object-cover mb-4" />
              ) : (
                <div className="w-20 h-20 bg-white border-2 border-slate-100 flex items-center justify-center mb-4 text-slate-900 font-black text-2xl rounded-2xl">
                  {businessName.substring(0, 2).toUpperCase()}
                </div>
              )}
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{businessName}</h2>
              {businessInfo?.abn && (
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">ABN {businessInfo.abn}</p>
              )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Invoice #{invoiceNumber}</span>
              <h1 className="text-[28px] font-black text-slate-900 leading-tight tracking-tighter uppercase">{estimate.jobTitle}</h1>
            </div>
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
                      <span className="text-xs font-black uppercase tracking-widest text-slate-900">Total Due</span>
                      <span className="text-2xl font-black text-slate-900 tracking-tighter">{formatCurrency(total)}</span>
                  </div>
              </div>
              {!isPaid && (
                <div className="p-6 bg-primary">
                    <button 
                      onClick={onPaymentClick}
                      className="w-full h-14 rounded-xl font-black uppercase tracking-widest text-xs bg-accent text-black active:scale-[0.98] transition-all shadow-lg shadow-accent/10"
                    >
                        Pay Now
                    </button>
                </div>
              )}
          </div>

          {/* Payment Details */}
          {!isPaid && (businessInfo?.bankName || businessInfo?.bsbRouting) && (
            <div className="space-y-4">
                <h3 className="text-[13px] font-black text-slate-400 uppercase tracking-widest ml-1">How to Pay</h3>
                <div className="bg-slate-50 rounded-[24px] p-6 space-y-4">
                    {businessInfo.bankName && (
                      <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Bank</span>
                          <span className="text-sm font-black text-slate-900 uppercase">{businessInfo.bankName}</span>
                      </div>
                    )}
                    {businessInfo.accountName && (
                      <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Account</span>
                          <span className="text-sm font-black text-slate-900 uppercase">{businessInfo.accountName}</span>
                      </div>
                    )}
                    {businessInfo.bsbRouting && (
                      <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">BSB</span>
                          <span className="text-sm font-black text-slate-900 uppercase">{businessInfo.bsbRouting}</span>
                      </div>
                    )}
                    {businessInfo.accountNumber && (
                      <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Account No</span>
                          <span className="text-sm font-black text-slate-900 uppercase">{businessInfo.accountNumber}</span>
                      </div>
                    )}
                </div>
            </div>
          )}

          {/* Scope of Work */}
          <div className="space-y-4">
            <h2 className="text-[13px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Completed</h2>
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

      {/* Sticky Bottom Actions */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-6 bg-white/95 backdrop-blur-xl border-t border-slate-50 z-50 pb-safe">
        <div className="flex gap-4">
          <Button
            variant="secondary"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex-1 h-14 font-black uppercase tracking-widest text-[11px] rounded-xl"
          >
            <Download size={18} className="mr-2" />
            {downloadingPdf ? '...' : 'PDF'}
          </Button>
          {!isPaid && (
            <Button variant="primary" className="flex-[2] h-14 font-black uppercase tracking-widest text-[11px] rounded-xl bg-primary" onClick={onPaymentClick}>
              <CreditCard size={18} className="mr-2" />
              Pay Invoice
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
};
