import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface DisconnectRequest {
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

    const { org_id } = await req.json() as DisconnectRequest;

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'org_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: userOrg, error: orgError } = await supabase
      .from('users')
      .select('org_id, role')
      .eq('id', user.id)
      .eq('org_id', org_id)
      .single();

    if (orgError || !userOrg || userOrg.role !== 'owner') {
      return new Response(
        JSON.stringify({ error: 'Only organization owners can disconnect QuickBooks' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateError } = await supabase
      .from('qb_connections')
      .update({
        is_active: false,
        access_token_encrypted: '',
        refresh_token_encrypted: '',
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', org_id);

    if (updateError) {
      console.error('Failed to disconnect:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to disconnect QuickBooks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'QuickBooks disconnected successfully' }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in quickbooks-disconnect:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});