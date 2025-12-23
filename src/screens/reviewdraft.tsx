import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { ArrowLeft, Loader2 } from 'lucide-react';
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

const STATUS_MESSAGES = [
  'Listening',
  'Understanding the job',
  'Matching materials',
  'Checking prices',
  'Locking totals',
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

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusIndexRef = useRef(0);
  const traceIdRef = useRef<string>('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const traceId = urlParams.get('trace_id') || '';
    traceIdRef.current = traceId;

    const now = Date.now();
    const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
    const renderTime = recordStopTime > 0 ? now - recordStopTime : 0;

    console.log(`[PERF] trace_id=${traceId} step=reviewdraft_mount intake_id=${intakeId} quote_id=${quoteId} ms=${renderTime}`);

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
      const quoteResult = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers(*),
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

      setQuote(quoteResult.data);
      setLoading(false);

      const hasLineItems = quoteResult.data.line_items && quoteResult.data.line_items.length > 0;

      if (hasLineItems) {
        setIsProcessing(false);
        stopPolling();
        stopStatusRotation();
        setStatusMessage('Quote ready');

        if (!firstRenderWithItemsLogged) {
          const now = Date.now();
          console.log(`[PERF] trace_id=${traceIdRef.current} step=first_render_with_real_items intake_id=${intakeId} quote_id=${quoteId} line_items_count=${quoteResult.data.line_items.length}`);
          setFirstRenderWithItemsLogged(true);
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
          title="Draft Quote"
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
        title="Draft Quote"
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
        {isStillProcessing && (
          <div className="text-center py-2">
            <p className="text-sm text-secondary font-medium">{statusMessage}</p>
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
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-primary">{item.description}</span>
                      <span className="font-semibold text-primary">
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
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-primary">{item.description}</span>
                      <span className="font-semibold text-primary">
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
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-primary">{item.description}</span>
                      <span className="font-semibold text-primary">
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

        <Card>
          <h3 className="font-semibold text-primary mb-3">Totals</h3>
          {!hasLineItems ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-secondary text-sm">Subtotal:</span>
                <span className="text-sm text-secondary">Calculating...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary text-sm">Tax:</span>
                <span className="text-sm text-secondary">Calculating...</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span className="text-primary">Total:</span>
                <span className="text-brand">Calculating...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Subtotal:</span>
                <span className="font-medium text-primary">
                  {formatCents(quote.subtotal_cents || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Tax:</span>
                <span className="font-medium text-primary">
                  {formatCents(quote.tax_cents || 0)}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span className="text-primary">Total:</span>
                <span className="text-brand">
                  {formatCents(quote.grand_total_cents || 0)}
                </span>
              </div>
            </div>
          )}
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
            disabled={!hasLineItems}
          >
            {hasLineItems ? 'Continue to Edit' : 'Building quote...'}
          </Button>
        </div>
      </div>
    </Layout>
  );
};
