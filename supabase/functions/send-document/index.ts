import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Attachment = { filename: string; content: string; contentType?: string };

interface SendDocumentRequest {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    // DEV SAFETY SWITCH:
    // When iterating on UI flows locally, it’s useful to bypass email sending (and JWT validation)
    // so the app can test the end-to-end UX without needing stable auth / Resend configuration.
    // Enable by setting `DEV_SKIP_EMAIL_SEND=true` in supabase/functions/.env (local only).
    const devSkip = (Deno.env.get("DEV_SKIP_EMAIL_SEND") || "").toLowerCase() === "true";

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM");
    if (!devSkip && (!resendKey || !from)) {
      return json(500, { error: "Email provider not configured (missing RESEND_API_KEY / RESEND_FROM)" });
    }

    const apiKeyHeader = req.headers.get("apikey") ?? req.headers.get("Apikey");
    if (!apiKeyHeader) return json(401, { error: "Missing apikey header" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) return json(401, { error: "Missing authorization header" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.slice("Bearer ".length);
    if (!devSkip) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
      if (userError || !user) return json(401, { error: "Unauthorized", detail: userError?.message ?? null });
    }

    const payload = (await req.json()) as SendDocumentRequest;
    if (!payload?.to || !payload?.subject) return json(400, { error: "Missing to/subject" });

    if (devSkip) {
      // Do not actually send email in this mode.
      return json(200, {
        ok: true,
        skipped: true,
        mode: "DEV_SKIP_EMAIL_SEND",
        to: payload.to,
        subject: payload.subject,
        attachments: payload.attachments?.map(a => ({ filename: a.filename, contentType: a.contentType })) ?? [],
      });
    }

    const out = {
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments: payload.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content, // base64 string
        content_type: a.contentType ?? "application/octet-stream",
      })),
    };

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(out),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json(resp.status, { error: "Email send failed", provider: data });
    }

    return json(200, { ok: true, provider: data });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});

