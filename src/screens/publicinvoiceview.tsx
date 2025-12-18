import React from 'react';
import { Layout } from '../components/layout';
import { Card } from '../components/card';
import { Button } from '../components/button';
import { Estimate } from '../types';
import { Calendar, FileCheck, Building2, CreditCard } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency } from '../lib/utils/calculations';

interface PublicInvoiceViewProps {
  estimate: Estimate;
  onPaymentClick: () => void;
  businessName: string;
  businessPhone?: string;
  invoiceNumber: string;
}

export const PublicInvoiceView: React.FC<PublicInvoiceViewProps> = ({
  estimate,
  onPaymentClick,
  businessName,
  businessPhone,
  invoiceNumber
}) => {
  const { materialsTotal, labourTotal, subtotal, gst, total } = calculateEstimateTotals(estimate);

  const isPaid = estimate.status === 'Paid';

  return (
    <Layout showNav={false} className="bg-surface pb-40">
      <div className="h-[80px] flex items-center justify-center bg-white border-b border-border mb-6 sticky top-0 z-30">
        <h1 className="font-bold text-xl tracking-tight text-primary">SMASH<span className="text-accent">.</span></h1>
      </div>

      <div className="px-6 py-4 bg-white border-b border-border mb-6">
        <div className="flex items-center gap-3 mb-3">
          <Building2 size={20} className="text-brand" />
          <div>
            <h2 className="text-[18px] font-bold text-primary">{businessName}</h2>
            {businessPhone && <p className="text-[13px] text-tertiary">{businessPhone}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-lg w-fit">
          <FileCheck size={16} className="text-brand" />
          <p className="text-[13px] font-bold text-secondary">Invoice #{invoiceNumber}</p>
        </div>
      </div>

      <div className="px-6 flex flex-col gap-6 mt-2">
        <Card>
          <div className="flex flex-col gap-2 mb-5">
            <h2 className="text-[24px] font-bold text-primary tracking-tighter leading-tight">{estimate.jobTitle}</h2>
            <p className="text-[16px] font-medium text-secondary">{estimate.clientName}</p>
            {estimate.clientAddress && <p className="text-[14px] text-tertiary">{estimate.clientAddress}</p>}
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-surface rounded-xl w-fit border border-border/50">
            <Calendar size={16} className="text-brand" />
            <span className="text-[14px] font-semibold text-secondary">
              Issued: <span className="text-primary">{estimate.date}</span>
            </span>
          </div>
        </Card>

        <div>
          <h3 className="text-[12px] font-bold text-secondary uppercase tracking-widest ml-1 mb-4 opacity-80">Work Completed</h3>
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
        </div>

        <div>
          <h3 className="text-[12px] font-bold text-secondary uppercase tracking-widest ml-1 mb-4 opacity-80">Breakdown</h3>
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
        </div>

        <div>
          <h3 className="text-[12px] font-bold text-secondary uppercase tracking-widest ml-1 mb-4 opacity-80">Total Due</h3>
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
        </div>

        {isPaid && (
          <Card className="bg-accent/10 border-accent/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                <FileCheck size={24} className="text-accentDark" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-accentText">Invoice Paid</h3>
                <p className="text-[13px] text-accentText/70">Payment received</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {!isPaid && (
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-xl border-t border-border flex gap-3 justify-center max-w-[390px] mx-auto z-40">
          <Button variant="primary" fullWidth onClick={onPaymentClick}>
            <CreditCard size={18} className="mr-2" />
            Pay Invoice
          </Button>
        </div>
      )}
    </Layout>
  );
};
