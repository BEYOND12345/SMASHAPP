import React, { useState, useEffect } from 'react';
import { Layout, Header } from '../components/layout';
import { Button } from '../components/button';
import { ChevronLeft, Search, User } from 'lucide-react';
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
        <div className="px-6 mt-8 flex flex-col gap-6 flex-1">
          <div>
            <label className="block text-[15px] font-semibold text-primary mb-2">
              Customer (Optional)
            </label>
            <p className="text-[13px] text-tertiary mb-3">
              Select an existing customer or leave blank for new
            </p>

            {selectedCustomer ? (
              <div className="bg-white border border-divider rounded-xl p-4 mb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-primary">{selectedCustomer.name}</h3>
                      {selectedCustomer.phone && (
                        <p className="text-sm text-secondary">{selectedCustomer.phone}</p>
                      )}
                      {selectedCustomer.email && (
                        <p className="text-sm text-secondary">{selectedCustomer.email}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-[13px] text-brand font-medium"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-divider rounded-xl text-[15px] text-primary placeholder-tertiary focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>

                {loading ? (
                  <div className="text-center py-4 text-tertiary text-[14px]">
                    Loading customers...
                  </div>
                ) : filteredCustomers.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => setSelectedCustomer(customer)}
                        className="w-full text-left bg-white border border-divider rounded-xl p-3 hover:border-brand transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-primary text-[14px] mb-0.5">
                              {customer.name}
                            </h4>
                            {customer.phone && (
                              <p className="text-[12px] text-secondary">{customer.phone}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : searchTerm ? (
                  <div className="text-center py-4 text-tertiary text-[14px]">
                    No customers found
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
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