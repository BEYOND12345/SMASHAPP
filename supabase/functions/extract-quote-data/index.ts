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

function buildMinimalPricingProfile(profileData: any): any {
  return {
    hourly_rate_cents: profileData.hourly_rate_cents,
    materials_markup_percent: profileData.materials_markup_percent,
    tax_rate_percent: profileData.tax_rate_percent,
    currency: profileData.currency,
    callout_fee_cents: profileData.callout_fee_cents || null,
    travel_hourly_rate_cents: profileData.travel_hourly_rate_cents || null
  };
}

function buildCatalogSQLFilter(keywords: string[], orgId: string, regionCode: string): string {
  const topKeywords = keywords.slice(0, 10);
  if (topKeywords.length === 0) {
    return `(org_id.eq.${orgId},and(org_id.is.null,region_code.eq.${regionCode}))`;
  }

  const ilikeConditions = topKeywords.map(kw =>
    `name.ilike.%${kw}%,category.ilike.%${kw}%,category_group.ilike.%${kw}%`
  ).join(',');

  return `and(or(${ilikeConditions}),or(org_id.eq.${orgId},and(org_id.is.null,region_code.eq.${regionCode})))`;
}

function scoreAndFilterCatalog(catalogItems: any[], keywords: string[], maxItems: number = 20): any[] {
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

const PROMPT_LINES = [
  "You are an expert trade quoting assistant.",
  "Extract structured quote data from spoken transcript.",
  "Internally normalize messy speech but do NOT output cleaned transcript.",
  "Work ONLY with provided catalog items.",
  "If no suitable catalog item exists mark as custom.",
  "Be conservative. If something is unclear mark it as assumption and lower confidence.",
  "",
  "FIELD-LEVEL CONFIDENCE RULES:",
  "Every extracted numeric value MUST include confidence score from 0.0 to 1.0.",
  "Explicitly stated values use 0.85 to 0.95.",
  "Implied values from context use 0.70 to 0.85.",
  "Reasonable estimates from vague speech use 0.55 to 0.70.",
  "Assumed or defaulted values use 0.40 to 0.55.",
  "",
  "EXTRACTION RULES:",
  "1. VAGUE DURATIONS: couple hours equals 2 hours confidence 0.65, few days equals 3 days confidence 0.60",
  "2. VAGUE QUANTITIES: couple equals 2 confidence 0.65, few equals 3 confidence 0.60, some equals 5 confidence 0.50",
  "3. RANGES: three or four days store min 3 max 4 use max for estimates",
  "4. UNIT NORMALIZATION: metres meters m lm all equal linear_m, square metres sqm m2 all equal square_m",
  "5. WHEN UNSURE: Extract with lower confidence rather than mark as missing",
  "",
  "MATERIALS CATALOG MATCHING:",
  "If Material Catalog provided try to match materials to catalog items.",
  "Match based on name and category similarity.",
  "If matched with confidence 0.75 or higher include catalog_item_id and set catalog_match_confidence.",
  "For pricing from catalog if typical_low_price_cents and typical_high_price_cents exist use midpoint otherwise set needs_pricing true.",
  "",
  "MISSING FIELDS:",
  "Flag missing fields with severity warning for most cases or required for extremely rare cases.",
  "Examples of WARNING include customer contact labour hours materials pricing.",
  "Examples of REQUIRED include NO work description at all.",
  "",
  "SCOPE OF WORK:",
  "Break down work into discrete measurable tasks.",
  "Separate prep work execution and finishing.",
  "Be specific about locations and quantities.",
  "",
  "Return ONLY valid JSON.",
  "Include customer with name email phone all nullable.",
  "Include job with title summary site_address estimated_days_min estimated_days_max job_date scope_of_work array.",
  "Include time labour_entries array with description hours object days object people object note.",
  "Include materials items array with description quantity object unit object unit_price_cents estimated_cost_cents needs_pricing source_store notes catalog_item_id catalog_match_confidence.",
  "Include fees with travel object materials_pickup object callout_fee_cents.",
  "Include pricing_defaults_used with hourly_rate_cents materials_markup_percent tax_rate_percent currency.",
  "Include assumptions array with field assumption confidence source.",
  "Include missing_fields array with field reason severity.",
  "Include quality with overall_confidence number ambiguous_fields array critical_fields_below_threshold array."
];

const COMBINED_EXTRACTION_PROMPT = PROMPT_LINES.join("\n");

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
    let catalogDuration: number | undefined;
    let extractionDuration: number | undefined;

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

      console.log("[PHASE_1.1] Starting optimized single-pass extraction");

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

      const keywords = extractKeywords(intake.transcript_text);
      console.log(`[PHASE_1.1] Extracted ${keywords.length} keywords for catalog filtering`);

      const catalogStartTime = Date.now();
      const sqlFilter = buildCatalogSQLFilter(keywords, (profileData as any).org_id, regionCode);

      const { data: catalogCandidates } = await supabase
        .from("material_catalog_items")
        .select("id, name, category, category_group, unit, typical_low_price_cents, typical_high_price_cents, search_aliases")
        .or(sqlFilter)
        .eq("is_active", true)
        .limit(50);

      const filteredCatalog = scoreAndFilterCatalog(catalogCandidates || [], keywords, 20);
      catalogDuration = Date.now() - catalogStartTime;

      console.log(`[PHASE_1.1] Catalog query: ${catalogDuration}ms, SQL returned ${catalogCandidates?.length || 0}, filtered to ${filteredCatalog.length}`);

      const proxyUrl = `${supabaseUrl}/functions/v1/openai-proxy`;

      console.log("[PHASE_1.1] Building minimal payload for GPT");

      const minimalProfile = buildMinimalPricingProfile(profileData);
      let extractionMessage = `Transcript:\n${intake.transcript_text}\n\nPricing Profile:\n${JSON.stringify(minimalProfile)}`;

      if (existingCustomer) {
        extractionMessage += `\n\nIMPORTANT: Customer is already selected. DO NOT extract customer information. Use these details:\n${JSON.stringify({
          name: existingCustomer.name,
          email: existingCustomer.email || null,
          phone: existingCustomer.phone || null,
        })}\n\nFocus ONLY on extracting job details, materials, and time estimates.`;
      }

      if (filteredCatalog.length > 0) {
        extractionMessage += `\n\nMaterial Catalog (ONLY match to these ${filteredCatalog.length} items):\n${JSON.stringify(filteredCatalog)}`;
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
      extractionDuration = Date.now() - extractionStartTime;

      console.log(`[PHASE_1.1] GPT extraction completed in ${extractionDuration}ms`);

      if (!extractionResult.choices || !extractionResult.choices[0] || !extractionResult.choices[0].message) {
        console.error("[PHASE_1.1] Invalid GPT response structure", { result: extractionResult });
        throw new Error("Invalid response from extraction model");
      }

      const rawContent = extractionResult.choices[0].message.content;
      try {
        extractedData = JSON.parse(rawContent);
      } catch (parseError) {
        console.error("[PHASE_1.1] Failed to parse GPT JSON response", {
          error: parseError,
          rawContent: rawContent?.substring(0, 500)
        });
        throw new Error("Model returned invalid JSON");
      }

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
    console.log(`[PHASE_1.1] Total extraction pipeline: ${totalDuration}ms`);

    const performanceData: any = {
      total_duration_ms: totalDuration,
      optimization: "phase_1.1_sql_filtered"
    };

    if (typeof catalogDuration !== 'undefined') {
      performanceData.catalog_query_ms = catalogDuration;
      performanceData.gpt_duration_ms = extractionDuration;
    }

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
        performance: performanceData
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[PHASE_1.1] Extraction error:", error);

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
