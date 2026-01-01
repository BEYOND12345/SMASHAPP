import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { Input } from '../components/inputs';
import { Layout, Header, Section } from '../components/layout';
import { ChevronLeft, Plus, Edit2, Trash2, Save, X, Package } from 'lucide-react';

interface MaterialItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_price_cents: number;
  supplier_name: string | null;
  sku_or_code: string | null;
  notes: string | null;
  is_active: boolean;
}

const CATEGORIES = ['timber', 'paint', 'hardware', 'fasteners', 'electrical', 'plumbing', 'other'];
const UNITS = ['each', 'linear_m', 'square_m', 'litre', 'kg', 'pack'];

const CATEGORY_COLORS: Record<string, string> = {
  timber: 'bg-amber-100 text-amber-700',
  paint: 'bg-blue-100 text-blue-700',
  hardware: 'bg-slate-100 text-slate-700',
  fasteners: 'bg-gray-100 text-gray-700',
  electrical: 'bg-yellow-100 text-yellow-700',
  plumbing: 'bg-cyan-100 text-cyan-700',
  other: 'bg-purple-100 text-purple-700'
};

export function MaterialsCatalog({ onBack }: { onBack: () => void }) {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'other',
    unit: 'each',
    unit_price_cents: 0,
    supplier_name: '',
    sku_or_code: '',
    notes: ''
  });
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('material_catalog_items')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Failed to load materials:', error);
      alert('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      const dataToSave = {
        name: formData.name.trim(),
        category: formData.category,
        unit: formData.unit,
        unit_price_cents: Math.round(formData.unit_price_cents * 100),
        supplier_name: formData.supplier_name.trim() || null,
        sku_or_code: formData.sku_or_code.trim() || null,
        notes: formData.notes.trim() || null
      };

      if (!dataToSave.name) {
        alert('Material name is required');
        return;
      }

      if (editingId) {
        const { error } = await supabase
          .from('material_catalog_items')
          .update(dataToSave)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('material_catalog_items')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setEditingId(null);
      setAddingNew(false);
      resetForm();
      loadMaterials();
    } catch (error) {
      console.error('Failed to save material:', error);
      alert('Failed to save material');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this material? This will not affect existing quotes.')) return;

    try {
      const { error } = await supabase
        .from('material_catalog_items')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      loadMaterials();
    } catch (error) {
      console.error('Failed to delete material:', error);
      alert('Failed to delete material');
    }
  }

  function startEdit(material: MaterialItem) {
    setEditingId(material.id);
    setAddingNew(false);
    setFormData({
      name: material.name,
      category: material.category,
      unit: material.unit,
      unit_price_cents: material.unit_price_cents / 100,
      supplier_name: material.supplier_name || '',
      sku_or_code: material.sku_or_code || '',
      notes: material.notes || ''
    });
  }

  function startAddNew() {
    setAddingNew(true);
    setEditingId(null);
    resetForm();
  }

  function resetForm() {
    setFormData({
      name: '',
      category: 'other',
      unit: 'each',
      unit_price_cents: 0,
      supplier_name: '',
      sku_or_code: '',
      notes: ''
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setAddingNew(false);
    resetForm();
  }

  const filteredMaterials = filterCategory === 'all'
    ? materials
    : materials.filter(m => m.category === filterCategory);

  const isEditing = addingNew || editingId !== null;

  return (
    <Layout showNav={false} className="bg-[#FAFAFA]">
      <div className="h-full flex flex-col">
        <Header
          title="Materials Catalog"
          left={
            <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-primary hover:bg-slate-100 rounded-full transition-colors">
              <ChevronLeft size={20} />
            </button>
          }
          right={
            !isEditing ? (
              <button onClick={startAddNew} className="w-10 h-10 flex items-center justify-center text-primary hover:bg-slate-100 rounded-full transition-colors">
                <Plus size={20} />
              </button>
            ) : null
          }
        />

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-secondary">Loading...</div>
            </div>
          ) : (
            <>
          {(addingNew || editingId) && (
            <div className="px-6 py-4 bg-white border-b border-slate-200">
              <h3 className="text-[12px] font-bold text-secondary uppercase tracking-widest mb-4">
                {addingNew ? 'New Material' : 'Edit Material'}
              </h3>
              <div className="space-y-3">
                <Input
                  label="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., White primer 4L"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-secondary uppercase tracking-wider mb-2">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat} className="capitalize">{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-secondary uppercase tracking-wider mb-2">Unit</label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
                    >
                      {UNITS.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Input
                  label="Price ($)"
                  type="number"
                  step="0.01"
                  value={formData.unit_price_cents}
                  onChange={(e) => setFormData({ ...formData, unit_price_cents: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />

                <Input
                  label="Supplier (optional)"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                  placeholder="e.g., Bunnings"
                />

                <div className="flex gap-2 pt-2">
                  <Button onClick={cancelEdit} variant="ghost" className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} className="flex-1">
                    <Save className="w-4 h-4" /> Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!isEditing && (
            <div className="px-6 py-4 overflow-x-auto no-scrollbar">
              <div className="flex gap-2 pb-2">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    filterCategory === 'all'
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  All ({materials.length})
                </button>
                {CATEGORIES.map(cat => {
                  const count = materials.filter(m => m.category === cat).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap capitalize transition-colors ${
                        filterCategory === cat
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="px-6 pb-6 space-y-3">
            {filteredMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <Package className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-sm font-semibold text-primary mb-1">No materials yet</h3>
                <p className="text-xs text-secondary max-w-[240px]">
                  {materials.length === 0
                    ? 'Add your first material to get started with faster quoting'
                    : `No ${filterCategory} materials found`}
                </p>
                {materials.length === 0 && (
                  <Button onClick={startAddNew} className="mt-4">
                    <Plus className="w-4 h-4" /> Add Material
                  </Button>
                )}
              </div>
            ) : (
              filteredMaterials.map((material) => (
                <Card key={material.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-primary truncate">{material.name}</h3>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full capitalize whitespace-nowrap ${CATEGORY_COLORS[material.category]}`}>
                          {material.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-secondary">
                        <span className="font-semibold text-primary">${(material.unit_price_cents / 100).toFixed(2)}</span>
                        <span className="text-tertiary">per {material.unit}</span>
                      </div>
                      {material.supplier_name && (
                        <div className="text-[11px] text-tertiary mt-1 truncate">
                          {material.supplier_name}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(material)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        disabled={isEditing}
                      >
                        <Edit2 className="w-4 h-4 text-slate-600" />
                      </button>
                      <button
                        onClick={() => handleDelete(material.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        disabled={isEditing}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
