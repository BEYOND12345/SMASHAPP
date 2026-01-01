import React, { useState } from 'react';
import { Invoice } from '../types';
import { Layout, Header } from '../components/layout';
import { FAB } from '../components/fab';
import { User, Search } from 'lucide-react';
import { calculateInvoiceTotals, formatCurrency, getInitials } from '../lib/utils/calculations';

interface InvoicesListProps {
  invoices: Invoice[];
  onNewEstimate: () => void;
  onSelectInvoice: (id: string) => void;
  activeTab: 'estimates' | 'invoices';
  onTabChange: (tab: 'estimates' | 'invoices') => void;
  onProfileClick?: () => void;
}

const StatusDot: React.FC<{ status: 'draft' | 'sent' | 'paid' | 'overdue' }> = ({ status }) => {
  const colors = {
    draft: "bg-gray-300",
    sent: "bg-gray-400",
    paid: "bg-accent",
    overdue: "bg-red-500",
  };
  const labels = {
    draft: "Draft",
    sent: "Sent",
    paid: "Paid",
    overdue: "Overdue"
  };
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-full">
      <div className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="text-[11px] font-semibold text-secondary">{labels[status]}</span>
    </div>
  );
};

type InvoiceStatusFilter = 'all' | 'draft' | 'sent' | 'paid' | 'overdue';

export const InvoicesList: React.FC<InvoicesListProps> = ({
  invoices,
  onNewEstimate,
  onSelectInvoice,
  activeTab,
  onTabChange,
  onProfileClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all');

  let filteredInvoices = invoices;

  // Apply status filter
  if (statusFilter !== 'all') {
    filteredInvoices = filteredInvoices.filter(inv => inv.status === statusFilter);
  }

  // Apply search filter
  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filteredInvoices = filteredInvoices.filter(inv =>
      inv.clientName.toLowerCase().includes(search) ||
      inv.jobTitle.toLowerCase().includes(search) ||
      inv.invoiceNumber.toLowerCase().includes(search) ||
      (inv.clientAddress && inv.clientAddress.toLowerCase().includes(search))
    );
  }

  const getFilterCount = (status: InvoiceStatusFilter): number => {
    if (status === 'all') return invoices.length;
    return invoices.filter(inv => inv.status === status).length;
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={onTabChange}
      className="bg-[#FAFAFA] relative pb-32"
      fab={<FAB onClick={onNewEstimate} />}
    >
      <Header
        title="SMASH"
        right={
          onProfileClick && (
            <button onClick={onProfileClick} className="w-10 h-10 flex items-center justify-center text-primary hover:bg-slate-100 rounded-full transition-colors">
              <User size={22} />
            </button>
          )
        }
      />

      <div className="px-5 mt-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, job, invoice #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-full bg-white shadow-sm border border-gray-100 text-[15px] text-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="px-5 mt-4 -mb-1 overflow-x-auto hide-scrollbar">
        <div className="flex gap-2 pb-1">
          {(['all', 'draft', 'sent', 'paid', 'overdue'] as InvoiceStatusFilter[]).map((status) => {
            const count = getFilterCount(status);
            const isActive = statusFilter === status;
            const labels = {
              all: 'All',
              draft: 'Draft',
              sent: 'Sent',
              paid: 'Paid',
              overdue: 'Overdue'
            };

            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all
                  ${isActive
                    ? 'bg-accent text-white shadow-md'
                    : 'bg-white text-secondary border border-gray-100 hover:border-gray-200'
                  }
                `}
              >
                {labels[status]}
                <span className={`text-[11px] font-bold ${isActive ? 'text-white/80' : 'text-tertiary'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 flex flex-col gap-3 mt-4">
        {filteredInvoices.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-[60vh] text-secondary opacity-60">
             <p className="font-medium tracking-tight">
               {searchTerm.trim() ? 'No matches found' : 'No invoices yet'}
             </p>
           </div>
        ) : (
          filteredInvoices.map(inv => (
            <div
              key={inv.id}
              onClick={() => onSelectInvoice(inv.id)}
              className="bg-white rounded-[20px] p-5 shadow-card hover:scale-[0.99] transition-transform duration-200 cursor-pointer flex flex-col gap-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[12px] font-bold text-gray-900 tracking-tight">
                      {getInitials(inv.clientName)}
                   </div>
                   <div>
                      <h3 className="text-[15px] font-bold text-primary tracking-tight leading-none mb-1">{inv.jobTitle}</h3>
                      <p className="text-[13px] text-secondary">{inv.clientName}</p>
                      <p className="text-[11px] text-tertiary mt-0.5">Invoice #{inv.invoiceNumber}</p>
                   </div>
                </div>
                <StatusDot status={inv.status} />
              </div>

              <div className="h-px bg-gray-50 w-full" />

              <div className="flex justify-between items-center">
                <span className="text-[12px] font-medium text-tertiary">{inv.date}</span>
                <span className="text-[15px] font-bold text-primary tracking-tight">{formatCurrency(calculateInvoiceTotals(inv).total)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
};
