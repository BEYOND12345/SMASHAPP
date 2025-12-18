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
  const [currency, setCurrency] = useState('AUD');
  const [hourlyRate, setHourlyRate] = useState('85.00');
  const [calloutFee, setCalloutFee] = useState('0.00');
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
            callout_fee_cents: Math.round(parseFloat(calloutFee) * 100),
            travel_rate_cents: null,
            travel_is_time: true,
            materials_markup_percent: parseFloat(materialsMarkup),
            default_tax_rate: parseFloat(taxRate),
            default_currency: currency,
            default_unit_preference: 'metric',
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
            callout_fee_cents: Math.round(parseFloat(calloutFee) * 100),
            travel_rate_cents: null,
            travel_is_time: true,
            materials_markup_percent: parseFloat(materialsMarkup),
            default_tax_rate: parseFloat(taxRate),
            default_currency: currency,
            default_unit_preference: 'metric',
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
        transparent
      />

      <div className="px-6 mt-8 flex flex-col gap-6 flex-1">
        {/* Progress Indicator */}
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-brand' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <div className="mb-2">
              <h1 className="text-[32px] font-bold text-primary mb-2 tracking-tight">
                Your Business
              </h1>
              <p className="text-[15px] text-secondary">
                Set up your business details so we can create professional quotes instantly
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
            <div className="flex flex-col items-center py-4">
              <button
                onClick={handleLogoClick}
                disabled={isUploadingLogo}
                className="relative w-24 h-24 rounded-full bg-brand/10 flex items-center justify-center cursor-pointer hover:bg-brand/20 transition-colors group disabled:cursor-wait disabled:opacity-50"
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Business logo"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User size={40} className="text-brand" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera size={28} className="text-white" />
                </div>
              </button>
              <p className="text-[13px] text-tertiary mt-2">Upload logo (optional)</p>
            </div>

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
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-2">
              <h1 className="text-[32px] font-bold text-primary mb-2 tracking-tight">
                Your Rates
              </h1>
              <p className="text-[15px] text-secondary">
                We'll use these rates to calculate quotes automatically for every job
              </p>
            </div>

            <Select
              label="Currency"
              options={CURRENCIES}
              value={currency}
              onChange={e => setCurrency(e.target.value)}
            />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[13px] text-blue-800">
              <strong>Note:</strong> All rates are tax-exclusive. Tax will be calculated and shown separately on quotes.
            </div>

            <Input
              label="Your Hourly Rate"
              type="number"
              step="0.01"
              placeholder="85.00"
              value={hourlyRate}
              onChange={e => setHourlyRate(e.target.value)}
              autoFocus
            />

            <Input
              label="Callout Fee (optional)"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={calloutFee}
              onChange={e => setCalloutFee(e.target.value)}
            />

            <Input
              label="Tax Rate %"
              type="number"
              step="0.1"
              placeholder="10"
              value={taxRate}
              onChange={e => setTaxRate(e.target.value)}
            />

            <Input
              label="Materials Markup %"
              type="number"
              step="0.1"
              placeholder="0"
              value={materialsMarkup}
              onChange={e => setMaterialsMarkup(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNext()}
            />
          </>
        )}

        {step === 3 && (
          <>
            <div className="mb-2">
              <h1 className="text-[32px] font-bold text-primary mb-2 tracking-tight">
                Invoice Details
              </h1>
              <p className="text-[15px] text-secondary">
                Final step! Add your business and payment details for professional invoices
              </p>
            </div>

            <Input
              label="Business Address"
              placeholder="123 Main St, City, State"
              value={businessAddress}
              onChange={e => setBusinessAddress(e.target.value)}
              autoFocus
            />

            <Input
              label="ABN / Business Number (optional)"
              placeholder="12 345 678 901"
              value={abn}
              onChange={e => setAbn(e.target.value)}
            />

            <Input
              label="Website (optional)"
              type="url"
              placeholder="https://example.com"
              value={website}
              onChange={e => setWebsite(e.target.value)}
            />

            <Select
              label="Payment Terms"
              options={PAYMENT_TERMS}
              value={paymentTerms}
              onChange={e => setPaymentTerms(e.target.value)}
            />

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[13px] text-amber-800 mb-2">
              <strong>Optional:</strong> Add bank details to get paid faster
            </div>

            <Input
              label="Bank Name (optional)"
              placeholder="e.g., Commonwealth Bank"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
            />

            <Input
              label="Account Name (optional)"
              placeholder="e.g., John Smith Trading"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="BSB (optional)"
                placeholder="123-456"
                value={bsbRouting}
                onChange={e => setBsbRouting(e.target.value)}
              />

              <Input
                label="Account # (optional)"
                placeholder="12345678"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNext()}
              />
            </div>
          </>
        )}
      </div>

      <div className="p-6 mt-auto bg-surface">
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
        >
          {saving ? 'Saving...' : step === 3 ? 'Start Creating Quotes' : 'Continue'}
        </Button>
      </div>
    </Layout>
  );
};
