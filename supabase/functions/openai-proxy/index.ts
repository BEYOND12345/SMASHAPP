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

    // Debug: Check if API key is present (without exposing the key)
    console.log("🔑 OPENAI_API_KEY present:", !!openaiApiKey);
    console.log("🔑 OPENAI_API_KEY length:", openaiApiKey ? openaiApiKey.length : 0);

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error("Unauthorized");
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