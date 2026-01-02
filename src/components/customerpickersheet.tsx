import React, { useState, useEffect } from 'react';
import { Search, User, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company_name?: string;
  notes?: string;
}

interface CustomerPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer: (customerId: string, customerName: string) => void;
  currentCustomerId?: string;
}

export const CustomerPickerSheet: React.FC<CustomerPickerSheetProps> = ({
  isOpen,
  onClose,
  onSelectCustomer,
  currentCustomerId
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredCustomers(customers.slice(0, 10));
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term) ||
          c.company_name?.toLowerCase().includes(term)
      );
      setFilteredCustomers(filtered);
    }
  }, [searchTerm, customers]);

  async function loadCustomers() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData?.org_id) return;

      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, email, company_name, notes')
        .eq('org_id', userData.org_id)
        .not('name', 'is', null)
        .neq('name', '')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCustomers(data || []);
      setFilteredCustomers((data || []).slice(0, 10));
    } catch (error) {
      console.error('[CustomerPickerSheet] Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddNewCustomer(name: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData?.org_id) return;

      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: name.trim(),
          org_id: userData.org_id
        })
        .select()
        .single();

      if (error) throw error;

      const newCustomer: Customer = {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        company_name: data.company_name,
        notes: data.notes
      };

      setCustomers([newCustomer, ...customers]);
      onSelectCustomer(newCustomer.id, newCustomer.name);
    } catch (error) {
      console.error('[CustomerPickerSheet] Error creating customer:', error);
    }
  }

  const handleSelectNone = () => {
    onSelectCustomer('', '');
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
          <h2 className="text-[18px] font-semibold text-primary">Select Customer</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-secondary hover:text-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-tertiary pointer-events-none" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-divider rounded-xl text-[15px] text-primary placeholder-tertiary focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="py-8 text-center text-tertiary text-[14px]">
              Loading customers...
            </div>
          ) : (
            <div className="space-y-2">
              {!currentCustomerId && (
                <button
                  onClick={handleSelectNone}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors border border-divider"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-primary text-[15px]">
                        No customer
                      </h4>
                      <p className="text-[13px] text-secondary">Record without a customer</p>
                    </div>
                  </div>
                </button>
              )}

              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => onSelectCustomer(customer.id, customer.name)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                    customer.id === currentCustomerId
                      ? 'bg-blue-50 border-2 border-brand'
                      : 'hover:bg-slate-50 border border-divider'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      customer.id === currentCustomerId ? 'bg-brand' : 'bg-slate-100'
                    }`}>
                      <User className={`w-5 h-5 ${
                        customer.id === currentCustomerId ? 'text-white' : 'text-slate-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-primary text-[15px]">
                        {customer.name}
                      </h4>
                      {(customer.phone || customer.email) && (
                        <p className="text-[13px] text-secondary truncate">
                          {customer.phone || customer.email}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}

              {searchTerm.trim() && (
                <button
                  onClick={() => handleAddNewCustomer(searchTerm)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 transition-colors border-2 border-dashed border-brand"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Plus className="w-5 h-5 text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-brand text-[15px]">
                        Add "{searchTerm}"
                      </h4>
                      <p className="text-[13px] text-blue-600">Create new customer</p>
                    </div>
                  </div>
                </button>
              )}

              {!loading && filteredCustomers.length === 0 && !searchTerm.trim() && (
                <div className="py-8 text-center">
                  <p className="text-[14px] text-secondary">No customers yet</p>
                  <p className="text-[13px] text-tertiary mt-1">Start typing to add a new customer</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
};
