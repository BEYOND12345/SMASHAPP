import React, { useState, useMemo } from 'react';
import { Layout, Header, Section } from '../components/layout';
import { Card } from '../components/card';
import { Input } from '../components/inputs';
import { Button } from '../components/button';
import { Estimate, MaterialItem, FeeItem } from '../types';
import { ChevronLeft, Plus, X, DollarSign } from 'lucide-react';
import { formatCurrency } from '../lib/utils/calculations';

interface EditEstimateProps {
  estimate: Estimate;
  returnScreen?: 'EstimatePreview' | 'InvoicePreview';
  onBack: () => void;
  onSave: (estimate: Estimate) => void;
  onSend?: (estimate: Estimate) => void;
}

export const EditEstimate: React.FC<EditEstimateProps> = ({ estimate, onBack, onSave, onSend }) => {
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
    setMaterials(
      materials.map((m) =>
        m.id === id ? { ...m, [field]: value } : m
      )
    );
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter((m) => m.id !== id));
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
    <Layout showNav={false} className="bg-surface pb-72">
      <Header
        title="Edit Quote"
        left={
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center -ml-2 text-primary hover:bg-slate-100 rounded-full transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
        }
      />

      <div className="px-6 pt-2 pb-1">
        <p className="text-xs text-tertiary text-center">Review and edit your quote. Nothing is sent until you tap "Send to Customer".</p>
      </div>

      <div className="flex flex-col gap-1 mt-2">
        {/* Job Details Section */}
        <Section title="Job Details">
          <Card>
            <div className="flex flex-col gap-4">
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
            </div>
          </Card>
        </Section>

        {/* Scope of Work Section */}
        <Section title="Scope of Work">
          <Card>
            <div className="flex flex-col gap-3">
              {scopeOfWork.length === 0 && (
                <p className="text-sm text-tertiary italic">No scope items yet. Add what work will be done.</p>
              )}
              {scopeOfWork.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-accentDark shrink-0" />
                  <span className="flex-1 text-[15px] text-primary font-medium">{item}</span>
                  <button
                    onClick={() => removeScopeItem(idx)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Add scope item..."
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addScopeItem()}
                />
                <Button variant="secondary" onClick={addScopeItem}>
                  <Plus size={18} />
                </Button>
              </div>
            </div>
          </Card>
        </Section>

        {/* Materials Section */}
        <Section title="Materials">
          <Card>
            <div className="flex flex-col gap-4">
              {materials.length === 0 && (
                <p className="text-sm text-tertiary italic">No materials yet. Add materials needed for the job.</p>
              )}
              {materials.map((material) => (
                <div key={material.id} className="flex flex-col gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <Input
                      label="Item Name"
                      value={material.name}
                      onChange={(e) => updateMaterial(material.id, 'name', e.target.value)}
                      className="flex-1"
                      placeholder="e.g. Merbau Decking"
                    />
                    <button
                      onClick={() => removeMaterial(material.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded ml-2"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
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
                      placeholder="m, kg, ea"
                    />
                    <Input
                      label="Rate ($)"
                      type="number"
                      value={material.rate}
                      onChange={(e) => updateMaterial(material.id, 'rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="text-right text-sm text-secondary">
                    Line total: <span className="font-semibold text-primary">{formatCurrency(material.quantity * material.rate)}</span>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={addMaterial} className="mt-2">
                <Plus size={18} className="mr-2" />
                Add Material
              </Button>
            </div>
          </Card>
        </Section>

        {/* Labour Section */}
        <Section title="Labour">
          <Card>
            <div className="grid grid-cols-2 gap-4">
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
            <div className="text-right text-sm text-secondary mt-3">
              Labour total: <span className="font-semibold text-primary">{formatCurrency(totals.labourTotal)}</span>
            </div>
          </Card>
        </Section>

        {/* Additional Fees Section */}
        <Section title="Additional Fees">
          <Card>
            <div className="flex flex-col gap-4">
              {additionalFees.length === 0 && (
                <p className="text-sm text-tertiary italic">No additional fees. Add travel, callout, or other charges.</p>
              )}
              {additionalFees.map((fee) => (
                <div key={fee.id} className="flex items-center gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                  <div className="flex-1">
                    <Input
                      label="Description"
                      value={fee.description}
                      onChange={(e) => updateFee(fee.id, 'description', e.target.value)}
                      placeholder="e.g. Travel fee"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      label="Amount ($)"
                      type="number"
                      value={fee.amount}
                      onChange={(e) => updateFee(fee.id, 'amount', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <button
                    onClick={() => removeFee(fee.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded mt-5"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
              
              {/* Quick add common fees */}
              <div className="flex flex-wrap gap-2 mt-2">
                {commonFees.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => addFee(preset.description)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
              
              <Button variant="outline" onClick={() => addFee()} className="mt-2">
                <Plus size={18} className="mr-2" />
                Add Custom Fee
              </Button>
            </div>
          </Card>
        </Section>

        {/* Totals Section */}
        <Section title="Quote Total">
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[14px]">
                <span className="text-secondary">Materials</span>
                <span className="text-primary font-medium">{formatCurrency(totals.materialsTotal)}</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-secondary">Labour</span>
                <span className="text-primary font-medium">{formatCurrency(totals.labourTotal)}</span>
              </div>
              {totals.feesTotal > 0 && (
                <div className="flex justify-between text-[14px]">
                  <span className="text-secondary">Additional Fees</span>
                  <span className="text-primary font-medium">{formatCurrency(totals.feesTotal)}</span>
                </div>
              )}
              <div className="border-t border-border my-2" />
              <div className="flex justify-between text-[14px]">
                <span className="text-secondary">Subtotal</span>
                <span className="text-primary font-semibold">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-secondary">GST (10%)</span>
                <span className="text-primary font-medium">{formatCurrency(totals.gst)}</span>
              </div>
              <div className="border-t border-border my-2" />
              <div className="flex justify-between items-center">
                <span className="text-[16px] font-bold text-primary">TOTAL</span>
                <span className="text-[24px] font-bold text-primary">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </Card>
        </Section>
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-5 bg-white/95 backdrop-blur-xl border-t border-border z-40 pb-safe">
        <div className="flex gap-3">
          <Button 
            variant="secondary" 
            className="flex-1 font-semibold" 
            onClick={handleSave}
          >
            Save Draft
          </Button>
          <Button 
            variant="primary" 
            className="flex-[2] font-bold shadow-lg"
            onClick={handleSend}
          >
            <DollarSign size={18} className="mr-1" />
            Send to Customer
          </Button>
        </div>
      </div>
    </Layout>
  );
};
