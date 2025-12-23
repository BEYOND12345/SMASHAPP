import React, { useState, useEffect } from 'react';
import { Layout, Header } from '../components/layout';
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { formatCents } from '../lib/utils/calculations';

interface ReviewDraftProps {
  quoteId: string;
  intakeId: string;
  onBack: () => void;
  onContinue: (quoteId: string) => void;
}

interface VoiceIntake {
  id: string;
  transcript_text: string;
  extraction_json: any;
  missing_fields: string[];
  extraction_confidence: number;
  status: string;
}

interface Quote {
  id: string;
  title: string;
  description: string;
  customer: any;
  line_items: any[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
}

export const ReviewDraft: React.FC<ReviewDraftProps> = ({
  quoteId,
  intakeId,
  onBack,
  onContinue,
}) => {
  const [intake, setIntake] = useState<VoiceIntake | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [originalTranscript, setOriginalTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [savingTranscript, setSavingTranscript] = useState(false);

  useEffect(() => {
    loadData();
  }, [quoteId, intakeId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('[ReviewDraft] Loading data for quoteId:', quoteId, 'intakeId:', intakeId);

      const intakeResult = await supabase
        .from('voice_intakes')
        .select('*')
        .eq('id', intakeId)
        .maybeSingle();

      console.log('[ReviewDraft] Intake result:', intakeResult);

      if (intakeResult.error) {
        throw new Error(`Intake error: ${intakeResult.error.message}`);
      }

      if (!intakeResult.data) {
        throw new Error('Voice intake not found');
      }

      const quoteResult = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers(*),
          line_items:quote_line_items(*)
        `)
        .eq('id', quoteId)
        .maybeSingle();

      console.log('[ReviewDraft] Quote result:', quoteResult);

      if (quoteResult.error) {
        throw new Error(`Quote error: ${quoteResult.error.message}`);
      }

      if (!quoteResult.data) {
        throw new Error('Quote not found');
      }

      setIntake(intakeResult.data);
      setQuote(quoteResult.data);
      setTranscript(intakeResult.data.transcript_text || '');
      setOriginalTranscript(intakeResult.data.transcript_text || '');
      console.log('[ReviewDraft] Data loaded successfully');
    } catch (err) {
      console.error('[ReviewDraft] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTranscript = async () => {
    if (!intake || transcript === originalTranscript) return;

    try {
      setSavingTranscript(true);
      setError('');

      const { error: updateError } = await supabase
        .from('voice_intakes')
        .update({ transcript_text: transcript })
        .eq('id', intakeId);

      if (updateError) throw updateError;

      setOriginalTranscript(transcript);
      setIsEditingTranscript(false);
      console.log('[ReviewDraft] Transcript saved successfully');
    } catch (err) {
      console.error('[ReviewDraft] Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save transcript');
    } finally {
      setSavingTranscript(false);
    }
  };


  if (loading) {
    return (
      <Layout showNav={false} className="bg-surface">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin text-brand" size={40} />
        </div>
      </Layout>
    );
  }

  if (!intake || !quote) {
    return (
      <Layout showNav={false} className="bg-surface">
        <div className="flex items-center justify-center h-full p-6">
          <Card className="text-center">
            <p className="text-lg font-semibold text-primary mb-2">Unable to load draft</p>
            <p className="text-sm text-secondary mb-4">{error || 'Data not found'}</p>
            <Button onClick={onBack}>Go Back</Button>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showNav={false} className="bg-surface">
      <Header
        transparent
        title="Review Draft"
        left={
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
        }
      />

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-[14px] text-green-900 font-medium">
            Your quote draft is ready! Review the details below, check the transcript if needed, then continue to edit and finalize.
          </p>
        </div>

        <Card>
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full flex items-center justify-between text-left"
          >
            <h3 className="font-semibold text-primary">Transcript</h3>
            {showTranscript ? (
              <ChevronUp className="text-secondary" size={20} />
            ) : (
              <ChevronDown className="text-secondary" size={20} />
            )}
          </button>
          {showTranscript && (
            <div className="mt-3 space-y-3">
              {isEditingTranscript ? (
                <>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    className="w-full min-h-[120px] p-3 bg-white border border-divider rounded-lg text-sm text-primary resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveTranscript}
                      disabled={savingTranscript || transcript === originalTranscript}
                      className="flex-1"
                      size="sm"
                    >
                      {savingTranscript ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save Changes'}
                    </Button>
                    <Button
                      onClick={() => {
                        setTranscript(originalTranscript);
                        setIsEditingTranscript(false);
                      }}
                      variant="secondary"
                      className="flex-1"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-secondary leading-relaxed">
                    {transcript}
                  </p>
                  <button
                    onClick={() => setIsEditingTranscript(true)}
                    className="text-sm text-brand hover:text-brandDark font-medium"
                  >
                    Edit Transcript
                  </button>
                </>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-primary mb-3">Quote Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-secondary">Title:</span>
              <span className="font-medium text-primary">{quote.title}</span>
            </div>
            {quote.customer?.name && (
              <div className="flex justify-between">
                <span className="text-secondary">Customer:</span>
                <span className="font-medium text-primary">{quote.customer.name}</span>
              </div>
            )}
            {quote.description && (
              <div>
                <span className="text-secondary">Description:</span>
                <p className="mt-1 text-primary">{quote.description}</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-primary mb-3">Line Items</h3>
          <div className="space-y-3">
            {quote.line_items.map((item: any) => (
              <div
                key={item.id}
                className="pb-3 border-b border-border last:border-0 last:pb-0"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-primary">{item.description}</span>
                  <span className="font-semibold text-primary">
                    {formatCents(item.line_total_cents)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-secondary">
                  <span>
                    {item.quantity} {item.unit} × {formatCents(item.unit_price_cents)}
                  </span>
                  <span className="text-xs uppercase bg-surface px-2 py-0.5 rounded">
                    {item.item_type}
                  </span>
                </div>
                {item.notes && (
                  <p className="mt-1 text-xs text-secondary italic">{item.notes}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Subtotal:</span>
              <span className="font-medium text-primary">
                {formatCents(quote.subtotal_cents)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Tax:</span>
              <span className="font-medium text-primary">
                {formatCents(quote.tax_cents)}
              </span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span className="text-primary">Total:</span>
              <span className="text-brand">
                {formatCents(quote.total_cents)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className="p-6 border-t border-border bg-white">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => onContinue(quoteId)}
            className="flex-1"
          >
            Continue to Edit
          </Button>
        </div>
      </div>
    </Layout>
  );
};
