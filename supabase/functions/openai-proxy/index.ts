import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ENDPOINTS = [
  "chat/completions",
  "audio/transcriptions",
  "embeddings",
];

const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024;

interface ProxyRequest {
  endpoint: string;
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      console.error("[SECURITY] OPENAI_API_KEY not configured");
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Even when verify_jwt is disabled in local dev config, we still enforce:
    // - presence of Supabase apikey header, and
    // - a valid user JWT (checked against Auth using the service role key).
    const apiKeyHeader = req.headers.get("apikey") ?? req.headers.get("Apikey");
    if (!apiKeyHeader) {
      return new Response(
        JSON.stringify({ error: "Missing apikey header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      // Return a real 401 (not 500) so the client gets a useful signal.
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization header format" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.slice("Bearer ".length);
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      console.error("[AUTH] Unauthorized request", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: userError?.message ?? null }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[AUTH] User authenticated", { user_id: user.id });

    // RATE LIMITING: Check if user has exceeded rate limit
    const { data: rateLimitResult, error: rateLimitError } = await supabase
      .rpc("check_rate_limit", {
        p_user_id: user.id,
        p_endpoint: "openai-proxy",
        p_max_calls: 50,
        p_window_minutes: 60,
      });

    if (rateLimitError) {
      console.error("[SECURITY] Rate limit check failed", { error: rateLimitError.message });
    } else if (rateLimitResult && !rateLimitResult.allowed) {
      console.warn("[SECURITY] RATE_LIMIT user_id=" + user.id + " endpoint=openai-proxy");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          rate_limit: rateLimitResult,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE) {
      return new Response(
        JSON.stringify({ error: "Payload too large. Maximum size: 2MB" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let requestData: ProxyRequest;
    let isFormData = false;
    let formData: FormData | null = null;

    if (contentType.includes("multipart/form-data")) {
      isFormData = true;
      formData = await req.formData();
      const endpoint = formData.get("endpoint") as string;
      if (!endpoint) {
        return new Response(
          JSON.stringify({ error: "Missing endpoint in form data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      requestData = { endpoint };
    } else {
      try {
        requestData = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON payload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { endpoint, method = "POST", body, headers: customHeaders } = requestData;

    if (!endpoint || typeof endpoint !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid endpoint parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEndpoint = endpoint.replace(/^\//, "");

    if (!ALLOWED_ENDPOINTS.includes(normalizedEndpoint)) {
      return new Response(
        JSON.stringify({
          error: "Invalid endpoint. Allowed endpoints: " + ALLOWED_ENDPOINTS.join(", ")
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiUrl = `https://api.openai.com/v1/${normalizedEndpoint}`;

    const openaiHeaders: Record<string, string> = {
      "Authorization": `Bearer ${openaiApiKey}`,
      ...customHeaders,
    };

    let openaiBody: any;
    
    if (isFormData && formData) {
      openaiBody = new FormData();
      for (const [key, value] of formData.entries()) {
        if (key !== "endpoint") {
          openaiBody.append(key, value);
        }
      }
    } else {
      if (!openaiHeaders["Content-Type"]) {
        openaiHeaders["Content-Type"] = "application/json";
      }
      openaiBody = body ? JSON.stringify(body) : undefined;
    }

    console.log("🚀 Making request to OpenAI:", normalizedEndpoint);

    const openaiResponse = await fetch(openaiUrl, {
      method,
      headers: openaiHeaders,
      body: openaiBody,
    });

    console.log("✅ OpenAI response status:", openaiResponse.status);

    const responseData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OpenAI API error:", responseData);
      return new Response(
        JSON.stringify({ error: "OpenAI API request failed" }),
        {
          status: openaiResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify(responseData),
      {
        status: openaiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("OpenAI proxy error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});