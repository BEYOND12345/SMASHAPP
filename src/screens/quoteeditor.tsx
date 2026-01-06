import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { ChevronLeft, Trash2, Check, Plus, X, Edit3, Share2, FileDown, Link2, Mail, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCents } from '../lib/utils/calculations';
import { BottomSheet } from '../components/bottomsheet';
import { ExtractionChecklist } from '../components/ExtractionChecklist';

interface QuoteEditorProps {
  quoteId: string;
  onBack: () => void;
  voiceQuoteId?: string;
}

interface LineItem {
  id: string;
  item_type: 'labour' | 'materials' | 'service' | 'fee' | 'discount';
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price_cents: number | null;
  line_total_cents: number;
  is_placeholder: boolean;
  is_needs_review: boolean;
  catalog_item_id: string | null;
  position: number;
}

interface Quote {
  id: string;
  quote_number: string;
  title: string;
  description: string;
  site_address: string | null;
  timeline_description: string | null;
  scope_of_work: string[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  customer_id: string;
  status: string;
}

interface Customer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export const QuoteEditor: React.FC<QuoteEditorProps> = ({ quoteId, onBack, voiceQuoteId }) => {
  const fromRecording = true; // TODO: Make this a prop if needed

  const [quote, setQuote] = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(fromRecording);
  const [jobId, setJobId] = useState<string | null>(null);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const [showLineItemSheet, setShowLineItemSheet] = useState(false);

  const [editLineForm, setEditLineForm] = useState({
    description: '',
    quantity: '',
    unit: '',
    rate: '',
  });

  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const dirtyFields = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('[QuoteEditor] MOUNTED with quoteId:', quoteId);

