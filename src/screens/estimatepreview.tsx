import React from 'react';
import { Layout, Header, Section } from '../components/layout';
import { Card } from '../components/card';
import { Button } from '../components/button';
import { Estimate, JobStatus, UserProfile } from '../types';
import { ChevronLeft, Calendar, CheckCircle2, ArrowRight, User, Trash2 } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency } from '../lib/utils/calculations';

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
  type = 'estimate'
}) => {
  const { materialsTotal, labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);

  const isInvoice = type === 'invoice';

  // Helper to render the correct buttons based on status
  const renderActions = () => {
    if (isPublic) {
      return (
        <>
          <Button variant="outline" className="flex-1" onClick={() => {}}>PDF</Button>
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
            <Button variant="primary" className="flex-[2] font-bold shadow-xl shadow-brand/10" onClick={onSend}>
              Send Estimate
            </Button>
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
    // CRITICAL FIX: set showNav={false} so the action buttons aren't covered by the menu
    <Layout showNav={false} className="bg-surface pb-40">
       {!isPublic ? (
        <Header
          title={isInvoice ? "Invoice Preview" : "Estimate Preview"}
          left={
            <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-primary hover:bg-slate-100 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
          }
          right={
            onDelete && (
              <button onClick={onDelete} className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors">
                <Trash2 size={20} />
              </button>
            )
          }
        />
       ) : (
         <div className="h-[80px] flex items-center justify-center bg-white/80 backdrop-blur-md border-b border-border mb-6 sticky top-0 z-30">
            <h1 className="font-bold text-xl tracking-tight text-primary">SMASH<span className="text-accent">.</span></h1>
         </div>
       )}

      <div className="flex flex-col gap-1 mt-2">
        <Section title="Job Summary">
          <Card>
            {userProfile && (
              <div className="flex items-center gap-4 pb-5 mb-5 border-b border-border/30">
                <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  {userProfile.logoUrl ? (
                    <img
                      src={userProfile.logoUrl}
                      alt={userProfile.businessName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <User size={24} className="text-brand" />
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-[16px] font-bold text-primary">{userProfile.businessName}</h3>
                  <p className="text-[13px] text-tertiary">{userProfile.tradeType}</p>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 mb-5">
              <h2 className="text-[24px] font-bold text-primary tracking-tighter leading-tight">{estimate.jobTitle}</h2>
              <p className="text-[16px] font-medium text-secondary">{estimate.clientName}</p>
              {estimate.clientAddress && <p className="text-[14px] text-tertiary">{estimate.clientAddress}</p>}
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-surface rounded-xl w-fit border border-border/50">
              <Calendar size={16} className="text-brand" />
              <span className="text-[14px] font-semibold text-secondary">
                Timeline: <span className="text-primary">{estimate.timeline}</span>
              </span>
            </div>
          </Card>
        </Section>

        <Section title="Scope of Work">
          <Card>
            <ul className="space-y-4">
              {estimate.scopeOfWork.map((item, idx) => (
                <li key={idx} className="flex gap-4 text-[15px] text-primary leading-relaxed font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-accentDark mt-2.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        <Section title="Breakdown">
          <Card noPadding className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface border-b border-border text-[11px] font-bold text-tertiary uppercase tracking-wider">
                    <th className="px-6 py-4">Item</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Materials Section Header */}
                  <tr className="bg-surface/30">
                    <td colSpan={2} className="px-6 py-3">
                      <span className="text-[13px] font-bold text-secondary uppercase tracking-wide">Materials</span>
                    </td>
                  </tr>

                  {/* Materials Items */}
                  {estimate.materials.map((item) => (
                    <tr key={item.id} className="border-b border-border/50">
                      <td className="px-6 py-4">
                        <div className="text-[15px] font-semibold text-primary mb-1">{item.name}</div>
                        <div className="text-[13px] font-medium text-tertiary">{item.quantity} {item.unit} × {formatCurrency(item.rate)}</div>
                      </td>
                      <td className="px-6 py-4 text-right text-[15px] font-medium text-primary tabular-nums font-mono">
                        {formatCurrency(item.quantity * item.rate)}
                      </td>
                    </tr>
                  ))}

                  {/* Materials Subtotal */}
                  <tr className="bg-surface/50 border-b border-border">
                    <td className="px-6 py-3 text-right">
                      <span className="text-[14px] font-bold text-secondary">Materials Subtotal</span>
                    </td>
                    <td className="px-6 py-3 text-right text-[15px] font-bold text-primary tabular-nums font-mono">
                      {formatCurrency(materialsTotal)}
                    </td>
                  </tr>

                  {/* Labour Section Header */}
                  <tr className="bg-surface/30">
                    <td colSpan={2} className="px-6 py-3">
                      <span className="text-[13px] font-bold text-secondary uppercase tracking-wide">Labour</span>
                    </td>
                  </tr>

                  {/* Labour Row */}
                  <tr className="border-b border-border/50">
                    <td className="px-6 py-4">
                      <div className="text-[15px] font-semibold text-primary mb-1">Labour Charges</div>
                      <div className="text-[13px] font-medium text-tertiary">{estimate.labour.hours} hrs × {formatCurrency(estimate.labour.rate)}/hr</div>
                    </td>
                    <td className="px-6 py-4 text-right text-[15px] font-medium text-primary tabular-nums font-mono">
                      {formatCurrency(labourTotal)}
                    </td>
                  </tr>

                  {/* Labour Subtotal */}
                  <tr className="bg-surface/50 border-b border-border">
                    <td className="px-6 py-3 text-right">
                      <span className="text-[14px] font-bold text-secondary">Labour Subtotal</span>
                    </td>
                    <td className="px-6 py-3 text-right text-[15px] font-bold text-primary tabular-nums font-mono">
                      {formatCurrency(labourTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </Section>

        {/* Total Section */}
        <Section title="Total Quote">
          <Card className="!p-0 border-2 border-surface shadow-none ring-1 ring-black/5 overflow-hidden">
            <div className="p-6 bg-white">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between text-[15px] font-medium text-secondary">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-mono text-primary">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[15px] font-medium text-secondary">
                  <span>GST (10%)</span>
                  <span className="tabular-nums font-mono text-primary">{formatCurrency(gst)}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-surface/50 border-t border-border p-6 flex justify-between items-center">
                <span className="text-[16px] font-bold text-primary tracking-tight">Total Amount</span>
                <span className="text-[32px] font-bold text-brand tracking-tighter tabular-nums font-mono leading-none">{formatCurrency(total)}</span>
            </div>
          </Card>
        </Section>

        {/* Dynamic Action Bar - Now Visible! */}
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-xl border-t border-border flex gap-3 justify-center max-w-[390px] mx-auto z-40">
          {renderActions()}
        </div>
      </div>
    </Layout>
  );
};