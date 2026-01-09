import React, { useState } from 'react';
import { Layout, Header, Section } from '../components/layout';
import { Card } from '../components/card';
import { Button } from '../components/button';
import { Estimate, JobStatus, UserProfile } from '../types';
import { ChevronLeft, Calendar, CheckCircle2, ArrowRight, User, Trash2, Download } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency } from '../lib/utils/calculations';
import { generateEstimatePDF } from '../lib/utils/pdfGenerator';

interface EstimatePreviewProps {
  estimate: Estimate;
  userProfile?: UserProfile;
  onBack: () => void;
  onEdit: () => void;
  onSend: () => void;
  isPublic?: boolean;
  onApprove?: () => void;
  onStatusChange?: (status: JobStatus) => void;
  onViewInvoice?: () => void;
  onDelete?: () => void;
  onConvertToInvoice?: () => void;
  type?: 'estimate' | 'invoice';
}

export const EstimatePreview: React.FC<EstimatePreviewProps> = ({
  estimate,
  userProfile,
  onBack,
  onEdit,
  onSend,
  isPublic = false,
  onApprove,
  onStatusChange,
  onViewInvoice,
  onDelete,
  onConvertToInvoice,
  type = 'estimate'
}) => {
  const { materialsTotal, labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);
  const [isDownloading, setIsDownloading] = useState(false);

  const isInvoice = type === 'invoice';

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      console.log('[EstimatePreview] Starting PDF generation...');

      const pdfBlob = await generateEstimatePDF(estimate, userProfile, type, estimate.id);

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-${estimate.jobTitle.replace(/\s+/g, '-')}-${estimate.id.substring(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('[EstimatePreview] PDF downloaded successfully');
    } catch (error) {
      console.error('[EstimatePreview] PDF generation failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Helper to render the correct buttons based on status
  const renderActions = () => {
    if (isPublic) {
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={handleDownloadPDF} disabled={isDownloading}>
            <Download size={16} className="mr-2" />
            {isDownloading ? 'Generating...' : 'PDF'}
          </Button>
          <Button variant="primary" className="flex-1" onClick={onApprove}>Approve Quote</Button>
        </>
      );
    }

    if (isInvoice) {
      return (
        <>
           <Button variant="secondary" className="flex-1 font-semibold" onClick={onEdit}>Edit</Button>
           <Button variant="primary" className="flex-[2] font-bold shadow-xl shadow-brand/10" onClick={onSend}>
             Send Invoice
           </Button>
        </>
      );
    }

    // Estimate Logic
    switch (estimate.status) {
      case JobStatus.DRAFT:
        return (
          <>
            <Button variant="secondary" className="flex-1 font-semibold" onClick={onEdit}>Edit</Button>
            <Button variant="primary" className="flex-1 font-bold shadow-xl shadow-brand/10" onClick={onSend}>
              Send Estimate
            </Button>
            {onConvertToInvoice && (
              <Button variant="accent" className="flex-1 font-bold shadow-xl shadow-accent/20" onClick={onConvertToInvoice}>
                Send as Invoice
              </Button>
            )}
          </>
        );
      case JobStatus.SENT:
        return (
           <>
            <Button variant="secondary" className="flex-1 font-semibold" onClick={onSend}>Resend</Button>
            <Button variant="success" className="flex-[2] font-bold shadow-xl shadow-accent/20" onClick={() => onStatusChange?.(JobStatus.APPROVED)}>
              <CheckCircle2 size={18} className="mr-2" />
              Approve to Invoice
            </Button>
           </>
        );
      case JobStatus.APPROVED:
      case JobStatus.PAID:
        return (
          <Button variant="accent" fullWidth className="font-bold shadow-xl shadow-accent/20" onClick={onViewInvoice}>
            <span className="mr-2">View Invoice</span>
            <ArrowRight size={18} />
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Layout showNav={false} className="bg-[#FAFAFA] pb-40">
       {!isPublic ? (
        <Header
          title={isInvoice ? "Invoice" : "Estimate"}
          left={
            <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
          }
          right={
            <div className="flex items-center gap-1">
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className="w-9 h-9 flex items-center justify-center text-slate-900 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
              >
                <Download size={18} />
              </button>
              {onDelete && (
                <button onClick={onDelete} className="w-9 h-9 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          }
        />
       ) : (
         <div className="h-[70px] flex items-center justify-center bg-white border-b border-slate-100 mb-6 sticky top-0 z-30">
            <h1 className="font-bold text-xl tracking-tighter text-slate-900 uppercase">SMASH<span className="text-accent">.</span></h1>
         </div>
       )}

      <div className="flex flex-col mt-2">
        <Section title="Summary">
          <Card className="flex flex-col gap-5">
            {userProfile && (
              <div className="flex items-center gap-3.5 pb-5 border-b border-slate-50">
                <div className="w-12 h-11 rounded-[14px] bg-slate-900 flex items-center justify-center shrink-0">
                  {userProfile.logoUrl ? (
                    <img
                      src={userProfile.logoUrl}
                      alt={userProfile.businessName}
                      className="w-full h-full rounded-[14px] object-cover"
                    />
                  ) : (
                    <User size={20} className="text-white" />
                  )}
                </div>
                <div className="flex flex-col">
                  <h3 className="text-[15px] font-bold text-slate-900 tracking-tight leading-tight">{userProfile.businessName}</h3>
                  <p className="text-[12px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{userProfile.tradeType}</p>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <h2 className="text-[24px] font-bold text-slate-900 tracking-tight leading-tight">{estimate.jobTitle}</h2>
              <div className="flex flex-col gap-0.5">
                <p className="text-[15px] font-bold text-slate-600 truncate">{estimate.clientName}</p>
                {estimate.clientAddress && <p className="text-[13px] text-slate-400 font-medium leading-relaxed">{estimate.clientAddress}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 rounded-[14px] w-fit border border-slate-100">
              <Calendar size={16} className="text-slate-900" />
              <span className="text-[13px] font-bold text-slate-900 uppercase tracking-wider">
                {isInvoice ? 'Issued:' : 'Timeline:'} <span className="text-slate-500">{estimate.timeline}</span>
              </span>
            </div>
          </Card>
        </Section>

        <Section title="Scope of Work">
          <Card className="p-6">
            <ul className="space-y-4">
              {estimate.scopeOfWork.map((item, idx) => (
                <li key={idx} className="flex gap-4 text-[15px] text-slate-900 leading-relaxed font-bold">
                  <span className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0 shadow-sm" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        <Section title="Breakdown">
          <Card noPadding className="overflow-hidden border border-slate-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="px-6 py-4">Item</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50">
                    <td colSpan={2} className="px-6 py-3">
                      <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Materials</span>
                    </td>
                  </tr>
                  {estimate.materials.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50">
                      <td className="px-6 py-5">
                        <div className="text-[15px] font-bold text-slate-900 mb-0.5">{item.name}</div>
                        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">{item.quantity} {item.unit} × {formatCurrency(item.rate)}</div>
                      </td>
                      <td className="px-6 py-5 text-right text-[15px] font-bold text-slate-900 tabular-nums">
                        {formatCurrency(item.quantity * item.rate)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50">
                    <td colSpan={2} className="px-6 py-3">
                      <span className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Labour</span>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-6 py-5">
                      <div className="text-[15px] font-bold text-slate-900 mb-0.5">Labour Charges</div>
                      <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">{estimate.labour.hours} hrs × {formatCurrency(estimate.labour.rate)}/hr</div>
                    </td>
                    <td className="px-6 py-5 text-right text-[15px] font-bold text-slate-900 tabular-nums">
                      {formatCurrency(labourTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </Section>

        <Section title="Totals">
          <Card className="!p-0 overflow-hidden border border-slate-900 shadow-xl">
            <div className="p-6 bg-white flex flex-col gap-3">
              <div className="flex justify-between text-[14px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Subtotal</span>
                <span className="text-slate-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[14px] font-bold text-slate-400 uppercase tracking-widest">
                <span>GST (10%)</span>
                <span className="text-slate-900">{formatCurrency(gst)}</span>
              </div>
            </div>
            
            <div className="bg-slate-900 p-6 flex justify-between items-center">
                <span className="text-[13px] font-bold text-slate-400 uppercase tracking-widest">Total Amount</span>
                <span className="text-[28px] font-bold text-white tracking-tight leading-none">{formatCurrency(total)}</span>
            </div>
          </Card>
        </Section>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-5 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-50 pb-safe">
          <div className="flex gap-3 justify-center">
            {renderActions()}
          </div>
        </div>
      </div>
    </Layout>
  );
};