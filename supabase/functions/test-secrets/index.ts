import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const secrets = {
      SUPABASE_URL: Deno.env.get("SUPABASE_URL") ? "[EXISTS]" : "[MISSING]",
      SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") ? "[EXISTS]" : "[MISSING]",
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ? "[EXISTS]" : "[MISSING]",
      SUPABASE_DB_URL: Deno.env.get("SUPABASE_DB_URL") ? "[EXISTS]" : "[MISSING]",
      // Do not leak the key. We only report presence / non-empty / length.
      OPENAI_API_KEY: openaiKey ? "[EXISTS]" : "[MISSING]",
      OPENAI_API_KEY_debug: {
        present: openaiKey !== undefined,
        nonEmpty: !!openaiKey,
        length: openaiKey?.length ?? 0,
        // Helpful to spot "wrong key pasted" without exposing it.
        prefix: openaiKey ? openaiKey.slice(0, 7) : null,
      },
      allEnvKeys: Object.keys(Deno.env.toObject()).filter(k => !k.includes("PATH") && !k.includes("HOME")),
    };

    return new Response(
      JSON.stringify(secrets, null, 2),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});