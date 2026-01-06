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

const SYSTEM_PROMPT = `Extract job details from this tradie's voice note. Return ONLY valid JSON:
{
  "customer": { "name": string|null, "email": string|null, "phone": string|null },
  "job": {
    "title": string,
    "summary": string|null,
    "site_address": string|null,
    "timeline_description": string|null,
    "estimated_days_min": number|null,
    "estimated_days_max": number|null,
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
  }
}

If information is missing, use null. Be generous with scope description.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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
      .select("*")
      .eq("id", intake_id)
      .single();

    if (intakeError || !intake) {
      console.warn(`[${trace_id}] Intake not found:`, intakeError);
      return new Response(
        JSON.stringify({ error: "Intake not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL DEBUG: Verify transcript exists
    console.log(`[${trace_id}] Transcript length: ${intake.transcript_text?.length || 0} chars`);
    console.log(`[${trace_id}] Transcript preview: ${intake.transcript_text?.substring(0, 200) || 'EMPTY'}`);

    const userPrompt = user_corrections_json
      ? `Original transcript:\n${intake.transcript_text}\n\nUser corrections:\n${JSON.stringify(user_corrections_json)}\n\nApply user corrections to the extracted data.`
      : intake.transcript_text;

    console.log(`[${trace_id}] User prompt length: ${userPrompt.length} chars`);
    console.log(`[${trace_id}] User prompt preview: ${userPrompt.substring(0, 300)}`);
    console.log(`[${trace_id}] Calling OpenAI with model: gpt-4o-mini`);

    const openaiRequestBody = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

    console.log(`[${trace_id}] OpenAI request body: ${JSON.stringify({
      model: openaiRequestBody.model,
      message_count: openaiRequestBody.messages.length,
      system_length: openaiRequestBody.messages[0].content.length,
      user_length: openaiRequestBody.messages[1].content.length,
      temperature: openaiRequestBody.temperature
    })}`);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiRequestBody),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.warn(`[${trace_id}] OpenAI error:`, errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const openaiResult = await openaiResponse.json();
    const extractedText = openaiResult.choices[0]?.message?.content;

    if (!extractedText) {
      console.error(`[${trace_id}] OpenAI returned no content! Full response:`, JSON.stringify(openaiResult));
      throw new Error("No content from OpenAI");
    }

    console.log(`[${trace_id}] OpenAI response length: ${extractedText.length} chars`);
    console.log(`[${trace_id}] OpenAI response:`, extractedText);

    let extracted: any;
    try {
      extracted = JSON.parse(extractedText);
    } catch (parseError) {
      console.warn(`[${trace_id}] JSON parse error:`, parseError);
      throw new Error("Failed to parse extraction JSON");
    }

    // CRITICAL DEBUG: Show what was extracted
    console.log(`[${trace_id}] Extracted customer name: ${extracted.customer?.name || 'NULL'}`);
    console.log(`[${trace_id}] Extracted job title: ${extracted.job?.title || 'EMPTY'}`);
    console.log(`[${trace_id}] Extracted site address: ${extracted.job?.site_address || 'NULL'}`);
    console.log(`[${trace_id}] Extracted materials count: ${extracted.materials?.items?.length || 0}`);
    console.log(`[${trace_id}] Extracted labour entries: ${extracted.time?.labour_entries?.length || 0}`);

    // VALIDATE: Check if OpenAI returned empty data
    const hasData = (
      extracted.job?.title ||
      extracted.customer?.name ||
      (extracted.materials?.items?.length > 0 && extracted.materials.items[0]?.description) ||
      (extracted.time?.labour_entries?.length > 0)
    );

    if (!hasData) {
      console.error(`[${trace_id}] WARNING: OpenAI returned completely empty extraction!`);
      console.error(`[${trace_id}] Transcript was: ${intake.transcript_text}`);
      console.error(`[${trace_id}] Full extracted object: ${JSON.stringify(extracted, null, 2)}`);
      throw new Error("OpenAI extraction returned empty data - check prompt or model");
    }

    // CRITICAL FIX: Use 'stage' not 'processing_stage'
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

    console.log(`[${trace_id}] Extract complete, saved to voice_intake`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted_data: extracted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extract error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});