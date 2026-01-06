import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractRequest {
  intake_id: string;
  user_corrections_json?: any;
  trace_id?: string;
}

const EXTRACTION_PROMPT = `You are an expert trade quoting assistant.
Extract only what the user said. Do not invent pricing. Do not invent catalog items.
Return only valid JSON. No markdown. No comments. No extra keys.
Use null for unknown values. Never output NaN. Never output Infinity.

EXTRACTION RULES:
1. VAGUE DURATIONS: couple hours equals 2 hours, few days equals 3 days
2. VAGUE QUANTITIES: couple equals 2, few equals 3, some equals 5
3. RANGES: three or four days store min 3 max 4 use max for estimates
4. UNIT NORMALIZATION: metres meters m lm all equal m, square metres sqm m2 all equal sqm
5. Extract all scope of work tasks as separate items in array
6. JOB TITLE EXTRACTION (CRITICAL): Extract from first 1-2 sentences describing the main work
7. CUSTOMER & SITE EXTRACTION: Look for customer names and site addresses
8. TIMELINE EXTRACTION: Extract natural language descriptions of duration
9. FEES EXTRACTION: Extract travel time, materials supply hours, callout fees

Return ONLY this exact JSON structure:
{
  "customer": { "name": string|null, "email": string|null, "phone": string|null },
  "job": {
    "title": string,
    "summary": string|null,
    "site_address": string|null,
    "timeline_description": string|null,
    "estimated_days_min": number|null,
    "estimated_days_max": number|null,
    "job_date": string|null,
    "scope_of_work": string[]
  },
  "time": {
    "labour_entries": [
      { "description": string, "hours": number|null, "days": number|null, "people": number|null, "note": string|null }
    ]
  },
  "materials": {
    "items": [
      { "description": string, "quantity": number|null, "unit": string|null, "notes": string|null }
    ]
  },
  "fees": {
    "travel_hours": number|null,
    "materials_supply_hours": number|null,
    "callout_fee_cents": number|null
  },
  "assumptions": [
    { "field": string, "assumption": string, "confidence": number|null, "source": string|null }
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let jobId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { intake_id, user_corrections_json, trace_id }: ExtractRequest = await req.json();

    if (!intake_id) {
      return new Response(
        JSON.stringify({ error: "intake_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${trace_id}] Extract starting for intake_id: ${intake_id}`);

    const { data: intake, error: intakeError } = await supabase
      .from("voice_intakes")
      .select("*, quotes!voice_intakes_created_quote_id_fkey(org_id, id)")
      .eq("id", intake_id)
      .single();

    if (intakeError || !intake) {
      console.warn(`[${trace_id}] Intake not found:`, intakeError);
      return new Response(
        JSON.stringify({ error: "Intake not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = intake.quotes?.org_id || intake.org_id;
    const userId = intake.user_id;
    const quoteId = intake.created_quote_id;

    const { data: existingJob } = await supabase
      .from("quote_generation_jobs")
      .select("id, status, progress_percent")
      .eq("intake_id", intake_id)
      .maybeSingle();

    if (existingJob) {
      if (existingJob.status === "complete") {
        console.log(`[${trace_id}] Job already complete, returning existing extraction`);
        return new Response(
          JSON.stringify({
            success: true,
            extracted_data: intake.extraction_json,
            job_id: existingJob.id,
            idempotent: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      jobId = existingJob.id;
      console.log(`[${trace_id}] Using existing job: ${jobId}`);
    } else {
      const { data: newJob, error: jobError } = await supabase
        .from("quote_generation_jobs")
        .insert({
          org_id: orgId,
          user_id: userId,
          intake_id: intake_id,
          quote_id: quoteId,
          status: "running",
          current_step: "extraction",
          progress_percent: 5,
        })
        .select("id")
        .single();

      if (jobError || !newJob) {
        console.error(`[${trace_id}] Failed to create job:`, jobError);
      } else {
        jobId = newJob.id;
        console.log(`[${trace_id}] Created job: ${jobId}`);
      }
    }

    if (jobId) {
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_step: "extraction_started",
        p_progress: 10,
      });
    }

    console.log(`[${trace_id}] Transcript length: ${intake.transcript_text?.length || 0} chars`);

    const userPrompt = user_corrections_json
      ? `Original transcript:\n${intake.transcript_text}\n\nUser corrections:\n${JSON.stringify(user_corrections_json)}\n\nApply user corrections to the extracted data.`
      : `Transcript:\n${intake.transcript_text}`;

    console.log(`[${trace_id}] Calling OpenAI (this will take 8-10 seconds)...`);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`[${trace_id}] OpenAI error:`, errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const openaiResult = await openaiResponse.json();
    const extractedText = openaiResult.choices[0]?.message?.content;

    if (!extractedText) {
      console.error(`[${trace_id}] OpenAI returned no content`);
      throw new Error("No content from OpenAI");
    }

    let extracted: any;
    try {
      extracted = JSON.parse(extractedText);
    } catch (parseError) {
      console.error(`[${trace_id}] JSON parse error:`, parseError);
      throw new Error("Failed to parse extraction JSON");
    }

    console.log(`[${trace_id}] Extracted:`, {
      customer: extracted.customer?.name || 'NULL',
      title: extracted.job?.title || 'EMPTY',
      materials: extracted.materials?.items?.length || 0,
      labour: extracted.time?.labour_entries?.length || 0,
    });

    const hasData = (
      extracted.job?.title ||
      extracted.customer?.name ||
      (extracted.materials?.items?.length > 0) ||
      (extracted.time?.labour_entries?.length > 0)
    );

    if (!hasData) {
      console.error(`[${trace_id}] OpenAI returned empty extraction`);
      throw new Error("Extraction returned empty data");
    }

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    if (jobId) {
      console.log(`[${trace_id}] \u2713 Step 1/6: Location`);
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_step: "location",
        p_progress: 17,
      });
      await delay(800);
    }

    if (jobId) {
      console.log(`[${trace_id}] \u2713 Step 2/6: Customer`);
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_step: "customer",
        p_progress: 34,
      });
      await delay(800);
    }

    if (jobId) {
      console.log(`[${trace_id}] \u2713 Step 3/6: Scope`);
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_step: "scope",
        p_progress: 51,
      });
      await delay(800);
    }

    if (jobId) {
      console.log(`[${trace_id}] \u2713 Step 4/6: Materials`);
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_step: "materials",
        p_progress: 68,
      });
      await delay(800);
    }

    if (jobId) {
      console.log(`[${trace_id}] \u2713 Step 5/6: Labour`);
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_step: "labour",
        p_progress: 85,
      });
      await delay(800);
    }

    if (jobId) {
      console.log(`[${trace_id}] \u2713 Step 6/6: Fees`);
      await supabase.rpc("update_job_progress", {
        p_job_id: jobId,
        p_step: "fees",
        p_progress: 100,
      });
      await delay(500);
    }

    const { error: updateError } = await supabase
      .from("voice_intakes")
      .update({
        extraction_json: extracted,
        status: "extracted",
        stage: "extracted"
      })
      .eq("id", intake_id);

    if (updateError) {
      console.error(`[${trace_id}] Database update failed:`, updateError);
      throw new Error(`Failed to save extraction: ${updateError.message}`);
    }

    console.log(`[${trace_id}] Extraction done - create-draft-quote will mark job complete after building quote`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted_data: extracted,
        job_id: jobId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extract error:", error);

    if (jobId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.rpc("mark_job_failed", {
        p_job_id: jobId,
        p_error_message: error.message || "Internal server error",
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});