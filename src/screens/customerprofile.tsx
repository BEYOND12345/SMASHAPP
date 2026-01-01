import React, { useState } from 'react';
import { Layout, Header } from '../components/layout';
import { Button } from '../components/button';
import { Customer, Estimate, Invoice, JobStatus } from '../types';
import { ChevronLeft, Plus, Mail, Phone, Building2, Trash2 } from 'lucide-react';
import { getInitials, calculateEstimateTotals, calculateInvoiceTotals, formatCurrency } from '../lib/utils/calculations';

interface CustomerProfileProps {
  customer: Customer;
  quotes: Estimate[];
  invoices: Invoice[];
  onBack: () => void;
  onNewQuote: (customerId: string) => void;
  onSelectQuote: (quoteId: string) => void;
  onSelectInvoice: (invoiceId: string) => void;
  onDeleteCustomer?: (customerId: string) => void;
}

export const CustomerProfile: React.FC<CustomerProfileProps> = ({
  customer,
  quotes,
  invoices,
  onBack,
  onNewQuote,
  onSelectQuote,
  onSelectInvoice,
  onDeleteCustomer
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const customerQuotes = quotes.filter(q => q.clientName === customer.name);
  const customerInvoices = invoices.filter(inv => inv.clientName === customer.name);

  const totalJobs = customerQuotes.length;
  const totalRevenue = [
    ...customerQuotes.map(q => calculateEstimateTotals(q).total),
    ...customerInvoices.map(inv => calculateInvoiceTotals(inv).total)
  ].reduce((sum, val) => sum + val, 0);

  const lastActivity = [...customerQuotes, ...customerInvoices]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date || 'No activity';

  const handleDelete = () => {
    if (totalJobs > 0) {
      alert('Cannot delete customer with existing quotes or invoices');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDeleteCustomer?.(customer.id);
    setShowDeleteConfirm(false);
  };

  const StatusDot: React.FC<{ status: JobStatus | 'draft' | 'issued' | 'sent' | 'paid' | 'overdue' }> = ({ status }) => {
    const colors: Record<string, string> = {
      Draft: "bg-gray-300",
      Sent: "bg-gray-400",
      Approved: "bg-accent",
      Paid: "bg-accent",
      draft: "bg-gray-300",
      issued: "bg-blue-400",
      sent: "bg-gray-400",
      paid: "bg-accent",
      overdue: "bg-red-500"
    };
    const label = typeof status === 'string' ? status.charAt(0).toUpperCase() + status.slice(1) : status;
    return (
      <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-full">
        <div className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
        <span className="text-[11px] font-semibold text-secondary">{label}</span>
      </div>
    );
  };

  return (
    <Layout showNav={false} className="bg-[#FAFAFA] relative pb-32">
      <Header
        left={
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-primary hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        }
        right={
          <button onClick={handleDelete} className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors">
            <Trash2 size={20} />
          </button>
        }
      />

      <div className="px-6 flex flex-col gap-6">

        {/* Customer Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center shrink-0 text-[24px] font-bold tracking-tight mb-4 bg-white border border-gray-200 text-gray-900 shadow-sm">
            {getInitials(customer.name)}
          </div>
          <h1 className="text-[24px] font-bold text-primary tracking-tight mb-1">{customer.name}</h1>
          {customer.company_name && (
            <p className="text-[15px] text-secondary font-medium">{customer.company_name}</p>
          )}
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-[20px] p-5 shadow-card flex flex-col gap-3">
          {customer.email && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                <Mail size={18} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-tertiary font-medium uppercase tracking-wide mb-0.5">Email</p>
                <p className="text-[14px] text-primary font-medium truncate">{customer.email}</p>
              </div>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                <Phone size={18} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-tertiary font-medium uppercase tracking-wide mb-0.5">Phone</p>
                <p className="text-[14px] text-primary font-medium">{customer.phone}</p>
              </div>
            </div>
          )}
          {customer.company_name && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                <Building2 size={18} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-tertiary font-medium uppercase tracking-wide mb-0.5">Company</p>
                <p className="text-[14px] text-primary font-medium truncate">{customer.company_name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-[16px] p-4 shadow-sm text-center">
            <p className="text-[24px] font-bold text-primary tracking-tight">{totalJobs}</p>
            <p className="text-[11px] text-tertiary font-medium uppercase tracking-wide mt-1">Jobs</p>
          </div>
          <div className="bg-white rounded-[16px] p-4 shadow-sm text-center">
            <p className="text-[24px] font-bold text-primary tracking-tight">{formatCurrency(totalRevenue)}</p>
            <p className="text-[11px] text-tertiary font-medium uppercase tracking-wide mt-1">Revenue</p>
          </div>
          <div className="bg-white rounded-[16px] p-4 shadow-sm text-center">
            <p className="text-[13px] font-bold text-primary tracking-tight">{lastActivity}</p>
            <p className="text-[11px] text-tertiary font-medium uppercase tracking-wide mt-1">Last Job</p>
          </div>
        </div>

        {/* New Quote Button */}
        <Button variant="primary" fullWidth onClick={() => onNewQuote(customer.id)} className="shadow-float">
          <Plus size={20} className="mr-2" />
          New Quote for {customer.name}
        </Button>

        {/* Recent Activity */}
        <div>
          <h2 className="text-[12px] font-bold text-secondary uppercase tracking-widest ml-1 opacity-80 mb-3">Recent Activity</h2>

          {totalJobs === 0 ? (
            <div className="bg-white rounded-[20px] p-8 shadow-sm text-center">
              <p className="text-[14px] text-tertiary">No quotes or invoices yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {customerQuotes.map(quote => (
                <div
                  key={quote.id}
                  onClick={() => onSelectQuote(quote.id)}
                  className="bg-white rounded-[20px] p-4 shadow-card hover:scale-[0.99] transition-transform duration-200 cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-[15px] font-bold text-primary tracking-tight leading-none mb-1">{quote.jobTitle}</h3>
                      <p className="text-[12px] text-tertiary">Quote</p>
                    </div>
                    <StatusDot status={quote.status} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] font-medium text-tertiary">{quote.date}</span>
                    <span className="text-[15px] font-bold text-primary tracking-tight">{formatCurrency(calculateEstimateTotals(quote).total)}</span>
                  </div>
                </div>
              ))}
              {customerInvoices.map(invoice => (
                <div
                  key={invoice.id}
                  onClick={() => onSelectInvoice(invoice.id)}
                  className="bg-white rounded-[20px] p-4 shadow-card hover:scale-[0.99] transition-transform duration-200 cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-[15px] font-bold text-primary tracking-tight leading-none mb-1">{invoice.jobTitle}</h3>
                      <p className="text-[12px] text-tertiary">Invoice #{invoice.invoiceNumber}</p>
                    </div>
                    <StatusDot status={invoice.status} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] font-medium text-tertiary">{invoice.date}</span>
                    <span className="text-[15px] font-bold text-primary tracking-tight">{formatCurrency(calculateInvoiceTotals(invoice).total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[32px] p-6 shadow-2xl max-w-[390px] mx-auto">
            <h3 className="text-[18px] font-bold text-primary mb-2">Delete Customer?</h3>
            <p className="text-[14px] text-secondary mb-6">
              This will permanently delete {customer.name}. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="danger" fullWidth onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
};
