import React, { useState } from 'react';
import { Layout, Header, Section } from '../components/layout';
import { Card } from '../components/card';
import { Input } from '../components/inputs';
import { Button } from '../components/button';
import { Estimate, MaterialItem } from '../types';
import { ChevronLeft, Plus, X } from 'lucide-react';

interface EditEstimateProps {
  estimate: Estimate;
  returnScreen?: 'EstimatePreview' | 'InvoicePreview';
  onBack: () => void;
  onSave: (estimate: Estimate) => void;
}

export const EditEstimate: React.FC<EditEstimateProps> = ({ estimate, onBack, onSave }) => {
  const [jobTitle, setJobTitle] = useState(estimate.jobTitle);
  const [clientName, setClientName] = useState(estimate.clientName);
  const [clientAddress, setClientAddress] = useState(estimate.clientAddress || '');
  const [timeline, setTimeline] = useState(estimate.timeline);
  const [scopeOfWork, setScopeOfWork] = useState(estimate.scopeOfWork);
  const [newScope, setNewScope] = useState('');
  const [materials, setMaterials] = useState(estimate.materials);
  const [labourHours, setLabourHours] = useState(estimate.labour.hours.toString());
  const [labourRate, setLabourRate] = useState(estimate.labour.rate.toString());

  const addScopeItem = () => {
    if (newScope.trim()) {
      setScopeOfWork([...scopeOfWork, newScope.trim()]);
      setNewScope('');
    }
  };

  const removeScopeItem = (index: number) => {
    setScopeOfWork(scopeOfWork.filter((_, i) => i !== index));
  };

  const addMaterial = () => {
    setMaterials([
      ...materials,
      {
        id: Date.now().toString(),
        name: '',
        quantity: 0,
        unit: 'units',
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

  const handleSave = () => {
    const updatedEstimate: Estimate = {
      ...estimate,
      jobTitle,
      clientName,
      clientAddress,
      timeline,
      scopeOfWork,
      materials,
      labour: {
        hours: parseFloat(labourHours) || 0,
        rate: parseFloat(labourRate) || 0,
      },
    };
    onSave(updatedEstimate);
  };

  return (
    <Layout showNav={false} className="bg-surface pb-32">
      <Header
        title="Edit Estimate"
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
        <p className="text-xs text-tertiary text-center">Prices and totals are finalised here. Nothing is sent until you choose to send.</p>
      </div>

      <div className="flex flex-col gap-1 mt-2">
        <Section title="Job Details">
          <Card>
            <div className="flex flex-col gap-4">
              <Input
                label="Job Title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
              <Input
                label="Client Name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
              <Input
                label="Client Address"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
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

        <Section title="Scope of Work">
          <Card>
            <div className="flex flex-col gap-3">
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

        <Section title="Materials">
          <Card>
            <div className="flex flex-col gap-4">
              {materials.map((material) => (
                <div key={material.id} className="flex flex-col gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <Input
                      label="Item Name"
                      value={material.name}
                      onChange={(e) => updateMaterial(material.id, 'name', e.target.value)}
                      className="flex-1"
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
                      label="Quantity"
                      type="number"
                      value={material.quantity}
                      onChange={(e) => updateMaterial(material.id, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      label="Unit"
                      value={material.unit}
                      onChange={(e) => updateMaterial(material.id, 'unit', e.target.value)}
                    />
                    <Input
                      label="Rate ($)"
                      type="number"
                      value={material.rate}
                      onChange={(e) => updateMaterial(material.id, 'rate', parseFloat(e.target.value) || 0)}
                    />
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

        <Section title="Labour">
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Hours"
                type="number"
                value={labourHours}
                onChange={(e) => setLabourHours(e.target.value)}
              />
              <Input
                label="Rate ($/hr)"
                type="number"
                value={labourRate}
                onChange={(e) => setLabourRate(e.target.value)}
              />
            </div>
          </Card>
        </Section>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-5 bg-white/90 backdrop-blur-xl border-t border-border z-40 pb-safe">
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" className="flex-1" onClick={onBack}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};
