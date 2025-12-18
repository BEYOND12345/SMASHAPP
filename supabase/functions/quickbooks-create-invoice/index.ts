import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CreateInvoiceRequest {
  org_id: string;
  invoice_id: string;
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

    const { org_id, invoice_id } = await req.json() as CreateInvoiceRequest;

    if (!org_id || !invoice_id) {
      return new Response(
        JSON.stringify({ error: 'org_id and invoice_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: existingMapping } = await supabase
      .from('integration_entity_map')
      .select('*')
      .eq('org_id', org_id)
      .eq('provider', 'quickbooks')
      .eq('entity_type', 'invoice')
      .eq('local_id', invoice_id)
      .maybeSingle();

    if (existingMapping) {
      return new Response(
        JSON.stringify({ error: 'Invoice already mapped to QuickBooks' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, invoice_line_items(*)')
      .eq('id', invoice_id)
      .eq('org_id', org_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (invoice.status === 'draft') {
      return new Response(
        JSON.stringify({ error: 'Invoice must be issued before syncing to QuickBooks' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: customerMapping } = await supabase
      .from('integration_entity_map')
      .select('external_id')
      .eq('org_id', org_id)
      .eq('provider', 'quickbooks')
      .eq('entity_type', 'customer')
      .eq('local_id', invoice.customer_id)
      .eq('sync_status', 'synced')
      .maybeSingle();

    if (!customerMapping) {
      return new Response(
        JSON.stringify({ error: 'Customer must be synced to QuickBooks first' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const lineItems = invoice.invoice_line_items.map((item: any) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: item.line_total_cents / 100,
      Description: item.description,
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: item.unit_price_cents / 100,
      },
    }));

    const qbInvoicePayload: any = {
      CustomerRef: {
        value: customerMapping.external_id,
      },
      DocNumber: invoice.invoice_number,
      TxnDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
      DueDate: invoice.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Line: lineItems,
    };

    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';
    const baseUrl = environment === 'production'
      ? `https://quickbooks.api.intuit.com/v3/company/${connection.realm_id}`
      : `https://sandbox-quickbooks.api.intuit.com/v3/company/${connection.realm_id}`;

    const qbResponse = await fetch(`${baseUrl}/invoice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(qbInvoicePayload),
    });

    if (!qbResponse.ok) {
      const errorText = await qbResponse.text();
      console.error('QuickBooks API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create invoice in QuickBooks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qbData = await qbResponse.json();
    const qbInvoice = qbData.Invoice;

    const { error: mappingError } = await supabase
      .from('integration_entity_map')
      .insert({
        org_id,
        provider: 'quickbooks',
        entity_type: 'invoice',
        local_id: invoice_id,
        external_id: qbInvoice.Id,
        sync_token: qbInvoice.SyncToken,
        sync_status: 'synced',
      });

    if (mappingError) {
      console.error('Failed to create mapping:', mappingError);
      return new Response(
        JSON.stringify({ error: 'Invoice created but failed to create mapping' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        qb_invoice_id: qbInvoice.Id,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in quickbooks-create-invoice:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});