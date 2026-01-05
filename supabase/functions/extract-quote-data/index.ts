import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEBUG_MODE = false;
const debugLog = (...args: any[]) => { if (DEBUG_MODE) console.log(...args); };
const debugWarn = (...args: any[]) => { if (DEBUG_MODE) console.warn(...args); };

interface ExtractRequest {
  intake_id: string;
  user_corrections_json?: any;
  trace_id?: string;
}

function buildMinimalPricingProfile(profileData: any, regionCode: string): any {
  return {
    hourly_rate_cents: profileData.hourly_rate_cents,
    materials_markup_percent: profileData.materials_markup_percent,
    tax_rate_percent: profileData.tax_rate_percent,
    currency: profileData.currency,
    callout_fee_cents: profileData.callout_fee_cents || null,
    travel_hourly_rate_cents: profileData.travel_hourly_rate_cents || null,
    region_code: regionCode
  };
}

const PROMPT_LINES = [
  "You are an expert trade quoting assistant.",
  "Extract only what the user said. Do not invent pricing. Do not invent catalog items.",
  "Return only valid JSON. No markdown. No comments. No extra keys.",
  "Use null for unknown values. Never output NaN. Never output Infinity.",
  "Do not perform catalog matching. Do not output catalog_item_id.",
  "Do not output unit_price_cents. Do not output estimated_cost_cents.",
  "Do not output pricing_defaults_used. Do not output missing_fields severity. Do not output quality critical lists.",
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
  "   - travel_hours: Time to travel to site",
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

    debugLog(`[${trace_id}] Extract starting for intake_id: ${intake_id}`);

    const { data: intake, error: intakeError } = await supabase
      .from("voice_intakes")
      .select("*")
      .eq("id", intake_id)
      .single();

    if (intakeError || !intake) {
      debugWarn(`[${trace_id}] Intake not found:`, intakeError);
      return new Response(
        JSON.stringify({ error: "Intake not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("user_pricing_profiles")
      .select("*")
      .eq("user_id", intake.user_id)
      .eq("is_active", true)
      .maybeSingle();

    const { data: orgData } = await supabase
      .from("organizations")
      .select("region_code")
      .eq("id", intake.org_id)
      .maybeSingle();

    const regionCode = orgData?.region_code || "AU";
    const pricingProfile = profile ? buildMinimalPricingProfile(profile, regionCode) : null;

    const systemPrompt = EXTRACTION_ONLY_PROMPT;
    const userPrompt = user_corrections_json
      ? `Original transcript:\n${intake.transcript}\n\nUser corrections:\n${JSON.stringify(user_corrections_json)}\n\nApply user corrections to the extracted data.`
      : `Transcript:\n${intake.transcript}`;

    debugLog(`[${trace_id}] Calling OpenAI...`);

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
      debugWarn(`[${trace_id}] OpenAI error:`, errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const openaiResult = await openaiResponse.json();
    const extractedText = openaiResult.choices[0]?.message?.content;

    if (!extractedText) {
      throw new Error("No content from OpenAI");
    }

    debugLog(`[${trace_id}] OpenAI response:`, extractedText);

    let extracted: any;
    try {
      extracted = JSON.parse(extractedText);
    } catch (parseError) {
      debugWarn(`[${trace_id}] JSON parse error:`, parseError);
      throw new Error("Failed to parse extraction JSON");
    }

    let customerId = null;
    if (extracted.customer?.name) {
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", intake.org_id)
        .ilike("name", extracted.customer.name)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            org_id: intake.org_id,
            name: extracted.customer.name,
            email: extracted.customer.email || null,
            phone: extracted.customer.phone || null,
          })
          .select("id")
          .single();
        customerId = newCustomer?.id || null;
      }
    }

    const quoteData: any = {
      org_id: intake.org_id,
      created_by: intake.user_id,
      customer_id: customerId,
      title: extracted.job?.title || "Voice quote",
      voice_intake_id: intake_id,
      scope_of_work: extracted.job?.scope_of_work || [],
      site_address: extracted.job?.site_address || null,
      timeline_description: extracted.job?.timeline_description || null,
      status: "draft",
      source: "voice",
    };

    debugLog(`[${trace_id}] Creating quote with data:`, quoteData);

    const { data: newQuote, error: quoteError } = await supabase
      .from("quotes")
      .insert(quoteData)
      .select("id")
      .single();

    if (quoteError || !newQuote) {
      debugWarn(`[${trace_id}] Quote creation error:`, quoteError);
      throw new Error(`Failed to create quote: ${quoteError?.message}`);
    }

    const quoteId = newQuote.id;
    debugLog(`[${trace_id}] Quote created: ${quoteId}`);

    const lineItems = [];

    if (extracted.materials?.items) {
      for (const item of extracted.materials.items) {
        lineItems.push({
          quote_id: quoteId,
          description: item.description,
          quantity: item.quantity || 1,
          unit: item.unit || "unit",
          item_type: "material",
          is_ai_estimated: true,
        });
      }
    }

    if (extracted.time?.labour_entries) {
      for (const entry of extracted.time.labour_entries) {
        const hours = entry.hours || (entry.days ? entry.days * 8 : null);
        if (hours) {
          lineItems.push({
            quote_id: quoteId,
            description: entry.description || "Labour",
            quantity: hours,
            unit: "hours",
            item_type: "labour",
            is_ai_estimated: true,
          });
        }
      }
    }

    if (extracted.fees?.travel_hours) {
      lineItems.push({
        quote_id: quoteId,
        description: "Travel time",
        quantity: extracted.fees.travel_hours,
        unit: "hours",
        item_type: "labour",
        is_ai_estimated: true,
      });
    }

    if (lineItems.length > 0) {
      const { error: lineItemsError } = await supabase
        .from("quote_line_items")
        .insert(lineItems);

      if (lineItemsError) {
        debugWarn(`[${trace_id}] Line items error:`, lineItemsError);
      }
    }

    await supabase
      .from("voice_intakes")
      .update({ processing_stage: "quote_created" })
      .eq("id", intake_id);

    debugLog(`[${trace_id}] Extract complete, quote_id: ${quoteId}`);

    return new Response(
      JSON.stringify({
        success: true,
        quote_id: quoteId,
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