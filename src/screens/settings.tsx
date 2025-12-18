import { useState, useEffect, useRef } from 'react';
import { supabase, uploadLogo } from '../lib/supabase';
import { Layout, Header, Section } from '../components/layout';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { Input, Select } from '../components/inputs';
import { ChevronLeft, DollarSign, Save, Camera, User, LogOut, RefreshCw, Check, X } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  trade_type: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  business_address: string | null;
  abn: string | null;
  website: string | null;
  default_currency: string;
  default_tax_rate: number | null;
  default_payment_terms: string | null;
  bank_name: string | null;
  account_name: string | null;
  bsb_routing: string | null;
  account_number: string | null;
  payment_instructions: string | null;
}

interface PricingProfile {
  id: string;
  hourly_rate_cents: number;
  callout_fee_cents: number;
  travel_rate_cents: number | null;
  travel_is_time: boolean;
  materials_markup_percent: number;
  default_tax_rate: number | null;
  default_currency: string;
  default_payment_terms: string | null;
  default_unit_preference: string;
  bunnings_run_enabled: boolean;
  bunnings_run_minutes_default: number;
  workday_hours_default: number;
}

interface QBConnection {
  id: string;
  realm_id: string;
  company_name: string | null;
  is_active: boolean;
  connected_at: string;
}

const TRADE_TYPES = [
  'Carpenter',
  'Painter',
  'Electrician',
  'Plumber',
  'Gardener',
  'Cleaner',
  'Handyman',
  'Builder',
  'Tiler',
  'Roofer',
  'Other'
];

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD'];

const PAYMENT_TERMS = [
  'Due on receipt',
  'Net 7',
  'Net 14',
  'Net 30',
  'Net 60',
  'Net 90'
];

