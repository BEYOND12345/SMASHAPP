import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { formatCents } from '../lib/utils/calculations';
import { ProgressChecklist, ChecklistItem } from '../components/progresschecklist';

interface ReviewDraftProps {
  quoteId: string;
  intakeId: string;
  onBack: () => void;
  onContinue: (quoteId: string) => void;
}

const STATUS_MESSAGES = [
  'Listening',
  'Understanding the job',
  'Matching materials',
  'Checking prices',
  'Preparing job details',
];

const SkeletonLine = ({ width = '100%' }: { width?: string }) => (
  <div
    className="h-4 bg-gray-200 rounded animate-pulse"
    style={{ width }}
  />
);

const SkeletonRow = () => (
  <div className="pb-3 border-b border-border space-y-2">
    <div className="flex justify-between items-start">
      <SkeletonLine width="60%" />
      <SkeletonLine width="20%" />
    </div>
    <SkeletonLine width="40%" />
  </div>
);

export const ReviewDraft: React.FC<ReviewDraftProps> = ({
  quoteId,
  intakeId,
  onBack,
  onContinue,
}) => {
  const [quote, setQuote] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(true);
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[0]);
  const [error, setError] = useState('');
  const [firstRenderWithItemsLogged, setFirstRenderWithItemsLogged] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'location', label: 'Job location', state: 'waiting' },
    { id: 'jobname', label: 'Job name', state: 'waiting' },
    { id: 'materials', label: 'Materials & quantities', state: 'waiting' },
    { id: 'labour', label: 'Labour & time', state: 'waiting' },
    { id: 'fees', label: 'Additional fees', state: 'waiting' },
  ]);
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklistFadingOut, setChecklistFadingOut] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIndexRef = useRef(0);
  const traceIdRef = useRef<string>('');
  const mountTimeRef = useRef<number>(0);
  const pollCountRef = useRef(0);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const traceId = urlParams.get('trace_id') || '';
    traceIdRef.current = traceId;
    mountTimeRef.current = Date.now();

    const now = Date.now();
    const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
    const renderTime = recordStopTime > 0 ? now - recordStopTime : 0;

    console.warn(`[PERF] trace_id=${traceId} step=reviewdraft_mount intake_id=${intakeId} quote_id=${quoteId} total_ms=${renderTime}`);

    loadData();
    startPolling();
    startStatusRotation();

    return () => {
      stopPolling();
      stopStatusRotation();
    };
  }, [quoteId, intakeId]);

  const loadData = async () => {
    try {
      pollCountRef.current += 1;
      const pollNum = pollCountRef.current;

      const quoteResult = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers!customer_id(*),
          line_items:quote_line_items(*)
        `)
        .eq('id', quoteId)
        .maybeSingle();

      if (quoteResult.error) {
        console.error('[ReviewDraft] Quote load error:', quoteResult.error);
        setError('Failed to load quote');
        return;
      }

      if (!quoteResult.data) {
        console.error('[ReviewDraft] Quote not found');
        setError('Quote not found');
        return;
      }

      const intakeResult = await supabase
        .from('voice_intakes')
        .select('extraction_json, status')
        .eq('id', intakeId)
        .maybeSingle();

      const extractionData = intakeResult.data?.extraction_json;

      setChecklistItems((prev) => {
        const updated = [...prev];

        const locationItem = updated.find(i => i.id === 'location');
        if (locationItem && extractionData?.job?.location) {
          locationItem.state = 'complete';
        }

        const jobNameItem = updated.find(i => i.id === 'jobname');
        if (jobNameItem && extractionData?.job?.title) {
          jobNameItem.state = 'complete';
        }

        const materialsItem = updated.find(i => i.id === 'materials');
        if (materialsItem && extractionData?.materials?.items && extractionData.materials.items.length > 0) {
          materialsItem.state = 'complete';
        }

        const labourItem = updated.find(i => i.id === 'labour');
        if (labourItem && extractionData?.time?.labour_entries && extractionData.time.labour_entries.length > 0) {
          labourItem.state = 'complete';
        }

        const feesItem = updated.find(i => i.id === 'fees');
        if (feesItem && extractionData?.fees?.items && extractionData.fees.items.length > 0) {
          feesItem.state = 'complete';
        } else if (feesItem && feesItem.state === 'waiting') {
          feesItem.state = 'complete';
        }

        return updated;
      });

      const allComplete = checklistItems.every(item => item.state === 'complete');
      if (allComplete && !checklistFadingOut) {
        setChecklistFadingOut(true);
        setTimeout(() => {
          setShowChecklist(false);
        }, 300);
      }

      setQuote(quoteResult.data);
      setLoading(false);

      const hasLineItems = quoteResult.data.line_items && quoteResult.data.line_items.length > 0;
      const elapsedMs = Date.now() - mountTimeRef.current;

      console.log(`[POLL] #${pollNum} elapsed_ms=${elapsedMs} has_items=${hasLineItems} items_count=${quoteResult.data.line_items?.length || 0}`);

      if (hasLineItems) {
        setIsProcessing(false);
        stopPolling();
        stopStatusRotation();
        setStatusMessage('Quote ready');

        if (!firstRenderWithItemsLogged) {
          const now = Date.now();
          const urlParams = new URLSearchParams(window.location.search);
          const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
          const totalTimeMs = recordStopTime > 0 ? now - recordStopTime : 0;

          console.warn(`[PERF] trace_id=${traceIdRef.current} step=first_render_with_real_items intake_id=${intakeId} quote_id=${quoteId} line_items_count=${quoteResult.data.line_items.length} total_ms=${totalTimeMs}`);
          setFirstRenderWithItemsLogged(true);
        }
      } else if (pollNum >= 5) {
        const { data: intakeData } = await supabase
          .from('voice_intakes')
          .select('status')
          .eq('id', intakeId)
          .maybeSingle();

        if (intakeData?.status === 'quote_created') {
          console.warn('[ReviewDraft] Quote created but has 0 line items - transcript had no work content');
          setIsProcessing(false);
          stopPolling();
          stopStatusRotation();
          setError('No work items were detected in your recording. Please try again and describe the job details, materials needed, and estimated hours.');
        }
      }
    } catch (err) {
      console.error('[ReviewDraft] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setLoading(false);
    }
  };

  const startPolling = () => {
    pollIntervalRef.current = setInterval(() => {
      loadData();
    }, 1000);

    setTimeout(() => {
      if (pollIntervalRef.current) {
        console.log('[ReviewDraft] Polling timeout after 60s');
        stopPolling();
        setError('Quote creation took too long. Please refresh or try again.');
      }
    }, 60000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startStatusRotation = () => {
    statusIntervalRef.current = setInterval(() => {
      statusIndexRef.current = (statusIndexRef.current + 1) % STATUS_MESSAGES.length;
      setStatusMessage(STATUS_MESSAGES[statusIndexRef.current]);
    }, 1200);
  };

  const stopStatusRotation = () => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  };

  if (loading && !quote) {
    return (
      <Layout showNav={false} className="bg-surface">
        <Header
          transparent
          title="Review Job Details"
          left={
            <button
              onClick={onBack}
              className="p-2 -ml-2 text-secondary hover:text-primary transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
          }
        />
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin text-brand" size={40} />
        </div>
      </Layout>
    );
  }

  if (error && !quote) {
    return (
      <Layout showNav={false} className="bg-surface">
        <div className="flex items-center justify-center h-full p-6">
          <Card className="text-center">
            <p className="text-lg font-semibold text-primary mb-2">Unable to load quote</p>
            <p className="text-sm text-secondary mb-4">{error}</p>
            <Button onClick={onBack}>Go Back</Button>
          </Card>
        </div>
      </Layout>
    );
  }

  const hasLineItems = quote?.line_items && quote.line_items.length > 0;
  const customerName = quote?.customer?.name || null;
  const quoteTitle = quote?.title || 'Processing job';
  const isStillProcessing = isProcessing || quoteTitle === 'Processing job';

  return (
    <Layout showNav={false} className="bg-surface">
      <Header
        transparent
        title="Review Job Details"
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
        <div className="text-center py-2">
          <p className="text-xs text-tertiary">Check the job details before turning this into a quote.</p>
        </div>
        {isStillProcessing && showChecklist && (
          <div className={`py-2 ${checklistFadingOut ? 'animate-fade-out' : ''}`}>
            <ProgressChecklist items={checklistItems} className="max-w-xs mx-auto" />
          </div>
        )}

        <Card>
          <h3 className="font-semibold text-primary mb-3">Job Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-secondary">Title:</span>
              {isStillProcessing && quoteTitle === 'Processing job' ? (
                <SkeletonLine width="120px" />
              ) : (
                <span className="font-medium text-primary">{quoteTitle}</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Customer:</span>
              {!customerName && isStillProcessing ? (
                <SkeletonLine width="100px" />
              ) : customerName ? (
                <span className="font-medium text-primary">{customerName}</span>
              ) : (
                <span className="text-tertiary text-xs">Not specified</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-primary mb-3">Labour</h3>
          {!hasLineItems ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <div className="space-y-3">
              {quote.line_items
                .filter((item: any) => item.item_type === 'labour')
                .map((item: any) => (
                  <div
                    key={item.id}
                    className="pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className="font-medium text-primary flex-1 min-w-0 truncate">{item.description}</span>
                      <span className="font-semibold text-primary flex-shrink-0">
                        {formatCents(item.line_total_cents)}
                      </span>
                    </div>
                    <div className="text-sm text-secondary">
                      {item.quantity} {item.unit} × {formatCents(item.unit_price_cents)}
                    </div>
                  </div>
                ))}
              {quote.line_items.filter((item: any) => item.item_type === 'labour').length === 0 && (
                <p className="text-sm text-tertiary">No labour items</p>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-primary mb-3">Materials</h3>
          {!hasLineItems ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <div className="space-y-3">
              {quote.line_items
                .filter((item: any) => item.item_type === 'materials')
                .map((item: any) => (
                  <div
                    key={item.id}
                    className="pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className="font-medium text-primary flex-1 min-w-0 truncate">{item.description}</span>
                      <span className="font-semibold text-primary flex-shrink-0">
                        {formatCents(item.line_total_cents)}
                      </span>
                    </div>
                    <div className="text-sm text-secondary">
                      {item.quantity} {item.unit} × {formatCents(item.unit_price_cents)}
                    </div>
                    {item.notes && (
                      <p className="mt-1 text-xs text-secondary italic">{item.notes}</p>
                    )}
                  </div>
                ))}
              {quote.line_items.filter((item: any) => item.item_type === 'materials').length === 0 && (
                <p className="text-sm text-tertiary">No materials</p>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-primary mb-3">Fees</h3>
          {!hasLineItems ? (
            <div className="space-y-3">
              <SkeletonRow />
            </div>
          ) : (
            <div className="space-y-3">
              {quote.line_items
                .filter((item: any) => item.item_type === 'fee')
                .map((item: any) => (
                  <div
                    key={item.id}
                    className="pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className="font-medium text-primary flex-1 min-w-0 truncate">{item.description}</span>
                      <span className="font-semibold text-primary flex-shrink-0">
                        {formatCents(item.line_total_cents)}
                      </span>
                    </div>
                  </div>
                ))}
              {quote.line_items.filter((item: any) => item.item_type === 'fee').length === 0 && (
                <p className="text-sm text-tertiary">No fees</p>
              )}
            </div>
          )}
        </Card>

        <div className="pt-4 pb-2 border-t border-border/50">
          <p className="text-xs text-tertiary mb-3 text-center">Estimated totals</p>
          {!hasLineItems ? (
            <div className="space-y-2 px-2">
              <div className="flex justify-between">
                <span className="text-tertiary text-xs">Subtotal:</span>
                <span className="text-xs text-tertiary">Calculating...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-tertiary text-xs">Tax:</span>
                <span className="text-xs text-tertiary">Calculating...</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Total:</span>
                <span className="text-secondary">Calculating...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2 px-2">
              <div className="flex justify-between text-xs">
                <span className="text-tertiary">Subtotal:</span>
                <span className="text-secondary">
                  {formatCents(quote.subtotal_cents || 0)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-tertiary">Tax:</span>
                <span className="text-secondary">
                  {formatCents(quote.tax_cents || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-secondary">Total:</span>
                <span className="text-primary">
                  {formatCents(quote.grand_total_cents || 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] p-6 border-t border-border bg-white pb-safe">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => onContinue(quoteId)}
            className="flex-1"
            disabled={!hasLineItems}
          >
            {hasLineItems ? 'Confirm Job and Build Quote' : 'Preparing details...'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};
