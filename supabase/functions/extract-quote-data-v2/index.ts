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

const SYSTEM_PROMPT = `You are extracting job details from a tradie's voice note.

RETURN ONLY THIS EXACT JSON STRUCTURE (no markdown, no code blocks):
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
      { "description": string, "quantity": number|null, "unit": string|null, "unit_price_cents": number, "notes": string|null }
    ]
  },
  "fees": {
    "travel_hours": number|null,
    "materials_supply_hours": number|null,
    "callout_fee_cents": number|null
  }
}

FOR EVERY MATERIAL ITEM:
- unit_price_cents is REQUIRED (Australian retail price in cents)
- NEVER use null, 0, or omit unit_price_cents
- Estimate conservatively based on typical Australian trade pricing

Examples:
- Steps/pavers: 20000-30000 cents each ($200-300)
- Paint (4L): 8000 cents ($80)
- Timber (per metre): 800 cents ($8)
- Cement bag (20kg): 1500 cents ($15)
- Pool chemicals: 5000 cents ($50)
- Sheet of wood (plywood 2400x1200x12mm): 6000 cents ($60)`;

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

    console.log(`[${trace_id}] Transcript length: ${intake.transcript_text?.length || 0} chars`);

    const userPrompt = user_corrections_json
      ? `Original transcript:\n${intake.transcript_text}\n\nUser corrections:\n${JSON.stringify(user_corrections_json)}\n\nApply user corrections to the extracted data.`
      : intake.transcript_text;

    console.log(`[${trace_id}] Calling OpenAI with model: gpt-4o`);
    const startTime = Date.now();

    const openaiRequestBody = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };

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
      console.error(`[${trace_id}] OpenAI returned no content!`);
      throw new Error("No content from OpenAI");
    }

    const openaiMs = Date.now() - startTime;
    console.log(`[${trace_id}] OpenAI response in ${openaiMs}ms, length: ${extractedText.length} chars`);

    let extracted: any;
    try {
      extracted = JSON.parse(extractedText);
    } catch (parseError) {
      console.warn(`[${trace_id}] JSON parse error:`, parseError);
      throw new Error("Failed to parse extraction JSON");
    }

    console.log(`[${trace_id}] Extracted customer: ${extracted.customer?.name || 'NULL'}`);
    console.log(`[${trace_id}] Extracted title: ${extracted.job?.title || 'EMPTY'}`);
    
    const materialsWithPrices = extracted.materials?.items?.filter((m: any) => m.unit_price_cents && m.unit_price_cents > 0).length || 0;
    const totalMaterials = extracted.materials?.items?.length || 0;
    console.log(`[${trace_id}] Materials with pricing: ${materialsWithPrices}/${totalMaterials}`);
    
    if (totalMaterials > 0 && materialsWithPrices === 0) {
      console.error(`[${trace_id}] CRITICAL: OpenAI did not provide prices for ANY materials!`);
      console.error(`[${trace_id}] Sample material:`, JSON.stringify(extracted.materials.items[0]));
    }

    const hasData = (
      extracted.job?.title ||
      extracted.customer?.name ||
      (extracted.materials?.items?.length > 0) ||
      (extracted.time?.labour_entries?.length > 0)
    );

    if (!hasData) {
      console.error(`[${trace_id}] OpenAI returned empty extraction!`);
      throw new Error("OpenAI extraction returned empty data");
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

    console.log(`[${trace_id}] Extract complete in ${openaiMs}ms - with ${materialsWithPrices} priced materials`);

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