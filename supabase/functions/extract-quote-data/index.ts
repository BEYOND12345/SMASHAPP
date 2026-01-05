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
  "",
  "Return ONLY this exact JSON structure:",
  "{",
  '  "customer": { "name": string|null, "email": string|null, "phone": string|null },',
  '  "job": {',
  '    "title": string,',
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
    debugWarn("[JSON_REPAIR] Initial parse failed, attempting repair", {
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

      debugLog("[JSON_REPAIR] Repair successful");
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

/**
 * Normalize text for alias matching
 * Must be identical for both alias insertion and lookup
 */
function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let normalized = text.toLowerCase().trim();

  // Replace ampersand with 'and'
  normalized = normalized.replace(/&/g, 'and');

  // Remove punctuation (keep spaces and alphanumeric)
  normalized = normalized.replace(/[^\w\s]/g, ' ');

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Remove filler tokens as standalone words
  const fillerTokens = [
    'materials', 'material', 'timber', 'wood', 'board', 'boards',
    'sheet', 'sheets', 'pack', 'packs', 'bottle', 'can', 'cans'
  ];

  const words = normalized.split(' ');
  const filtered = words.filter(word => !fillerTokens.includes(word));

  // If filtering removed everything, keep original normalized
  if (filtered.length === 0) {
    return normalized;
  }

  normalized = filtered.join(' ');

  // Normalize metre variants
  normalized = normalized.replace(/\bmetres?\b/g, 'metre');
  normalized = normalized.replace(/\bm\b/g, 'metre');

  return normalized.trim();
}

/**
 * Try to match material description against org's alias table
 * Returns matched catalog item data if found, null otherwise
 */
async function matchAlias(
  orgId: string,
  description: string,
  supabase: any
): Promise<any> {
  if (!description || typeof description !== 'string') return null;

  const normalizedDesc = normalizeText(description);
  if (!normalizedDesc) return null;

  debugLog('[ALIAS_MATCH] Attempting alias match for:', {
    original: description,
    normalized: normalizedDesc
  });

  // Strategy A: Exact match
  const { data: exactMatches, error: exactError } = await supabase
    .from('material_catalog_aliases')
    .select(`
      id,
      alias_text,
      normalized_alias,
      priority,
      canonical_catalog_item_id,
      material_catalog_items!material_catalog_aliases_canonical_catalog_item_id_fkey (
        id,
        name,
        unit,
        unit_price_cents,
        typical_low_price_cents,
        typical_high_price_cents
      )
    `)
    .eq('org_id', orgId)
    .eq('normalized_alias', normalizedDesc)
    .order('priority', { ascending: true })
    .limit(1);

  if (!exactError && exactMatches && exactMatches.length > 0) {
    const match = exactMatches[0];
    const catalogItem = (match as any).material_catalog_items;

    debugLog('[ALIAS_MATCH] Exact match found:', {
      alias: match.alias_text,
      catalog_item: catalogItem?.name
    });

    return {
      catalog_item_id: catalogItem.id,
      catalog_item_name: catalogItem.name,
      unit: catalogItem.unit,
      typical_low_price_cents: catalogItem.typical_low_price_cents,
      typical_high_price_cents: catalogItem.typical_high_price_cents,
      match_type: 'exact_alias',
      matched_alias: match.alias_text
    };
  }

  // Strategy B: Contains match (find if description contains any alias)
  const { data: allAliases, error: allError } = await supabase
    .from('material_catalog_aliases')
    .select(`
      id,
      alias_text,
      normalized_alias,
      priority,
      canonical_catalog_item_id,
      material_catalog_items!material_catalog_aliases_canonical_catalog_item_id_fkey (
        id,
        name,
        unit,
        unit_price_cents,
        typical_low_price_cents,
        typical_high_price_cents
      )
    `)
    .eq('org_id', orgId)
    .order('priority', { ascending: true });

  if (allError || !allAliases || allAliases.length === 0) {
    debugLog('[ALIAS_MATCH] No aliases found for org');
    return null;
  }

  // Find aliases where normalized_desc contains normalized_alias as whole word sequence
  const containsMatches = allAliases.filter(alias => {
    const aliasNorm = alias.normalized_alias;
    if (!aliasNorm) return false;

    // Check if description contains alias as whole word sequence
    const pattern = new RegExp(`\\b${aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return pattern.test(normalizedDesc);
  });

  if (containsMatches.length > 0) {
    // Choose longest normalized_alias, then lowest priority
    containsMatches.sort((a, b) => {
      const lenDiff = b.normalized_alias.length - a.normalized_alias.length;
      if (lenDiff !== 0) return lenDiff;
      return a.priority - b.priority;
    });

    const match = containsMatches[0];
    const catalogItem = (match as any).material_catalog_items;

    debugLog('[ALIAS_MATCH] Contains match found:', {
      alias: match.alias_text,
      catalog_item: catalogItem?.name
    });

    return {
      catalog_item_id: catalogItem.id,
      catalog_item_name: catalogItem.name,
      unit: catalogItem.unit,
      typical_low_price_cents: catalogItem.typical_low_price_cents,
      typical_high_price_cents: catalogItem.typical_high_price_cents,
      match_type: 'contains_alias',
      matched_alias: match.alias_text
    };
  }

  debugLog('[ALIAS_MATCH] No alias match found');
  return null;
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

  // Step 1: Try alias matching for each material
  const aliasResults: (any | null)[] = [];
  for (const material of materials) {
    const aliasMatch = await matchAlias(orgId, material.description, supabase);
    aliasResults.push(aliasMatch);
  }

  // Step 2: For materials without alias match, prepare for fuzzy matching
  const materialsNeedingFuzzyMatch: any[] = [];
  const fuzzyMatchIndices: number[] = [];

  materials.forEach((m, idx) => {
    if (!aliasResults[idx]) {
      materialsNeedingFuzzyMatch.push({
        description: m.description || '',
        unit: m.unit || null,
        quantity: m.quantity || null
      });
      fuzzyMatchIndices.push(idx);
    }
  });

  // Step 3: Run fuzzy matching for remaining materials
  let fuzzyMatchResults: any[] = [];
  if (materialsNeedingFuzzyMatch.length > 0) {
    const { data: matchResults, error } = await supabase
      .rpc('match_catalog_items_for_quote_materials', {
        p_org_id: orgId,
        p_region_code: regionCode,
        p_materials: materialsNeedingFuzzyMatch
      });

    if (error) {
      console.error("[CATALOG_MATCH] SQL matching failed", error);
      fuzzyMatchResults = materialsNeedingFuzzyMatch.map(() => null);
    } else {
      fuzzyMatchResults = matchResults || [];
    }
  }

  // Step 4: Merge results - alias matches take priority
  return materials.map((m, idx) => {
    const aliasMatch = aliasResults[idx];

    // If alias match found, use it
    if (aliasMatch) {
      const midpoint = Math.round(
        (aliasMatch.typical_low_price_cents + aliasMatch.typical_high_price_cents) / 2
      );
      const unitPriceCents = Math.round(midpoint * (1 + markupPercent / 100));

      const quantity = typeof m.quantity === 'number' ? m.quantity : null;
      const estimatedCostCents = quantity !== null && unitPriceCents !== null
        ? Math.round(unitPriceCents * quantity)
        : null;

      const needsPricing = estimatedCostCents === null;

      return {
        description: m.description,
        quantity: wrapFieldValue(m.quantity, 0.85),
        unit: wrapFieldValue(aliasMatch.unit || m.unit, 0.85),
        unit_price_cents: unitPriceCents,
        estimated_cost_cents: estimatedCostCents,
        needs_pricing: needsPricing,
        source_store: null,
        notes: `Matched by alias: ${aliasMatch.matched_alias}`,
        catalog_item_id: aliasMatch.catalog_item_id,
        catalog_match_confidence: 1.0
      };
    }

    // Otherwise use fuzzy match result
    const fuzzyIdx = fuzzyMatchIndices.indexOf(idx);
    const fuzzyMatch = fuzzyIdx >= 0 ? fuzzyMatchResults[fuzzyIdx] : null;

    let unitPriceCents = null;
    let estimatedCostCents = null;
    let needsPricing = true;

    if (fuzzyMatch?.typical_low_price_cents && fuzzyMatch?.typical_high_price_cents) {
      const midpoint = Math.round(
        (fuzzyMatch.typical_low_price_cents + fuzzyMatch.typical_high_price_cents) / 2
      );
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
      unit: wrapFieldValue(fuzzyMatch?.unit || m.unit, 0.85),
      unit_price_cents: unitPriceCents,
      estimated_cost_cents: estimatedCostCents,
      needs_pricing: needsPricing,
      source_store: null,
      notes: m.notes || null,
      catalog_item_id: fuzzyMatch?.catalog_item_id || null,
      catalog_match_confidence: fuzzyMatch?.match_confidence || null
    };
  });
}

function generateFallbackTitle(extractedData: any, transcript: string): string {
  if (extractedData.job?.scope_of_work && extractedData.job.scope_of_work.length > 0) {
    const firstScope = String(extractedData.job.scope_of_work[0]).trim();
    if (firstScope.length > 0) {
      return firstScope.substring(0, 60);
    }
  }

  const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length > 0) {
    const firstSentence = sentences[0];
    if (firstSentence.length >= 10 && firstSentence.length <= 100) {
      return firstSentence.substring(0, 60);
    }
  }

  if (extractedData.time?.labour_entries && extractedData.time.labour_entries.length > 0) {
    const firstLabour = extractedData.time.labour_entries[0];
    if (firstLabour.description && firstLabour.description.length > 0) {
      return String(firstLabour.description).substring(0, 60);
    }
  }

  if (extractedData.materials?.items && extractedData.materials.items.length > 0) {
    const firstMaterial = extractedData.materials.items[0];
    if (firstMaterial.description && firstMaterial.description.length > 0) {
      return `Supply ${String(firstMaterial.description).substring(0, 50)}`;
    }
  }

  return `Voice Quote ${new Date().toLocaleDateString()}`;
}

function enrichExtractedData(rawData: any, pricingProfile: any, transcript?: string): any {
  let jobTitle = rawData.job?.title || null;

  if (!jobTitle || jobTitle.trim() === '' || jobTitle.toLowerCase() === 'processing job') {
    if (transcript) {
      jobTitle = generateFallbackTitle(rawData, transcript);
      debugLog('[TITLE_FALLBACK] Generated fallback title:', jobTitle);
    } else {
      jobTitle = null;
    }
  }

  const enriched: any = {
    customer: rawData.customer || { name: null, email: null, phone: null },
    job: {
      title: jobTitle,
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

    debugLog("[AUTH] User authenticated", { user_id: user.id });

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
      debugWarn("[SECURITY] RATE_LIMIT user_id=" + user.id + " endpoint=extract-quote-data");
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

    const { intake_id, user_corrections_json, trace_id }: ExtractRequest = await req.json();

    debugLog(`[PERF] trace_id=${trace_id || 'none'} step=extract_start intake_id=${intake_id}`);

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
      debugLog("[CUSTOMER] Using pre-selected customer:", intake.customer_id);
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("id", intake.customer_id)
        .maybeSingle();

      if (!customerError && customerData) {
        existingCustomer = customerData;
        debugLog("[CUSTOMER] Found existing customer:", existingCustomer.name);
      } else {
        debugWarn("[CUSTOMER] Failed to load pre-selected customer, will extract from transcript");
      }
    }

    let extractedData: any;
    let extractionDuration: number | undefined;
    let catalogMatchDuration: number | undefined;
    let postProcessDuration: number | undefined;

    if (user_corrections_json && intake.extraction_json) {
      debugLog("[PHASE_1.2] User corrections path - merging deterministically");
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

      debugLog(`[PHASE_1.2] Recalculated confidence: ${overallConfidence.toFixed(2)}`);
    } else {
      if (!intake.transcript_text) {
        throw new Error("No transcript available for extraction");
      }

      debugLog("[PHASE_1.2] Starting extraction-only pipeline");

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

      debugLog(`[PHASE_1.2] GPT extraction completed in ${extractionDuration}ms`);

      if (!extractionResult?.choices?.[0]?.message?.content) {
        throw new Error("Invalid response from extraction model");
      }

      const rawContent = extractionResult.choices[0].message.content;
      const rawExtraction = await parseOrRepairJson(rawContent, authHeader, supabaseUrl);

      debugLog("[PHASE_1.2] Starting post-processing");
      const postProcessStartTime = Date.now();

      extractedData = enrichExtractedData(rawExtraction, minimalProfile, intake.transcript_text);

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

      debugLog(`[PHASE_1.2] Catalog match SQL in ${catalogMatchDuration}ms`);

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
      debugLog(`[PHASE_1.2] Post processing in ${postProcessDuration}ms`);
    }

    debugLog("[PHASE_1.2] Determining status based on quality checks");

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
      debugWarn("[EXTRACTION_CONFIDENCE] DEFAULT_APPLIED", {
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
      debugLog("[REVIEW_FLOW] User corrections provided, honoring confirmation regardless of confidence");
      finalStatus = "extracted";
      requiresReview = false;

      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = false;
      extractedData.quality.user_confirmed = true;
      extractedData.quality.user_confirmed_at = new Date().toISOString();
    } else if (hasRequiredMissing) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      debugLog("[REVIEW_FLOW] Status: needs_user_review (reason: required fields missing)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else if (hasCriticalLowConfidence) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      debugLog("[REVIEW_FLOW] Status: needs_user_review (reason: critical fields below confidence threshold)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else if (hasLowConfidenceLabour) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      debugLog("[REVIEW_FLOW] Status: needs_user_review (reason: labour hours confidence < 0.6)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else if (overallConfidence < 0.7) {
      finalStatus = "needs_user_review";
      requiresReview = true;
      debugLog("[REVIEW_FLOW] Status: needs_user_review (reason: overall confidence < 0.7)");
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = true;
    } else {
      debugLog("[REVIEW_FLOW] Status: extracted (all quality checks passed)");
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

    debugLog("[PROGRESSIVE_UPDATE] Updating quote record with extracted data");

    const { data: quoteData } = await supabase
      .from("quotes")
      .select("id, customer_id, org_id")
      .eq("id", intake.created_quote_id)
      .maybeSingle();

    if (quoteData) {
      let finalCustomerId = quoteData.customer_id;

      if (!existingCustomer && extractedData.customer?.name) {
        debugLog("[PROGRESSIVE_UPDATE] Attempting to match/create customer from extracted name");

        const { data: matchedCustomer } = await supabase
          .from("customers")
          .select("id, name")
          .eq("org_id", quoteData.org_id)
          .or(`name.ilike.%${extractedData.customer.name}%,email.eq.${extractedData.customer.email || ''}`)
          .limit(1)
          .maybeSingle();

        if (matchedCustomer) {
          debugLog("[PROGRESSIVE_UPDATE] Matched existing customer:", matchedCustomer.name);
          finalCustomerId = matchedCustomer.id;
        } else if (extractedData.customer.name) {
          debugLog("[PROGRESSIVE_UPDATE] Creating new customer:", extractedData.customer.name);
          const { data: newCustomer, error: customerCreateError } = await supabase
            .from("customers")
            .insert({
              org_id: quoteData.org_id,
              name: extractedData.customer.name,
              email: extractedData.customer.email || null,
              phone: extractedData.customer.phone || null,
            })
            .select("id")
            .single();

          if (!customerCreateError && newCustomer) {
            finalCustomerId = newCustomer.id;
            debugLog("[PROGRESSIVE_UPDATE] New customer created:", finalCustomerId);

            await supabase
              .from("voice_intakes")
              .update({ customer_id: newCustomer.id })
              .eq("id", intake_id);
          }
        }
      }

      let finalTitle = extractedData.job?.title || "Processing job";
      if (!finalTitle || finalTitle === "Processing job") {
        finalTitle = generateFallbackTitle(extractedData, intake.transcript_text);
        debugLog("[PROGRESSIVE_UPDATE] Using fallback title:", finalTitle);
      }

      const quoteUpdateData: any = {
        title: finalTitle,
        description: extractedData.job?.summary || "",
        scope_of_work: extractedData.job?.scope_of_work || [],
      };

      if (finalCustomerId !== quoteData.customer_id) {
        quoteUpdateData.customer_id = finalCustomerId;
      }

      const { error: quoteUpdateError } = await supabase
        .from("quotes")
        .update(quoteUpdateData)
        .eq("id", intake.created_quote_id);

      if (quoteUpdateError) {
        console.error("[PROGRESSIVE_UPDATE] Failed to update quote:", quoteUpdateError);
      } else {
        debugLog("[PROGRESSIVE_UPDATE] Quote updated successfully with extracted data");
      }
    }

    const totalDuration = Date.now() - startTime;
    debugLog(`[PERF] trace_id=${trace_id || 'none'} step=extract_complete intake_id=${intake_id} ms=${totalDuration} status=${finalStatus}`);

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
