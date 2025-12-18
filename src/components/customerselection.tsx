import { useState, useEffect } from 'react';
import { Search, Plus, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card } from './card';
import { Button } from './button';
import { Input } from './inputs';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface CustomerSelectionProps {
  onSelectCustomer: (customer: Customer | null) => void;
  onSkip: () => void;
}

export function CustomerSelection({ onSelectCustomer, onSkip }: CustomerSelectionProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term)
      );
      setFilteredCustomers(filtered);
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
      setFilteredCustomers(data || []);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectCustomer(customer: Customer) {
    onSelectCustomer(customer);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Select Customer
          </h1>
          <p className="text-slate-600">
            Choose an existing customer or create a new one
          </p>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Button
          onClick={onSkip}
          variant="outline"
          className="w-full mb-4 flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Customer
        </Button>

        {loading ? (
          <div className="text-center py-8 text-slate-500">
            Loading customers...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 mb-4">
              {searchTerm ? 'No customers found' : 'No customers yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredCustomers.map((customer) => (
              <Card
                key={customer.id}
                onClick={() => handleSelectCustomer(customer)}
                className="cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 mb-1">
                      {customer.name}
                    </h3>
                    {customer.phone && (
                      <p className="text-sm text-slate-600">{customer.phone}</p>
                    )}
                    {customer.email && (
                      <p className="text-sm text-slate-600">{customer.email}</p>
                    )}
                    {customer.address && (
                      <p className="text-sm text-slate-500 truncate">
                        {customer.address}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
