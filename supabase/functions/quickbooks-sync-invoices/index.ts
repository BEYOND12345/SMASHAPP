import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SyncRequest {
  org_id: string;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // FEATURE FLAG: QuickBooks integration disabled for MVP
    const integrationEnabled = Deno.env.get('ENABLE_QUICKBOOKS_INTEGRATION') === 'true';
    if (!integrationEnabled) {
      return new Response(
        JSON.stringify({
          error: 'QuickBooks integration is currently disabled',
          message: 'This feature is not available in the current release'
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { org_id } = await req.json() as SyncRequest;

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'org_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: connection, error: connError } = await supabase
      .from('qb_connections')
      .select('*')
      .eq('org_id', org_id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No active QuickBooks connection' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: accessToken, error: decryptError } = await supabase
      .rpc('decrypt_qb_token', { 
        encrypted_token: connection.access_token_encrypted, 
        org_id 
      });

    if (decryptError || !accessToken) {
      console.error('Failed to decrypt token:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt access token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';
    const baseUrl = environment === 'production'
      ? `https://quickbooks.api.intuit.com/v3/company/${connection.realm_id}`
      : `https://sandbox-quickbooks.api.intuit.com/v3/company/${connection.realm_id}`;

    const qbResponse = await fetch(`${baseUrl}/query?query=SELECT * FROM Invoice MAXRESULTS 100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!qbResponse.ok) {
      const errorText = await qbResponse.text();
      console.error('QuickBooks API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch invoices from QuickBooks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qbData = await qbResponse.json();
    const qbInvoices = qbData.QueryResponse?.Invoice || [];

    const { data: localInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, grand_total_cents, amount_paid_cents')
      .eq('org_id', org_id);

    const { data: existingMappings } = await supabase
      .from('integration_entity_map')
      .select('*')
      .eq('org_id', org_id)
      .eq('provider', 'quickbooks')
      .eq('entity_type', 'invoice');

    const mappingsByExternal = new Map(
      existingMappings?.map(m => [m.external_id, m]) || []
    );

    const mappingsByLocal = new Map(
      existingMappings?.map(m => [m.local_id, m]) || []
    );

    let matched = 0;
    let newMappings = 0;
    let paymentUpdates = 0;
    let unmatched = 0;

    for (const qbInvoice of qbInvoices) {
      const qbId = qbInvoice.Id;
      const qbDocNumber = qbInvoice.DocNumber;
      const qbBalance = qbInvoice.Balance || 0;
      const qbTotal = qbInvoice.TotalAmt || 0;

      const existingMapping = mappingsByExternal.get(qbId);
      if (existingMapping) {
        matched++;

        if (qbBalance === 0 && qbTotal > 0) {
          const localInvoice = localInvoices?.find(inv => inv.id === existingMapping.local_id);
          if (localInvoice && localInvoice.amount_paid_cents < localInvoice.grand_total_cents) {
            await supabase
              .from('invoices')
              .update({
                amount_paid_cents: localInvoice.grand_total_cents,
                paid_at: new Date().toISOString(),
                status: 'paid',
              })
              .eq('id', existingMapping.local_id);
            paymentUpdates++;
          }
        }
        continue;
      }

      let matchedLocal = null;
      if (qbDocNumber) {
        matchedLocal = localInvoices?.find(
          inv => inv.invoice_number === qbDocNumber && !mappingsByLocal.has(inv.id)
        );
      }

      if (matchedLocal) {
        const { error: mappingError } = await supabase
          .from('integration_entity_map')
          .insert({
            org_id,
            provider: 'quickbooks',
            entity_type: 'invoice',
            local_id: matchedLocal.id,
            external_id: qbId,
            sync_token: qbInvoice.SyncToken,
            sync_status: 'synced',
          });

        if (!mappingError) {
          newMappings++;
          mappingsByLocal.set(matchedLocal.id, { external_id: qbId } as any);

          if (qbBalance === 0 && qbTotal > 0) {
            if (matchedLocal.amount_paid_cents < matchedLocal.grand_total_cents) {
              await supabase
                .from('invoices')
                .update({
                  amount_paid_cents: matchedLocal.grand_total_cents,
                  paid_at: new Date().toISOString(),
                  status: 'paid',
                })
                .eq('id', matchedLocal.id);
              paymentUpdates++;
            }
          }
        }
      } else {
        unmatched++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_qb_invoices: qbInvoices.length,
        already_matched: matched,
        new_mappings: newMappings,
        payment_updates: paymentUpdates,
        unmatched: unmatched,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in quickbooks-sync-invoices:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});