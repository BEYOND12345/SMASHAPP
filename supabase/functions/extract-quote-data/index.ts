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
  "",
  "Return ONLY this exact JSON structure:",
  "{",
  '  "customer": { "name": string|null, "email": string|null, "phone": string|null },',
  '  "job": {',
  '    "title": string|null,',
  '    "summary": string|null,',
  '    "site_address": string|null,',
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
  '    "callout_fee_cents": number|null',
  "  },",
  '  "assumptions": [',
  '    { "field": string, "assumption": string, "confidence": number|null, "source": string|null }',
  "  ]",
  "}"
];

const EXTRACTION_ONLY_PROMPT = PROMPT_LINES.join("\n");

async function parseOrRepairJson(rawContent: string, authHeader: string, supabaseUrl: string): Promise<any> {
  try {
    return JSON.parse(rawContent);
  } catch (parseError) {
    console.warn("[JSON_REPAIR] Initial parse failed, attempting repair", {
      error: String(parseError),
      contentLength: rawContent.length,
      first200: rawContent.substring(0, 200),
      last200: rawContent.substring(Math.max(0, rawContent.length - 200))
    });

    const proxyUrl = `${supabaseUrl}/functions/v1/openai-proxy`;

    try {
      const repairResponse = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: "chat/completions",
          body: {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You convert invalid JSON into valid JSON. Output only valid JSON."
              },
              {
                role: "user",
                content: `Fix this so it becomes valid JSON. Do not change keys or structure. Replace NaN or Infinity with null. Remove trailing commas. Output only JSON.\n\n${rawContent}`
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0.0,
            max_tokens: 1500,
          },
        }),
      });

      if (!repairResponse.ok) {
        throw new Error("Repair request failed");
      }

      const repairResult = await repairResponse.json();
      const repairedContent = repairResult.choices?.[0]?.message?.content;

      if (!repairedContent) {
        throw new Error("No content in repair response");
      }

      console.log("[JSON_REPAIR] Repair successful");
      return JSON.parse(repairedContent);
    } catch (repairError) {
      console.error("[JSON_REPAIR] Repair also failed", {
        error: String(repairError),
        first200: rawContent.substring(0, 200)
      });
      throw new Error(`Model returned invalid JSON and repair failed: ${String(parseError)}`);
    }
  }
}

function wrapFieldValue(value: any, defaultConfidence: number): any {
  if (value === null || value === undefined) {
    return { value: null, confidence: 0.0 };
  }
  return { value, confidence: defaultConfidence };
}

function calculateDeterministicConfidence(extractedData: any, transcript: string): number {
  let confidence = 0.85;
  const transcriptLower = transcript.toLowerCase();

  if (!extractedData.job?.title) {
    confidence -= 0.15;
  }

  if (!extractedData.job?.scope_of_work || extractedData.job.scope_of_work.length === 0) {
    confidence -= 0.10;
  }

  const hasLabour = extractedData.time?.labour_entries && extractedData.time.labour_entries.length > 0;
  const transcriptMentionsLabour = /\b(hour|hours|day|days|week|weeks)\b/.test(transcriptLower);
  if (!hasLabour && transcriptMentionsLabour) {
    confidence -= 0.10;
  }

  const hasMaterials = extractedData.materials?.items && extractedData.materials.items.length > 0;
  const transcriptMentionsMaterials = /\b(buy|supply|purchase|material|materials|timber|paint|sheet)\b/.test(transcriptLower);
  if (!hasMaterials && transcriptMentionsMaterials) {
    confidence -= 0.10;
  }

  if (!extractedData.job?.site_address) {
    confidence -= 0.05;
  }

  return Math.max(0.0, Math.min(1.0, confidence));
}

function generateMissingFields(extractedData: any): any[] {
  const missingFields: any[] = [];

  const hasNoContent =
    (!extractedData.job?.scope_of_work || extractedData.job.scope_of_work.length === 0) &&
    (!extractedData.job?.summary);

  const hasNoWorkData =
    (!extractedData.time?.labour_entries || extractedData.time.labour_entries.length === 0) &&
    (!extractedData.materials?.items || extractedData.materials.items.length === 0) &&
    (!extractedData.fees?.travel_hours) &&
    (!extractedData.fees?.callout_fee_cents);

  if (hasNoContent && hasNoWorkData && !extractedData.job?.title) {
    missingFields.push({
      field: "work_description",
      reason: "No work description at all",
      severity: "required"
    });
  }

  if (!extractedData.customer?.name) {
    missingFields.push({
      field: "customer_name",
      reason: "Customer name not provided",
      severity: "warning"
    });
  }

  if (!extractedData.job?.site_address) {
    missingFields.push({
      field: "site_address",
      reason: "Site address not provided",
      severity: "warning"
    });
  }

  if (extractedData.time?.labour_entries) {
    extractedData.time.labour_entries.forEach((entry: any, idx: number) => {
      if (!entry.hours && !entry.days) {
        missingFields.push({
          field: `labour_entry_${idx}_time`,
          reason: "Labour time not specified",
          severity: "warning"
        });
      }
    });
  }

  return missingFields;
}