    if (voiceQuoteId) {
      const fetchJobId = async () => {
        const { data } = await supabase
          .from('voice_intakes')
          .select('job_id')
          .eq('created_quote_id', voiceQuoteId)
          .maybeSingle();

        if (data?.job_id) {
          console.log('[QuoteEditor] Found job_id:', data.job_id);
          setJobId(data.job_id);
        }
      };
      fetchJobId();
    }
  }, [voiceQuoteId]);

  useEffect(() => {
    console.log('[QuoteEditor] useEffect triggered, quoteId:', quoteId);

    if (!quoteId) {
      console.error('[QuoteEditor] No quoteId provided!');
      return;
    }

    console.log('[QuoteEditor] Calling loadQuoteData...');
    loadQuoteData();
  }, [quoteId]);

  useEffect(() => {
    if (showSuccessAnimation) {
      const timer = setTimeout(() => {
        setShowSuccessAnimation(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessAnimation]);

  useEffect(() => {
    if (!voiceQuoteId) return;

    console.log('[QuoteEditor] VOICE QUOTE: Setting up polling for background processing');

    let pollCount = 0;
    const maxPolls = 15; // 15 polls × 3 seconds = 45 seconds max

    const pollInterval = setInterval(async () => {
      pollCount++;
      console.log(`[QuoteEditor] Poll attempt ${pollCount}/${maxPolls}`);

      const { data: freshQuote } = await supabase
        .from('quotes')
        .select('title, subtotal_cents')
        .eq('id', voiceQuoteId)
        .single();

      console.log('[QuoteEditor] Poll result:', {
        title: freshQuote?.title,
        subtotal: freshQuote?.subtotal_cents,
        isStillPlaceholder: freshQuote?.title === 'Processing job'
      });

      // Stop polling if quote has real data
      if (freshQuote &&
          freshQuote.title !== 'Processing job' &&
          freshQuote.subtotal_cents > 0) {

        console.log('[QuoteEditor] ✅ REAL DATA DETECTED! Reloading quote...');
        clearInterval(pollInterval);
        await loadQuoteData();
        return;
      }

      // Stop polling after max attempts
      if (pollCount >= maxPolls) {
        console.warn('[QuoteEditor] ⏱️ Polling timeout - processing may have failed');
        clearInterval(pollInterval);
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      console.log('[QuoteEditor] Cleaning up polling interval');
      clearInterval(pollInterval);
    };
  }, [voiceQuoteId]); // Only run this for voice quotes

  const loadQuoteData = async () => {
    console.log('[QuoteEditor] loadQuoteData START, quoteId:', quoteId);

    try {
      setLoading(true);

      console.log('[QuoteEditor] Querying quotes table for id:', quoteId);
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .maybeSingle();

      console.log('[QuoteEditor] Quote query result:', { quoteData, quoteError });

      if (quoteError) {
        console.error('[QuoteEditor] Quote query error:', quoteError);
        throw quoteError;
      }

      if (!quoteData) {
        console.error('[QuoteEditor] No quote found for id:', quoteId);
        throw new Error('Quote not found');
      }

      console.log('[QuoteEditor] Quote loaded:', {
        id: quoteData.id,
        title: quoteData.title,
        site_address: quoteData.site_address,
        customer_id: quoteData.customer_id,
        subtotal_cents: quoteData.subtotal_cents,
        total_cents: quoteData.total_cents
      });

      setQuote(quoteData);

      console.log('[QuoteEditor] Querying customer for id:', quoteData.customer_id);
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', quoteData.customer_id)
        .maybeSingle();

      console.log('[QuoteEditor] Customer query result:', { customerData, customerError });

      setCustomer(customerData);

      console.log('[QuoteEditor] Querying line items for quote_id:', quoteId);
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('quote_line_items')
        .select('*')
        .eq('quote_id', quoteId)
        .eq('is_placeholder', false)
        .order('position', { ascending: true });

      console.log('[QuoteEditor] Line items query result:', {
        items: lineItemsData,
        count: lineItemsData?.length || 0,
        error: lineItemsError
      });

      if (lineItemsError) {
        console.error('[QuoteEditor] Line items query error:', lineItemsError);
        throw lineItemsError;
      }

      setLineItems(lineItemsData || []);

      console.log('[QuoteEditor] loadQuoteData COMPLETE - Quote:', quoteData?.title, 'Items:', lineItemsData?.length || 0);
    } catch (err) {
      console.error('[QuoteEditor] loadQuoteData ERROR:', err);
    } finally {
      setLoading(false);
      console.log('[QuoteEditor] Loading state set to false');
    }
  };

  const debouncedSave = useCallback(async () => {
    if (dirtyFields.current.size === 0) return;

    setSaveStatus('saving');

    try {
      const updates: any = {};
      dirtyFields.current.forEach(field => {
        if (quote && field in quote) {
          updates[field] = (quote as any)[field];
        }
      });

      const { error } = await supabase
        .from('quotes')
        .update(updates)
        .eq('id', quoteId);

      if (error) throw error;

      dirtyFields.current.clear();
      setSaveStatus('saved');

      setTimeout(() => {
        if (dirtyFields.current.size === 0) {
          setSaveStatus('saved');
        }
      }, 1000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
    }
  }, [quote, quoteId]);

  const handleFieldChange = (field: string, value: any) => {
    setQuote(prev => prev ? { ...prev, [field]: value } : null);
    dirtyFields.current.add(field);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      debouncedSave();
    }, 500);
  };

  const handleInlineEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleInlineSave = () => {
    if (editingField) {
      handleFieldChange(editingField, editValue);
      setEditingField(null);
    }
  };

  const handleInlineCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleEditLineItem = (item: LineItem) => {
    setEditingLineItem(item);
    setEditLineForm({
      description: item.description,
      quantity: item.quantity?.toString() || '',
      unit: item.unit || '',
      rate: item.unit_price_cents ? (item.unit_price_cents / 100).toFixed(2) : '',
    });
    setShowLineItemSheet(true);
  };

  const handleSaveLineItem = async () => {
    if (!editingLineItem) return;

    try {
      const quantity = parseFloat(editLineForm.quantity) || null;
      const rateCents = parseFloat(editLineForm.rate) * 100 || null;
      const totalCents = (quantity && rateCents) ? Math.round(quantity * rateCents) : 0;

      const { error } = await supabase
        .from('quote_line_items')
        .update({
          description: editLineForm.description,
          quantity,
          unit: editLineForm.unit || null,
          unit_price_cents: rateCents,
          line_total_cents: totalCents,
        })
        .eq('id', editingLineItem.id);

      if (error) throw error;

      await loadQuoteData();
      setShowLineItemSheet(false);
      setEditingLineItem(null);
    } catch (err) {
      console.error('Failed to update line item:', err);
    }
  };

  const handleDeleteLineItem = async (itemId: string) => {
    if (!confirm('Delete this item?')) return;

    try {
      const { error } = await supabase
        .from('quote_line_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      await loadQuoteData();
    } catch (err) {
      console.error('Failed to delete line item:', err);
    }
  };

  const handleAddScopeItem = async () => {
    if (!quote) return;

    const newItem = prompt('Enter scope item:');
    if (!newItem) return;

    const updatedScope = [...quote.scope_of_work, newItem];
    handleFieldChange('scope_of_work', updatedScope);
  };

  const handleDeleteScopeItem = async (index: number) => {
    if (!quote) return;

    const updatedScope = quote.scope_of_work.filter((_, i) => i !== index);
    handleFieldChange('scope_of_work', updatedScope);
  };

  const handleSendEstimate = async () => {
    if (!quote || !customer) return;

    const shareText = `View estimate #${quote.quote_number}: ${window.location.origin}/quote/${quote.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Estimate #${quote.quote_number}`,
          text: shareText,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      alert('Share functionality not available on this device');
    }
  };

  const handleSendAsInvoice = () => {
    alert('Convert to Invoice coming soon');
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/quote/${quoteId}`;
    try {
      await navigator.clipboard.writeText(link);
      alert('Link copied!');
    } catch (err) {
      alert(`Copy this link: ${link}`);
    }
  };

  const handleDownloadPDF = () => {
    alert('PDF download coming soon');
  };

  const handleDeleteQuote = async () => {
    if (!confirm('Delete this quote? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);

      if (error) throw error;

      onBack();
    } catch (err) {
      console.error('Failed to delete quote:', err);
      alert('Failed to delete quote');
    }
  };

  if (loading) {
    return (
      <Layout showNav={true}>
        <Header title={voiceQuoteId ? "Processing Quote..." : "Loading..."} left={<button onClick={onBack}><ChevronLeft /></button>} />
        <div className="flex items-center justify-center h-full p-6">
          {voiceQuoteId && jobId ? (
            <ExtractionChecklist jobId={jobId} />
          ) : (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
          )}
        </div>
      </Layout>
    );
  }

  if (!quote) {
    return (
      <Layout showNav={true}>
        <Header title="Error" left={<button onClick={onBack}><ChevronLeft /></button>} />
        <div className="p-6 text-center">
          <p className="text-secondary">Quote not found</p>
        </div>
      </Layout>
    );
  }

  const materials = lineItems.filter(item => item.item_type === 'materials');
  const labour = lineItems.filter(item => item.item_type === 'labour');
  const fees = lineItems.filter(item => item.item_type === 'fee');

  return (
    <Layout showNav={true}>
      <Header
        title="Edit Quote"
        left={
          <button onClick={onBack} className="p-2 -ml-2">
            <ChevronLeft size={24} />
          </button>
        }
        right={
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="text-[13px] text-secondary">Saving...</span>
            )}
            {saveStatus === 'saved' && dirtyFields.current.size === 0 && (
              <span className="text-[13px] text-green-600 flex items-center gap-1">
                <Check size={14} /> Saved
              </span>
            )}
            <button onClick={handleDeleteQuote} className="p-2 -mr-2 text-red-500">
              <Trash2 size={20} />
            </button>
          </div>
        }
      />

      {showSuccessAnimation && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 animate-fade-out">
          <div className="flex items-center gap-2">
            <Check size={20} className="text-green-600" />
            <p className="text-[14px] text-green-800 font-medium">
              Quote generated! Review and send below
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-32">
        <div className="p-6 space-y-6">
          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <h2 className="text-[16px] font-bold text-primary">Job Details</h2>

            <div>
              <label className="text-[13px] font-semibold text-tertiary uppercase tracking-wide">
                Title
              </label>
              {editingField === 'title' ? (
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 px-3 py-2 border border-brand rounded-lg text-[15px]"
                    autoFocus
                  />
                  <button onClick={handleInlineSave} className="px-3 py-2 bg-brand text-white rounded-lg">
                    <Check size={18} />
                  </button>
                  <button onClick={handleInlineCancel} className="px-3 py-2 border border-divider rounded-lg">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleInlineEdit('title', quote.title)}
                  className="w-full text-left mt-1 px-3 py-2 border border-divider rounded-lg hover:border-brand transition-colors flex items-center justify-between"
                >
                  <span className="text-[15px] text-primary">{quote.title}</span>
                  <Edit3 size={16} className="text-secondary" />
                </button>
              )}
            </div>

            <div>
              <label className="text-[13px] font-semibold text-tertiary uppercase tracking-wide">
                Client
              </label>
              <div className="mt-1 px-3 py-2 border border-divider rounded-lg">
                <span className="text-[15px] text-primary">{customer?.name || 'No customer'}</span>
              </div>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-tertiary uppercase tracking-wide">
                Location
              </label>
              {editingField === 'site_address' ? (
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Add location"
                    className="flex-1 px-3 py-2 border border-brand rounded-lg text-[15px]"
                    autoFocus
                  />
                  <button onClick={handleInlineSave} className="px-3 py-2 bg-brand text-white rounded-lg">
                    <Check size={18} />
                  </button>
                  <button onClick={handleInlineCancel} className="px-3 py-2 border border-divider rounded-lg">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleInlineEdit('site_address', quote.site_address || '')}
                  className="w-full text-left mt-1 px-3 py-2 border border-divider rounded-lg hover:border-brand transition-colors flex items-center justify-between"
                >
                  <span className="text-[15px] text-primary">{quote.site_address || '[Tap to add]'}</span>
                  <Edit3 size={16} className="text-secondary" />
                </button>
              )}
            </div>

            <div>
              <label className="text-[13px] font-semibold text-tertiary uppercase tracking-wide">
                Timeline
              </label>
              {editingField === 'timeline_description' ? (
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="e.g., 2-3 days"
                    className="flex-1 px-3 py-2 border border-brand rounded-lg text-[15px]"
                    autoFocus
                  />
                  <button onClick={handleInlineSave} className="px-3 py-2 bg-brand text-white rounded-lg">
                    <Check size={18} />
                  </button>
                  <button onClick={handleInlineCancel} className="px-3 py-2 border border-divider rounded-lg">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleInlineEdit('timeline_description', quote.timeline_description || '')}
                  className="w-full text-left mt-1 px-3 py-2 border border-divider rounded-lg hover:border-brand transition-colors flex items-center justify-between"
                >
                  <span className="text-[15px] text-primary">{quote.timeline_description || '[Tap to add]'}</span>
                  <Edit3 size={16} className="text-secondary" />
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-primary">Scope of Work</h2>
              <button onClick={handleAddScopeItem} className="text-brand">
                <Plus size={20} />
              </button>
            </div>

            {quote.scope_of_work.length === 0 ? (
              <p className="text-[14px] text-secondary italic">No scope items yet</p>
            ) : (
              <div className="space-y-2">
                {quote.scope_of_work.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 group">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-2 flex-shrink-0" />
                    <span className="flex-1 text-[14px] text-primary">{item}</span>
                    <button
                      onClick={() => handleDeleteScopeItem(index)}
                      className="opacity-0 group-hover:opacity-100 text-red-500 p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {materials.length > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
              <h2 className="text-[16px] font-bold text-primary">Materials</h2>
              <div className="space-y-2">
                {materials.map(item => (
                  <div key={item.id} className="flex items-center justify-between group py-2 border-b border-divider last:border-0">
                    <button
                      onClick={() => handleEditLineItem(item)}
                      className="flex-1 text-left flex items-center gap-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] text-primary font-medium">{item.description}</span>
                          {item.is_needs_review && (
                            <span className="text-[11px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Review</span>
                          )}
                          {item.catalog_item_id && (
                            <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded">Catalog</span>
                          )}
                        </div>
                        <div className="text-[13px] text-secondary mt-0.5">
                          {item.quantity} {item.unit} × {formatCents(item.unit_price_cents || 0)}
                        </div>
                      </div>
                      <div className="text-[14px] font-semibold text-primary">
                        {formatCents(item.line_total_cents)}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteLineItem(item.id)}
                      className="ml-2 opacity-0 group-hover:opacity-100 text-red-500 p-2"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {labour.length > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
              <h2 className="text-[16px] font-bold text-primary">Labour</h2>
              <div className="space-y-2">
                {labour.map(item => (
                  <div key={item.id} className="flex items-center justify-between group py-2 border-b border-divider last:border-0">
                    <button
                      onClick={() => handleEditLineItem(item)}
                      className="flex-1 text-left flex items-center gap-3"
                    >
                      <div className="flex-1">
                        <span className="text-[14px] text-primary font-medium block">{item.description}</span>
                        <span className="text-[13px] text-secondary">
                          {item.quantity} {item.unit} × {formatCents(item.unit_price_cents || 0)}
                        </span>
                      </div>
                      <div className="text-[14px] font-semibold text-primary">
                        {formatCents(item.line_total_cents)}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteLineItem(item.id)}
                      className="ml-2 opacity-0 group-hover:opacity-100 text-red-500 p-2"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fees.length > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
              <h2 className="text-[16px] font-bold text-primary">Additional Fees</h2>
              <div className="space-y-2">
                {fees.map(item => (
                  <div key={item.id} className="flex items-center justify-between group py-2 border-b border-divider last:border-0">
                    <button
                      onClick={() => handleEditLineItem(item)}
                      className="flex-1 text-left flex items-center gap-3"
                    >
                      <span className="flex-1 text-[14px] text-primary font-medium">{item.description}</span>
                      <div className="text-[14px] font-semibold text-primary">
                        {formatCents(item.line_total_cents)}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteLineItem(item.id)}
                      className="ml-2 opacity-0 group-hover:opacity-100 text-red-500 p-2"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-divider">
              <span className="text-[15px] text-secondary">Subtotal</span>
              <span className="text-[15px] font-semibold text-primary">
                {formatCents(quote.subtotal_cents)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-divider">
              <span className="text-[15px] text-secondary">Tax (GST)</span>
              <span className="text-[15px] font-semibold text-primary">
                {formatCents(quote.tax_cents)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-[18px] font-bold text-primary">Total</span>
              <span className="text-[22px] font-bold text-brand">
                {formatCents(quote.total_cents)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-divider p-4 space-y-3">
        <div className="flex gap-3">
          <button
            onClick={handleSendEstimate}
            className="flex-1 bg-brand hover:bg-brandDark text-white py-3 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors"
          >
            <Mail size={18} />
            Send Estimate
          </button>
          <button
            onClick={handleSendAsInvoice}
            className="flex-1 bg-white hover:bg-gray-50 border-2 border-brand text-brand py-3 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors"
          >
            <DollarSign size={18} />
            Send as Invoice
          </button>
        </div>
        <div className="flex justify-center gap-6">
          <button onClick={handleCopyLink} className="flex items-center gap-2 text-[14px] text-secondary hover:text-brand">
            <Link2 size={16} />
            Copy Link
          </button>
          <button onClick={handleDownloadPDF} className="flex items-center gap-2 text-[14px] text-secondary hover:text-brand">
            <FileDown size={16} />
            Download PDF
          </button>
        </div>
      </div>

      <BottomSheet
        isOpen={showLineItemSheet}
        onClose={() => setShowLineItemSheet(false)}
        title="Edit Item"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-tertiary uppercase tracking-wide mb-1">
              Description
            </label>
            <input
              type="text"
              value={editLineForm.description}
              onChange={(e) => setEditLineForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 border border-divider rounded-lg text-[15px]"
            />
          </div>

          {editingLineItem?.item_type !== 'fee' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-tertiary uppercase tracking-wide mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editLineForm.quantity}
                    onChange={(e) => setEditLineForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full px-4 py-3 border border-divider rounded-lg text-[15px]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-tertiary uppercase tracking-wide mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={editLineForm.unit}
                    onChange={(e) => setEditLineForm(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="e.g., hours, m²"
                    className="w-full px-4 py-3 border border-divider rounded-lg text-[15px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-tertiary uppercase tracking-wide mb-1">
                  Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editLineForm.rate}
                  onChange={(e) => setEditLineForm(prev => ({ ...prev, rate: e.target.value }))}
                  className="w-full px-4 py-3 border border-divider rounded-lg text-[15px]"
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowLineItemSheet(false)}
              className="flex-1 py-3 border border-divider rounded-lg font-semibold text-[15px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveLineItem}
              className="flex-1 py-3 bg-brand text-white rounded-lg font-semibold text-[15px]"
            >
              Save
            </button>
          </div>
        </div>
      </BottomSheet>
    </Layout>
  );
};