export function Settings({ onBack, onNavigate, onLogout }: { onBack: () => void; onNavigate?: (screen: string) => void; onLogout?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<PricingProfile | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [connection, setConnection] = useState<QBConnection | null>(null);

  const [editingBusiness, setEditingBusiness] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editingPricing, setEditingPricing] = useState(false);
  const [editingPayment, setEditingPayment] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const quickbooksEnabled = import.meta.env.VITE_ENABLE_QUICKBOOKS_INTEGRATION === 'true';

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setUserEmail(user.email || '');

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData?.org_id) return;

      setOrgId(userData.org_id);

      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', userData.org_id)
        .maybeSingle();

      setOrganization(orgData);

      const { data: profileData } = await supabase
        .from('user_pricing_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      setProfile(profileData);

      if (quickbooksEnabled) {
        const { data: conn } = await supabase
          .from('qb_connections')
          .select('*')
          .eq('org_id', userData.org_id)
          .eq('is_active', true)
          .maybeSingle();

        setConnection(conn);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveBusiness() {
    if (!organization || !orgId) return;

    try {
      setSavingBusiness(true);

      const { error } = await supabase
        .from('organizations')
        .update({
          name: organization.name,
          trade_type: organization.trade_type,
          phone: organization.phone,
        })
        .eq('id', orgId);

      if (error) throw error;

      setEditingBusiness(false);
    } catch (error) {
      console.error('Failed to save business info:', error);
      alert('Failed to save business information. Please try again.');
    } finally {
      setSavingBusiness(false);
    }
  }

  async function saveInvoice() {
    if (!organization || !orgId) return;

    try {
      setSavingInvoice(true);

      const { error } = await supabase
        .from('organizations')
        .update({
          business_address: organization.business_address,
          abn: organization.abn,
          website: organization.website,
        })
        .eq('id', orgId);

      if (error) throw error;

      setEditingInvoice(false);
    } catch (error) {
      console.error('Failed to save invoice details:', error);
      alert('Failed to save invoice details. Please try again.');
    } finally {
      setSavingInvoice(false);
    }
  }

  async function savePricing() {
    if (!profile) {
      await createDefaultProfile();
      return;
    }

    try {
      setSavingPricing(true);

      const { error } = await supabase
        .from('user_pricing_profiles')
        .update({
          hourly_rate_cents: profile.hourly_rate_cents,
          callout_fee_cents: profile.callout_fee_cents,
          travel_rate_cents: profile.travel_rate_cents,
          materials_markup_percent: profile.materials_markup_percent,
          default_tax_rate: profile.default_tax_rate,
          default_currency: profile.default_currency,
          bunnings_run_enabled: profile.bunnings_run_enabled,
          bunnings_run_minutes_default: profile.bunnings_run_minutes_default,
          workday_hours_default: profile.workday_hours_default,
        })
        .eq('id', profile.id);

      if (error) throw error;

      setEditingPricing(false);
    } catch (error) {
      console.error('Failed to save pricing:', error);
      alert('Failed to save pricing. Please try again.');
    } finally {
      setSavingPricing(false);
    }
  }

  async function savePayment() {
    if (!organization || !orgId) return;

    try {
      setSavingPayment(true);

      const { error } = await supabase
        .from('organizations')
        .update({
          default_payment_terms: organization.default_payment_terms,
          bank_name: organization.bank_name,
          account_name: organization.account_name,
          bsb_routing: organization.bsb_routing,
          account_number: organization.account_number,
          payment_instructions: organization.payment_instructions,
        })
        .eq('id', orgId);

      if (error) throw error;

      setEditingPayment(false);
    } catch (error) {
      console.error('Failed to save payment settings:', error);
      alert('Failed to save payment settings. Please try again.');
    } finally {
      setSavingPayment(false);
    }
  }

  async function createDefaultProfile() {
    try {
      setSavingPricing(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) return;

      const defaultProfile = {
        org_id: orgId,
        user_id: user.id,
        hourly_rate_cents: 8500,
        callout_fee_cents: 0,
        travel_rate_cents: null,
        travel_is_time: true,
        materials_markup_percent: 0,
        default_tax_rate: 10,
        default_currency: 'AUD',
        default_unit_preference: 'metric',
        bunnings_run_enabled: true,
        bunnings_run_minutes_default: 60,
        workday_hours_default: 8,
      };

      const { data, error } = await supabase
        .from('user_pricing_profiles')
        .insert(defaultProfile)
        .select()
        .single();

      if (error) throw error;

      setProfile(data);
      setEditingPricing(true);
    } catch (error) {
      console.error('Failed to create default profile:', error);
      alert('Failed to create pricing profile. Please try again.');
    } finally {
      setSavingPricing(false);
    }
  }

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !orgId) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    try {
      setIsUploadingLogo(true);
      const logoUrl = await uploadLogo(userId, file);

      const { error } = await supabase
        .from('organizations')
        .update({ logo_url: logoUrl })
        .eq('id', orgId);

      if (error) throw error;

      setOrganization(prev => prev ? { ...prev, logo_url: logoUrl } : null);
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  async function handleConnect() {
    if (!orgId) return;

    try {
      setConnecting(true);

      const { data, error } = await supabase.functions.invoke('quickbooks-connect', {
        body: { org_id: orgId },
      });

      if (error) throw error;

      if (data.auth_url) {
        const authWindow = window.open(
          data.auth_url,
          'QuickBooks Authorization',
          'width=800,height=600'
        );

        const checkClosed = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(checkClosed);
            setTimeout(() => loadAllData(), 1000);
            setConnecting(false);
          }
        }, 500);
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      alert('Failed to connect to QuickBooks. Please try again.');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!orgId || !confirm('Are you sure you want to disconnect QuickBooks?')) return;

    try {
      setLoading(true);

      const { error } = await supabase.functions.invoke('quickbooks-disconnect', {
        body: { org_id: orgId },
      });

      if (error) throw error;

      setConnection(null);
      alert('QuickBooks disconnected successfully');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      alert('Failed to disconnect QuickBooks. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncCustomers() {
    if (!orgId) return;

    try {
      setSyncing(true);

      const { error } = await supabase.functions.invoke('quickbooks-sync-customers', {
        body: { org_id: orgId },
      });

      if (error) throw error;

      alert('Customer sync started successfully');
    } catch (error) {
      console.error('Failed to sync customers:', error);
      alert('Failed to sync customers. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncInvoices() {
    if (!orgId) return;

    try {
      setSyncing(true);

      const { error } = await supabase.functions.invoke('quickbooks-sync-invoices', {
        body: { org_id: orgId },
      });

      if (error) throw error;

      alert('Invoice sync started successfully');
    } catch (error) {
      console.error('Failed to sync invoices:', error);
      alert('Failed to sync invoices. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <Layout showNav={false} className="bg-surface">
        <div className="h-full flex flex-col">
          <Header
            left={
              <button onClick={onBack} className="p-2 -ml-2 text-primary">
                <ChevronLeft size={24} />
              </button>
            }
            title="Settings"
          />
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 text-center text-secondary">Loading...</div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showNav={false} className="bg-surface">
      <div className="h-full flex flex-col">
        <Header
          left={
            <button onClick={onBack} className="p-2 -ml-2 text-primary">
              <ChevronLeft size={24} />
            </button>
          }
          title="Settings"
        />

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-8 flex flex-col items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoChange}
          className="hidden"
        />
        <button
          onClick={handleLogoClick}
          disabled={isUploadingLogo}
          className="relative w-20 h-20 rounded-full bg-brand/10 flex items-center justify-center mb-4 cursor-pointer hover:bg-brand/20 transition-colors group disabled:cursor-wait disabled:opacity-50"
        >
          {organization?.logo_url ? (
            <img
              src={organization.logo_url}
              alt="Business logo"
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <User size={36} className="text-brand" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={24} className="text-white" />
          </div>
        </button>
        <h2 className="text-[20px] font-bold text-primary">{organization?.name || 'Business Name'}</h2>
        <p className="text-[14px] text-secondary mt-1">{userEmail}</p>
      </div>

      <Section title="Business Information">
        <Card>
          {editingBusiness && organization ? (
            <div className="flex flex-col gap-5">
              <Input
                label="Business Name"
                value={organization.name}
                onChange={e => setOrganization({ ...organization, name: e.target.value })}
                autoFocus
              />
              <Select
                label="Trade Type"
                options={TRADE_TYPES}
                value={organization.trade_type || ''}
                onChange={e => setOrganization({ ...organization, trade_type: e.target.value })}
              />
              <Input
                label="Phone Number"
                type="tel"
                value={organization.phone || ''}
                onChange={e => setOrganization({ ...organization, phone: e.target.value })}
              />
              <div className="flex gap-3 mt-2">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setEditingBusiness(false);
                    loadAllData();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={saveBusiness}
                  disabled={savingBusiness || !organization.name}
                >
                  {savingBusiness ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Business Name</p>
                <p className="text-[16px] text-primary">{organization?.name || 'Not set'}</p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Trade Type</p>
                <p className="text-[16px] text-primary">{organization?.trade_type || 'Not set'}</p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Phone Number</p>
                <p className="text-[16px] text-primary">{organization?.phone || 'Not set'}</p>
              </div>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setEditingBusiness(true)}
              >
                Edit Business Info
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Invoice Details">
        <Card>
          {editingInvoice && organization ? (
            <div className="flex flex-col gap-5">
              <Input
                label="Business Address"
                value={organization.business_address || ''}
                onChange={e => setOrganization({ ...organization, business_address: e.target.value })}
                placeholder="123 Main St, City, State"
              />
              <Input
                label="ABN / Business Number"
                value={organization.abn || ''}
                onChange={e => setOrganization({ ...organization, abn: e.target.value })}
                placeholder="12 345 678 901"
              />
              <Input
                label="Website"
                type="url"
                value={organization.website || ''}
                onChange={e => setOrganization({ ...organization, website: e.target.value })}
                placeholder="https://example.com"
              />
              <div className="flex gap-3 mt-2">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setEditingInvoice(false);
                    loadAllData();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={saveInvoice}
                  disabled={savingInvoice}
                >
                  {savingInvoice ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Business Address</p>
                <p className="text-[16px] text-primary">{organization?.business_address || 'Not set'}</p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">ABN / Business Number</p>
                <p className="text-[16px] text-primary">{organization?.abn || 'Not set'}</p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Website</p>
                <p className="text-[16px] text-primary">{organization?.website || 'Not set'}</p>
              </div>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setEditingInvoice(true)}
              >
                Edit Invoice Details
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Pricing & Rates">
        <Card>
          {profile && (
            <div className="mb-4 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-green-600" />
                <span className="text-[14px] font-medium text-green-800">Pricing profile active</span>
              </div>
              <span className="text-[12px] text-green-600">Ready to create quotes</span>
            </div>
          )}
          {!profile ? (
            <div className="text-center py-8">
              <DollarSign size={48} className="mx-auto text-brand/30 mb-4" />
              <p className="text-secondary mb-4">No pricing profile set up yet</p>
              <Button onClick={createDefaultProfile} disabled={savingPricing}>
                {savingPricing ? 'Creating...' : 'Create Profile'}
              </Button>
            </div>
          ) : editingPricing ? (
            <div className="flex flex-col gap-5">
              <Select
                label="Currency"
                options={CURRENCIES}
                value={profile.default_currency}
                onChange={e => setProfile({ ...profile, default_currency: e.target.value })}
              />
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[13px] text-blue-800">
                <strong>Note:</strong> All rates are tax-exclusive. GST will be calculated and shown separately on quotes and invoices.
              </div>
              <Input
                label="Hourly Rate"
                type="number"
                step="0.01"
                value={(profile.hourly_rate_cents / 100).toFixed(2)}
                onChange={e => setProfile({ ...profile, hourly_rate_cents: Math.round(parseFloat(e.target.value) * 100) })}
                placeholder="85.00"
              />
              <Input
                label="Callout Fee"
                type="number"
                step="0.01"
                value={(profile.callout_fee_cents / 100).toFixed(2)}
                onChange={e => setProfile({ ...profile, callout_fee_cents: Math.round(parseFloat(e.target.value) * 100) })}
                placeholder="0.00"
              />
              <Input
                label="Travel Fee"
                type="number"
                step="0.01"
                value={profile.travel_rate_cents ? (profile.travel_rate_cents / 100).toFixed(2) : ''}
                onChange={e => setProfile({ ...profile, travel_rate_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                placeholder="0.00"
              />
              <Input
                label="Materials Markup %"
                type="number"
                step="0.1"
                value={profile.materials_markup_percent.toString()}
                onChange={e => setProfile({ ...profile, materials_markup_percent: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
              <Input
                label="Tax Rate %"
                type="number"
                step="0.1"
                value={profile.default_tax_rate?.toString() || ''}
                onChange={e => setProfile({ ...profile, default_tax_rate: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="10"
              />
              <Input
                label="Workday Hours"
                type="number"
                value={profile.workday_hours_default.toString()}
                onChange={e => setProfile({ ...profile, workday_hours_default: parseInt(e.target.value) || 8 })}
                placeholder="8"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bunnings_run"
                  checked={profile.bunnings_run_enabled}
                  onChange={e => setProfile({ ...profile, bunnings_run_enabled: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="bunnings_run" className="text-[14px] text-primary">
                  Enable Bunnings Run (materials pickup fee)
                </label>
              </div>
              {profile.bunnings_run_enabled && (
                <Input
                  label="Bunnings Run Default Minutes"
                  type="number"
                  value={profile.bunnings_run_minutes_default.toString()}
                  onChange={e => setProfile({ ...profile, bunnings_run_minutes_default: parseInt(e.target.value) || 60 })}
                  placeholder="60"
                />
              )}
              <div className="flex gap-3 mt-2">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setEditingPricing(false);
                    loadAllData();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={savePricing}
                  disabled={savingPricing}
                >
                  {savingPricing ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Currency</p>
                <p className="text-[16px] text-primary">{profile.default_currency}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Hourly Rate</p>
                  <p className="text-[16px] text-primary">${(profile.hourly_rate_cents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Callout Fee</p>
                  <p className="text-[16px] text-primary">${(profile.callout_fee_cents / 100).toFixed(2)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Travel Fee</p>
                  <p className="text-[16px] text-primary">
                    {profile.travel_rate_cents ? `$${(profile.travel_rate_cents / 100).toFixed(2)}` : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Materials Markup</p>
                  <p className="text-[16px] text-primary">{profile.materials_markup_percent}%</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Tax Rate</p>
                  <p className="text-[16px] text-primary">{profile.default_tax_rate || 0}%</p>
                </div>
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Workday Hours</p>
                  <p className="text-[16px] text-primary">{profile.workday_hours_default} hours</p>
                </div>
              </div>
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Bunnings Run</p>
                <p className="text-[16px] text-primary">{profile.bunnings_run_enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setEditingPricing(true)}
              >
                Edit Rates
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Payment Settings">
        <Card>
          {editingPayment && organization ? (
            <div className="flex flex-col gap-5">
              <Select
                label="Payment Terms"
                options={PAYMENT_TERMS}
                value={organization.default_payment_terms || 'Net 30'}
                onChange={e => setOrganization({ ...organization, default_payment_terms: e.target.value })}
              />
              <Input
                label="Bank Name"
                value={organization.bank_name || ''}
                onChange={e => setOrganization({ ...organization, bank_name: e.target.value })}
                placeholder="e.g., Commonwealth Bank"
              />
              <Input
                label="Account Name"
                value={organization.account_name || ''}
                onChange={e => setOrganization({ ...organization, account_name: e.target.value })}
                placeholder="e.g., John Smith Trading"
              />
              <Input
                label="BSB / Routing Number"
                value={organization.bsb_routing || ''}
                onChange={e => setOrganization({ ...organization, bsb_routing: e.target.value })}
                placeholder="e.g., 123-456"
              />
              <Input
                label="Account Number"
                value={organization.account_number || ''}
                onChange={e => setOrganization({ ...organization, account_number: e.target.value })}
                placeholder="e.g., 12345678"
              />
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-tertiary uppercase tracking-widest">
                  Payment Instructions
                </label>
                <textarea
                  value={organization.payment_instructions || ''}
                  onChange={e => setOrganization({ ...organization, payment_instructions: e.target.value })}
                  placeholder="Additional payment notes or instructions..."
                  className="w-full px-4 py-3 bg-white border-2 border-border rounded-xl text-[16px] text-primary placeholder:text-tertiary focus:outline-none focus:border-brand transition-colors resize-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 mt-2">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setEditingPayment(false);
                    loadAllData();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={savePayment}
                  disabled={savingPayment}
                >
                  {savingPayment ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Payment Terms</p>
                <p className="text-[16px] text-primary">{organization?.default_payment_terms || 'Net 30'}</p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Bank Name</p>
                <p className="text-[16px] text-primary">{organization?.bank_name || 'Not set'}</p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Account Name</p>
                <p className="text-[16px] text-primary">{organization?.account_name || 'Not set'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">BSB / Routing</p>
                  <p className="text-[16px] text-primary">{organization?.bsb_routing || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Account Number</p>
                  <p className="text-[16px] text-primary">{organization?.account_number || 'Not set'}</p>
                </div>
              </div>
              {organization?.payment_instructions && (
                <div>
                  <p className="text-[12px] font-bold text-tertiary uppercase tracking-widest mb-2">Payment Instructions</p>
                  <p className="text-[16px] text-primary whitespace-pre-wrap">{organization.payment_instructions}</p>
                </div>
              )}
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setEditingPayment(true)}
              >
                Edit Payment Settings
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Materials Catalog">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-[14px] text-secondary">
                Manage commonly used materials and prices for faster quoting
              </p>
            </div>
            <Button onClick={() => onNavigate?.('MaterialsCatalog')} variant="secondary">
              Manage
            </Button>
          </div>
        </Card>
      </Section>

      {!quickbooksEnabled && (
        <Section title="Coming Soon">
          <Card className="bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 mt-1">ℹ️</div>
              <div>
                <p className="text-[14px] text-blue-700">
                  QuickBooks integration is currently under development and will be available in a future release.
                </p>
              </div>
            </div>
          </Card>
        </Section>
      )}

      {quickbooksEnabled && (
        <Section title="QuickBooks Integration">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[14px] text-secondary">
                Sync customers and invoices with QuickBooks
              </p>
              {connection && (
                <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-[12px] font-medium">
                  <Check size={14} />
                  Connected
                </div>
              )}
            </div>

            {loading ? (
              <div className="py-4 text-center text-secondary">Loading...</div>
            ) : connection ? (
              <div className="flex flex-col gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-3 text-[14px]">
                    <div>
                      <span className="text-secondary">Company:</span>
                      <span className="ml-2 font-medium text-primary">
                        {connection.company_name || 'Not set'}
                      </span>
                    </div>
                    <div>
                      <span className="text-secondary">Connected:</span>
                      <span className="ml-2 font-medium text-primary">
                        {new Date(connection.connected_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleSyncCustomers}
                    disabled={syncing}
                    variant="secondary"
                    fullWidth
                  >
                    <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                    Sync Customers
                  </Button>
                  <Button
                    onClick={handleSyncInvoices}
                    disabled={syncing}
                    variant="secondary"
                    fullWidth
                  >
                    <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                    Sync Invoices
                  </Button>
                </div>

                <Button
                  onClick={handleDisconnect}
                  variant="secondary"
                  fullWidth
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X size={16} />
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={connecting}
                fullWidth
              >
                {connecting ? 'Connecting...' : 'Connect QuickBooks'}
              </Button>
            )}
          </Card>
        </Section>
      )}

      <Section title="Account">
        <Card>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-3 py-4 text-red-600 hover:text-red-700 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-bold text-[15px]">Sign Out</span>
          </button>
        </Card>
      </Section>
        </div>
      </div>
    </Layout>
  );
}