async function matchAndPriceMaterials(
  materials: any[],
  orgId: string,
  regionCode: string,
  markupPercent: number,
  supabase: any
): Promise<any[]> {
  if (!materials || materials.length === 0) {
    return [];
  }

  const materialsForMatching = materials.map(m => ({
    description: m.description || '',
    unit: m.unit || null,
    quantity: m.quantity || null
  }));

  const { data: matchResults, error } = await supabase
    .rpc('match_catalog_items_for_quote_materials', {
      p_org_id: orgId,
      p_region_code: regionCode,
      p_materials: materialsForMatching
    });

  if (error) {
    console.error("[CATALOG_MATCH] SQL matching failed", error);
    return materials.map(m => ({
      description: m.description,
      quantity: wrapFieldValue(m.quantity, 0.85),
      unit: wrapFieldValue(m.unit, 0.85),
      unit_price_cents: null,
      estimated_cost_cents: null,
      needs_pricing: true,
      source_store: null,
      notes: m.notes || null,
      catalog_item_id: null,
      catalog_match_confidence: null
    }));
  }

  return materials.map((m, idx) => {
    const match = matchResults[idx];
    let unitPriceCents = null;
    let estimatedCostCents = null;
    let needsPricing = true;

    if (match?.typical_low_price_cents && match?.typical_high_price_cents) {
      const midpoint = Math.round((match.typical_low_price_cents + match.typical_high_price_cents) / 2);
      unitPriceCents = Math.round(midpoint * (1 + markupPercent / 100));

      const quantity = typeof m.quantity === 'number' ? m.quantity : null;
      if (quantity !== null && unitPriceCents !== null) {
        estimatedCostCents = Math.round(unitPriceCents * quantity);
        needsPricing = false;
      }
    }

    return {
      description: m.description,
      quantity: wrapFieldValue(m.quantity, 0.85),
      unit: wrapFieldValue(match?.unit || m.unit, 0.85),
      unit_price_cents: unitPriceCents,
      estimated_cost_cents: estimatedCostCents,
      needs_pricing: needsPricing,
      source_store: null,
      notes: m.notes || null,
      catalog_item_id: match?.catalog_item_id || null,
      catalog_match_confidence: match?.match_confidence || null
    };
  });
}

