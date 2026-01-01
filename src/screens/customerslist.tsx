import React, { useState } from 'react';
import { Customer } from '../types';
import { Layout, Header } from '../components/layout';
import { FAB } from '../components/fab';
import { User, Search } from 'lucide-react';
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
        <div className="flex gap-2 relative">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by name, email, phone, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-full bg-white shadow-sm border border-gray-100 text-[15px] text-primary placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
      </div>

      <div className="px-5 mt-2">
        <p className="text-[13px] text-tertiary font-medium">
          {filteredCustomers.length} {filteredCustomers.length === 1 ? 'customer' : 'customers'}
        </p>
      </div>

      <div className="px-5 flex flex-col gap-3 mt-3">
        {filteredCustomers.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-[60vh] text-secondary opacity-60">
             <p className="font-medium tracking-tight">
               {searchTerm.trim() ? 'No matches found' : 'No customers yet'}
             </p>
           </div>
        ) : (
          filteredCustomers.map(customer => (
            <div
              key={customer.id}
              onClick={() => onSelectCustomer(customer.id)}
              className="bg-white rounded-[20px] p-5 shadow-card hover:scale-[0.99] transition-transform duration-200 cursor-pointer flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-[14px] font-bold text-gray-900 tracking-tight flex-shrink-0">
                {getInitials(customer.name)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-bold text-primary tracking-tight leading-none mb-1">{customer.name}</h3>
                {customer.company_name && (
                  <p className="text-[13px] text-secondary truncate">{customer.company_name}</p>
                )}
                {customer.email && (
                  <p className="text-[12px] text-tertiary truncate mt-0.5">{customer.email}</p>
                )}
                {customer.phone && (
                  <p className="text-[12px] text-tertiary mt-0.5">{customer.phone}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
};
