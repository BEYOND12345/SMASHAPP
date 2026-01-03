import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { formatCents } from '../lib/utils/calculations';
import { ProgressChecklist, ChecklistItem } from '../components/progresschecklist';
import { getQuoteLineItemsForQuote, QuoteLineItem } from '../lib/data/quoteLineItems';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ReviewDraftProps {
  quoteId: string;
  intakeId: string;
  onBack: () => void;
  onContinue: (quoteId: string) => void;
}

interface QuoteData {
  id: string;
  title: string;
  org_id: string;
  customer_id: string;
  subtotal_cents: number;
  tax_total_cents: number;
  grand_total_cents: number;
  scope_of_work: string[];
  customer?: {
    name?: string;
  };
}

interface IntakeData {
  id: string;
  status: string;
  extraction_json: any;
}

interface ProcessingState {
  isActive: boolean;
  startTime: number;
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
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [intake, setIntake] = useState<IntakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(true);
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[0]);
  const [error, setError] = useState('');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'job', label: 'Job identified', state: 'waiting' },
    { id: 'materials', label: 'Materials detected', state: 'waiting' },
    { id: 'labour', label: 'Labour detected', state: 'waiting' },
    { id: 'totals', label: 'Totals ready', state: 'waiting' },
  ]);
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklistFadingOut, setChecklistFadingOut] = useState(false);
  const [processingTimeout, setProcessingTimeout] = useState(false);
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const [showPricingWarning, setShowPricingWarning] = useState(false);

  const quoteChannelRef = useRef<RealtimeChannel | null>(null);
  const lineItemsChannelRef = useRef<RealtimeChannel | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIndexRef = useRef(0);
  const traceIdRef = useRef<string>('');
  const mountTimeRef = useRef<number>(0);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingStateRef = useRef<ProcessingState>({ isActive: true, startTime: Date.now() });

  const logDiagnostics = (phase: string, data: any) => {
    const diagnosticInfo = {
      phase,
      timestamp: new Date().toISOString(),
      trace_id: traceIdRef.current,
      quote_id: quoteId,
      intake_id: intakeId,
      ...data,
    };

    console.groupCollapsed(`[ReviewDraft] ${phase}`);
    console.log('Diagnostic Info:', diagnosticInfo);
    console.groupEnd();
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const traceId = urlParams.get('trace_id') || '';
    traceIdRef.current = traceId;
    mountTimeRef.current = Date.now();

    const now = Date.now();
    const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
    const renderTime = recordStopTime > 0 ? now - recordStopTime : 0;

    console.warn(`[PERF] trace_id=${traceId} step=reviewdraft_mount intake_id=${intakeId} quote_id=${quoteId} total_ms=${renderTime}`);

    supabase.auth.getUser().then(({ data }) => {
      logDiagnostics('MOUNT', {
        user_id: data?.user?.id,
        has_trace_id: !!traceId,
        render_time_ms: renderTime,
      });
    });

    loadAllData();
    setupRealtimeSubscriptions();
    startStatusRotation();
    startRefreshPolling();
    startTimeoutCheck();

    return () => {
      cleanupSubscriptions();
      stopStatusRotation();
      stopRefreshPolling();
      stopTimeoutCheck();
    };
  }, [quoteId, intakeId]);

  const loadAllData = async () => {
    try {
      const startTime = Date.now();

      const quoteResult = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers!customer_id(name)
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
        .select('*')
        .eq('id', intakeId)
        .maybeSingle();

      const lineItemsResult = await getQuoteLineItemsForQuote(supabase, quoteId);

      if (lineItemsResult.error) {
        console.error('[ReviewDraft] Line items load error:', lineItemsResult.error);
      }

      const { data: { user } } = await supabase.auth.getUser();

      logDiagnostics('DATA_LOADED', {
        quote_org_id: quoteResult.data.org_id,
        user_id: user?.id,
        line_items_count: lineItemsResult.data?.length || 0,
        line_items_query_error: lineItemsResult.error ? lineItemsResult.error.message : null,
        first_line_item: lineItemsResult.data?.[0] ? {
          id: lineItemsResult.data[0].id,
          quote_id: lineItemsResult.data[0].quote_id,
          org_id: lineItemsResult.data[0].org_id,
          item_type: lineItemsResult.data[0].item_type,
        } : null,
        load_duration_ms: Date.now() - startTime,
      });

      setQuote(quoteResult.data);
      setLineItems(lineItemsResult.data || []);
      setIntake(intakeResult.data);
      updateChecklistFromActualData(quoteResult.data, lineItemsResult.data || [], intakeResult.data);
      setLoading(false);

      const hasRealItems = lineItemsResult.data && lineItemsResult.data.length > 0 &&
        lineItemsResult.data.some(item => !item.is_placeholder);
      const isDraftDone = intakeResult.data?.stage === 'draft_done';

      if (hasRealItems && isDraftDone) {
        markProcessingComplete();
      }
    } catch (err) {
      console.error('[ReviewDraft] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setLoading(false);
    }
  };

  const refreshLineItems = async () => {
    const lineItemsResult = await getQuoteLineItemsForQuote(supabase, quoteId);

    if (lineItemsResult.data && lineItemsResult.data.length > 0) {
      logDiagnostics('REFRESH_SUCCESS', {
        attempt: refreshAttempts + 1,
        items_found: lineItemsResult.data.length,
      });

      setLineItems(lineItemsResult.data);
      setRefreshAttempts(0);

      if (quote) {
        updateChecklistFromActualData(quote, lineItemsResult.data, intake);
      }

      const hasRealItems = lineItemsResult.data.some(item => !item.is_placeholder);
      const isDraftDone = intake?.stage === 'draft_done';

      if (hasRealItems && isDraftDone) {
        markProcessingComplete();
      }
      return true;
    }

    return false;
  };

  const updateChecklistFromActualData = (
    quoteData: QuoteData,
    items: QuoteLineItem[],
    intakeData: IntakeData | null
  ) => {
    const hasLineItems = items.length > 0;
    const hasMaterials = items.some(item => item.item_type === 'materials');
    const hasLabour = items.some(item => item.item_type === 'labour');
    const hasJobDetails = quoteData.title && quoteData.title !== 'Processing job';
    const hasTotals = quoteData.subtotal_cents !== undefined && quoteData.subtotal_cents !== null;

    const needsPricing = items.some(item =>
      item.unit_price_cents === 0 ||
      item.notes?.toLowerCase().includes('needs pricing')
    );

    setShowPricingWarning(needsPricing);

    setChecklistItems((prev) => {
      const updated = [...prev];

      const jobItem = updated.find(i => i.id === 'job');
      if (jobItem) {
        jobItem.state = hasJobDetails ? 'complete' : 'waiting';
      }

      const materialsItem = updated.find(i => i.id === 'materials');
      if (materialsItem) {
        materialsItem.state = hasMaterials ? 'complete' : 'waiting';
      }

      const labourItem = updated.find(i => i.id === 'labour');
      if (labourItem) {
        labourItem.state = hasLabour ? 'complete' : 'waiting';
      }

      const totalsItem = updated.find(i => i.id === 'totals');
      if (totalsItem) {
        if (hasLineItems && hasTotals) {
          totalsItem.state = 'complete';
        } else if (hasLineItems) {
          totalsItem.state = 'in_progress';
        } else {
          totalsItem.state = 'waiting';
        }
      }

      return updated;
    });

    logDiagnostics('CHECKLIST_UPDATED', {
      has_line_items: hasLineItems,
      has_materials: hasMaterials,
      has_labour: hasLabour,
      has_job_details: hasJobDetails,
      has_totals: hasTotals,
      needs_pricing: needsPricing,
      line_items_count: items.length,
    });

    if (hasLineItems) {
      const now = Date.now();
      const urlParams = new URLSearchParams(window.location.search);
      const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
      const totalTimeMs = recordStopTime > 0 ? now - recordStopTime : 0;

      console.warn(`[PERF] trace_id=${traceIdRef.current} step=first_render_with_real_items intake_id=${intakeId} quote_id=${quoteId} line_items_count=${items.length} total_ms=${totalTimeMs}`);
    }
  };

  const markProcessingComplete = () => {
    processingStateRef.current.isActive = false;
    setIsProcessing(false);
    stopStatusRotation();
    stopRefreshPolling();
    stopTimeoutCheck();
    setStatusMessage('Quote ready');
  };

  const startRefreshPolling = () => {
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const POLL_INTERVAL = 1000;

    refreshIntervalRef.current = setInterval(async () => {
      if (!processingStateRef.current.isActive) {
        stopRefreshPolling();
        return;
      }

      if (lineItems.length > 0) {
        stopRefreshPolling();
        return;
      }

      attempts++;
      setRefreshAttempts(attempts);

      logDiagnostics('POLLING_ATTEMPT', {
        attempt: attempts,
        max_attempts: MAX_ATTEMPTS,
        elapsed_ms: Date.now() - processingStateRef.current.startTime,
      });

      const foundItems = await refreshLineItems();

      if (foundItems || attempts >= MAX_ATTEMPTS) {
        stopRefreshPolling();
      }
    }, POLL_INTERVAL);
  };

  const stopRefreshPolling = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
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
          await loadAllData();
        }
      )
      .subscribe();

    lineItemsChannelRef.current = supabase
      .channel(`line_items:${quoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quote_line_items',
          filter: `quote_id=eq.${quoteId}`
        },
        async (payload) => {
          console.log('[REALTIME] Line item inserted:', payload.new);
          await refreshLineItems();
        }
      )
      .subscribe();
  };

  const cleanupSubscriptions = () => {
    if (quoteChannelRef.current) {
      supabase.removeChannel(quoteChannelRef.current);
      quoteChannelRef.current = null;
    }
    if (lineItemsChannelRef.current) {
      supabase.removeChannel(lineItemsChannelRef.current);
      lineItemsChannelRef.current = null;
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
      if (processingStateRef.current.isActive && lineItems.length === 0) {
        console.warn('[ReviewDraft] Processing timeout - 10 seconds elapsed without line items');

        logDiagnostics('TIMEOUT', {
          refresh_attempts: refreshAttempts,
          processing_duration_ms: Date.now() - processingStateRef.current.startTime,
        });

        setProcessingTimeout(true);
        setIsProcessing(false);
        stopStatusRotation();
        stopRefreshPolling();
        setError('Could not extract job details with confidence. You can still proceed to edit the quote manually.');
      }
    }, 10000);
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

  const retryDraftCreation = async () => {
    setError('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-draft-quote`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ intake_id: intakeId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setError(`Retry failed: ${errorData.error || response.statusText}`);
        setLoading(false);
        return;
      }

      await loadAllData();
    } catch (err) {
      console.error('[ReviewDraft] Retry failed:', err);
      setError(err instanceof Error ? err.message : 'Retry failed');
      setLoading(false);
    }
  };

  if (intake?.stage === 'failed' && intake?.error_message) {
    return (
      <Layout showNav={false} className="bg-surface">
        <div className="flex items-center justify-center h-full p-6">
          <Card className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle size={32} className="text-red-600" />
            </div>
            <p className="text-lg font-semibold text-primary mb-2">Processing Failed</p>
            <p className="text-sm text-secondary mb-4">{intake.error_message}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={onBack} variant="secondary">Go Back</Button>
              <Button onClick={retryDraftCreation} disabled={loading}>
                {loading ? 'Retrying...' : 'Retry Draft Creation'}
              </Button>
            </div>
          </Card>
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

  const hasLineItems = lineItems.length > 0;
  const customerName = quote?.customer?.name || null;
  const quoteTitle = quote?.title || 'Processing job';
  const isStillProcessing = isProcessing || quoteTitle === 'Processing job';
  const extractionData = intake?.extraction_json;
  const scopeOfWork = quote?.scope_of_work || [];

  const extractionRequiresReview = intake?.status === 'needs_user_review' &&
    extractionData?.quality?.requires_user_confirmation === true;

  const hasRequiredFieldsMissing = intake?.extraction_json?.missing_fields?.some(
    (field: any) => field.severity === 'required'
  );

  const shouldShowIncompleteWarning = extractionRequiresReview || hasRequiredFieldsMissing;

  const labourItems = lineItems.filter(item => item.item_type === 'labour');
  const materialItems = lineItems.filter(item => item.item_type === 'materials');
  const feeItems = lineItems.filter(item => item.item_type === 'fee');

  const hasOnlyPlaceholders = hasLineItems && lineItems.every(item => item.is_placeholder);
  const hasSomePlaceholders = hasLineItems && lineItems.some(item => item.is_placeholder);

  const showProcessingState = (
    intake?.stage === 'draft_started' ||
    intake?.stage === 'extract_done' ||
    (hasLineItems && hasOnlyPlaceholders)
  );

  const showPlaceholderWarning = (
    intake?.stage === 'draft_done' &&
    hasSomePlaceholders
  );

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

        {showProcessingState && (
          <Card className="bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Loader2 size={20} className="text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Processing your quote
                </p>
                <p className="text-xs text-blue-700">
                  Extracting materials, calculating costs, and building line items. This usually takes 5-10 seconds.
                </p>
              </div>
            </div>
          </Card>
        )}

        {showPlaceholderWarning && !showProcessingState && (
          <Card className="bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">
                  Placeholder items detected
                </p>
                <p className="text-xs text-red-700 mb-2">
                  Some line items were not properly created from your voice recording. Rebuilding now...
                </p>
                <Button size="sm" onClick={retryDraftCreation} disabled={loading}>
                  {loading ? 'Rebuilding...' : 'Rebuild Quote'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {shouldShowIncompleteWarning && hasLineItems && !showProcessingState && (
          <Card className="bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-1 h-full bg-amber-400 rounded-full"></div>
              <div className="flex-1 py-1">
                <p className="text-sm font-medium text-amber-900 mb-1">
                  Requires review
                </p>
                <p className="text-xs text-amber-700">
                  {hasRequiredFieldsMissing
                    ? 'Some required fields are missing. Please review and update the details below.'
                    : 'Some details were extracted with low confidence. Please review the items below and make any necessary corrections.'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {showPricingWarning && hasLineItems && (
          <Card className="bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-1 h-full bg-blue-400 rounded-full"></div>
              <div className="flex-1 py-1">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Pricing needed
                </p>
                <p className="text-xs text-blue-700">
                  Some materials couldn't be matched to the catalog. You'll be able to add pricing in the next step.
                </p>
              </div>
            </div>
          </Card>
        )}

        {processingTimeout && (
          <Card className="bg-yellow-50 border-yellow-200">
            <div className="text-center space-y-3">
              <p className="text-sm font-medium text-yellow-900">
                {hasLineItems ? 'Processing is taking longer than expected' : 'Unable to extract details automatically'}
              </p>
              <p className="text-xs text-yellow-700">
                {hasLineItems
                  ? 'Some details may still be loading. You can continue or wait a moment and refresh.'
                  : 'The recording may not have contained clear job details. You can still create the quote manually in the next step.'}
              </p>
              <div className="flex gap-2 justify-center">
                {hasLineItems ? (
                  <Button
                    variant="secondary"
                    onClick={() => window.location.reload()}
                    className="mt-2"
                  >
                    Refresh Page
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={onBack}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => onContinue(quoteId)}
                    >
                      Continue to Edit
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        )}

        {isStillProcessing && showChecklist && !processingTimeout && (
          <div className={`py-2 ${checklistFadingOut ? 'animate-fade-slide-out' : ''}`}>
            <ProgressChecklist items={checklistItems} className="max-w-xs mx-auto" />
            {refreshAttempts > 0 && (
              <p className="text-xs text-tertiary text-center mt-2">
                Loading details... (attempt {refreshAttempts}/10)
              </p>
            )}
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
              {labourItems.map((item) => {
                const needsReview = item.is_needs_review || item.is_placeholder;
                return (
                  <div
                    key={item.id}
                    className={`pb-3 border-b border-border last:border-0 last:pb-0 ${needsReview ? 'bg-amber-50 -mx-4 px-4 py-3 rounded' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className={`font-medium flex-1 min-w-0 truncate ${needsReview ? 'text-amber-900' : 'text-primary'}`}>
                        {item.description}
                      </span>
                      <span className={`font-semibold flex-shrink-0 ${needsReview ? 'text-amber-700' : 'text-primary'}`}>
                        {formatCents(item.line_total_cents)}
                      </span>
                    </div>
                    <div className={`text-sm ${needsReview ? 'text-amber-600' : 'text-secondary'}`}>
                      {item.quantity} {item.unit} × {formatCents(item.unit_price_cents)}
                    </div>
                    {needsReview && (
                      <p className="mt-1 text-xs text-amber-700 font-medium">Needs estimation</p>
                    )}
                  </div>
                );
              })}
              {labourItems.length === 0 && (
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
              {materialItems.map((item) => {
                const needsPricing = item.unit_price_cents === 0 || item.notes?.toLowerCase().includes('needs pricing');
                const needsReview = item.is_needs_review || item.is_placeholder;
                const showWarning = needsPricing || needsReview;

                return (
                  <div
                    key={item.id}
                    className={`pb-3 border-b border-border last:border-0 last:pb-0 ${showWarning ? 'bg-amber-50 -mx-4 px-4 py-3 rounded' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className={`font-medium flex-1 min-w-0 truncate ${showWarning ? 'text-amber-900' : 'text-primary'}`}>
                        {item.description}
                      </span>
                      <span className={`font-semibold flex-shrink-0 ${showWarning ? 'text-amber-700' : 'text-primary'}`}>
                        {formatCents(item.line_total_cents)}
                      </span>
                    </div>
                    <div className={`text-sm ${showWarning ? 'text-amber-600' : 'text-secondary'}`}>
                      {item.quantity} {item.unit} × {formatCents(item.unit_price_cents)}
                    </div>
                    {needsPricing ? (
                      <p className="mt-1 text-xs text-amber-700 font-medium">Needs pricing</p>
                    ) : item.notes ? (
                      <p className="mt-1 text-xs text-secondary italic">{item.notes}</p>
                    ) : null}
                  </div>
                );
              })}
              {materialItems.length === 0 && (
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
              {feeItems.map((item) => (
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
              {feeItems.length === 0 && (
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
                  {formatCents(quote?.subtotal_cents || 0)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-tertiary">Tax:</span>
                <span className="text-secondary">
                  {formatCents(quote?.tax_total_cents || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-secondary">Total:</span>
                <span className="text-primary">
                  {formatCents(quote?.grand_total_cents || 0)}
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
            disabled={!hasLineItems && !processingTimeout}
          >
            {hasLineItems ? 'Confirm Job and Build Quote' : processingTimeout ? 'Continue to Edit' : 'Preparing details...'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};
