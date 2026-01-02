import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UpdateStageRequest {
  intake_id: string;
  stage: string;
  trace_id?: string;
  last_error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { intake_id, stage, trace_id, last_error }: UpdateStageRequest = await req.json();

    console.log(`[STAGE_UPDATE] intake_id=${intake_id} stage=${stage} trace_id=${trace_id || 'none'}`);

    const updateData: any = { stage };
    if (trace_id) updateData.trace_id = trace_id;
    if (last_error) updateData.last_error = last_error;

    const { error } = await supabase
      .from("voice_intakes")
      .update(updateData)
      .eq("id", intake_id);

    if (error) {
      console.error("[STAGE_UPDATE] Failed:", error);
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, intake_id, stage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});