import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CreateCustomerRequest {
  org_id: string;
  customer_id: string;
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

    const { org_id, customer_id } = await req.json() as CreateCustomerRequest;

    if (!org_id || !customer_id) {
      return new Response(
        JSON.stringify({ error: 'org_id and customer_id are required' }),
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
      .eq('entity_type', 'customer')
      .eq('local_id', customer_id)
      .maybeSingle();

    if (existingMapping) {
      return new Response(
        JSON.stringify({ error: 'Customer already mapped to QuickBooks' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .eq('org_id', org_id)
      .single();

    if (customerError || !customer) {
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    const qbCustomerPayload: any = {
      DisplayName: customer.name,
    };

    if (customer.email) {
      qbCustomerPayload.PrimaryEmailAddr = {
        Address: customer.email,
      };
    }

    if (customer.phone) {
      qbCustomerPayload.PrimaryPhone = {
        FreeFormNumber: customer.phone,
      };
    }

    if (customer.company_name) {
      qbCustomerPayload.CompanyName = customer.company_name;
    }

    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';
    const baseUrl = environment === 'production'
      ? `https://quickbooks.api.intuit.com/v3/company/${connection.realm_id}`
      : `https://sandbox-quickbooks.api.intuit.com/v3/company/${connection.realm_id}`;

    const qbResponse = await fetch(`${baseUrl}/customer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(qbCustomerPayload),
    });

    if (!qbResponse.ok) {
      const errorText = await qbResponse.text();
      console.error('QuickBooks API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create customer in QuickBooks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qbData = await qbResponse.json();
    const qbCustomer = qbData.Customer;

    const { error: mappingError } = await supabase
      .from('integration_entity_map')
      .insert({
        org_id,
        provider: 'quickbooks',
        entity_type: 'customer',
        local_id: customer_id,
        external_id: qbCustomer.Id,
        sync_token: qbCustomer.SyncToken,
        sync_status: 'synced',
      });

    if (mappingError) {
      console.error('Failed to create mapping:', mappingError);
      return new Response(
        JSON.stringify({ error: 'Customer created but failed to create mapping' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        qb_customer_id: qbCustomer.Id,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in quickbooks-create-customer:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});