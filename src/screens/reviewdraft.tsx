import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { formatCents } from '../lib/utils/calculations';
import { ProgressChecklist, ChecklistItem } from '../components/progresschecklist';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  const [intake, setIntake] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(true);
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[0]);
  const [error, setError] = useState('');
  const [firstRenderWithItemsLogged, setFirstRenderWithItemsLogged] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'job', label: 'Job identified', state: 'waiting' },
    { id: 'materials', label: 'Materials detected', state: 'waiting' },
    { id: 'labour', label: 'Labour detected', state: 'waiting' },
    { id: 'totals', label: 'Totals ready', state: 'waiting' },
  ]);
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklistFadingOut, setChecklistFadingOut] = useState(false);
  const [processingTimeout, setProcessingTimeout] = useState(false);

  const quoteChannelRef = useRef<RealtimeChannel | null>(null);
  const intakeChannelRef = useRef<RealtimeChannel | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIndexRef = useRef(0);
  const traceIdRef = useRef<string>('');
  const mountTimeRef = useRef<number>(0);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const traceId = urlParams.get('trace_id') || '';
    traceIdRef.current = traceId;
    mountTimeRef.current = Date.now();

    const now = Date.now();
    const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
    const renderTime = recordStopTime > 0 ? now - recordStopTime : 0;

    console.warn(`[PERF] trace_id=${traceId} step=reviewdraft_mount intake_id=${intakeId} quote_id=${quoteId} total_ms=${renderTime}`);

    loadInitialData();
    setupRealtimeSubscriptions();
    startStatusRotation();
    startTimeoutCheck();

    return () => {
      cleanupSubscriptions();
      stopStatusRotation();
      stopTimeoutCheck();
    };
  }, [quoteId, intakeId]);

  const loadInitialData = async () => {
    try {
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

      setQuote(quoteResult.data);
      setIntake(intakeResult.data);
      updateChecklistFromData(quoteResult.data, intakeResult.data);
      setLoading(false);
    } catch (err) {
      console.error('[ReviewDraft] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setLoading(false);
    }
  };

  const updateChecklistFromData = (quoteData: any, intakeData: any) => {
    const extractionData = intakeData?.extraction_json;
    const hasLineItems = quoteData?.line_items && quoteData.line_items.length > 0;

    setChecklistItems((prev) => {
      const updated = [...prev];

      const jobItem = updated.find(i => i.id === 'job');
      if (jobItem && (extractionData?.job?.title || quoteData.title !== 'Processing job')) {
        jobItem.state = 'complete';
      }

      const materialsItem = updated.find(i => i.id === 'materials');
      if (materialsItem && extractionData?.materials?.items && extractionData.materials.items.length > 0) {
        materialsItem.state = 'complete';
      }

      const labourItem = updated.find(i => i.id === 'labour');
      if (labourItem && extractionData?.time?.labour_entries && extractionData.time.labour_entries.length > 0) {
        labourItem.state = 'complete';
      }

      const totalsItem = updated.find(i => i.id === 'totals');
      if (totalsItem) {
        if (totalsItem.state === 'waiting' && (extractionData?.materials?.items || extractionData?.time?.labour_entries)) {
          totalsItem.state = 'in_progress';
        }
        if (hasLineItems && totalsItem.state === 'in_progress') {
          totalsItem.state = 'complete';
        }
      }

      return updated;
    });

    if (hasLineItems) {
      setIsProcessing(false);
      stopStatusRotation();
      stopTimeoutCheck();
      setStatusMessage('Quote ready');

      if (!firstRenderWithItemsLogged) {
        const now = Date.now();
        const urlParams = new URLSearchParams(window.location.search);
        const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
        const totalTimeMs = recordStopTime > 0 ? now - recordStopTime : 0;

        console.warn(`[PERF] trace_id=${traceIdRef.current} step=first_render_with_real_items intake_id=${intakeId} quote_id=${quoteId} line_items_count=${quoteData.line_items.length} total_ms=${totalTimeMs}`);
        setFirstRenderWithItemsLogged(true);
      }
    }
  };

  const setupRealtimeSubscriptions = () => {
    quoteChannelRef.current = supabase
      .channel(`quote:${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quotes',
          filter: `id=eq.${quoteId}`
        },
        async (payload) => {
          console.log('[REALTIME] Quote updated:', payload.new);

          const { data: updatedQuote } = await supabase
            .from('quotes')
            .select(`
              *,
              customer:customers!customer_id(*),
              line_items:quote_line_items(*)
            `)
            .eq('id', quoteId)
            .maybeSingle();

          if (updatedQuote) {
            setQuote(updatedQuote);
            setIntake(currentIntake => {
              updateChecklistFromData(updatedQuote, currentIntake);
              return currentIntake;
            });
          }
        }
      )
      .subscribe();

    intakeChannelRef.current = supabase
      .channel(`intake:${intakeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'voice_intakes',
          filter: `id=eq.${intakeId}`
        },
        async (payload) => {
          console.log('[REALTIME] Intake updated:', payload.new);

          const { data: updatedIntake } = await supabase
            .from('voice_intakes')
            .select('extraction_json, status')
            .eq('id', intakeId)
            .maybeSingle();

          if (updatedIntake) {
            setIntake(updatedIntake);
            setQuote(currentQuote => {
              updateChecklistFromData(currentQuote, updatedIntake);
              return currentQuote;
            });
          }
        }
      )
      .subscribe();
  };

  const cleanupSubscriptions = () => {
    if (quoteChannelRef.current) {
      supabase.removeChannel(quoteChannelRef.current);
      quoteChannelRef.current = null;
    }
    if (intakeChannelRef.current) {
      supabase.removeChannel(intakeChannelRef.current);
      intakeChannelRef.current = null;
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

  const startTimeoutCheck = () => {
    timeoutTimerRef.current = setTimeout(() => {
      if (isProcessing && !quote?.line_items?.length) {
        console.warn('[ReviewDraft] Processing timeout detected after 30 seconds');
        setProcessingTimeout(true);
        setIsProcessing(false);
        stopStatusRotation();
      }
    }, 30000);
  };

  const stopTimeoutCheck = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
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
  const extractionData = intake?.extraction_json;
  const scopeOfWork = quote?.scope_of_work || [];

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
        {processingTimeout && (
          <Card className="bg-yellow-50 border-yellow-200">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-yellow-900">Processing is taking longer than expected</p>
              <p className="text-xs text-yellow-700">
                This can happen with longer recordings or complex jobs. Check the browser console for details.
              </p>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
                className="mt-2"
              >
                Refresh Page
              </Button>
            </div>
          </Card>
        )}
        {isStillProcessing && showChecklist && !processingTimeout && (
          <div className={`py-2 ${checklistFadingOut ? 'animate-fade-slide-out' : ''}`}>
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

        {scopeOfWork.length > 0 && (
          <Card>
            <h3 className="font-semibold text-primary mb-3">Scope of Work</h3>
            <ul className="space-y-2">
              {scopeOfWork.map((item: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-brand mt-1">•</span>
                  <span className="text-secondary flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h3 className="font-semibold text-primary mb-3">Labour</h3>
          {!hasLineItems && !extractionData?.time?.labour_entries ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : !hasLineItems && extractionData?.time?.labour_entries ? (
            <div className="space-y-3">
              {extractionData.time.labour_entries.map((entry: any, idx: number) => {
                const hours = entry.hours?.value || entry.hours;
                const days = entry.days?.value || entry.days;
                const people = entry.people?.value || entry.people || 1;

                let timeDescription = '';
                if (hours) {
                  timeDescription = `${hours * people} hours`;
                } else if (days) {
                  timeDescription = `${days * people} days`;
                }

                return (
                  <div
                    key={idx}
                    className="pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className="font-medium text-primary flex-1 min-w-0">{entry.description}</span>
                      <span className="text-sm text-tertiary flex-shrink-0 italic">Pricing...</span>
                    </div>
                    {timeDescription && (
                      <div className="text-sm text-secondary">{timeDescription}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : hasLineItems ? (
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
          ) : (
            <p className="text-sm text-tertiary">No labour items</p>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-primary mb-3">Materials</h3>
          {!hasLineItems && !extractionData?.materials?.items ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : !hasLineItems && extractionData?.materials?.items ? (
            <div className="space-y-3">
              {extractionData.materials.items.map((item: any, idx: number) => {
                const quantity = item.quantity?.value || item.quantity;
                const unit = item.unit?.value || item.unit;

                return (
                  <div
                    key={idx}
                    className="pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className="font-medium text-primary flex-1 min-w-0">{item.description}</span>
                      <span className="text-sm text-tertiary flex-shrink-0 italic">Pricing...</span>
                    </div>
                    {(quantity || unit) && (
                      <div className="text-sm text-secondary">
                        {quantity && `${quantity} `}{unit && unit}
                      </div>
                    )}
                    {item.notes && (
                      <p className="mt-1 text-xs text-secondary italic">{item.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : hasLineItems ? (
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
          ) : (
            <p className="text-sm text-tertiary">No materials</p>
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
