import React, { useState } from 'react';
import { Layout } from '../components/layout';
import { Button } from '../components/button';
import { Estimate, UserProfile } from '../types';
import { CreditCard, Download } from 'lucide-react';
import { generateEstimatePDF } from '../lib/utils/pdfGenerator';
import { DocumentTemplate } from '../components/document/documenttemplate';
import { buildPdfFileName } from '../lib/utils/fileNames';

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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const isPaid = estimate.status === 'Paid';

  const userProfile: UserProfile = {
    id: '',
    email: businessInfo?.email || '',
    businessName: businessName,
    phone: businessPhone || '',
    tradeType: '',
    businessAddress: businessInfo?.businessAddress,
    abn: businessInfo?.abn,
    website: businessInfo?.website,
    logoUrl: businessInfo?.logoUrl,
    bankName: businessInfo?.bankName,
    accountName: businessInfo?.accountName,
    bsbRouting: businessInfo?.bsbRouting,
    accountNumber: businessInfo?.accountNumber,
    paymentTerms: businessInfo?.paymentTerms,
    paymentInstructions: businessInfo?.paymentInstructions,
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      const pdfBlob = await generateEstimatePDF(estimate, userProfile, 'invoice', invoiceNumber);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildPdfFileName('invoice', invoiceNumber || estimate.id);
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
    <Layout showNav={false} className="bg-slate-100 pb-48">
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
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

      <div className="flex-1 overflow-x-hidden pt-8 px-0 sm:px-6">
          <div className="max-w-[800px] mx-auto shadow-2xl mb-12">
            <DocumentTemplate 
              estimate={estimate} 
              userProfile={userProfile} 
              type="invoice"
            />
          </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[450px] p-6 bg-white/95 backdrop-blur-xl border-t border-slate-200 z-50 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-[32px]">
        <div className="flex gap-4 animate-in slide-in-from-bottom-4 duration-500">
          <Button
            variant="secondary"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex-1 h-14 font-black uppercase tracking-widest text-[11px] rounded-xl border-slate-200"
          >
            <Download size={18} className="mr-2" />
            {downloadingPdf ? '...' : 'PDF'}
          </Button>
          {!isPaid && (
            <Button variant="primary" className="flex-[2] h-14 font-black uppercase tracking-widest text-[11px] rounded-xl bg-slate-900 text-white shadow-xl shadow-slate-900/10 active:scale-[0.98]" onClick={onPaymentClick}>
              <CreditCard size={18} className="mr-2" />
              Pay Invoice
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
};
