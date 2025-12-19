import React, { useState, useEffect } from 'react';
import { Layout, Header } from '../components/layout';
import { Button } from '../components/button';
import { ChevronLeft, Search, User, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface NewEstimateProps {
  onBack: () => void;
  onStartRecording: (clientName: string, address: string, customerId?: string) => void;
}

export const NewEstimate: React.FC<NewEstimateProps> = ({ onBack, onStartRecording }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredCustomers(customers.slice(0, 5));
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term)
      );
      setFilteredCustomers(filtered.slice(0, 5));
    }
  }, [searchTerm, customers]);

  async function loadCustomers() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, email, address')
        .eq('organization_id', userData.organization_id)
        .not('name', 'is', null)
        .neq('name', '')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCustomers(data || []);
      setFilteredCustomers((data || []).slice(0, 5));
    } catch (error) {
      console.error('Error loading customers:', error);
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
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: name.trim(),
          org_id: userData.organization_id
        })
        .select()
        .single();

      if (error) throw error;

      const newCustomer: Customer = {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address
      };

      setCustomers([newCustomer, ...customers]);
      setSelectedCustomer(newCustomer);
      setSearchTerm('');
    } catch (error) {
      console.error('Error creating customer:', error);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCustomer) {
      onStartRecording(selectedCustomer.name, selectedCustomer.address || '', selectedCustomer.id);
    } else {
      onStartRecording('', '');
    }
  };

  return (
    <Layout showNav={false} className="bg-surface flex flex-col">
      <Header
        left={
          <button onClick={onBack} className="p-2 -ml-2 text-primary">
            <ChevronLeft size={24} />
          </button>
        }
        title="New Estimate"
      />

      <form onSubmit={handleSubmit} className="flex flex-col flex-1">
        <div className="px-6 mt-8 flex flex-col flex-1">
          <label className="block text-[15px] font-semibold text-primary mb-2">
            Customer (Optional)
          </label>
          <p className="text-[13px] text-tertiary mb-3">
            Select an existing customer or leave blank for new
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-tertiary pointer-events-none z-10" />
            <input
              type="text"
              placeholder={selectedCustomer ? selectedCustomer.name : "Search customers..."}
              value={selectedCustomer ? selectedCustomer.name : searchTerm}
              onChange={(e) => {
                if (selectedCustomer) {
                  setSelectedCustomer(null);
                }
                setSearchTerm(e.target.value);
              }}
              onFocus={() => {
                if (selectedCustomer) {
                  setSelectedCustomer(null);
                }
              }}
              className="w-full pl-10 pr-4 py-3 bg-white border border-divider rounded-xl text-[15px] text-primary placeholder-tertiary focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />

            {!selectedCustomer && searchTerm && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-divider rounded-xl shadow-lg overflow-hidden z-20 max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="px-4 py-3 text-center text-tertiary text-[13px]">
                    Loading...
                  </div>
                ) : (
                  <>
                    {filteredCustomers.map((customer, index) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setSearchTerm('');
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                          index > 0 ? 'border-t border-divider' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-primary text-[14px]">
                              {customer.name}
                            </h4>
                            {customer.phone && (
                              <p className="text-[12px] text-secondary">{customer.phone}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}

                    {searchTerm.trim() && (
                      <button
                        type="button"
                        onClick={() => handleAddNewCustomer(searchTerm)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                          filteredCustomers.length > 0 ? 'border-t border-divider' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Plus className="w-4 h-4 text-brand" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-brand text-[14px]">
                              Add "{searchTerm}"
                            </h4>
                          </div>
                        </div>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
            <p className="text-[13px] text-blue-900 leading-relaxed">
              {selectedCustomer
                ? "Voice AI will focus on the job details. Customer info is already saved."
                : "Voice AI will capture both customer and job details."}
            </p>
          </div>
        </div>

        <div className="p-6 mt-auto bg-surface">
          <Button
            type="submit"
            fullWidth
            variant="primary"
          >
            Start Recording
          </Button>
        </div>
      </form>
    </Layout>
  );
};