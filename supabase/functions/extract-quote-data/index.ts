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
}

// PHASE 1 OPTIMIZATION: Helper functions for catalog pre-filtering
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'including', 'until', 'against', 'among', 'throughout', 'despite', 'towards',
  'upon', 'concerning', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them',
  'their', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'can', 'will', 'just', 'should', 'now', 'uh', 'um', 'like', 'yeah', 'okay'
]);

function extractKeywords(transcript: string): string[] {
  const words = transcript
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));

  return [...new Set(words)];
}

function filterCatalog(catalogItems: any[], keywords: string[], maxItems: number = 20): any[] {
  if (!catalogItems || catalogItems.length === 0) return [];

  const scored = catalogItems.map(item => {
    let score = 0;
    const searchText = [
      item.name,
      item.category,
      item.category_group,
      ...(item.search_aliases || [])
    ].join(' ').toLowerCase();

    keywords.forEach(keyword => {
      if (searchText.includes(keyword)) {
        score += keyword.length > 4 ? 3 : 1;
      }
    });

    return { item, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(s => ({
      id: s.item.id,
      name: s.item.name,
      category: s.item.category,
      unit: s.item.unit,
      typical_low_price_cents: s.item.typical_low_price_cents,
      typical_high_price_cents: s.item.typical_high_price_cents
    }));
}

// PHASE 1: SINGLE COMBINED EXTRACTION PROMPT
const COMBINED_EXTRACTION_PROMPT = `You are an expert trade quoting assistant.

Your task is to extract structured quote data from a spoken transcript.
You must internally normalize messy speech, filler words, and casual phrasing,
but you must NOT output the cleaned transcript.

You must work ONLY with the provided catalog items.
Do NOT invent materials or prices outside the catalog.
If no suitable catalog item exists, mark it as "custom".

Be conservative.
If something is unclear, mark it as an assumption and lower confidence.

FIELD-LEVEL CONFIDENCE RULES:
- Every extracted numeric value MUST include a confidence score (0.0 to 1.0)
- Explicitly stated values: confidence 0.85-0.95
- Implied values from context: confidence 0.70-0.85
- Reasonable estimates from vague speech: confidence 0.55-0.70
- Assumed/defaulted values: confidence 0.40-0.55

EXTRACTION RULES:
1. VAGUE DURATIONS: "a couple hours" to 2 hours (confidence 0.65), "few days" to 3 days (confidence 0.60)
2. VAGUE QUANTITIES: "a couple" to 2 (confidence 0.65), "a few" to 3 (confidence 0.60), "some" to 5 (confidence 0.50)
3. RANGES: "three or four days" store min: 3, max: 4, use max for estimates
4. UNIT NORMALIZATION: "metres"/"meters"/"m"/"lm" = "linear_m", "square metres"/"sqm"/"m2" = "square_m"
5. WHEN UNSURE: Extract with lower confidence rather than mark as missing

MATERIALS CATALOG MATCHING:
- If a Material Catalog is provided, try to match mentioned materials to catalog items
- Match based on name and category similarity
- If matched with confidence >= 0.75, include catalog_item_id and set catalog_match_confidence
- PRICING FROM CATALOG:
  - If typical_low_price_cents and typical_high_price_cents exist: use midpoint
  - Otherwise set needs_pricing: true

MISSING FIELDS:
- Flag missing fields with severity: "warning" (most cases) or "required" (extremely rare)
- Examples of WARNING: customer contact, labour hours, materials pricing
- Examples of REQUIRED: NO work description at all

SCOPE OF WORK:
- Break down work into DISCRETE, MEASURABLE tasks
- Separate prep work, execution, and finishing
- Be SPECIFIC about locations and quantities

Return ONLY valid JSON with these fields:
- customer: {name, email, phone} - all nullable strings
- job: {title, summary, site_address, estimated_days_min, estimated_days_max, job_date, scope_of_work[]}
- time.labour_entries[]: {description, hours{value,confidence}, days{value,confidence}, people{value,confidence}, note}
- materials.items[]: {description, quantity{value,confidence}, unit{value,confidence}, unit_price_cents, estimated_cost_cents, needs_pricing, source_store, notes, catalog_item_id, catalog_match_confidence}
- fees: {travel{is_time,hours{value,confidence},fee_cents}, materials_pickup{enabled,minutes{value,confidence},fee_cents}, callout_fee_cents}
- pricing_defaults_used: {hourly_rate_cents, materials_markup_percent, tax_rate_percent, currency}
- assumptions[]: {field, assumption, confidence, source}
- missing_fields[]: {field, reason, severity}
- quality: {overall_confidence, ambiguous_fields[], critical_fields_below_threshold[]}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[AUTH] Missing authorization header");
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      console.error("[AUTH] Unauthorized request", { error: userError?.message });
      throw new Error("Unauthorized");
    }

    console.log("[AUTH] User authenticated", { user_id: user.id });

    const { data: rateLimitResult, error: rateLimitError } = await supabase
      .rpc("check_rate_limit", {
        p_user_id: user.id,
        p_endpoint: "extract-quote-data",
        p_max_calls: 20,
        p_window_minutes: 60,
      });

    if (rateLimitError) {
      console.error("[SECURITY] Rate limit check failed", { error: rateLimitError.message });
    } else if (rateLimitResult && !rateLimitResult.allowed) {
      console.warn("[SECURITY] RATE_LIMIT user_id=" + user.id + " endpoint=extract-quote-data");
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

    const { intake_id, user_corrections_json }: ExtractRequest = await req.json();

    if (!intake_id) {
      throw new Error("Missing intake_id");
    }

    const { data: intake, error: intakeError } = await supabase
      .from("voice_intakes")
      .select("*")
      .eq("id", intake_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (intakeError || !intake) {
      throw new Error("Voice intake not found");
    }

    let existingCustomer: any = null;
    if (intake.customer_id) {
      console.log("[CUSTOMER] Using pre-selected customer:", intake.customer_id);
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, name, email, phone, billing_street")
        .eq("id", intake.customer_id)
        .maybeSingle();

      if (!customerError && customerData) {
        existingCustomer = customerData;
        console.log("[CUSTOMER] Found existing customer:", existingCustomer.name);
      } else {
        console.warn("[CUSTOMER] Failed to load pre-selected customer, will extract from transcript");
      }
    }

    let extractedData: any;

    if (user_corrections_json && intake.extraction_json) {
      console.log("[PHASE_1] User corrections path - merging deterministically");
      extractedData = JSON.parse(JSON.stringify(intake.extraction_json));

      if (user_corrections_json.labour_overrides && extractedData.time?.labour_entries) {
        Object.entries(user_corrections_json.labour_overrides).forEach(([key, value]: [string, any]) => {
          const match = key.match(/^labour_(\d+)_(hours|days|people)$/);
          if (match) {
            const [, idxStr, field] = match;
            const idx = parseInt(idxStr, 10);
            if (extractedData.time.labour_entries[idx]) {
              const entry = extractedData.time.labour_entries[idx];
              if (typeof entry[field] === 'object') {
                entry[field] = { value, confidence: 1.0 };
              } else {
                entry[field] = { value, confidence: 1.0 };
              }
            }
          }
        });
      }

      if (user_corrections_json.materials_overrides && extractedData.materials?.items) {
        Object.entries(user_corrections_json.materials_overrides).forEach(([key, value]: [string, any]) => {
          const match = key.match(/^material_(\d+)_quantity$/);
          if (match) {
            const idx = parseInt(match[1], 10);
            if (extractedData.materials.items[idx]) {
              const item = extractedData.materials.items[idx];
              if (typeof item.quantity === 'object') {
                item.quantity = { value, confidence: 1.0 };
              } else {
                item.quantity = { value, confidence: 1.0 };
              }
            }
          }
        });
      }

      if (user_corrections_json.travel_overrides && extractedData.fees?.travel) {
        if (user_corrections_json.travel_overrides.travel_hours !== undefined) {
          const travel = extractedData.fees.travel;
          if (typeof travel.hours === 'object') {
            travel.hours = { value: user_corrections_json.travel_overrides.travel_hours, confidence: 1.0 };
          } else {
            travel.hours = { value: user_corrections_json.travel_overrides.travel_hours, confidence: 1.0 };
          }
        }
      }

      if (user_corrections_json.confirmed_assumptions && extractedData.assumptions) {
        extractedData.assumptions = extractedData.assumptions.map((assumption: any) => {
          if (user_corrections_json.confirmed_assumptions.includes(assumption.field)) {
            return { ...assumption, confidence: 1.0 };
          }
          return assumption;
        });
      }

      let totalConfidence = 0;
      let confidenceCount = 0;

      if (extractedData.time?.labour_entries) {
        extractedData.time.labour_entries.forEach((entry: any) => {
          ['hours', 'days', 'people'].forEach((field) => {
            if (entry[field]) {
              const conf = typeof entry[field] === 'object' ? entry[field].confidence : 0.9;
              totalConfidence += conf;
              confidenceCount++;
            }
          });
        });
      }

      if (extractedData.materials?.items) {
        extractedData.materials.items.forEach((item: any) => {
          if (item.quantity) {
            const conf = typeof item.quantity === 'object' ? item.quantity.confidence : 0.9;
            totalConfidence += conf;
            confidenceCount++;
          }
        });
      }

      if (extractedData.assumptions) {
        extractedData.assumptions.forEach((assumption: any) => {
          totalConfidence += assumption.confidence || 0;
          confidenceCount++;
        });
      }

      const overallConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.overall_confidence = overallConfidence;

      console.log(`[PHASE_1] Recalculated confidence: ${overallConfidence.toFixed(2)}`);
    } else {
      if (!intake.transcript_text) {
        throw new Error("No transcript available for extraction");
      }

      console.log("[PHASE_1] Starting single-pass extraction optimization");

      const { data: profileData, error: profileError } = await supabase
        .rpc("get_effective_pricing_profile", { p_user_id: user.id });

      if (profileError || !profileData) {
        throw new Error("No pricing profile found");
      }

      const { data: orgData } = await supabase
        .from("organizations")
        .select("country_code")
        .eq("id", (profileData as any).org_id)
        .maybeSingle();

      const regionCode = orgData?.country_code || 'AU';

      // PHASE 1: Extract keywords from transcript
      const keywords = extractKeywords(intake.transcript_text);
      console.log("[PHASE_1] Extracted keywords:", keywords.slice(0, 10).join(', '));

      // PHASE 1: Fetch ALL catalog items first
      const { data: allCatalogItems } = await supabase
        .from("material_catalog_items")
        .select("id, name, category, category_group, unit, typical_low_price_cents, typical_high_price_cents, search_aliases")
        .or(`org_id.eq.${(profileData as any).org_id},and(org_id.is.null,region_code.eq.${regionCode})`)
        .eq("is_active", true);

      // PHASE 1: Pre-filter catalog to 10-20 items max
      const filteredCatalog = filterCatalog(allCatalogItems || [], keywords, 20);
      console.log(`[PHASE_1] Filtered catalog: ${allCatalogItems?.length || 0} to ${filteredCatalog.length} items`);

      const proxyUrl = `${supabaseUrl}/functions/v1/openai-proxy`;

      // PHASE 1: SINGLE GPT CALL (no repair step)
      console.log("[PHASE_1] Single extraction call (no repair step)");

      let extractionMessage = `Transcript:\n${intake.transcript_text}\n\nPricing Profile:\n${JSON.stringify(profileData, null, 2)}`;

      if (existingCustomer) {
        extractionMessage += `\n\nIMPORTANT: Customer is already selected. DO NOT extract customer information. Use these details:\n${JSON.stringify({
          name: existingCustomer.name,
          email: existingCustomer.email || null,
          phone: existingCustomer.phone || null,
        }, null, 2)}\n\nFocus ONLY on extracting job details, materials, and time estimates.`;
      }

      if (filteredCatalog.length > 0) {
        extractionMessage += `\n\nMaterial Catalog (ONLY match to these ${filteredCatalog.length} items):\n${JSON.stringify(filteredCatalog, null, 2)}`;
      }

      const extractionStartTime = Date.now();

      const extractionResponse = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: "chat/completions",
          body: {
            model: "gpt-4o",
            messages: [
              { role: "system", content: COMBINED_EXTRACTION_PROMPT },
              { role: "user", content: extractionMessage },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 800,
          },
        }),
      });

      if (!extractionResponse.ok) {
        const errorText = await extractionResponse.text();
        throw new Error(`OpenAI extraction failed: ${errorText}`);
      }

      const extractionResult = await extractionResponse.json();
      const extractionDuration = Date.now() - extractionStartTime;

      console.log(`[PHASE_1] Extraction completed in ${extractionDuration}ms`);

      extractedData = JSON.parse(extractionResult.choices[0].message.content);

      if (existingCustomer) {
        console.log("[CUSTOMER] Overriding extracted customer data with existing customer");
        extractedData.customer = {
          name: existingCustomer.name,
          email: existingCustomer.email || null,
          phone: existingCustomer.phone || null,
        };
        if (!extractedData.assumptions) extractedData.assumptions = [];
        extractedData.assumptions.push({
          field: "customer",
          assumption: `Customer pre-selected: ${existingCustomer.name}`,
          confidence: 1.0,
          source: "user_selection"
        });
      }
    }

    console.log("[PHASE_1] Determining status based on quality checks");

    const missingFields = extractedData.missing_fields || [];
    const assumptions = extractedData.assumptions || [];
    const quality = extractedData.quality || {};

    let oc: any = quality.overall_confidence;

    const bad =
      oc === null ||
      oc === undefined ||
      (typeof oc !== "number" && typeof oc !== "string") ||
      (typeof oc === "string" && oc.trim() === "") ||
      Number.isNaN(Number(oc));

    if (bad) {
      console.warn("[EXTRACTION_CONFIDENCE] DEFAULT_APPLIED", {
        intake_id,
        previous: oc,
        applied: 0.5
      });
      oc = 0.5;
    }

    oc = Number(oc);
    if (Number.isNaN(oc)) oc = 0.5;
    if (oc < 0) oc = 0.0;
    if (oc > 1) oc = 1.0;

    if (!extractedData.quality) extractedData.quality = {};
    extractedData.quality.overall_confidence = oc;

    const hasRequiredMissing = missingFields.some((mf: any) => mf.severity === "required");

    const hasCriticalLowConfidence = quality.critical_fields_below_threshold?.length > 0;

    const overallConfidence = oc;

    let hasLowConfidenceLabour = false;
    if (extractedData.time?.labour_entries) {
      for (const entry of extractedData.time.labour_entries) {
        const hoursConf = entry.hours?.confidence || 0;
        const daysConf = entry.days?.confidence || 0;
        if ((hoursConf > 0 && hoursConf < 0.6) || (daysConf > 0 && daysConf < 0.6)) {
          hasLowConfidenceLabour = true;
          break;
        }
      }
    }

    let finalStatus = "extracted";
    let requiresReview = false;

    const userHasConfirmed = user_corrections_json !== undefined && user_corrections_json !== null;

    if (userHasConfirmed) {
      console.log("[REVIEW_FLOW] User corrections provided, honoring confirmation regardless of confidence");
      finalStatus = "extracted";
      requiresReview = false;

      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = false;
      extractedData.quality.user_confirmed = true;
      extractedData.quality.user_confirmed_at = new Date().toISOString();
    } else if (hasRequiredMissing) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      console.log("[REVIEW_FLOW] Status: needs_user_review (reason: required fields missing)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else if (hasCriticalLowConfidence) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      console.log("[REVIEW_FLOW] Status: needs_user_review (reason: critical fields below confidence threshold)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else if (hasLowConfidenceLabour) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      console.log("[REVIEW_FLOW] Status: needs_user_review (reason: labour hours confidence < 0.6)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else if (overallConfidence < 0.7) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      console.log("[REVIEW_FLOW] Status: needs_user_review (reason: overall confidence < 0.7)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else {
      console.log("[REVIEW_FLOW] Status: extracted (all quality checks passed)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = false;
    }

    const { error: updateError } = await supabase
      .from("voice_intakes")
      .update({
        extraction_json: extractedData,
        extraction_model: "gpt-4o",
        extraction_confidence: overallConfidence,
        missing_fields: missingFields,
        assumptions: assumptions,
        status: finalStatus,
        user_corrections_json: user_corrections_json || null,
      })
      .eq("id", intake_id);

    if (updateError) {
      throw new Error(`Failed to update intake: ${updateError.message}`);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[PHASE_1] Total extraction pipeline: ${totalDuration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        intake_id,
        status: finalStatus,
        requires_review: requiresReview,
        extracted_data: extractedData,
        quality_summary: {
          overall_confidence: overallConfidence,
          missing_fields_count: missingFields.length,
          required_missing_count: missingFields.filter((mf: any) => mf.severity === "required").length,
          assumptions_count: assumptions.length,
          has_low_confidence_labour: hasLowConfidenceLabour,
        },
        performance: {
          total_duration_ms: totalDuration,
          optimization: "phase_1_single_pass"
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[PHASE_1] Extraction error:", error);

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
