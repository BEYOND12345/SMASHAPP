import React, { useState, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { Input, Select } from '../components/inputs';
import { Button } from '../components/button';
import { ChevronLeft, Camera, User } from 'lucide-react';
import { supabase, uploadLogo } from '../lib/supabase';

interface OnboardingProps {
  onComplete: () => void;
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

const COUNTRIES = [
  { name: 'Australia', currency: 'AUD', units: 'metric', taxLabel: 'GST' },
  { name: 'United Kingdom', currency: 'GBP', units: 'metric', taxLabel: 'VAT' },
  { name: 'United States', currency: 'USD', units: 'imperial', taxLabel: 'Sales Tax' },
  { name: 'New Zealand', currency: 'NZD', units: 'metric', taxLabel: 'GST' },
  { name: 'Ireland', currency: 'EUR', units: 'metric', taxLabel: 'VAT' },
  { name: 'Other', currency: 'USD', units: 'metric', taxLabel: 'Tax' },
];

const PAYMENT_TERMS = [
  'Due on receipt',
  'Net 7',
  'Net 14',
  'Net 30',
  'Net 60',
  'Net 90'
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Business Basics
  const [businessName, setBusinessName] = useState('');
  const [tradeType, setTradeType] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Step 2: Pricing & Rates
  const [country, setCountry] = useState('Australia');
  const [currency, setCurrency] = useState('AUD');
  const [unitPreference, setUnitPreference] = useState('metric');
  const [hourlyRate, setHourlyRate] = useState('85');
  const [calloutFee, setCalloutFee] = useState('');
  const [taxRate, setTaxRate] = useState('10');
  const [materialsMarkup, setMaterialsMarkup] = useState('0');

  // Step 3: Invoice & Payment
  const [businessAddress, setBusinessAddress] = useState('');
  const [abn, setAbn] = useState('');
  const [website, setWebsite] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bsbRouting, setBsbRouting] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const canContinueStep1 = businessName.length > 0 && tradeType.length > 0;
  const canContinueStep2 = parseFloat(hourlyRate) > 0;
  const canContinueStep3 = businessAddress.length > 0;

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const url = await uploadLogo(user.id, file);
      setLogoUrl(url);
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && canContinueStep1) setStep(2);
    else if (step === 2 && canContinueStep2) setStep(3);
    else if (step === 3 && canContinueStep3) handleComplete();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSkip = async () => {
    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData?.org_id) return;

      const { error: orgError } = await supabase
        .from('organizations')
        .update({
          name: user.email || 'My Business',
          trade_type: 'General',
        })
        .eq('id', userData.org_id);

      if (orgError) throw orgError;

      onComplete();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's org_id
      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData?.org_id) return;

      // Update organization
      const { error: orgError } = await supabase
        .from('organizations')
        .update({
          name: businessName,
          trade_type: tradeType,
          phone: phone || null,
          logo_url: logoUrl,
          business_address: businessAddress || null,
          abn: abn || null,
          website: website || null,
          default_payment_terms: paymentTerms,
          bank_name: bankName || null,
          account_name: accountName || null,
          bsb_routing: bsbRouting || null,
          account_number: accountNumber || null,
        })
        .eq('id', userData.org_id);

      if (orgError) throw orgError;

      // Check if pricing profile already exists
      const { data: existingProfile } = await supabase
        .from('user_pricing_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        const { error: pricingError } = await supabase
          .from('user_pricing_profiles')
          .update({
            hourly_rate_cents: Math.round(parseFloat(hourlyRate) * 100),
            callout_fee_cents: calloutFee ? Math.round(parseFloat(calloutFee) * 100) : 0,
            travel_rate_cents: null,
            travel_is_time: true,
            materials_markup_percent: parseFloat(materialsMarkup),
            default_tax_rate: parseFloat(taxRate),
            default_currency: currency,
            default_unit_preference: unitPreference,
            bunnings_run_enabled: true,
            bunnings_run_minutes_default: 60,
            workday_hours_default: 8,
          })
          .eq('id', existingProfile.id);

        if (pricingError) throw pricingError;
      } else {
        // Create new pricing profile
        const { error: pricingError } = await supabase
          .from('user_pricing_profiles')
          .insert({
            org_id: userData.org_id,
            user_id: user.id,
            hourly_rate_cents: Math.round(parseFloat(hourlyRate) * 100),
            callout_fee_cents: calloutFee ? Math.round(parseFloat(calloutFee) * 100) : 0,
            travel_rate_cents: null,
            travel_is_time: true,
            materials_markup_percent: parseFloat(materialsMarkup),
            default_tax_rate: parseFloat(taxRate),
            default_currency: currency,
            default_unit_preference: unitPreference,
            bunnings_run_enabled: true,
            bunnings_run_minutes_default: 60,
            workday_hours_default: 8,
          });

        if (pricingError) throw pricingError;
      }

      onComplete();
    } catch (error) {
      console.error('Failed to save onboarding data:', error);
      alert('Failed to save your information. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout showNav={false} className="bg-surface flex flex-col">
      <Header
        title={`Step ${step} of 3`}
        left={step > 1 ? (
          <button onClick={handleBack} className="p-2 -ml-2 text-primary">
            <ChevronLeft size={24} />
          </button>
        ) : undefined}
        right={
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-[14px] font-medium text-secondary hover:text-primary transition-colors disabled:opacity-50"
          >
            Skip
          </button>
        }
        transparent
      />

      <div className="px-8 mt-12 flex flex-col gap-8 flex-1">
        {/* Progress Indicator */}
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                i <= step ? 'bg-accent' : 'bg-slate-100'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-8">
            <div>
              <div className="flex items-center gap-1 mb-6">
                  <span className="text-[14px] font-black tracking-tighter text-slate-900 uppercase">SMASH</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5 shadow-[0_0_8px_rgba(212,255,0,0.5)]"></div>
              </div>
              <h1 className="text-[32px] font-bold text-slate-900 mb-3 tracking-tight">
                Your Business
              </h1>
              <p className="text-[15px] text-slate-500 font-medium leading-relaxed">
                Set up your business details so we can create professional quotes instantly.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
            <div className="flex flex-col items-center">
              <button
                onClick={handleLogoClick}
                disabled={isUploadingLogo}
                className="relative w-24 h-24 rounded-[24px] bg-slate-50 border-2 border-slate-100 flex items-center justify-center cursor-pointer hover:border-slate-900 transition-all group disabled:cursor-wait disabled:opacity-50"
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Business logo"
                    className="w-full h-full rounded-[22px] object-cover"
                  />
                ) : (
                  <User size={32} className="text-slate-300" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 rounded-[22px] opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera size={24} className="text-white" />
                </div>
              </button>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-3">Business Logo</p>
            </div>

            <div className="space-y-6">
              <Input
                label="Business Name"
                placeholder="e.g. Smith Carpentry"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                autoFocus
              />

              <Select
                label="What trade are you in?"
                options={TRADE_TYPES}
                value={tradeType}
                onChange={e => setTradeType(e.target.value)}
              />

              <Input
                label="Phone Number"
                type="tel"
                placeholder="e.g. 0400 000 000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNext()}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col gap-8">
            <div>
              <div className="flex items-center gap-1 mb-6">
                  <span className="text-[14px] font-black tracking-tighter text-slate-900 uppercase">SMASH</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5 shadow-[0_0_8px_rgba(212,255,0,0.5)]"></div>
              </div>
              <h1 className="text-[32px] font-bold text-slate-900 mb-3 tracking-tight">
                Your Rates
              </h1>
              <p className="text-[15px] text-slate-500 font-medium leading-relaxed">
                We'll use these rates to calculate quotes automatically for every job.
              </p>
            </div>

            <div className="space-y-6">
              <Select
                label="Country"
                options={COUNTRIES.map(c => c.name)}
                value={country}
                onChange={e => {
                  const selected = COUNTRIES.find(c => c.name === e.target.value);
                  if (selected) {
                    setCountry(selected.name);
                    setCurrency(selected.currency);
                    setUnitPreference(selected.units);
                    // Dynamic tax defaults
                    if (selected.name === 'United Kingdom') setTaxRate('20');
                    else if (selected.name === 'Australia') setTaxRate('10');
                    else setTaxRate('0');
                  }
                }}
              />

              <Select
                label="Currency"
                options={CURRENCIES}
                value={currency}
                onChange={e => setCurrency(e.target.value)}
              />

              <Input
                label="Your Hourly Rate"
                type="text"
                inputMode="decimal"
                placeholder="85"
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
                autoFocus
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Tax Rate %"
                  type="number"
                  step="0.1"
                  placeholder="10"
                  value={taxRate}
                  onChange={e => setTaxRate(e.target.value)}
                />
                <Input
                  label="Markup %"
                  type="number"
                  step="0.1"
                  placeholder="0"
                  value={materialsMarkup}
                  onChange={e => setMaterialsMarkup(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNext()}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col gap-8">
            <div>
              <div className="flex items-center gap-1 mb-6">
                  <span className="text-[14px] font-black tracking-tighter text-slate-900 uppercase">SMASH</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5 shadow-[0_0_8px_rgba(212,255,0,0.5)]"></div>
              </div>
              <h1 className="text-[32px] font-bold text-slate-900 mb-3 tracking-tight">
                Payments
              </h1>
              <p className="text-[15px] text-slate-500 font-medium leading-relaxed">
                Add your details so we can create professional invoices instantly.
              </p>
            </div>

            <div className="space-y-6">
              <Input
                label="Business Address"
                placeholder="123 Main St, City, State"
                value={businessAddress}
                onChange={e => setBusinessAddress(e.target.value)}
                autoFocus
              />

              <Input
                label="ABN / Business ID"
                placeholder="12 345 678 901"
                value={abn}
                onChange={e => setAbn(e.target.value)}
              />

              <Select
                label="Payment Terms"
                options={PAYMENT_TERMS}
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
              />

              <div className="pt-4 space-y-4 border-t border-slate-50">
                <h3 className="text-[13px] font-black text-slate-400 uppercase tracking-widest">Bank Details</h3>
                <Input
                  label="Bank Name"
                  placeholder="e.g., Commonwealth Bank"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="BSB"
                    placeholder="123-456"
                    value={bsbRouting}
                    onChange={e => setBsbRouting(e.target.value)}
                  />
                  <Input
                    label="Account #"
                    placeholder="12345678"
                    value={accountNumber}
                    onChange={e => setAccountNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNext()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-8 mt-auto bg-white border-t border-slate-50">
        <Button
          fullWidth
          variant="primary"
          disabled={
            (step === 1 && !canContinueStep1) ||
            (step === 2 && !canContinueStep2) ||
            (step === 3 && !canContinueStep3) ||
            saving
          }
          onClick={handleNext}
          className="h-16 rounded-[20px] font-black uppercase tracking-widest bg-accent text-black shadow-xl shadow-accent/10 transition-all active:scale-95"
        >
          {saving ? 'Saving...' : step === 3 ? 'Get Started' : 'Continue'}
        </Button>
      </div>
    </Layout>
  );
};
