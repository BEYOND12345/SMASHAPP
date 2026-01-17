import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Header, Section } from '../components/layout';
import { Card } from '../components/card';
import { Input } from '../components/inputs';
import { Button } from '../components/button';
import { Estimate, MaterialItem, FeeItem } from '../types';
import { ChevronLeft, Plus, X, Check, AlertTriangle, MessageSquare } from 'lucide-react';
import { FeedbackSheet } from '../components/feedbacksheet';
import { formatCurrency } from '../lib/utils/calculations';
import { supabase } from '../lib/supabase';

interface EditEstimateProps {
  estimate: Estimate;
  returnScreen?: 'EstimatePreview' | 'InvoicePreview';
  onBack: () => void;
  onSave: (estimate: Estimate) => void;
  onSend?: (estimate: Estimate) => void;
  onChangeCustomer?: () => void;
}

export const EditEstimate: React.FC<EditEstimateProps> = ({ estimate, onBack, onSave, onSend, onChangeCustomer }) => {
  // Job details
  const [jobTitle, setJobTitle] = useState(estimate.jobTitle);
  const [clientName, setClientName] = useState(estimate.clientName);
  const [clientAddress, setClientAddress] = useState(estimate.clientAddress || '');
  const [clientEmail, setClientEmail] = useState(estimate.clientEmail || '');
  const [clientPhone, setClientPhone] = useState(estimate.clientPhone || '');
  const [timeline, setTimeline] = useState(estimate.timeline);
  
  // Scope of work
  const [scopeOfWork, setScopeOfWork] = useState(estimate.scopeOfWork);
  const [newScope, setNewScope] = useState('');
  
  // Materials
  const [materials, setMaterials] = useState(estimate.materials);

  // For the "self-improving" pricing loop (save corrected prices back to org catalog)
  const [orgId, setOrgId] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [savingCatalogFor, setSavingCatalogFor] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  useEffect(() => {
    setJobTitle(estimate.jobTitle);
    setClientName(estimate.clientName);
    setClientAddress(estimate.clientAddress || '');
    setClientEmail(estimate.clientEmail || '');
    setClientPhone(estimate.clientPhone || '');
    setTimeline(estimate.timeline);
    setScopeOfWork(estimate.scopeOfWork);
    setMaterials(estimate.materials);
    setLabourHours(estimate.labour.hours.toString());
    setLabourRate(estimate.labour.rate.toString());
    setAdditionalFees(estimate.additionalFees || []);
  }, [estimate]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setAuthUserId(user.id);

        const { data: userData } = await supabase
          .from('users')
          .select('org_id')
          .eq('id', user.id)
          .maybeSingle();
        if (userData?.org_id) setOrgId(userData.org_id);
      } catch (e) {
        console.warn('[EditEstimate] Failed to load org/user for catalog save (non-fatal):', e);
      }
    })();
  }, []);
  
  // Labour
  const [labourHours, setLabourHours] = useState(estimate.labour.hours.toString());
  const [labourRate, setLabourRate] = useState(estimate.labour.rate.toString());
  
  // Additional fees
  const [additionalFees, setAdditionalFees] = useState<FeeItem[]>(estimate.additionalFees || []);

  // GST rate
  const gstRate = estimate.gstRate || 0.10;

  // Calculate totals dynamically
  const totals = useMemo(() => {
    const materialsTotal = materials.reduce((sum, item) => {
      return sum + (item.quantity * item.rate);
    }, 0);

    const labourTotal = (parseFloat(labourHours) || 0) * (parseFloat(labourRate) || 0);

    const feesTotal = additionalFees.reduce((sum, fee) => {
      return sum + (fee.amount || 0);
    }, 0);

    const subtotal = materialsTotal + labourTotal + feesTotal;
    const gst = subtotal * gstRate;
    const total = subtotal + gst;

    return {
      materialsTotal,
      labourTotal,
      feesTotal,
      subtotal,
      gst,
      total
    };
  }, [materials, labourHours, labourRate, additionalFees, gstRate]);

  // Scope of work handlers
  const addScopeItem = () => {
    if (newScope.trim()) {
      setScopeOfWork([...scopeOfWork, newScope.trim()]);
      setNewScope('');
    }
  };

  const removeScopeItem = (index: number) => {
    setScopeOfWork(scopeOfWork.filter((_, i) => i !== index));
  };

  // Material handlers
  const addMaterial = () => {
    setMaterials([
      ...materials,
      {
        id: Date.now().toString(),
        name: '',
        quantity: 1,
        unit: 'unit',
        rate: 0,
      },
    ]);
  };

  const updateMaterial = (id: string, field: keyof MaterialItem, value: string | number) => {
    setMaterials(materials.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter((m) => m.id !== id));
  };

  const saveMaterialToCatalog = async (material: MaterialItem) => {
    if (!orgId || !authUserId) {
      alert('Unable to save to catalog yet (missing org/user). Try again in a moment.');
      return;
    }
    if (!material.name || material.name.trim().length === 0) {
      alert('Please enter a material name before saving.');
      return;
    }
    const unitPriceCents = Math.round((material.rate || 0) * 100);
    if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
      alert('Please enter a non-zero price before saving.');
      return;
    }

    try {
      setSavingCatalogFor(material.id);

      const { data, error } = await supabase
        .from('material_catalog_items')
        .insert({
          org_id: orgId,
          created_by_user_id: authUserId,
          name: material.name.trim(),
          category: 'other',
          unit: (material.unit || 'unit').trim() || 'unit',
          unit_price_cents: unitPriceCents,
          notes: 'Saved from quote (user correction)',
        })
        .select('id')
        .single();

      if (error) {
        console.error('[EditEstimate] Save to catalog failed:', error);
        alert(`Failed to save to catalog: ${error.message}`);
        return;
      }

      // Update local UI metadata so it shows as a trusted catalog item
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === material.id
            ? {
                ...m,
                catalogItemId: data?.id ?? null,
                pricingSource: 'catalog',
                pricingNotes: 'Saved to your catalog.',
                needsReview: false,
              }
            : m
        )
      );
    } catch (e) {
      console.error('[EditEstimate] Exception saving to catalog:', e);
      alert('Failed to save to catalog. Please try again.');
    } finally {
      setSavingCatalogFor(null);
    }
  };

  const renderPricingBadge = (m: MaterialItem) => {
    const inferred =
      m.pricingSource ||
      (typeof m.pricingNotes === 'string' && m.pricingNotes.toLowerCase().startsWith('ai estimated')
        ? 'ai'
        : typeof m.pricingNotes === 'string' && m.pricingNotes.toLowerCase().startsWith('default price')
          ? 'fallback'
          : m.catalogItemId
            ? 'catalog'
            : undefined);

    if (inferred === 'catalog') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/[0.08] text-primary text-[11px] font-bold">
          <Check size={14} />
          Catalog
        </span>
      );
    }
    if (inferred === 'ai') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/[0.06] text-slate-700 text-[11px] font-bold">
          [?] AI estimated
        </span>
      );
    }
    if (inferred === 'fallback') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/[0.12] text-amber-700 text-[11px] font-bold">
          <AlertTriangle size={14} />
          Default
        </span>
      );
    }
    if (m.needsReview) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/[0.12] text-amber-700 text-[11px] font-bold">
          <AlertTriangle size={14} />
          Needs review
        </span>
      );
    }
    return null;
  };

  // Additional fee handlers
  const addFee = (description: string = '') => {
    setAdditionalFees([
      ...additionalFees,
      {
        id: Date.now().toString(),
        description: description || '',
        amount: 0,
      },
    ]);
  };

  const updateFee = (id: string, field: keyof FeeItem, value: string | number) => {
    setAdditionalFees(
      additionalFees.map((f) =>
        f.id === id ? { ...f, [field]: value } : f
      )
    );
  };

  const removeFee = (id: string) => {
    setAdditionalFees(additionalFees.filter((f) => f.id !== id));
  };

  // Common fee presets
  const commonFees = [
    { label: 'Bunnings Run', description: 'Bunnings run / materials pickup' },
    { label: 'Travel', description: 'Travel fee' },
    { label: 'Callout', description: 'Callout fee' },
    { label: 'Waste', description: 'Waste disposal' },
  ];

  // Build updated estimate
  const buildUpdatedEstimate = (): Estimate => ({
    ...estimate,
    jobTitle,
    clientName,
    clientAddress,
    clientEmail,
    clientPhone,
    timeline,
    scopeOfWork,
    materials,
    labour: {
      hours: parseFloat(labourHours) || 0,
      rate: parseFloat(labourRate) || 0,
    },
    additionalFees,
  });

  const handleSave = () => {
    onSave(buildUpdatedEstimate());
  };

  const handleSend = () => {
    if (onSend) {
      onSend(buildUpdatedEstimate());
    } else {
      // Fallback: save and let parent handle navigation to send
      onSave(buildUpdatedEstimate());
    }
  };

  return (
    <Layout showNav={false} className="bg-[#FAFAFA] pb-40">
      <Header
        title="Edit Quote"
        left={
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center -ml-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
        }
        right={
          <button 
            onClick={() => setIsFeedbackOpen(true)}
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all"
            title="Report an Issue"
          >
            <MessageSquare size={20} />
          </button>
        }
      />

      <div className="px-5 pt-1 pb-1">
        <p className="text-[10px] text-slate-300 font-black text-center uppercase tracking-[0.3em]">Draft Review session</p>
      </div>

      <div className="flex flex-col mt-4">
        {/* Job Details Section */}
        <Section title="Job Details">
          <Card className="flex flex-col gap-6">
            {onChangeCustomer && (
              <button
                onClick={onChangeCustomer}
                className="self-start px-4 py-2 rounded-full bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-colors"
              >
                Change customer
              </button>
            )}
            <Input
              label="Job Title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Deck Replacement"
            />
            <Input
              label="Client Name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Customer name"
            />
            <div className="grid grid-cols-1 gap-6">
              <Input
                label="Client Email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="customer@email.com"
              />
              <Input
                label="Client Phone"
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="0400 000 000"
              />
            </div>
            <Input
              label="Site Address"
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="Job site address"
            />
            <Input
              label="Timeline"
              placeholder="e.g. 2-3 days"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
            />
          </Card>
        </Section>

        {/* Scope of Work Section */}
        <Section title="Scope of Work">
          <Card className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              {scopeOfWork.length === 0 && (
                <p className="text-sm text-slate-400 italic font-medium ml-1">No scope items yet.</p>
              )}
              {scopeOfWork.map((item, idx) => (
                <div key={idx} className="flex gap-4 items-center bg-slate-50 p-4 rounded-[20px] border border-slate-100">
                  <span className="w-2 h-2 rounded-full bg-accent shrink-0 shadow-sm" />
                  <span className="flex-1 text-[14px] text-slate-900 font-black uppercase tracking-tight">{item}</span>
                  <button
                    onClick={() => removeScopeItem(idx)}
                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Input
                placeholder="ADD SCOPE ITEM..."
                value={newScope}
                onChange={(e) => setNewScope(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addScopeItem()}
                className="!bg-white uppercase tracking-widest text-xs"
              />
              <button 
                onClick={addScopeItem}
                className="w-14 h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 active:scale-95 transition-transform shadow-lg"
              >
                <Plus size={24} />
              </button>
            </div>
          </Card>
        </Section>

        {/* Materials Section */}
        <Section title="Materials">
          <Card className="flex flex-col gap-6">
            {materials.length === 0 && (
              <p className="text-sm text-slate-400 italic font-medium ml-1">No materials added yet.</p>
            )}
            <div className="flex flex-col gap-8">
              {materials.map((material) => (
                <div key={material.id} className="flex flex-col gap-5 pb-8 border-b border-slate-50 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Input
                        label="Item Name"
                        value={material.name}
                        onChange={(e) => updateMaterial(material.id, 'name', e.target.value)}
                        placeholder="e.g. Merbau Decking"
                      />
                    </div>
                    <button
                      onClick={() => removeMaterial(material.id)}
                      className="mt-10 p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      {renderPricingBadge(material)}
                    </div>
                    {(material.pricingSource === 'ai' || material.pricingSource === 'fallback' || material.needsReview) && (
                      <button
                        disabled={savingCatalogFor === material.id}
                        onClick={() => saveMaterialToCatalog(material)}
                        className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 disabled:opacity-50 transition-colors"
                      >
                        {savingCatalogFor === material.id ? 'Saving…' : 'Save to catalog'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      label="Qty"
                      type="number"
                      value={material.quantity}
                      onChange={(e) => updateMaterial(material.id, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      label="Unit"
                      value={material.unit}
                      onChange={(e) => updateMaterial(material.id, 'unit', e.target.value)}
                      placeholder="m, ea"
                    />
                    <Input
                      label="Rate ($)"
                      type="number"
                      value={material.rate}
                      onChange={(e) => updateMaterial(material.id, 'rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100 mx-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Line Total</span>
                    <span className="text-[16px] font-black text-slate-900 tabular-nums">{formatCurrency(material.quantity * material.rate)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={addMaterial} className="mt-2 border-dashed h-14 rounded-xl font-black uppercase tracking-widest text-[11px]">
              <Plus size={18} className="mr-2" />
              Add Material
            </Button>
          </Card>
        </Section>

        {/* Labour Section */}
        <Section title="Labour">
          <Card className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-5">
              <Input
                label="Hours"
                type="number"
                value={labourHours}
                onChange={(e) => setLabourHours(e.target.value)}
                placeholder="0"
              />
              <Input
                label="Rate ($/hr)"
                type="number"
                value={labourRate}
                onChange={(e) => setLabourRate(e.target.value)}
                placeholder="85"
              />
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-[14px] border border-slate-100">
              <span className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Labour Total</span>
              <span className="text-[16px] font-bold text-slate-900">{formatCurrency(totals.labourTotal)}</span>
            </div>
          </Card>
        </Section>

        {/* Additional Fees Section */}
        <Section title="Additional Fees">
          <Card className="flex flex-col gap-5">
            {additionalFees.length === 0 && (
              <p className="text-sm text-slate-400 italic font-medium ml-1">No additional fees added.</p>
            )}
            <div className="flex flex-col gap-5">
              {additionalFees.map((fee) => (
                <div key={fee.id} className="flex items-end gap-3 bg-slate-50/50 p-3.5 rounded-[16px] border border-slate-100 relative">
                  <div className="flex-1">
                    <Input
                      label="Description"
                      value={fee.description}
                      onChange={(e) => updateFee(fee.id, 'description', e.target.value)}
                      placeholder="e.g. Travel fee"
                      className="!bg-white h-[48px]"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      label="Amount"
                      type="number"
                      value={fee.amount}
                      onChange={(e) => updateFee(fee.id, 'amount', parseFloat(e.target.value) || 0)}
                      className="!bg-white h-[48px]"
                    />
                  </div>
                  <button
                    onClick={() => removeFee(fee.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors mb-1"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex flex-wrap gap-2 px-0.5">
              {commonFees.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => addFee(preset.description)}
                  className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full border border-slate-100 transition-all active:scale-95"
                >
                  + {preset.label}
                </button>
              ))}
            </div>
            
            <Button variant="outline" onClick={() => addFee()} className="mt-1 border-dashed h-[50px]">
              <Plus size={18} className="mr-2" />
              Add Custom Fee
            </Button>
          </Card>
        </Section>

        {/* Totals Section */}
        <Section title="Final Quote">
          <Card className="!p-0 overflow-hidden border border-slate-200 shadow-lg">
            <div className="p-6 flex flex-col gap-3 bg-white">
              <div className="flex justify-between text-[14px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                <span>Summary</span>
                <span>Amount</span>
              </div>
              <div className="flex justify-between text-[15px] font-medium text-slate-600">
                <span>Materials</span>
                <span className="text-slate-900">{formatCurrency(totals.materialsTotal)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-medium text-slate-600">
                <span>Labour</span>
                <span className="text-slate-900">{formatCurrency(totals.labourTotal)}</span>
              </div>
              {totals.feesTotal > 0 && (
                <div className="flex justify-between text-[15px] font-medium text-slate-600">
                  <span>Fees</span>
                  <span className="text-slate-900">{formatCurrency(totals.feesTotal)}</span>
                </div>
              )}
              <div className="h-px bg-slate-50 w-full my-1" />
              <div className="flex justify-between text-[15px] font-bold text-slate-900">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[15px] font-medium text-slate-500">
                <span>{estimate.currency === 'GBP' ? 'VAT' : estimate.currency === 'USD' ? 'Sales Tax' : 'GST'} ({(gstRate * 100).toFixed(0)}%)</span>
                <span>{formatCurrency(totals.gst)}</span>
              </div>
            </div>
            
            <div className="bg-slate-50 border-t border-slate-200 p-6 flex justify-between items-center">
                <span className="text-[13px] font-bold text-slate-500 uppercase tracking-[0.2em]">Total</span>
                <span className="text-[28px] font-bold text-slate-900 tracking-tight">{formatCurrency(totals.total)}</span>
            </div>
          </Card>
        </Section>
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-5 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-50 pb-safe">
        <div className="flex gap-3">
          <Button 
            variant="secondary" 
            className="flex-1 font-bold uppercase tracking-widest text-[12px]" 
            onClick={handleSave}
          >
            Draft
          </Button>
          <Button 
            variant="primary" 
            className="flex-[2] font-bold uppercase tracking-widest text-[12px]"
            onClick={handleSend}
          >
            Preview
          </Button>
        </div>
      </div>

      <FeedbackSheet 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
        metadata={{ 
          source: 'edit_estimate',
          estimateId: estimate.id,
          orgId,
          userId: authUserId
        }} 
      />
    </Layout>
  );
};
