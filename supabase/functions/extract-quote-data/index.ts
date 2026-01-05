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

const PROMPT_LINES = [
  "You are an expert trade quoting assistant.",
  "Extract only what the user said. Do not invent pricing. Do not invent catalog items.",
  "Return only valid JSON. No markdown. No comments. No extra keys.",
  "Use null for unknown values. Never output NaN. Never output Infinity.",
  "Do not perform catalog matching. Do not output catalog_item_id.",
  "Do not output unit_price_cents. Do not output estimated_cost_cents.",
  "Keep content short. Use concise strings.",
  "",
  "EXTRACTION RULES:",
  "1. VAGUE DURATIONS: couple hours equals 2 hours, few days equals 3 days",
  "2. VAGUE QUANTITIES: couple equals 2, few equals 3, some equals 5",
  "3. RANGES: three or four days store min 3 max 4 use max for estimates",
  "4. UNIT NORMALIZATION: metres meters m lm all equal m, square metres sqm m2 all equal sqm",
  "5. Extract all scope of work tasks as separate items in array",
  "6. JOB TITLE EXTRACTION (CRITICAL):",
  "   - Extract from first 1-2 sentences describing the main work",
  "   - Examples: 'Deck replacement at house in Sydney' → 'Deck replacement'",
  "   - Examples: 'Need new kitchen cabinets installed' → 'Kitchen cabinet installation'",
  "   - Examples: 'Fix leaking roof' → 'Roof leak repair'",
  "   - Examples: 'Quote for painting exterior' → 'Exterior painting'",
  "   - ALWAYS extract a title. Never return null. Be concise (3-6 words).",
  "7. CUSTOMER & SITE EXTRACTION:",
  "   - Customer name: Look for 'for NAME', 'customer NAME', NAME's house, possessive forms",
  "   - Site address: Extract any mention of location, address, suburb, street, or site",
  "   - Examples: 'Kate's place' → name: Kate, 'work at 123 Smith St' → site_address: 123 Smith St",
  "   - Examples: 'job for John in Newtown' → name: John, site_address: Newtown",
  "8. TIMELINE EXTRACTION:",
  "   - Extract natural language descriptions of duration and timing",
  "   - Examples: '2 to 3 days', 'about 40 hours', 'next week', 'couple of days'",
  "   - Store in timeline_description field as spoken",
  "9. FEES EXTRACTION:",
  "   - travel_hours: Time to travel to site (look for 'travel time', 'drive there and back')",
  "   - materials_supply_hours: Time to pick up/supply materials, trips to hardware store",
  "   - Look for: 'pick up materials', 'trip to Bunnings', 'supply materials', 'get supplies'",
  "",
  "Return ONLY this exact JSON structure:",
  "{",
  '  "customer": { "name": string|null, "email": string|null, "phone": string|null },',
  '  "job": {',
  '    "title": string,',
  '    "summary": string|null,',
  '    "site_address": string|null,',
  '    "timeline_description": string|null,',
  '    "estimated_days_min": number|null,',
  '    "estimated_days_max": number|null,',
  '    "job_date": string|null,',
  '    "scope_of_work": string[]',
  "  },",
  '  "time": {',
  '    "labour_entries": [',
  '      { "description": string, "hours": number|null, "days": number|null, "people": number|null, "note": string|null }',
  "    ]",
  "  },",
  '  "materials": {',
  '    "items": [',
  '      { "description": string, "quantity": number|null, "unit": string|null, "notes": string|null }',
  "    ]",
  "  },",
  '  "fees": {',
  '    "travel_hours": number|null,',
  '    "materials_supply_hours": number|null,',
  '    "callout_fee_cents": number|null',
  "  },",
  '  "assumptions": [',
  '    { "field": string, "assumption": string, "confidence": number|null, "source": string|null }',
  "  ]",
  "}"
];

const EXTRACTION_ONLY_PROMPT = PROMPT_LINES.join("\n");

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
    console.log(`[${trace_id}] Transcript length: ${intake.transcript?.length || 0} chars`);
    console.log(`[${trace_id}] Transcript preview: ${intake.transcript?.substring(0, 200) || 'EMPTY'}`);

    const systemPrompt = EXTRACTION_ONLY_PROMPT;
    const userPrompt = user_corrections_json
      ? `Original transcript:\n${intake.transcript}\n\nUser corrections:\n${JSON.stringify(user_corrections_json)}\n\nApply user corrections to the extracted data.`
      : `Transcript:\n${intake.transcript}`;

    console.log(`[${trace_id}] User prompt length: ${userPrompt.length} chars`);
    console.log(`[${trace_id}] Calling OpenAI with model: gpt-4o-mini`);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
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

    await supabase
      .from("voice_intakes")
      .update({
        extraction_json: extracted,
        status: "extracted",
        processing_stage: "extracted"
      })
      .eq("id", intake_id);

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