import React, { useState } from 'react';
import { Layout, Header, Section } from '../components/layout';
import { Card } from '../components/card';
import { Button } from '../components/button';
import { Estimate, JobStatus, UserProfile } from '../types';
import { ChevronLeft, Calendar, CheckCircle2, ArrowRight, User, Users, Trash2, Download, SquarePen } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency } from '../lib/utils/calculations';
import { generateEstimatePDF } from '../lib/utils/pdfGenerator';
import { DocumentTemplate } from '../components/document/documenttemplate';
import { buildPdfFileName } from '../lib/utils/fileNames';

interface EstimatePreviewProps {
  estimate: Estimate;
  userProfile?: UserProfile;
  onBack: () => void;
  onEdit: () => void;
  onChangeCustomer?: () => void;
  onSend: () => void;
  isPublic?: boolean;
  onApprove?: () => void;
  onStatusChange?: (status: JobStatus) => void;
  onViewInvoice?: () => void;
  onDelete?: () => void;
  type?: 'estimate' | 'invoice';
  invoiceStatus?: 'draft' | 'issued' | 'sent' | 'paid' | 'overdue';
}

export const EstimatePreview: React.FC<EstimatePreviewProps> = ({
  estimate,
  userProfile,
  onBack,
  onEdit,
  onChangeCustomer,
  onSend,
  isPublic = false,
  onApprove,
  onStatusChange,
  onViewInvoice,
  onDelete,
  type = 'estimate',
  invoiceStatus
}) => {
  const { labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Public pages should show the formal document. Inside the app, show the "app" layout by default.
  const viewMode: 'app' | 'formal' = isPublic ? 'formal' : 'app';

  const isInvoice = type === 'invoice';

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      setDownloadError(null);
      console.log('[EstimatePreview] Starting PDF generation...');

      const pdfBlob = await generateEstimatePDF(estimate, userProfile, type, estimate.id);

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildPdfFileName(isInvoice ? 'invoice' : 'estimate', estimate.id);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('[EstimatePreview] PDF downloaded successfully');
    } catch (error) {
      console.error('[EstimatePreview] PDF generation failed:', error);
      setDownloadError('Couldn’t generate the PDF. Please try again.');
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
      const sendLabel =
        invoiceStatus === 'sent' || invoiceStatus === 'issued'
          ? 'Resend'
          : 'Send';
      return (
        <Button variant="primary" fullWidth className="font-bold shadow-xl shadow-brand/10" onClick={onSend}>
          {sendLabel}
        </Button>
      );
    }

    // Estimate Logic
    switch (estimate.status) {
      case JobStatus.DRAFT:
        return (
          <div className="flex w-full gap-3">
            <Button variant="primary" className="flex-1 font-bold shadow-xl shadow-brand/10" onClick={onSend}>
              Send
            </Button>
            {onStatusChange && (
              <Button variant="secondary" className="flex-1" onClick={() => onStatusChange(JobStatus.APPROVED)}>
                Mark as Approved
              </Button>
            )}
          </div>
        );
      case JobStatus.SENT:
        return (
          <div className="flex w-full gap-3">
            <Button variant="primary" className="flex-1 font-bold shadow-xl shadow-brand/10" onClick={onSend}>
              Send
            </Button>
            {onStatusChange && (
              <Button variant="secondary" className="flex-1" onClick={() => onStatusChange(JobStatus.APPROVED)}>
                Mark as Approved
              </Button>
            )}
          </div>
        );
      case JobStatus.APPROVED:
      case JobStatus.PAID:
      case JobStatus.INVOICED:
        return (
          <Button variant="accent" fullWidth className="font-bold shadow-xl shadow-accent/20" onClick={onViewInvoice}>
            <span className="mr-2">View Invoice</span>
            <ArrowRight size={18} />
          </Button>
        );
      case JobStatus.DECLINED:
        return (
          <div className="flex flex-col w-full gap-3">
            <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center">
              <p className="text-[13px] font-bold text-red-600 uppercase tracking-wider">Estimate Declined</p>
            </div>
            <Button variant="secondary" fullWidth onClick={onEdit}>Edit to Reuse</Button>
          </div>
        );
      case JobStatus.EXPIRED:
        return (
          <div className="flex flex-col w-full gap-3">
            <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 text-center">
              <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">Estimate Expired</p>
            </div>
            <Button variant="secondary" fullWidth onClick={onEdit}>Edit to Renew</Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Layout showNav={false} className={`pb-40 ${viewMode === 'formal' ? 'bg-slate-200' : 'bg-[#FAFAFA]'}`}>
       {!isPublic ? (
        <Header
          // Title removed to prevent overlap on small widths.
          title=""
          left={
            <button
              onClick={onBack}
              className="w-10 h-10 flex items-center justify-center text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
              aria-label="Back"
              title="Back"
            >
              <ChevronLeft size={22} />
            </button>
          }
          right={
            <div className="flex items-center gap-2">
              {onChangeCustomer && (
                <button
                  onClick={onChangeCustomer}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-slate-900 hover:bg-slate-100 transition-colors"
                  title="Customer"
                  aria-label="Customer"
                >
                  <Users size={20} />
                </button>
              )}
              <button
                onClick={onEdit}
                className="w-10 h-10 flex items-center justify-center rounded-full text-slate-900 hover:bg-slate-100 transition-colors"
                aria-label="Edit estimate"
                title="Edit"
              >
                <SquarePen size={20} />
              </button>
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className="w-10 h-10 flex items-center justify-center text-slate-900 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
                aria-label="Download PDF"
                title="Download PDF"
              >
                <Download size={20} />
              </button>
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          }
        />
       ) : (
         <div className="h-[70px] flex items-center justify-center bg-white border-b border-slate-100 mb-6 sticky top-0 z-30">
            <h1 className="font-bold text-xl tracking-tighter text-slate-900 uppercase flex items-center justify-center gap-0.5">
              <span>SMASH</span>
              <span className="w-1 h-1 rounded-full bg-accent mt-1.5 shadow-[0_0_8px_rgba(212,255,0,0.4)]" />
            </h1>
         </div>
       )}

      {downloadError && (
        <div className="px-5 mt-3">
          <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-[13px] font-semibold text-red-700">
            {downloadError}
          </div>
        </div>
      )}

      {viewMode === 'formal' ? (
        <div className="flex-1 overflow-y-auto bg-slate-200 animate-in fade-in duration-300 pb-[140px] pb-safe">
           <div className="w-full p-4 sm:p-8">
            <div className="max-w-[800px] mx-auto shadow-2xl rounded-sm">
              <DocumentTemplate 
                estimate={estimate} 
                userProfile={userProfile} 
                type={type}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col mt-2 animate-in fade-in duration-300">
          <Section title="Summary">
            <Card className="flex flex-col gap-5">
              {userProfile && (
                  <div className="flex items-center gap-3.5 pb-5 border-b border-slate-50">
                  <div className="w-12 h-11 rounded-[14px] bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    {userProfile.logoUrl ? (
                      <img
                        src={userProfile.logoUrl}
                        alt={userProfile.businessName}
                        className="w-full h-full rounded-[14px] object-cover"
                      />
                    ) : (
                      <User size={20} className="text-slate-900" />
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
                {!isInvoice && (
                  <p className="text-[11px] text-tertiary font-bold uppercase tracking-wider">
                    Estimate #{estimate.id.substring(0, 6).toUpperCase()}
                  </p>
                )}
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
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
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
            <Card className="!p-0 overflow-hidden border border-slate-100 shadow-xl">
              <div className="p-6 bg-white flex flex-col gap-3">
                <div className="flex justify-between text-[14px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>Subtotal</span>
                  <span className="text-slate-900">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[14px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>{estimate.currency === 'GBP' ? 'VAT' : estimate.currency === 'USD' ? 'Sales Tax' : 'GST'} ({(estimate.gstRate * 100).toFixed(0)}%)</span>
                  <span className="text-slate-900">{formatCurrency(gst)}</span>
                </div>
              </div>
              
              <div className="bg-slate-50 border-t border-slate-100 p-6 flex justify-between items-center">
                  <span className="text-[13px] font-bold text-slate-500 uppercase tracking-widest">Total Amount</span>
                  <span className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">{formatCurrency(total)}</span>
              </div>
            </Card>
          </Section>
        </div>
      )}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-5 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-50 pb-safe">
        <div className="w-full">
          {renderActions()}
        </div>
      </div>
    </Layout>
  );
};
