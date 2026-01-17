import React, { useState, useEffect } from 'react';
import { Search, User, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BottomSheet } from './bottomsheet';

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
        .is('deleted_at', null)
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

  const [isCreating, setIsCreating] = useState(false);

  async function handleAddNewCustomer(name: string) {
    if (isCreating) return; // Prevent double-clicks
    
    try {
      setIsCreating(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsCreating(false);
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData?.org_id) {
        setIsCreating(false);
        return;
      }

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

      // Update local state first
      setCustomers([newCustomer, ...customers]);
      
      // Brief delay so user sees the new customer was added
      await new Promise(r => setTimeout(r, 150));
      
      // Then notify parent
      onSelectCustomer(newCustomer.id, newCustomer.name);
    } catch (error) {
      console.error('[CustomerPickerSheet] Error creating customer:', error);
      alert('Failed to create customer. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  const handleSelectNone = () => {
    onSelectCustomer('', '');
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Select Customer" contained variant="dark">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-white/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[15px] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-transparent"
          />
        </div>

        {loading ? (
          <div className="py-8 text-center text-white/50 text-[14px]">
            Loading customers...
          </div>
        ) : (
          <div className="space-y-2">
            {!currentCustomerId && (
              <button
                onClick={handleSelectNone}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 transition-colors border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white text-[15px]">
                      No customer
                    </h4>
                    <p className="text-[13px] text-white/50">Record without a customer</p>
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
                    ? 'bg-white/5 border-2 border-accent/50'
                    : 'hover:bg-white/5 border border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    customer.id === currentCustomerId ? 'bg-accent text-black' : 'bg-white/10'
                  }`}>
                    <User className={`w-5 h-5 ${
                      customer.id === currentCustomerId ? 'text-black' : 'text-white/70'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white text-[15px]">
                      {customer.name}
                    </h4>
                    {(customer.phone || customer.email) && (
                      <p className="text-[13px] text-white/50 truncate">
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
                disabled={isCreating}
                className={`w-full text-left px-4 py-3 rounded-xl transition-colors border-2 border-dashed border-accent/50 ${isCreating ? 'opacity-60' : 'hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    {isCreating ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5 text-accent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white text-[15px]">
                      {isCreating ? 'Creating...' : `Add "${searchTerm}"`}
                    </h4>
                    <p className="text-[13px] text-white/50">{isCreating ? 'Please wait' : 'Create new customer'}</p>
                  </div>
                </div>
              </button>
            )}

            {!loading && filteredCustomers.length === 0 && !searchTerm.trim() && (
              <div className="py-8 text-center">
                <p className="text-[14px] text-white/70">No customers yet</p>
                <p className="text-[13px] text-white/40 mt-1">Start typing to add a new customer</p>
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