function enrichExtractedData(rawData: any, pricingProfile: any): any {
  const enriched: any = {
    customer: rawData.customer || { name: null, email: null, phone: null },
    job: {
      title: rawData.job?.title || null,
      summary: rawData.job?.summary || null,
      site_address: rawData.job?.site_address || null,
      estimated_days_min: rawData.job?.estimated_days_min || null,
      estimated_days_max: rawData.job?.estimated_days_max || null,
      job_date: rawData.job?.job_date || null,
      scope_of_work: rawData.job?.scope_of_work || []
    },
    time: {
      labour_entries: (rawData.time?.labour_entries || []).map((entry: any) => ({
        description: entry.description,
        hours: wrapFieldValue(entry.hours, 0.85),
        days: wrapFieldValue(entry.days, 0.85),
        people: wrapFieldValue(entry.people, 0.85),
        note: entry.note || null
      }))
    },
    materials: {
      items: []
    },
    fees: {
      travel: {
        hours: wrapFieldValue(rawData.fees?.travel_hours, 0.85)
      },
      materials_pickup: null,
      callout_fee_cents: rawData.fees?.callout_fee_cents || null
    },
    pricing_defaults_used: {
      hourly_rate_cents: pricingProfile.hourly_rate_cents,
      materials_markup_percent: pricingProfile.materials_markup_percent,
      tax_rate_percent: pricingProfile.tax_rate_percent,
      currency: pricingProfile.currency
    },
    assumptions: rawData.assumptions || [],
    missing_fields: [],
    quality: {
      overall_confidence: 0.85,
      ambiguous_fields: [],
      critical_fields_below_threshold: [],
      requires_user_confirmation: false
    }
  };

  return enriched;
}

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
    let extractionDuration: number | undefined;
    let catalogMatchDuration: number | undefined;
    let postProcessDuration: number | undefined;

    if (user_corrections_json && intake.extraction_json) {
      console.log("[PHASE_1.2] User corrections path - merging deterministically");
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

      console.log(`[PHASE_1.2] Recalculated confidence: ${overallConfidence.toFixed(2)}`);
    } else {
      if (!intake.transcript_text) {
        throw new Error("No transcript available for extraction");
      }

      console.log("[PHASE_1.2] Starting extraction-only pipeline");

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
      const minimalProfile = buildMinimalPricingProfile(profileData, regionCode);

      const proxyUrl = `${supabaseUrl}/functions/v1/openai-proxy`;

      let extractionMessage = `Transcript:\n${intake.transcript_text}\n\nPricing Defaults:\n${JSON.stringify(minimalProfile)}`;

      if (existingCustomer) {
        extractionMessage += `\n\nIMPORTANT: Customer is already selected. DO NOT extract customer information. Use these details:\n${JSON.stringify({
          name: existingCustomer.name,
          email: existingCustomer.email || null,
          phone: existingCustomer.phone || null,
        })}\n\nFocus ONLY on extracting job details, materials, and time estimates.`;
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
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: EXTRACTION_ONLY_PROMPT },
              { role: "user", content: extractionMessage },
            ],
            response_format: { type: "json_object" },
            temperature: 0.0,
            max_tokens: 900,
          },
        }),
      });

      if (!extractionResponse.ok) {
        const errorText = await extractionResponse.text();
        throw new Error(`OpenAI extraction failed: ${errorText}`);
      }

      const extractionResult = await extractionResponse.json();
      extractionDuration = Date.now() - extractionStartTime;

      console.log(`[PHASE_1.2] GPT extraction completed in ${extractionDuration}ms`);

      if (!extractionResult?.choices?.[0]?.message?.content) {
        throw new Error("Invalid response from extraction model");
      }

      const rawContent = extractionResult.choices[0].message.content;
      const rawExtraction = await parseOrRepairJson(rawContent, authHeader, supabaseUrl);

      console.log("[PHASE_1.2] Starting post-processing");
      const postProcessStartTime = Date.now();

      extractedData = enrichExtractedData(rawExtraction, minimalProfile);

      if (existingCustomer) {
        extractedData.customer = {
          name: existingCustomer.name,
          email: existingCustomer.email || null,
          phone: existingCustomer.phone || null,
        };
        extractedData.assumptions.push({
          field: "customer",
          assumption: `Customer pre-selected: ${existingCustomer.name}`,
          confidence: 1.0,
          source: "user_selection"
        });
      }

      const catalogMatchStartTime = Date.now();
      const rawMaterials = rawExtraction.materials?.items || [];
      const enrichedMaterials = await matchAndPriceMaterials(
        rawMaterials,
        (profileData as any).org_id,
        regionCode,
        minimalProfile.materials_markup_percent,
        supabase
      );
      catalogMatchDuration = Date.now() - catalogMatchStartTime;

      console.log(`[PHASE_1.2] Catalog match SQL in ${catalogMatchDuration}ms`);

      extractedData.materials.items = enrichedMaterials;

      const materialsNeedingPricing = enrichedMaterials.filter(m => m.needs_pricing);
      if (materialsNeedingPricing.length > 0) {
        extractedData.missing_fields.push({
          field: "materials_pricing",
          reason: `${materialsNeedingPricing.length} materials need pricing`,
          severity: "warning"
        });
      }

      extractedData.quality.overall_confidence = calculateDeterministicConfidence(
        extractedData,
        intake.transcript_text
      );

      extractedData.missing_fields = generateMissingFields(extractedData);

      postProcessDuration = Date.now() - postProcessStartTime;
      console.log(`[PHASE_1.2] Post processing in ${postProcessDuration}ms`);
    }

    console.log("[PHASE_1.2] Determining status based on quality checks");

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
        extraction_model: "gpt-4o-mini-phase-1.2",
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
    console.log(`[PHASE_1.2] Total extraction pipeline: ${totalDuration}ms`);

    const performanceData: any = {
      total_duration_ms: totalDuration,
      optimization: "phase_1.2_deterministic"
    };

    if (typeof extractionDuration !== 'undefined') {
      performanceData.gpt_duration_ms = extractionDuration;
    }
    if (typeof catalogMatchDuration !== 'undefined') {
      performanceData.catalog_match_sql_ms = catalogMatchDuration;
    }
    if (typeof postProcessDuration !== 'undefined') {
      performanceData.post_process_ms = postProcessDuration;
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
    console.error("[PHASE_1.2] Extraction error:", error);

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
