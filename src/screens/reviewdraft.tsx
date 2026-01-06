import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { formatCents } from '../lib/utils/calculations';
import { ProgressChecklist, ChecklistItem } from '../components/progresschecklist';
import { ExtractionChecklist } from '../components/ExtractionChecklist';
import { getQuoteLineItemsForQuote, QuoteLineItem } from '../lib/data/quoteLineItems';
import type { RealtimeChannel } from '@supabase/supabase-js';

const DEBUG_MODE = true;
const debugLog = (...args: any[]) => { if (DEBUG_MODE) console.log(...args); };
const debugWarn = (...args: any[]) => { if (DEBUG_MODE) console.warn(...args); };
const debugGroupCollapsed = (...args: any[]) => { if (DEBUG_MODE) console.groupCollapsed(...args); };
const debugGroupEnd = () => { if (DEBUG_MODE) console.groupEnd(); };

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
  stage: string;
  created_quote_id?: string;
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
  debugLog('[ReviewDraft] COMPONENT MOUNTED WITH PROPS:', {
    quoteId,
    intakeId,
    quoteId_type: typeof quoteId,
    intakeId_type: typeof intakeId,
    quoteId_defined: !!quoteId,
    intakeId_defined: !!intakeId,
  });

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [intake, setIntake] = useState<IntakeData | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const effectiveQuoteId = intake?.created_quote_id || quoteId;

  console.log('[REVIEWDRAFT_DEBUG]', {
    intakeId,
    quoteIdFromParams: quoteId,
    'intake.created_quote_id': intake?.created_quote_id,
    effectiveQuoteId,
    lineItemsCount: lineItems.length
  });
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
  const [showSlowProcessingWarning, setShowSlowProcessingWarning] = useState(false);
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const [showPricingWarning, setShowPricingWarning] = useState(false);

  const quoteChannelRef = useRef<RealtimeChannel | null>(null);
  const lineItemsChannelRef = useRef<RealtimeChannel | null>(null);
  const intakeChannelRef = useRef<RealtimeChannel | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIndexRef = useRef(0);
  const traceIdRef = useRef<string>('');
  const mountTimeRef = useRef<number>(0);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
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

    debugGroupCollapsed(`[ReviewDraft] ${phase}`);
    debugLog('Diagnostic Info:', diagnosticInfo);
    debugGroupEnd();
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      console.log('[ReviewDraft] session exists:', !!data.session);
    });

    if (!quoteId || typeof quoteId !== 'string' || quoteId.trim() === '') {
      const errorMsg = 'Invalid quoteId prop';
      console.error('[ReviewDraft] Props validation failed:', errorMsg);
      setError(errorMsg);
      setLoading(false);
      return;
    }

    if (!intakeId || typeof intakeId !== 'string' || intakeId.trim() === '') {
      const errorMsg = 'Invalid intakeId prop';
      console.error('[ReviewDraft] Props validation failed:', errorMsg);
      setError(errorMsg);
      setLoading(false);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const traceId = urlParams.get('trace_id') || '';
    traceIdRef.current = traceId;
    mountTimeRef.current = Date.now();

    const now = Date.now();
    const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
    const renderTime = recordStopTime > 0 ? now - recordStopTime : 0;

    debugWarn(`[PERF] trace_id=${traceId} step=reviewdraft_mount intake_id=${intakeId} quote_id=${quoteId} total_ms=${renderTime}`);

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

  useEffect(() => {
    const findJob = async () => {
      if (!intakeId) return;

      console.log('[ReviewDraft] Looking up job for intake:', intakeId);

      const { data: job, error } = await supabase
        .from('quote_generation_jobs')
        .select('id, status, progress_percent')
        .eq('intake_id', intakeId)
        .maybeSingle();

      if (error) {
        console.error('[ReviewDraft] Failed to lookup job:', error);
        return;
      }

      if (job) {
        console.log('[ReviewDraft] Found job:', job.id, 'with progress:', job.progress_percent);
        setJobId(job.id);
      } else {
        console.log('[ReviewDraft] No job found yet for intake:', intakeId);
      }
    };

    findJob();

    const checkInterval = setInterval(() => {
      if (!jobId) {
        findJob();
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [intakeId, jobId]);

  useEffect(() => {
    if (!intake?.created_quote_id) return;
    if (intake.created_quote_id === quoteId) return;

    console.log('[REVIEWDRAFT] created_quote_id arrived, switching to:', intake.created_quote_id);

    const refetchWithNewQuoteId = async () => {
      debugLog('[ReviewDraft] FETCHING QUOTE with effectiveQuoteId:', intake.created_quote_id);
      const quoteResult = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers!customer_id(name)
        `)
        .eq('id', intake.created_quote_id)
        .maybeSingle();

      if (quoteResult.data) {
        setQuote(quoteResult.data);
      }

      const lineItemsResult = await getQuoteLineItemsForQuote(supabase, intake.created_quote_id);
      if (lineItemsResult.data) {
        setLineItems(lineItemsResult.data);
        updateChecklistFromActualData(quoteResult.data || quote!, lineItemsResult.data, intake);
      }
    };

    refetchWithNewQuoteId();

    cleanupSubscriptions();
    setupRealtimeSubscriptions();
  }, [intake?.created_quote_id]);

  const loadAllData = async () => {
    try {
      const startTime = Date.now();

      debugLog('[ReviewDraft] FETCHING INTAKE with id:', intakeId);
      const intakeResult = await supabase
        .from('voice_intakes')
        .select('*')
        .eq('id', intakeId)
        .maybeSingle();

      debugLog('[ReviewDraft] INTAKE FETCH RESULT:', {
        has_data: !!intakeResult.data,
        has_error: !!intakeResult.error,
        error: intakeResult.error,
        data_stage: intakeResult.data?.stage,
        data_status: intakeResult.data?.status,
        data_created_quote_id: intakeResult.data?.created_quote_id,
      });

      if (intakeResult.error) {
        console.error('[ReviewDraft] Intake load error:', intakeResult.error);
        setError('Failed to load voice intake');
        stopRefreshPolling();
        stopStatusRotation();
        stopTimeoutCheck();
        cleanupSubscriptions();
        setLoading(false);
        return;
      }

      if (!intakeResult.data) {
        console.error('[ReviewDraft] Intake not found for id:', intakeId);
        setError('Voice intake not found');
        stopRefreshPolling();
        stopStatusRotation();
        stopTimeoutCheck();
        cleanupSubscriptions();
        setLoading(false);
        return;
      }

      const loadedIntake = intakeResult.data;
      const determinedEffectiveQuoteId = loadedIntake.created_quote_id || quoteId;

      debugLog('[ReviewDraft] DETERMINED effectiveQuoteId:', {
        from_intake: loadedIntake.created_quote_id,
        from_params: quoteId,
        effective: determinedEffectiveQuoteId,
      });

      debugLog('[ReviewDraft] FETCHING QUOTE with effectiveQuoteId:', determinedEffectiveQuoteId);
      const quoteResult = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers!customer_id(name)
        `)
        .eq('id', determinedEffectiveQuoteId)
        .maybeSingle();

      debugLog('[ReviewDraft] QUOTE FETCH RESULT:', {
        has_data: !!quoteResult.data,
        has_error: !!quoteResult.error,
        error: quoteResult.error,
        data_title: quoteResult.data?.title,
        data_id: quoteResult.data?.id,
      });

      if (quoteResult.error) {
        console.error('[ReviewDraft] Quote load error:', quoteResult.error);
        setError('Failed to load quote');
        stopRefreshPolling();
        stopStatusRotation();
        stopTimeoutCheck();
        cleanupSubscriptions();
        setLoading(false);
        return;
      }

      if (!quoteResult.data) {
        console.error('[ReviewDraft] Quote not found');
        setError('Quote not found');
        stopRefreshPolling();
        stopStatusRotation();
        stopTimeoutCheck();
        cleanupSubscriptions();
        setLoading(false);
        return;
      }

      const lineItemsResult = await getQuoteLineItemsForQuote(supabase, determinedEffectiveQuoteId);

      if (lineItemsResult.error) {
        console.error('[ReviewDraft] Line items load error:', lineItemsResult.error);
      }

      const { data: { user } } = await supabase.auth.getUser();

      logDiagnostics('DATA_LOADED', {
        quote_org_id: quoteResult.data.org_id,
        user_id: user?.id,
        effective_quote_id: determinedEffectiveQuoteId,
        quote_id_from_params: quoteId,
        intake_created_quote_id: loadedIntake.created_quote_id,
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

      debugLog('[ReviewDraft] SETTING STATE with data:', {
        quote_title: quoteResult.data.title,
        quote_id: quoteResult.data.id,
        effective_quote_id: determinedEffectiveQuoteId,
        intake_stage: loadedIntake.stage,
        intake_status: loadedIntake.status,
        intake_created_quote_id: loadedIntake.created_quote_id,
        line_items_count: lineItemsResult.data?.length || 0,
        real_items: lineItemsResult.data?.filter(item => !item.is_placeholder).length || 0,
      });

      setQuote(quoteResult.data);
      setLineItems(lineItemsResult.data || []);
      setIntake(loadedIntake);
      updateChecklistFromActualData(quoteResult.data, lineItemsResult.data || [], loadedIntake);
      setLoading(false);

      const hasRealItems = lineItemsResult.data && lineItemsResult.data.length > 0 &&
        lineItemsResult.data.some(item => !item.is_placeholder);
      const realItemsCount = lineItemsResult.data?.filter(item => !item.is_placeholder).length || 0;
      const isDraftDone = loadedIntake.stage === 'draft_done';
      const hasCreatedQuoteId = !!loadedIntake.created_quote_id;

      debugLog('[ReviewDraft] INITIAL LOAD CHECK:', {
        quote_id_from_params: quoteId,
        effective_quote_id: determinedEffectiveQuoteId,
        intake_id: intakeId,
        intake_stage: loadedIntake.stage,
        intake_status: loadedIntake.status,
        intake_created_quote_id: loadedIntake.created_quote_id,
        total_line_items: lineItemsResult.data?.length || 0,
        real_line_items: realItemsCount,
        has_real_items: hasRealItems,
        is_draft_done: isDraftDone,
        has_created_quote_id: hasCreatedQuoteId,
        should_complete: isDraftDone && hasCreatedQuoteId,
      });

      if (isDraftDone && hasCreatedQuoteId) {
        debugLog('[ReviewDraft] PROCESSING COMPLETE ON MOUNT - Conditions met:', {
          effective_quote_id: determinedEffectiveQuoteId,
          intake_stage: loadedIntake.stage,
          intake_created_quote_id: loadedIntake.created_quote_id,
          real_items_count: realItemsCount,
          reason: 'draft_done stage + created_quote_id present',
        });
        markProcessingComplete();
      }
    } catch (err) {
      console.error('[ReviewDraft] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      stopRefreshPolling();
      stopStatusRotation();
      stopTimeoutCheck();
      cleanupSubscriptions();
      setLoading(false);
    }
  };

  const refreshLineItems = async () => {
    debugLog('[ReviewDraft] REFRESH: Starting refresh cycle', {
      current_line_items: lineItems.length,
      current_stage: intake?.stage,
      current_effective_quote_id: effectiveQuoteId,
    });

    debugLog('[ReviewDraft] REFRESH: Fetching intake with id:', intakeId);
    const intakeResult = await supabase
      .from('voice_intakes')
      .select('*')
      .eq('id', intakeId)
      .maybeSingle();

    debugLog('[ReviewDraft] REFRESH: Intake fetch result:', {
      has_data: !!intakeResult.data,
      has_error: !!intakeResult.error,
      error: intakeResult.error,
      data_stage: intakeResult.data?.stage,
      data_created_quote_id: intakeResult.data?.created_quote_id,
    });

    if (intakeResult.error) {
      console.error('[ReviewDraft] Refresh intake error:', intakeResult.error);
      return false;
    }

    const currentIntake = intakeResult.data || intake;
    const currentEffectiveQuoteId = currentIntake?.created_quote_id || quoteId;

    debugLog('[ReviewDraft] REFRESH: Using effectiveQuoteId:', currentEffectiveQuoteId);

    const lineItemsResult = await getQuoteLineItemsForQuote(supabase, currentEffectiveQuoteId);
    debugLog('[ReviewDraft] REFRESH: Line items result:', {
      has_data: !!lineItemsResult.data,
      has_error: !!lineItemsResult.error,
      count: lineItemsResult.data?.length || 0,
    });

    const isDraftDone = currentIntake?.stage === 'draft_done';
    const hasCreatedQuoteId = !!currentIntake?.created_quote_id;
    const hasLineItems = lineItemsResult.data && lineItemsResult.data.length > 0;
    const hasRealItems = hasLineItems && lineItemsResult.data.some(item => !item.is_placeholder);
    const realItemsCount = hasLineItems ? lineItemsResult.data.filter(item => !item.is_placeholder).length : 0;

    debugLog('[ReviewDraft] REFRESH CHECK:', {
      quote_id_from_params: quoteId,
      effective_quote_id: currentEffectiveQuoteId,
      intake_id: intakeId,
      intake_stage: currentIntake?.stage,
      intake_status: currentIntake?.status,
      intake_created_quote_id: currentIntake?.created_quote_id,
      total_line_items: lineItemsResult.data?.length || 0,
      real_line_items: realItemsCount,
      has_real_items: hasRealItems,
      is_draft_done: isDraftDone,
      has_created_quote_id: hasCreatedQuoteId,
      should_complete: isDraftDone && hasCreatedQuoteId,
    });

    if (lineItemsResult.error) {
      console.error('[ReviewDraft] REFRESH: Line items query failed:', {
        error: lineItemsResult.error,
        message: lineItemsResult.error.message,
        code: lineItemsResult.error.code,
      });

      if (lineItemsResult.error.code === '42501' || lineItemsResult.error.message?.includes('permission')) {
        setError('Access denied to line items. Please contact support.');
        stopRefreshPolling();
        stopStatusRotation();
        stopTimeoutCheck();
        return false;
      }
    }

    logDiagnostics('REFRESH_SUCCESS', {
      attempt: refreshAttempts + 1,
      items_found: lineItemsResult.data?.length || 0,
      real_items: realItemsCount,
      intake_stage: currentIntake?.stage,
      has_created_quote_id: hasCreatedQuoteId,
      should_complete: isDraftDone && hasCreatedQuoteId,
    });

    setLineItems(lineItemsResult.data || []);
    setIntake(currentIntake);

    if (quote) {
      updateChecklistFromActualData(quote, lineItemsResult.data || [], currentIntake);
    }

    if (isDraftDone && hasCreatedQuoteId) {
      debugLog('[ReviewDraft] PROCESSING COMPLETE - Conditions met:', {
        effective_quote_id: currentEffectiveQuoteId,
        intake_stage: currentIntake?.stage,
        intake_created_quote_id: currentIntake?.created_quote_id,
        real_items_count: realItemsCount,
        has_line_items: hasLineItems,
        reason: 'draft_done stage + created_quote_id present',
      });
      markProcessingComplete();

      if (!hasLineItems) {
        debugLog('[REVIEWDRAFT_POLL] trace_id=' + traceIdRef.current + ' reason=waiting_for_line_items count=0');
      } else {
        setRefreshAttempts(0);
      }
      return true;
    }

    debugLog('[REVIEWDRAFT_POLL] trace_id=' + traceIdRef.current + ' reason=' +
      (!isDraftDone ? 'stage_not_draft_done' : !hasCreatedQuoteId ? 'no_created_quote_id' : 'unknown') +
      ' stage=' + currentIntake?.stage + ' count=' + (lineItemsResult.data?.length || 0));

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

      debugWarn(`[PERF] trace_id=${traceIdRef.current} step=first_render_with_real_items intake_id=${intakeId} quote_id=${quoteId} line_items_count=${items.length} total_ms=${totalTimeMs}`);
    }
  };

  const markProcessingComplete = () => {
    debugLog('[ReviewDraft] ✅ MARKING PROCESSING COMPLETE', {
      quote_id: quoteId,
      intake_id: intakeId,
      was_processing: processingStateRef.current.isActive,
      duration_ms: Date.now() - processingStateRef.current.startTime,
    });

    processingStateRef.current.isActive = false;
    setIsProcessing(false);
    stopStatusRotation();
    stopRefreshPolling();
    stopTimeoutCheck();
    setStatusMessage('Quote ready');
  };

  const startRefreshPolling = () => {
    stopRefreshPolling();

    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 30 attempts = 60 seconds
    const POLL_INTERVAL = 2000;

    refreshIntervalRef.current = setInterval(async () => {
      attempts++;
      setRefreshAttempts(attempts);

      try {
        const freshIntakeResult = await supabase
          .from('voice_intakes')
          .select('id, stage, status, created_quote_id')
          .eq('id', intakeId)
          .maybeSingle();

        if (freshIntakeResult.error || !freshIntakeResult.data) {
          console.error('[ReviewDraft] POLL: Failed to fetch intake', freshIntakeResult.error);
          return;
        }

        const freshIntake = freshIntakeResult.data;
        const freshStage = freshIntake.stage;
        const freshCreatedQuoteId = freshIntake.created_quote_id;
        const freshEffectiveQuoteId = freshCreatedQuoteId || quoteId;

        let freshLineItemsCount = 0;
        const lineItemsResult = await supabase
          .from('quote_line_items')
          .select('id', { count: 'exact', head: true })
          .eq('quote_id', freshEffectiveQuoteId);

        freshLineItemsCount = lineItemsResult.count || 0;

        let reason = 'unknown';
        if (freshStage !== 'draft_done') {
          reason = 'stage_not_draft_done';
        } else if (!freshCreatedQuoteId) {
          reason = 'no_created_quote_id';
        } else if (freshLineItemsCount === 0) {
          reason = 'waiting_for_line_items';
        }

        debugLog(`[REVIEWDRAFT_POLL] trace_id=${traceIdRef.current} reason=${reason} stage=${freshStage} quote_id=${freshCreatedQuoteId || 'null'} count=${freshLineItemsCount} attempt=${attempts}`);

        logDiagnostics('POLLING_ATTEMPT', {
          attempt: attempts,
          max_attempts: MAX_ATTEMPTS,
          elapsed_ms: Date.now() - processingStateRef.current.startTime,
          fresh_stage: freshStage,
          fresh_created_quote_id: freshCreatedQuoteId,
          fresh_line_items_count: freshLineItemsCount,
          reason: reason,
        });

        if (freshStage === 'draft_done' && freshCreatedQuoteId && freshLineItemsCount > 0) {
          debugLog('[ReviewDraft] Polling complete - all conditions met');
          await refreshLineItems();
          stopRefreshPolling();
          return;
        }

        await refreshLineItems();

        if (attempts >= MAX_ATTEMPTS) {
          debugWarn('[ReviewDraft] Polling complete after 60 seconds');
          stopRefreshPolling();
        }
      } catch (err) {
        console.error('[ReviewDraft] POLL: Exception during tick', err);
      }
    }, POLL_INTERVAL);
  };

  const stopRefreshPolling = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const debouncedRefresh = () => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }

    refreshDebounceRef.current = setTimeout(async () => {
      debugLog('[ReviewDraft] Executing debounced refresh');
      await refreshLineItems();
      refreshDebounceRef.current = null;
    }, 500);
  };

  const setupRealtimeSubscriptions = () => {
    const subscriptionQuoteId = effectiveQuoteId;

    debugLog('[REALTIME] Setting up subscriptions for effectiveQuoteId:', subscriptionQuoteId);

    quoteChannelRef.current = supabase
      .channel(`quote:${subscriptionQuoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quotes',
          filter: `id=eq.${subscriptionQuoteId}`
        },
        (payload) => {
          debugLog('[REALTIME] Quote updated:', payload.new);
          debouncedRefresh();
        }
      )
      .subscribe();

    lineItemsChannelRef.current = supabase
      .channel(`line_items:${subscriptionQuoteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quote_line_items',
          filter: `quote_id=eq.${subscriptionQuoteId}`
        },
        (payload) => {
          debugLog('[REALTIME] Line item inserted:', payload.new);
          debouncedRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quote_line_items',
          filter: `quote_id=eq.${subscriptionQuoteId}`
        },
        (payload) => {
          debugLog('[REALTIME] Line item updated:', payload.new);
          debouncedRefresh();
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
        (payload) => {
          debugLog('[REALTIME] Intake updated:', {
            stage: payload.new.stage,
            status: payload.new.status,
          });
          debouncedRefresh();
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
      if (processingStateRef.current.isActive) {
        debugWarn('[ReviewDraft] Processing taking longer than expected - 45 seconds elapsed', {
          has_line_items: lineItems.length > 0,
          intake_stage: intake?.stage,
        });

        logDiagnostics('SLOW_PROCESSING_WARNING', {
          refresh_attempts: refreshAttempts,
          processing_duration_ms: Date.now() - processingStateRef.current.startTime,
          line_items_count: lineItems.length,
        });

        setShowSlowProcessingWarning(true);
        // DON'T stop polling or processing - let it continue
        // DON'T set error - this is just informational
      }
    }, 45000);
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
        <div className="flex items-center justify-center h-full p-6">
          {jobId ? (
            <ExtractionChecklist jobId={jobId} />
          ) : (
            <div className="text-center">
              <Loader2 className="animate-spin text-brand mx-auto mb-4" size={40} />
              <p className="text-sm text-tertiary">Initializing quote processing...</p>
            </div>
          )}
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
            <div className="flex gap-2 justify-center">
              <Button onClick={onBack} variant="secondary">Go Back</Button>
              <Button onClick={() => {
                setError('');
                setLoading(true);
                loadAllData();
              }} disabled={loading}>
                {loading ? 'Retrying...' : 'Retry'}
              </Button>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  const hasLineItems = lineItems.length > 0;
  const extractionData = intake?.extraction_json;

  const customerName = quote?.customer?.name || extractionData?.customer?.name || null;
  const siteAddress = extractionData?.job?.site_address || null;
  const quoteTitle = quote?.title || 'Processing job';
  const estimatedDaysMin = extractionData?.job?.estimated_days_min || null;
  const estimatedDaysMax = extractionData?.job?.estimated_days_max || null;
  const jobDate = extractionData?.job?.job_date || null;

  const scopeOfWork = (() => {
    if (quote?.scope_of_work && Array.isArray(quote.scope_of_work) && quote.scope_of_work.length > 0) {
      return quote.scope_of_work;
    }
    if (quote?.scope_of_work && typeof quote.scope_of_work === 'string') {
      try {
        const parsed = JSON.parse(quote.scope_of_work);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // Ignore parse errors
      }
    }
    if (extractionData?.job?.scope_of_work && Array.isArray(extractionData.job.scope_of_work)) {
      return extractionData.job.scope_of_work;
    }
    return [];
  })();

  const extractionRequiresReview = intake?.status === 'needs_user_review' &&
    extractionData?.quality?.requires_user_confirmation === true;

  const hasRequiredFieldsMissing = intake?.extraction_json?.missing_fields?.some(
    (field: any) => field.severity === 'required'
  );

  const shouldShowIncompleteWarning = extractionRequiresReview || hasRequiredFieldsMissing;

  const labourItems = lineItems.filter(item => item.item_type === 'labour');
  const materialItems = lineItems.filter(item => item.item_type === 'materials');
  const feeItems = lineItems.filter(item => item.item_type === 'fee');

  debugLog('[ReviewDraft] LINE ITEMS IN RENDER:', {
    total_count: lineItems.length,
    labour_count: labourItems.length,
    material_count: materialItems.length,
    labour_items: labourItems.map(item => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price_cents: item.unit_price_cents,
      is_placeholder: item.is_placeholder,
      is_needs_review: item.is_needs_review,
    })),
  });

  const hasOnlyPlaceholders = hasLineItems && lineItems.every(item => item.is_placeholder);
  const hasRealItems = hasLineItems && lineItems.some(item => !item.is_placeholder);
  const hasSomePlaceholders = hasLineItems && lineItems.some(item => item.is_placeholder);

  const isDraftComplete = intake?.stage === 'draft_done' && intake?.created_quote_id != null;

  debugLog('[ReviewDraft] RENDER STATE:', {
    intake_stage: intake?.stage,
    intake_status: intake?.status,
    intake_created_quote_id: intake?.created_quote_id,
    has_line_items: hasLineItems,
    has_real_items: hasRealItems,
    is_draft_complete: isDraftComplete,
    is_processing_state: isProcessing,
    show_slow_processing_warning: showSlowProcessingWarning,
  });

  const showProcessingState = !isDraftComplete && (
    intake?.stage === 'draft_started' ||
    intake?.stage === 'extract_done' ||
    intake?.stage === 'extracting' ||
    isProcessing
  );

  const isStillProcessing = showProcessingState;

  const showPlaceholderWarning = (
    isDraftComplete &&
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

        {jobId && isProcessing && (
          <ExtractionChecklist jobId={jobId} />
        )}

        {showProcessingState && (
          <Card className="bg-blue-50 border-blue-200 transition-all duration-300 ease-out">
            <div className="flex items-start gap-3">
              <Loader2 size={20} className="text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Processing your quote
                </p>
                <p className="text-xs text-blue-700">
                  Materials are estimates. Please check details below.
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
                  Please add pricing in the next step.
                </p>
              </div>
            </div>
          </Card>
        )}

        {showSlowProcessingWarning && !isDraftComplete && (
          <Card className="bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Loader2 size={20} className="text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Still processing your quote
                </p>
                <p className="text-xs text-blue-700">
                  {hasLineItems
                    ? 'Taking longer than usual. You can continue editing now, or wait for all details to appear.'
                    : 'Processing is taking longer than expected. New details will appear automatically when ready, or you can continue to add them manually.'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {isStillProcessing && showChecklist && !showSlowProcessingWarning && (
          <div className={`py-2 ${checklistFadingOut ? 'animate-fade-slide-out' : ''}`}>
            <ProgressChecklist items={checklistItems} className="max-w-xs mx-auto" />
            {refreshAttempts > 0 && (
              <p className="text-xs text-tertiary text-center mt-2">
                Loading details... (attempt {refreshAttempts}/30)
              </p>
            )}
          </div>
        )}

        <Card className="transition-all duration-300 ease-out">
          <h3 className="font-semibold text-primary mb-3">Job Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-secondary">Title:</span>
              {!quote || (isStillProcessing && quoteTitle === 'Processing job') ? (
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
            {siteAddress && (
              <div className="flex justify-between">
                <span className="text-secondary">Site:</span>
                <span className="font-medium text-primary">{siteAddress}</span>
              </div>
            )}
            {(estimatedDaysMin || estimatedDaysMax) && (
              <div className="flex justify-between">
                <span className="text-secondary">Timeframe:</span>
                <span className="font-medium text-primary">
                  {estimatedDaysMin && estimatedDaysMax && estimatedDaysMin !== estimatedDaysMax
                    ? `${estimatedDaysMin}-${estimatedDaysMax} days`
                    : `${estimatedDaysMax || estimatedDaysMin} days`}
                </span>
              </div>
            )}
            {jobDate && (
              <div className="flex justify-between">
                <span className="text-secondary">Start Date:</span>
                <span className="font-medium text-primary">{jobDate}</span>
              </div>
            )}
          </div>
        </Card>

        {scopeOfWork.length > 0 && (
          <Card>
            <h3 className="font-semibold text-primary mb-3">Scope of Work</h3>
            <ul className="space-y-2">
              {scopeOfWork.map((item: any, idx: number) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-brand mt-1">•</span>
                  <span className="text-secondary flex-1">{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="transition-all duration-300 ease-out">
          <h3 className="font-semibold text-primary mb-3">Labour</h3>
          {!hasLineItems && !extractionData?.time?.labour_entries && isStillProcessing ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : !hasLineItems && !isStillProcessing && isDraftComplete ? (
            <div className="py-4 text-center">
              <p className="text-sm text-tertiary italic">Waiting for items...</p>
            </div>
          ) : !hasLineItems && extractionData?.time?.labour_entries ? (
            <div className="space-y-3">
              {extractionData.time.labour_entries.map((entry: any, idx: number) => {
                const hours = typeof entry.hours === 'object' ? entry.hours?.value : entry.hours;
                const days = typeof entry.days === 'object' ? entry.days?.value : entry.days;
                const people = typeof entry.people === 'object' ? entry.people?.value : entry.people;
                const peopleCount = people || 1;

                let timeDescription = '';
                if (hours !== null && hours !== undefined) {
                  timeDescription = `${hours * peopleCount} hours`;
                } else if (days !== null && days !== undefined) {
                  timeDescription = `${days * peopleCount} days`;
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
                const quantity = typeof item.quantity === 'object' ? (item.quantity as any)?.value : item.quantity;
                const unit = typeof item.unit === 'object' ? (item.unit as any)?.value : item.unit;
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
                      {quantity} {unit} × {formatCents(item.unit_price_cents)}
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

        <Card className="transition-all duration-300 ease-out">
          <h3 className="font-semibold text-primary mb-3">Materials</h3>
          {!hasLineItems && !extractionData?.materials?.items && isStillProcessing ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : !hasLineItems && !isStillProcessing && isDraftComplete ? (
            <div className="py-4 text-center">
              <p className="text-sm text-tertiary italic">Waiting for items...</p>
            </div>
          ) : !hasLineItems && extractionData?.materials?.items ? (
            <div className="space-y-3">
              {extractionData.materials.items.map((item: any, idx: number) => {
                const quantity = typeof item.quantity === 'object' ? item.quantity?.value : item.quantity;
                const unit = typeof item.unit === 'object' ? item.unit?.value : item.unit;

                return (
                  <div
                    key={idx}
                    className="pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-1 gap-3">
                      <span className="font-medium text-primary flex-1 min-w-0">{item.description}</span>
                      <span className="text-sm text-tertiary flex-shrink-0 italic">Pricing...</span>
                    </div>
                    {(quantity !== null && quantity !== undefined) || unit ? (
                      <div className="text-sm text-secondary">
                        {quantity !== null && quantity !== undefined && `${quantity} `}{unit && String(unit)}
                      </div>
                    ) : null}
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
                const quantity = typeof item.quantity === 'object' ? (item.quantity as any)?.value : item.quantity;
                const unit = typeof item.unit === 'object' ? (item.unit as any)?.value : item.unit;

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
                      {quantity} {unit} × {formatCents(item.unit_price_cents)}
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

        {(feeItems.some(item => item.description?.toLowerCase().includes('callout')) || !hasLineItems) && (
          <Card>
            <h3 className="font-semibold text-primary mb-3">Call-out Fee</h3>
            {!hasLineItems ? (
              <div className="space-y-3">
                <SkeletonRow />
              </div>
            ) : (
              <div className="space-y-3">
                {feeItems.filter(item => item.description?.toLowerCase().includes('callout')).map((item) => {
                  const quantity = typeof item.quantity === 'object' ? (item.quantity as any)?.value : item.quantity;
                  const unit = typeof item.unit === 'object' ? (item.unit as any)?.value : item.unit;
                  return (
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
                      {quantity && unit && item.unit_price_cents && (
                        <div className="text-sm text-secondary">
                          {quantity} {unit} × {formatCents(item.unit_price_cents)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {feeItems.filter(item => item.description?.toLowerCase().includes('callout')).length === 0 && (
                  <p className="text-sm text-tertiary">No call-out fee</p>
                )}
              </div>
            )}
          </Card>
        )}

        {(feeItems.some(item => item.description?.toLowerCase().includes('travel')) || !hasLineItems) && (
          <Card>
            <h3 className="font-semibold text-primary mb-3">Travel Time</h3>
            {!hasLineItems ? (
              <div className="space-y-3">
                <SkeletonRow />
              </div>
            ) : (
              <div className="space-y-3">
                {feeItems.filter(item => item.description?.toLowerCase().includes('travel')).map((item) => {
                  const quantity = typeof item.quantity === 'object' ? (item.quantity as any)?.value : item.quantity;
                  const unit = typeof item.unit === 'object' ? (item.unit as any)?.value : item.unit;
                  return (
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
                      {quantity && unit && item.unit_price_cents && (
                        <div className="text-sm text-secondary">
                          {quantity} {unit} × {formatCents(item.unit_price_cents)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {feeItems.filter(item => item.description?.toLowerCase().includes('travel')).length === 0 && (
                  <p className="text-sm text-tertiary">No travel time</p>
                )}
              </div>
            )}
          </Card>
        )}

        {(feeItems.some(item => item.description?.toLowerCase().includes('material')) || !hasLineItems) && (
          <Card>
            <h3 className="font-semibold text-primary mb-3">Materials Collection</h3>
            {!hasLineItems ? (
              <div className="space-y-3">
                <SkeletonRow />
              </div>
            ) : (
              <div className="space-y-3">
                {feeItems.filter(item => item.description?.toLowerCase().includes('material')).map((item) => {
                  const quantity = typeof item.quantity === 'object' ? (item.quantity as any)?.value : item.quantity;
                  const unit = typeof item.unit === 'object' ? (item.unit as any)?.value : item.unit;
                  return (
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
                      {quantity && unit && item.unit_price_cents && (
                        <div className="text-sm text-secondary">
                          {quantity} {unit} × {formatCents(item.unit_price_cents)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {feeItems.filter(item => item.description?.toLowerCase().includes('material')).length === 0 && (
                  <p className="text-sm text-tertiary">No materials collection fee</p>
                )}
              </div>
            )}
          </Card>
        )}

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
            onClick={() => onContinue(effectiveQuoteId)}
            className="flex-1"
            disabled={!effectiveQuoteId}
          >
            {isDraftComplete && hasLineItems
              ? 'Review and Edit Quote'
              : showSlowProcessingWarning || hasLineItems
              ? 'Continue with Current Details'
              : 'Processing...'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};
