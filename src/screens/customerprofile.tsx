import React, { useState } from 'react';
import { Layout, Header } from '../components/layout';
import { Button } from '../components/button';
import { Customer, Estimate, Invoice, JobStatus } from '../types';
import { ChevronLeft, Plus, MoreVertical, Trash2 } from 'lucide-react';
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
  const [showMenu, setShowMenu] = useState(false);

  const customerQuotes = quotes.filter(q => q.clientName === customer.name);
  const customerInvoices = invoices.filter(inv => inv.clientName === customer.name);

  const totalJobs = customerQuotes.length;
  const totalRevenue = [
    ...customerQuotes.map(q => calculateEstimateTotals(q).total),
    ...customerInvoices.map(inv => calculateInvoiceTotals(inv).total)
  ].reduce((sum, val) => sum + val, 0);

  const allActivity = [...customerQuotes, ...customerInvoices]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lastActivityDate = allActivity[0]?.date;

  const handleDelete = () => {
    setShowMenu(false);
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

  const StatusPill: React.FC<{ status: JobStatus | 'draft' | 'issued' | 'sent' | 'paid' | 'overdue' }> = ({ status }) => {
    const colors: Record<string, string> = {
      Draft: "bg-gray-100 text-gray-600",
      Sent: "bg-blue-50 text-blue-600",
      Approved: "bg-green-50 text-green-600",
      Paid: "bg-green-50 text-green-600",
      draft: "bg-gray-100 text-gray-600",
      issued: "bg-blue-50 text-blue-600",
      sent: "bg-blue-50 text-blue-600",
      paid: "bg-green-50 text-green-600",
      overdue: "bg-red-50 text-red-600"
    };
    const label = typeof status === 'string' ? status.charAt(0).toUpperCase() + status.slice(1) : status;
    return (
      <div className={`px-2.5 py-1 rounded-full ${colors[status]}`}>
        <span className="text-[11px] font-semibold">{label}</span>
      </div>
    );
  };

  const hasContactInfo = customer.email || customer.phone;

  return (
    <Layout showNav={false} className="bg-[#FAFAFA] relative pb-32">
      <Header
        left={
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-primary hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        }
        right={
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-10 h-10 flex items-center justify-center text-secondary hover:bg-slate-100 rounded-full transition-colors"
            >
              <MoreVertical size={20} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-12 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                    Delete Customer
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />

      <div className="px-6 flex flex-col gap-6 pb-6">

        {/* Customer Header */}
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-24 h-24 rounded-full flex items-center justify-center shrink-0 text-[28px] font-bold tracking-tight mb-5 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 text-gray-700 shadow-sm">
            {getInitials(customer.name)}
          </div>
          <h1 className="text-[28px] font-bold text-primary tracking-tight leading-none mb-2">{customer.name}</h1>
          {customer.company_name && (
            <p className="text-[15px] text-secondary font-medium">{customer.company_name}</p>
          )}
          {hasContactInfo && (
            <div className="flex flex-col items-center gap-1 mt-3">
              {customer.email && (
                <p className="text-[13px] text-tertiary">{customer.email}</p>
              )}
              {customer.phone && (
                <p className="text-[13px] text-tertiary">{customer.phone}</p>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="bg-white rounded-[20px] p-5 shadow-sm">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-[28px] font-bold text-primary tracking-tight leading-none">{totalJobs}</p>
              <p className="text-[11px] text-tertiary font-semibold uppercase tracking-wider mt-2">Jobs</p>
            </div>
            <div className="text-center border-x border-gray-100 px-2">
              <p className="text-[17px] font-bold text-primary tracking-tight leading-none break-all">{formatCurrency(totalRevenue)}</p>
              <p className="text-[11px] text-tertiary font-semibold uppercase tracking-wider mt-2">Revenue</p>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-primary tracking-tight leading-tight whitespace-nowrap">{lastActivityDate || '—'}</p>
              <p className="text-[11px] text-tertiary font-semibold uppercase tracking-wider mt-2">Last Job</p>
            </div>
          </div>
        </div>

        {/* New Quote Button */}
        <Button variant="primary" fullWidth onClick={() => onNewQuote(customer.id)} className="shadow-md">
          <Plus size={20} className="mr-2" />
          New Quote
        </Button>

        {/* Recent Activity */}
        {totalJobs === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Plus size={28} className="text-gray-400" />
            </div>
            <p className="text-[15px] text-secondary font-medium">No quotes or invoices yet</p>
            <p className="text-[13px] text-tertiary mt-1">Create your first quote to get started</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-bold text-secondary uppercase tracking-wider">Recent Activity</h2>
              <span className="text-[12px] text-tertiary font-medium">{totalJobs} total</span>
            </div>
            <div className="flex flex-col gap-2">
              {allActivity.map((item) => {
                const isQuote = 'jobTitle' in item && 'status' in item && typeof item.status !== 'string';
                if (isQuote) {
                  const quote = item as Estimate;
                  return (
                    <div
                      key={quote.id}
                      onClick={() => onSelectQuote(quote.id)}
                      className="bg-white rounded-[16px] p-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-gray-50"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[15px] font-bold text-primary tracking-tight leading-tight mb-1 truncate">{quote.jobTitle}</h3>
                          <p className="text-[12px] text-tertiary font-medium">Quote</p>
                        </div>
                        <StatusPill status={quote.status} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-tertiary font-medium">{quote.date}</span>
                        <span className="text-[17px] font-bold text-primary tracking-tight">{formatCurrency(calculateEstimateTotals(quote).total)}</span>
                      </div>
                    </div>
                  );
                } else {
                  const invoice = item as Invoice;
                  return (
                    <div
                      key={invoice.id}
                      onClick={() => onSelectInvoice(invoice.id)}
                      className="bg-white rounded-[16px] p-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-gray-50"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[15px] font-bold text-primary tracking-tight leading-tight mb-1 truncate">{invoice.jobTitle}</h3>
                          <p className="text-[12px] text-tertiary font-medium">Invoice #{invoice.invoiceNumber}</p>
                        </div>
                        <StatusPill status={invoice.status} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-tertiary font-medium">{invoice.date}</span>
                        <span className="text-[17px] font-bold text-primary tracking-tight">{formatCurrency(calculateInvoiceTotals(invoice).total)}</span>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[32px] p-6 shadow-2xl max-w-[390px] mx-auto">
            <h3 className="text-[20px] font-bold text-primary mb-2">Delete Customer?</h3>
            <p className="text-[15px] text-secondary leading-relaxed mb-6">
              This will permanently delete <span className="font-semibold">{customer.name}</span>. This action cannot be undone.
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
