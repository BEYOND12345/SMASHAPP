import React, { useState } from 'react';
import { Estimate, JobStatus } from '../types';
import { Layout, Header } from '../components/layout';
import { FAB } from '../components/fab';
import { User, Search } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency, getInitials } from '../lib/utils/calculations';

interface EstimatesListProps {
  estimates: Estimate[];
  onNewEstimate: () => void;
  onSelectEstimate: (id: string) => void;
  activeTab: 'estimates' | 'invoices';
  onTabChange: (tab: 'estimates' | 'invoices') => void;
  onProfileClick?: () => void;
}

// Simplified status indicator (just a dot)
const StatusDot: React.FC<{ status: JobStatus }> = ({ status }) => {
  const colors = {
    [JobStatus.DRAFT]: "bg-gray-300",
    [JobStatus.SENT]: "bg-gray-400",
    [JobStatus.APPROVED]: "bg-accent",
    [JobStatus.PAID]: "bg-accent",
  };
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-full">
      <div className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="text-[11px] font-semibold text-secondary">{status}</span>
    </div>
  );
}

export const EstimatesList: React.FC<EstimatesListProps> = ({
  estimates,
  onNewEstimate,
  onSelectEstimate,
  activeTab,
  onTabChange,
  onProfileClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter estimates based on active tab
  let filteredEstimates = activeTab === 'estimates'
    ? estimates.filter(est => est.status === JobStatus.DRAFT || est.status === JobStatus.SENT)
    : estimates.filter(est => est.status === JobStatus.APPROVED || est.status === JobStatus.PAID);

  // Apply search filter
  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filteredEstimates = filteredEstimates.filter(est =>
      est.clientName.toLowerCase().includes(search) ||
      est.jobTitle.toLowerCase().includes(search) ||
      (est.clientAddress && est.clientAddress.toLowerCase().includes(search))
    );
  }

  return (
    <Layout activeTab={activeTab} onTabChange={onTabChange} className="bg-[#FAFAFA] relative pb-32">
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
            placeholder="Search by name, job, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-full bg-white shadow-sm border border-gray-100 text-[15px] text-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="px-5 flex flex-col gap-3 mt-4">
        {filteredEstimates.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-[60vh] text-secondary opacity-60">
             <p className="font-medium tracking-tight">
               {searchTerm.trim() ? 'No matches found' : `No ${activeTab === 'estimates' ? 'estimates' : 'invoices'} yet`}
             </p>
           </div>
        ) : (
          filteredEstimates.map(est => (
            <div 
              key={est.id} 
              onClick={() => onSelectEstimate(est.id)} 
              className="bg-white rounded-[20px] p-5 shadow-card hover:scale-[0.99] transition-transform duration-200 cursor-pointer flex flex-col gap-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[12px] font-bold text-gray-900 tracking-tight">
                      {getInitials(est.clientName)}
                   </div>
                   <div>
                      <h3 className="text-[15px] font-bold text-primary tracking-tight leading-none mb-1">{est.jobTitle}</h3>
                      <p className="text-[13px] text-secondary">{est.clientName}</p>
                   </div>
                </div>
                <StatusDot status={est.status} />
              </div>

              <div className="h-px bg-gray-50 w-full" />
              
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-medium text-tertiary">{est.date}</span>
                <span className="text-[15px] font-bold text-primary tracking-tight">{formatCurrency(calculateEstimateTotals(est).total)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <FAB onClick={onNewEstimate} />
    </Layout>
  );
};