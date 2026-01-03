import { SupabaseClient } from '@supabase/supabase-js';

export interface QuoteLineItem {
  id: string;
  quote_id: string;
  org_id: string;
  item_type: 'labour' | 'materials' | 'fee';
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  line_total_cents: number;
  position: number;
  catalog_item_id?: string | null;
  notes?: string | null;
  is_placeholder?: boolean;
  is_needs_review?: boolean;
  created_at?: string;
}

export interface FetchQuoteLineItemsOptions {
  orgId?: string;
}

export async function getQuoteLineItemsForQuote(
  supabase: SupabaseClient,
  quoteId: string,
  options: FetchQuoteLineItemsOptions = {}
): Promise<{ data: QuoteLineItem[] | null; error: any }> {
  console.log('[getQuoteLineItemsForQuote] Fetching line items', {
    quoteId,
    orgId: options.orgId || 'not specified (RLS will handle)',
  });

  let query = supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quoteId);

  query = query.order('position', { ascending: true });
  query = query.order('created_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('[getQuoteLineItemsForQuote] Query failed', {
      quoteId,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return { data: null, error };
  }

  console.log('[getQuoteLineItemsForQuote] Query successful', {
    quoteId,
    count: data?.length || 0,
    sample_org_ids: data?.slice(0, 3).map(item => item.org_id) || [],
  });

  return { data, error: null };
}
