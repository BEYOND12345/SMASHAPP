import React, { useState, useEffect } from 'react';
import { Estimate, JobStatus } from '../types';
import { Layout, Header } from '../components/layout';
import { FAB } from '../components/fab';
import { User, Search, Filter, Check } from 'lucide-react';
import { calculateEstimateTotals, formatCurrency, getInitials } from '../lib/utils/calculations';

interface EstimatesListProps {
  estimates: Estimate[];
  onNewEstimate: () => void;
  onSelectEstimate: (id: string) => void;
  activeTab: 'estimates' | 'invoices' | 'customers';
  onTabChange: (tab: 'estimates' | 'invoices' | 'customers') => void;
  onProfileClick?: () => void;
  onQuickRecord?: () => void;
}

// Minimal status indicator
const StatusDot: React.FC<{ status: JobStatus }> = ({ status }) => {
  return (
    <div className="bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
      <span className="text-[11px] font-semibold text-slate-600">{status}</span>
    </div>
  );
}

type EstimateStatusFilter = 'all' | JobStatus.DRAFT | JobStatus.SENT | JobStatus.APPROVED | JobStatus.PAID;

export const EstimatesList: React.FC<EstimatesListProps> = ({
  estimates,
  onNewEstimate,
  onSelectEstimate,
  activeTab,
  onTabChange,
  onProfileClick,
  onQuickRecord
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<EstimateStatusFilter>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Reset filter when switching tabs
  useEffect(() => {
    setStatusFilter('all');
    setShowFilterModal(false);
  }, [activeTab]);

  // Filter estimates based on active tab
  let filteredEstimates = activeTab === 'estimates'
    ? estimates.filter(est => est.status === JobStatus.DRAFT || est.status === JobStatus.SENT)
    : estimates.filter(est => est.status === JobStatus.APPROVED || est.status === JobStatus.PAID);

  // Apply status filter
  if (statusFilter !== 'all') {
    filteredEstimates = filteredEstimates.filter(est => est.status === statusFilter);
  }

  // Apply search filter
  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filteredEstimates = filteredEstimates.filter(est =>
      est.clientName.toLowerCase().includes(search) ||
      est.jobTitle.toLowerCase().includes(search) ||
      (est.clientAddress && est.clientAddress.toLowerCase().includes(search))
    );
  }

  const getFilterCount = (status: EstimateStatusFilter): number => {
    const baseFiltered = activeTab === 'estimates'
      ? estimates.filter(est => est.status === JobStatus.DRAFT || est.status === JobStatus.SENT)
      : estimates.filter(est => est.status === JobStatus.APPROVED || est.status === JobStatus.PAID);

    if (status === 'all') return baseFiltered.length;
    return baseFiltered.filter(est => est.status === status).length;
  };

  const getAvailableFilters = (): EstimateStatusFilter[] => {
    if (activeTab === 'estimates') {
      return ['all', JobStatus.DRAFT, JobStatus.SENT];
    } else {
      return ['all', JobStatus.APPROVED, JobStatus.PAID];
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={onTabChange}
      className="bg-[#FAFAFA] relative pb-32"
      fab={<FAB onClick={onQuickRecord || onNewEstimate} />}
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
        <div className="flex gap-2 relative">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="SEARCH JOBS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 h-12 rounded-xl bg-white shadow-sm border border-slate-100 text-[13px] font-semibold text-slate-700 placeholder:text-slate-300 uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-slate-200 transition-all"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilterModal(!showFilterModal)}
              className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
                statusFilter !== 'all'
                  ? 'bg-accent text-black shadow-md shadow-accent/20'
                  : 'bg-white text-slate-400 border border-slate-100 shadow-sm'
              }`}
            >
              <Filter size={20} />
            </button>

            {/* Filter Dropdown */}
            {showFilterModal && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowFilterModal(false)}
                />
                <div className="absolute right-0 top-14 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                  {getAvailableFilters().map((status) => {
                    const count = getFilterCount(status);
                    const isActive = statusFilter === status;
                    const label = status === 'all' ? 'All' : status;

                    return (
                      <button
                        key={status}
                        onClick={() => {
                          setStatusFilter(status);
                          setShowFilterModal(false);
                        }}
                        className={`
                          w-full flex items-center justify-between px-4 py-3 text-[14px] font-medium transition-all
                          ${isActive
                            ? 'bg-accent/10 text-accent'
                            : 'text-secondary hover:bg-gray-50'
                          }
                        `}
                      >
                        <span>{label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[12px] font-bold ${isActive ? 'text-accent' : 'text-tertiary'}`}>
                            {count}
                          </span>
                          {isActive && <Check size={16} className="text-accent" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
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
              className="bg-white rounded-[24px] p-6 shadow-sm border-2 border-slate-50 active:scale-[0.98] active:bg-slate-50 transition-all duration-200 cursor-pointer flex flex-col gap-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4 flex-1 min-w-0 pr-3">
                   <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-[14px] font-bold text-slate-900 tracking-tight flex-shrink-0">
                      {getInitials(est.clientName)}
                   </div>
                   <div className="flex-1 min-w-0">
                      <h3 className="text-[17px] font-black text-slate-900 tracking-tighter uppercase leading-tight mb-0.5 truncate">{est.jobTitle}</h3>
                      <p className="text-[12px] text-slate-400 font-bold uppercase tracking-widest truncate">{est.clientName}</p>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mt-1.5">ID #{est.id.substring(0, 6).toUpperCase()}</p>
                   </div>
                </div>
                <div className="flex-shrink-0">
                  <StatusDot status={est.status} />
                </div>
              </div>

              <div className="h-px bg-slate-50 w-full" />

              <div className="flex justify-between items-center px-0.5">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{est.date}</span>
                <span className="text-[20px] font-black text-slate-900 tracking-tighter tabular-nums">{formatCurrency(calculateEstimateTotals(est).total)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
};