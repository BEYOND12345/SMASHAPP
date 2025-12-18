import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ConnectRequest {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { org_id } = await req.json() as ConnectRequest;

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'org_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user belongs to org and is owner
    const { data: userOrg, error: orgError } = await supabase
      .from('users')
      .select('org_id, role')
      .eq('id', user.id)
      .eq('org_id', org_id)
      .single();

    if (orgError || !userOrg || userOrg.role !== 'owner') {
      return new Response(
        JSON.stringify({ error: 'Only organization owners can connect QuickBooks' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate nonce for CSRF protection
    const nonce = crypto.randomUUID();

    // Store state in database
    const { error: stateError } = await supabase
      .from('qb_oauth_states')
      .insert({
        org_id,
        nonce,
      });

    if (stateError) {
      console.error('Failed to store OAuth state:', stateError);
      return new Response(
        JSON.stringify({ error: 'Failed to initiate OAuth flow' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // QuickBooks OAuth configuration
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const redirectUri = Deno.env.get('QUICKBOOKS_REDIRECT_URI');
    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';

    if (!clientId || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks OAuth not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Minimal scopes for read-only access initially
    const scopes = 'com.intuit.quickbooks.accounting';
    
    // Build authorization URL
    const baseUrl = environment === 'production' 
      ? 'https://appcenter.intuit.com/connect/oauth2'
      : 'https://appcenter.intuit.com/connect/oauth2';
    
    const state = `${org_id}:${nonce}`;
    
    const authUrl = `${baseUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${encodeURIComponent(state)}`;

    return new Response(
      JSON.stringify({ 
        auth_url: authUrl,
        state,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in quickbooks-connect:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});