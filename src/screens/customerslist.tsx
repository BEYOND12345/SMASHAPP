import React, { useState } from 'react';
import { Customer } from '../types';
import { Layout, Header } from '../components/layout';
import { FAB } from '../components/fab';
import { User, Search, Users } from 'lucide-react';
import { getInitials } from '../lib/utils/calculations';

interface CustomersListProps {
  customers: Customer[];
  onNewEstimate: () => void;
  onSelectCustomer: (id: string) => void;
  activeTab: 'estimates' | 'invoices' | 'customers';
  onTabChange: (tab: 'estimates' | 'invoices' | 'customers') => void;
  onProfileClick?: () => void;
}

export const CustomersList: React.FC<CustomersListProps> = ({
  customers,
  onNewEstimate,
  onSelectCustomer,
  activeTab,
  onTabChange,
  onProfileClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  let filteredCustomers = customers;

  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filteredCustomers = filteredCustomers.filter(customer =>
      customer.name.toLowerCase().includes(search) ||
      (customer.email && customer.email.toLowerCase().includes(search)) ||
      (customer.phone && customer.phone.toLowerCase().includes(search)) ||
      (customer.company_name && customer.company_name.toLowerCase().includes(search))
    );
  }

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
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-full bg-white shadow-sm border border-gray-100 text-[15px] text-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="px-5 mt-4 mb-2">
        <p className="text-[12px] text-tertiary font-semibold uppercase tracking-wider">
          {filteredCustomers.length} {filteredCustomers.length === 1 ? 'Customer' : 'Customers'}
        </p>
      </div>

      <div className="px-5 flex flex-col gap-2.5">
        {filteredCustomers.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-[60vh]">
             <div className="w-20 h-20 rounded-[24px] bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
               <Users size={32} className="text-slate-300" />
             </div>
             <p className="text-[16px] text-slate-900 font-bold">
               {searchTerm.trim() ? 'No customers found' : 'No customers yet'}
             </p>
             <p className="text-[14px] text-slate-400 mt-1">
               {searchTerm.trim() ? 'Try a different search term' : 'Customers will appear here as you create quotes'}
             </p>
           </div>
        ) : (
          filteredCustomers.map(customer => {
            const hasSecondaryInfo = customer.company_name || customer.email || customer.phone;
            return (
              <div
                key={customer.id}
                onClick={() => onSelectCustomer(customer.id)}
                className="bg-white rounded-[20px] p-4 shadow-sm border border-slate-100/50 active:scale-[0.98] active:bg-slate-50/50 transition-all duration-200 cursor-pointer flex items-center gap-4"
              >
                <div className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center text-[14px] font-bold text-slate-900 tracking-tight flex-shrink-0 border border-slate-100">
                  {getInitials(customer.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-900 tracking-tight leading-tight mb-0.5">{customer.name}</h3>
                  {hasSecondaryInfo && (
                    <div className="flex flex-col gap-0.5">
                      {customer.company_name && (
                        <p className="text-[13px] text-slate-500 font-medium truncate">{customer.company_name}</p>
                      )}
                      {customer.email && (
                        <p className="text-[12px] text-slate-400 truncate font-medium">{customer.email}</p>
                      )}
                      {customer.phone && !customer.email && (
                        <p className="text-[12px] text-slate-400 font-medium">{customer.phone}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
};
