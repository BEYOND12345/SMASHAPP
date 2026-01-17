import { useState, useEffect, useRef } from 'react';
import { supabase, uploadLogo } from '../lib/supabase';
import { Layout, Header, Section } from '../components/layout';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { Input, Select } from '../components/inputs';
import { ChevronLeft, Camera, User, LogOut, Briefcase, ArrowRight, MessageSquare } from 'lucide-react';
import { FeedbackSheet } from '../components/feedbacksheet';
import { ScreenName } from '../types';

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
  'Carpenter', 'Painter', 'Electrician', 'Plumber', 'Gardener', 'Cleaner', 'Handyman', 'Builder', 'Tiler', 'Roofer', 'Other'
];

export function Settings({ onBack, onNavigate, onLogout }: { onBack: () => void; onNavigate?: (screen: ScreenName) => void; onLogout?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<PricingProfile | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [, setConnection] = useState<QBConnection | null>(null);

  const [editingSection, setEditingSection] = useState<'business' | 'invoice' | 'pricing' | 'payment' | null>(null);
  const [saving, setSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  // syncing state reserved for future QuickBooks UI
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickbooksEnabled = import.meta.env.VITE_ENABLE_QUICKBOOKS_INTEGRATION === 'true';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const isLocalSupabase =
    typeof supabaseUrl === 'string' &&
    (supabaseUrl.includes('127.0.0.1:54321') || supabaseUrl.includes('localhost:54321'));

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;

      setUserId(user.id);
      setUserEmail(user.email || '');

      const { data: userData } = await supabase.from('users').select('org_id').eq('id', user.id).maybeSingle();
      if (!userData?.org_id) return;

      setOrgId(userData.org_id);

      const { data: orgData } = await supabase.from('organizations').select('*').eq('id', userData.org_id).maybeSingle();
      setOrganization(orgData);

      const { data: profileData } = await supabase.from('user_pricing_profiles').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle();
      setProfile(profileData);

      if (quickbooksEnabled) {
        const { data: conn } = await supabase.from('qb_connections').select('*').eq('org_id', userData.org_id).eq('is_active', true).maybeSingle();
        setConnection(conn);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!orgId || !organization) return;
    try {
      setSaving(true);
      let error;

      if (editingSection === 'business') {
        const { error: e } = await supabase.from('organizations').update({
          name: organization.name,
          trade_type: organization.trade_type,
          phone: organization.phone,
        }).eq('id', orgId);
        error = e;
      } else if (editingSection === 'invoice') {
        const { error: e } = await supabase.from('organizations').update({
          business_address: organization.business_address,
          abn: organization.abn,
          website: organization.website,
        }).eq('id', orgId);
        error = e;
      } else if (editingSection === 'pricing' && profile) {
        const { error: e } = await supabase.from('user_pricing_profiles').update({
          hourly_rate_cents: profile.hourly_rate_cents,
          callout_fee_cents: profile.callout_fee_cents,
          travel_rate_cents: profile.travel_rate_cents,
          materials_markup_percent: profile.materials_markup_percent,
          default_tax_rate: profile.default_tax_rate,
          default_currency: profile.default_currency,
          bunnings_run_enabled: profile.bunnings_run_enabled,
          bunnings_run_minutes_default: profile.bunnings_run_minutes_default,
          workday_hours_default: profile.workday_hours_default,
        }).eq('id', profile.id);
        error = e;
      } else if (editingSection === 'payment') {
        const { error: e } = await supabase.from('organizations').update({
          default_payment_terms: organization.default_payment_terms,
          bank_name: organization.bank_name,
          account_name: organization.account_name,
          bsb_routing: organization.bsb_routing,
          account_number: organization.account_number,
          payment_instructions: organization.payment_instructions,
        }).eq('id', orgId);
        error = e;
      }

      if (error) throw error;
      setEditingSection(null);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !orgId) return;
    try {
      setIsUploadingLogo(true);
      const logoUrl = await uploadLogo(userId, file);
      await supabase.from('organizations').update({ logo_url: logoUrl }).eq('id', orgId);
      setOrganization(prev => prev ? { ...prev, logo_url: logoUrl } : null);
    } catch (error) {
      console.error('Error uploading logo:', error);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  if (loading) {
    return (
      <Layout showNav={false} className="bg-[#FAFAFA]">
        <Header title="Settings" left={<button onClick={onBack} className="p-2 -ml-2 text-slate-900"><ChevronLeft size={24} /></button>} />
        <div className="flex-1 flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-[13px]">
          Loading...
        </div>
      </Layout>
    );
  }

  return (
    <Layout showNav={false} className="bg-[#FAFAFA]">
      <Header 
        title="Settings" 
        left={
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        } 
      />

      <div className="flex flex-col pb-32">
        {/* Profile Hero */}
        <div className="px-6 py-10 flex flex-col items-center text-center">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingLogo}
            className="relative w-24 h-24 rounded-[32px] bg-white shadow-xl shadow-slate-900/5 flex items-center justify-center mb-6 cursor-pointer hover:scale-105 transition-all group disabled:opacity-50 border border-slate-50"
          >
            {organization?.logo_url ? (
              <img src={organization.logo_url} alt="Logo" className="w-full h-full rounded-[32px] object-cover" />
            ) : (
              <User size={40} className="text-slate-900" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-[32px] opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={24} className="text-white" />
            </div>
          </button>
          <h2 className="text-[28px] font-black text-slate-900 tracking-tighter uppercase leading-tight">{organization?.name || 'Business Name'}</h2>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-[13px] text-slate-400 font-bold uppercase tracking-widest">{userEmail}</p>
            <span className="px-2 py-0.5 rounded-full bg-accent text-black text-[9px] font-black uppercase tracking-[0.2em] shadow-sm">BETA</span>
          </div>
        </div>

        {/* Business Info Section */}
        <Section title="Business Profile">
          <Card className="flex flex-col gap-6">
            {editingSection === 'business' ? (
              <>
                <Input label="Business Name" value={organization?.name || ''} onChange={e => setOrganization(prev => prev ? { ...prev, name: e.target.value } : null)} />
                <Select label="Trade Type" options={TRADE_TYPES} value={organization?.trade_type || ''} onChange={e => setOrganization(prev => prev ? { ...prev, trade_type: e.target.value } : null)} />
                <Input label="Phone" type="tel" value={organization?.phone || ''} onChange={e => setOrganization(prev => prev ? { ...prev, phone: e.target.value } : null)} />
                <div className="flex gap-3">
                  <Button variant="secondary" fullWidth onClick={() => setEditingSection(null)}>Cancel</Button>
                  <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1.5">Trade Type</p><p className="font-black text-[15px] text-slate-900 uppercase tracking-tight">{organization?.trade_type || 'Not set'}</p></div>
                  <div><p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1.5">Phone</p><p className="font-black text-[15px] text-slate-900 uppercase tracking-tight">{organization?.phone || 'Not set'}</p></div>
                </div>
                <Button variant="secondary" className="h-14 font-black uppercase tracking-widest text-[11px] rounded-xl" onClick={() => setEditingSection('business')}>Edit Profile</Button>
              </div>
            )}
          </Card>
        </Section>

        {/* Pricing Section */}
        <Section title="Pricing & Rates">
          <Card className="flex flex-col gap-6">
            {editingSection === 'pricing' && profile ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Hourly Rate" type="number" value={String(profile.hourly_rate_cents / 100)} onChange={e => setProfile({ ...profile, hourly_rate_cents: Math.round(parseFloat(e.target.value) * 100) })} />
                  <Input label="Tax Rate %" type="number" value={String(profile.default_tax_rate || 10)} onChange={e => setProfile({ ...profile, default_tax_rate: parseFloat(e.target.value) })} />
                </div>
                <Input label="Materials Markup %" type="number" value={String(profile.materials_markup_percent)} onChange={e => setProfile({ ...profile, materials_markup_percent: parseFloat(e.target.value) })} />
                <div className="flex gap-3">
                  <Button variant="secondary" className="h-14 font-black uppercase tracking-widest text-[11px] rounded-xl" onClick={() => setEditingSection(null)}>Cancel</Button>
                  <Button variant="primary" className="h-14 font-black uppercase tracking-widest text-[11px] rounded-xl" onClick={handleSave} disabled={saving}>Save</Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">Hourly Rate</p>
                    <p className="text-[24px] font-black text-slate-900 tracking-tighter tabular-nums">${(profile?.hourly_rate_cents || 0) / 100}</p>
                  </div>
                  <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">Markup</p>
                    <p className="text-[24px] font-black text-slate-900 tracking-tighter tabular-nums">{profile?.materials_markup_percent || 0}%</p>
                  </div>
                </div>
                <Button variant="secondary" className="h-14 font-black uppercase tracking-widest text-[11px] rounded-xl" onClick={() => setEditingSection('pricing')}>Edit Rates</Button>
              </div>
            )}
          </Card>
        </Section>

        {/* Materials Catalog Link */}
        <Section title="Tools">
          <div className="flex flex-col gap-3">
            <Card onClick={() => onNavigate?.('MaterialsCatalog')} className="flex items-center gap-4 active:scale-[0.98] transition-all border-2 border-slate-100 bg-white rounded-[24px] p-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                <Briefcase size={22} className="text-slate-900" />
              </div>
              <div className="flex-1">
                <h3 className="font-black text-slate-900 tracking-tighter uppercase text-[15px]">Materials Catalog</h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Manage shortcuts</p>
              </div>
              <ArrowRight size={20} className="text-slate-200" />
            </Card>

            <Card onClick={() => setIsFeedbackOpen(true)} className="flex items-center gap-4 active:scale-[0.98] transition-all bg-accent/5 border-2 border-accent/10 rounded-[24px] p-6">
              <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shrink-0">
                <MessageSquare size={22} className="text-black" />
              </div>
              <div className="flex-1">
                <h3 className="font-black text-slate-900 tracking-tighter uppercase text-[15px]">Report an Issue</h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Beta feedback</p>
              </div>
              <ArrowRight size={20} className="text-accent/30" />
            </Card>
          </div>
        </Section>

        <FeedbackSheet 
          isOpen={isFeedbackOpen} 
          onClose={() => setIsFeedbackOpen(false)} 
          metadata={{ 
            source: 'settings',
            orgId,
            userId
          }} 
        />

        {/* Debug (dev only): helps confirm which Supabase backend is in use */}
        {import.meta.env.DEV && (
          <div className="px-6 mt-10">
            <Section title="Debug">
              <Card className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1.5">Supabase URL</p>
                    <p className="text-[13px] font-bold text-slate-900 break-all">{supabaseUrl || '(missing)'}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] ${isLocalSupabase ? 'bg-accent text-black' : 'bg-slate-100 text-slate-600'}`}>
                    {isLocalSupabase ? 'LOCAL' : 'REMOTE'}
                  </span>
                </div>
                {!isLocalSupabase && (
                  <p className="text-[12px] text-slate-500 font-semibold leading-relaxed">
                    Your app is not pointing at local Supabase. For local dev, set <span className="font-black">VITE_SUPABASE_URL</span> to <span className="font-black">http://127.0.0.1:54321</span>.
                  </p>
                )}
              </Card>
            </Section>
          </div>
        )}

        {/* Sign Out */}
        <div className="px-6 mt-10">
          <button
            onClick={() => {
              onLogout?.();
            }}
            className="w-full h-16 rounded-[24px] bg-red-50 text-red-500 font-black uppercase tracking-[0.3em] text-[11px] flex items-center justify-center gap-3 active:scale-95 transition-all shadow-sm"
          >
            <LogOut size={18} />
            Sign Out Session
          </button>
        </div>
      </div>
    </Layout>
  );
}
