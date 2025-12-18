import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const realmId = url.searchParams.get('realmId');
    const error = url.searchParams.get('error');

    if (error) {
      return new Response(
        `<html><body><h1>Authorization Failed</h1><p>${error}</p><script>window.close()</script></body></html>`,
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    if (!code || !state || !realmId) {
      return new Response(
        '<html><body><h1>Invalid callback</h1><script>window.close()</script></body></html>',
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Parse state
    const [org_id, nonce] = state.split(':');
    if (!org_id || !nonce) {
      return new Response(
        '<html><body><h1>Invalid state</h1><script>window.close()</script></body></html>',
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Use service role to validate state and store tokens
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify state exists and is not expired
    const { data: stateData, error: stateError } = await supabase
      .from('qb_oauth_states')
      .select('*')
      .eq('org_id', org_id)
      .eq('nonce', nonce)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (stateError || !stateData) {
      return new Response(
        '<html><body><h1>Invalid or expired state</h1><script>window.close()</script></body></html>',
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Delete used state
    await supabase.from('qb_oauth_states').delete().eq('id', stateData.id);

    // Exchange code for tokens
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const redirectUri = Deno.env.get('QUICKBOOKS_REDIRECT_URI');
    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';

    if (!clientId || !clientSecret || !redirectUri) {
      return new Response(
        '<html><body><h1>Server configuration error</h1><script>window.close()</script></body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const tokenUrl = environment === 'production'
      ? 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(
        '<html><body><h1>Token exchange failed</h1><script>window.close()</script></body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Encrypt tokens
    const { data: encryptedAccess, error: encryptError1 } = await supabase
      .rpc('encrypt_qb_token', { token: access_token, org_id });

    const { data: encryptedRefresh, error: encryptError2 } = await supabase
      .rpc('encrypt_qb_token', { token: refresh_token, org_id });

    if (encryptError1 || encryptError2) {
      console.error('Encryption failed:', encryptError1, encryptError2);
      return new Response(
        '<html><body><h1>Failed to secure tokens</h1><script>window.close()</script></body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Upsert connection
    const { error: upsertError } = await supabase
      .from('qb_connections')
      .upsert({
        org_id,
        realm_id: realmId,
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        token_expires_at: expiresAt.toISOString(),
        scopes: 'com.intuit.quickbooks.accounting',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'org_id',
      });

    if (upsertError) {
      console.error('Failed to store connection:', upsertError);
      return new Response(
        '<html><body><h1>Failed to store connection</h1><script>window.close()</script></body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new Response(
      '<html><body><h1>✓ QuickBooks Connected Successfully!</h1><p>You can close this window.</p><script>setTimeout(() => window.close(), 2000)</script></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Error in quickbooks-callback:', error);
    return new Response(
      '<html><body><h1>An error occurred</h1><script>window.close()</script></body></html>',
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
});