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

const SPEECH_REPAIR_PROMPT = `You are a speech repair system for construction quote transcripts. Your job is to clean up messy, incomplete human speech into clear, structured sentences BEFORE extraction.

RULES:
1. DO NOT invent quantities, prices, or material brands not mentioned
2. DO NOT apply business logic or pricing rules
3. DO preserve uncertainty (e.g., "three or four days" stays as is)
4. DO expand vague references into clearer structure
5. DO separate combined statements into distinct sentences
6. DO correct obvious speech recognition errors
7. DO preserve the speaker's uncertainty phrases like "maybe", "around", "approximately"

EXAMPLE TRANSFORMATIONS:

Input: "uh yeah so three rooms and I'll scrape it first maybe three hours or so and then paint white and the doors"
Output: "Paint three bedrooms. Scrape walls first, approximately 3 hours. Paint walls white. Paint doors and trim."

Input: "need to replace that uh that blackbutt timber like twenty meters or so and some screws dunno how many"
Output: "Replace blackbutt timber, approximately 20 linear meters. Need screws, quantity not specified."

Input: "job's in Richmond probably take me a day maybe two to do it all"
Output: "Job location: Richmond. Estimated duration: 1 to 2 days."

Return ONLY the repaired transcript text, no JSON, no explanation.`;

const EXTRACTION_PROMPT = `You are a construction quote extraction system. Extract structured quote data from the REPAIRED transcript.

CRITICAL: Missing details are NORMAL and EXPECTED in voice quotes. Your job is to extract what WAS said and flag what WASN'T, but NEVER block or fail because of missing information.

FIELD-LEVEL CONFIDENCE RULES:
- Every extracted numeric value MUST include a confidence score (0.0 to 1.0)
- Explicitly stated values: confidence 0.85-0.95
- Implied values from context: confidence 0.70-0.85
- Reasonable estimates from vague speech: confidence 0.55-0.70
- Assumed/defaulted values: confidence 0.40-0.55
- DO NOT set confidence to 0 - if you extract something, it has at least 0.40 confidence

EXTRACTION RULES:
1. VAGUE DURATIONS: "a couple hours" → 2 hours (confidence 0.65), "few days" → 3 days (confidence 0.60), "about a week" → 5 days (confidence 0.65)
2. VAGUE QUANTITIES: "a couple" → 2 (confidence 0.65), "a few" → 3 (confidence 0.60), "some" → 5 (confidence 0.50)
3. RANGES: "three or four days" → store min: 3, max: 4, use max for estimates
4. UNIT CONVERSION: "20 linear meters" = {quantity: 20, unit: "linear_m"}, "100 screws" = {quantity: 100, unit: "each"}
5. DEFAULTS: If hourly rate not spoken, use profile default and mark in defaults_used
6. TRAVEL: If mentioned but vague, estimate reasonably (e.g., "drive there" → 1 hour with confidence 0.55)
7. MATERIALS: If mentioned without cost, set needs_pricing: true, but ALWAYS include them
8. NEVER invent brands or specific costs not mentioned
9. UNIT NORMALIZATION: "metres"/"meters"/"m"/"lm" = "linear_m", "square metres"/"sqm"/"m2" = "square_m"
10. WHEN UNSURE: Extract with lower confidence rather than mark as missing

ASSUMPTIONS LEDGER:
- Log EVERY assumption, rounding, default, or interpretation
- Format: {field: "field_name", assumption: "description", confidence: 0.0-1.0, source: "reason"}
- Examples:
  * Rounded "three or four" to 4 days
  * Assumed standard 2-coat system (not mentioned)
  * Defaulted to hourly travel rate (charge method not specified)

MISSING FIELDS DETECTION:
- Flag missing fields, but be LENIENT - missing details are normal
- severity: "warning" (most cases) - field is missing but quote can still be created
- severity: "required" (EXTREMELY RARE) - only for truly critical fields that make the quote completely impossible
- Examples of WARNING (not blocking): customer contact, labour hours, exact quantities, exact durations, travel details, materials pricing
- Examples of REQUIRED (blocking): NO work description at all (empty job title and summary)
- CRITICAL: Missing labour hours should ALWAYS be "warning" not "required" - user can fill them in during review
- When in doubt, use "warning" not "required"

SCOPE OF WORK - CRITICAL REQUIREMENTS:
8. Break down work into DISCRETE, MEASURABLE tasks - never combine multiple activities
9. Separate prep work, execution, and finishing into distinct items
10. Be SPECIFIC about locations and quantities (e.g., "three bedrooms" not just "bedrooms")
11. Each scope item should be a single, clear task that a customer can understand
12. Use professional trade terminology but keep it accessible

MATERIALS CATALOG MATCHING:
13. If a Material Catalog is provided, try to match mentioned materials to catalog items
14. Match based on description similarity (e.g., "white paint" matches "White top coat")
15. If matched, include catalog_item_id and set catalog_match_confidence (0.0-1.0)
16. Use catalog unit_price_cents when matched with high confidence (>0.8)
17. If no good match or catalog empty, leave catalog_item_id as null and set needs_pricing: true

Return ONLY valid JSON matching this exact schema:
{
  "repaired_transcript": "string - cleaned up version of raw transcript",
  "customer": {
    "name": "string or null",
    "email": "string or null",
    "phone": "string or null"
  },
  "job": {
    "title": "string",
    "summary": "string",
    "site_address": "string or null",
    "estimated_days_min": "number or null",
    "estimated_days_max": "number or null",
    "job_date": "ISO date string or null",
    "scope_of_work": ["string - discrete, measurable task items"]
  },
  "time": {
    "labour_entries": [
      {
        "description": "string",
        "hours": {"value": "number or null", "confidence": "number 0-1"},
        "days": {"value": "number or null", "confidence": "number 0-1"},
        "people": {"value": "number or null", "confidence": "number 0-1"},
        "note": "string or null"
      }
    ]
  },
  "materials": {
    "items": [
      {
        "description": "string",
        "quantity": {"value": "number", "confidence": "number 0-1"},
        "unit": {"value": "string", "confidence": "number 0-1"},
        "unit_price_cents": "number or null",
        "estimated_cost_cents": "number or null",
        "needs_pricing": "boolean",
        "source_store": "string or null",
        "notes": "string or null",
        "catalog_item_id": "uuid or null",
        "catalog_match_confidence": "number 0-1 or null"
      }
    ]
  },
  "fees": {
    "travel": {
      "is_time": "boolean",
      "hours": {"value": "number or null", "confidence": "number 0-1"},
      "fee_cents": "number or null"
    },
    "materials_pickup": {
      "enabled": "boolean",
      "minutes": {"value": "number or null", "confidence": "number 0-1"},
      "fee_cents": "number or null"
    },
    "callout_fee_cents": "number or null"
  },
  "pricing_defaults_used": {
    "hourly_rate_cents": "number or null",
    "materials_markup_percent": "number or null",
    "tax_rate_percent": "number or null",
    "currency": "string or null"
  },
  "assumptions": [
    {
      "field": "string - field name",
      "assumption": "string - what was assumed",
      "confidence": "number 0-1",
      "source": "string - reason for assumption"
    }
  ],
  "missing_fields": [
    {
      "field": "string - field name",
      "reason": "string - why missing",
      "severity": "required or warning"
    }
  ],
  "quality": {
    "overall_confidence": "number 0-1",
    "ambiguous_fields": ["string"],
    "critical_fields_below_threshold": ["string - fields with confidence < 0.6"]
  }
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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

    // RATE LIMITING: Check if user has exceeded rate limit
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

    // Fetch intake record
    const { data: intake, error: intakeError } = await supabase
      .from("voice_intakes")
      .select("*")
      .eq("id", intake_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (intakeError || !intake) {
      throw new Error("Voice intake not found");
    }

    // Check if customer is pre-selected
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

    // PHASE A2: If corrections exist, merge deterministically (no new AI inference)
    if (user_corrections_json && intake.extraction_json) {
      console.log("Phase A2: Merging user corrections deterministically...");
      extractedData = JSON.parse(JSON.stringify(intake.extraction_json)); // Deep clone

      // Apply labour overrides
      if (user_corrections_json.labour_overrides && extractedData.time?.labour_entries) {
        Object.entries(user_corrections_json.labour_overrides).forEach(([key, value]: [string, any]) => {
          const match = key.match(/^labour_(\d+)_(hours|days|people)$/);
          if (match) {
            const [, idxStr, field] = match;
            const idx = parseInt(idxStr, 10);
            if (extractedData.time.labour_entries[idx]) {
              const entry = extractedData.time.labour_entries[idx];
              // Set value and boost confidence to 1.0 (user-corrected)
              if (typeof entry[field] === 'object') {
                entry[field] = { value, confidence: 1.0 };
              } else {
                entry[field] = { value, confidence: 1.0 };
              }
            }
          }
        });
      }

      // Apply materials overrides
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

      // Apply travel overrides
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

      // Boost confidence for confirmed assumptions
      if (user_corrections_json.confirmed_assumptions && extractedData.assumptions) {
        extractedData.assumptions = extractedData.assumptions.map((assumption: any) => {
          if (user_corrections_json.confirmed_assumptions.includes(assumption.field)) {
            return { ...assumption, confidence: 1.0 };
          }
          return assumption;
        });
      }

      // Recalculate overall confidence
      let totalConfidence = 0;
      let confidenceCount = 0;

      // Labour confidence
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

      // Materials confidence
      if (extractedData.materials?.items) {
        extractedData.materials.items.forEach((item: any) => {
          if (item.quantity) {
            const conf = typeof item.quantity === 'object' ? item.quantity.confidence : 0.9;
            totalConfidence += conf;
            confidenceCount++;
          }
        });
      }

      // Assumption confidence
      if (extractedData.assumptions) {
        extractedData.assumptions.forEach((assumption: any) => {
          totalConfidence += assumption.confidence || 0;
          confidenceCount++;
        });
      }

      const overallConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.overall_confidence = overallConfidence;

      console.log(`Recalculated confidence: ${overallConfidence.toFixed(2)}`);
    } else {
      // PHASE A1: Standard extraction flow (no corrections)
      if (!intake.transcript_text) {
        throw new Error("No transcript available for extraction");
      }

      // Get pricing profile
      const { data: profileData, error: profileError } = await supabase
        .rpc("get_effective_pricing_profile", { p_user_id: user.id });

      if (profileError || !profileData) {
        throw new Error("No pricing profile found");
      }

      // Get material catalog for the user's org
      const { data: catalogItems } = await supabase
        .from("material_catalog_items")
        .select("id, name, category, unit, unit_price_cents, supplier_name")
        .eq("org_id", (profileData as any).org_id)
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      const proxyUrl = `${supabaseUrl}/functions/v1/openai-proxy`;

      // STEP 1: Speech Repair - Clean up messy transcript
      console.log("Step 1: Repairing transcript...");
      const repairResponse = await fetch(proxyUrl, {
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
              { role: "system", content: SPEECH_REPAIR_PROMPT },
              { role: "user", content: intake.transcript_text },
            ],
            temperature: 0.1,
          },
        }),
      });

      if (!repairResponse.ok) {
        const errorText = await repairResponse.text();
        throw new Error(`Speech repair failed: ${errorText}`);
      }

      const repairResult = await repairResponse.json();
      const repairedTranscript = repairResult.choices[0].message.content.trim();

      console.log("Repaired transcript:", repairedTranscript);

      // STEP 2: Structured Extraction with Confidence Scoring
      console.log("Step 2: Extracting structured data with confidence scores...");

      let extractionMessage = `Raw Transcript:\n${intake.transcript_text}\n\nRepaired Transcript:\n${repairedTranscript}\n\nPricing Profile:\n${JSON.stringify(profileData, null, 2)}`;

      if (existingCustomer) {
        extractionMessage += `\n\nIMPORTANT: Customer is already selected. DO NOT extract customer information. Use these details:\n${JSON.stringify({
          name: existingCustomer.name,
          email: existingCustomer.email || null,
          phone: existingCustomer.phone || null,
        }, null, 2)}\n\nFocus ONLY on extracting job details, materials, and time estimates.`;
      }

      if (catalogItems && catalogItems.length > 0) {
        extractionMessage += `\n\nMaterial Catalog (match materials to these if possible):\n${JSON.stringify(catalogItems, null, 2)}`;
      }

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
              { role: "system", content: EXTRACTION_PROMPT },
              { role: "user", content: extractionMessage },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
          },
        }),
      });

      if (!extractionResponse.ok) {
        const errorText = await extractionResponse.text();
        throw new Error(`OpenAI extraction failed: ${errorText}`);
      }

      const extractionResult = await extractionResponse.json();
      extractedData = JSON.parse(extractionResult.choices[0].message.content);

      // Override customer data if we have an existing customer
      if (existingCustomer) {
        console.log("[CUSTOMER] Overriding extracted customer data with existing customer");
        extractedData.customer = {
          name: existingCustomer.name,
          email: existingCustomer.email || null,
          phone: existingCustomer.phone || null,
        };
        // Add to assumptions that customer was pre-selected
        if (!extractedData.assumptions) extractedData.assumptions = [];
        extractedData.assumptions.push({
          field: "customer",
          assumption: `Customer pre-selected: ${existingCustomer.name}`,
          confidence: 1.0,
          source: "user_selection"
        });
      }
    }

    // STEP 3: Determine Status Based on Quality Checks
    console.log("Step 3: Determining status based on quality checks...");

    const missingFields = extractedData.missing_fields || [];
    const assumptions = extractedData.assumptions || [];
    const quality = extractedData.quality || {};

    // CRITICAL: Validate and enforce overall_confidence is always a valid number
    // This prevents NULL confidence from ever being written to the database
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

    // Coerce to number and clamp to valid range [0.0, 1.0]
    oc = Number(oc);
    if (Number.isNaN(oc)) oc = 0.5;
    if (oc < 0) oc = 0.0;
    if (oc > 1) oc = 1.0;

    // Write back to extractedData so it's stored correctly
    if (!extractedData.quality) extractedData.quality = {};
    extractedData.quality.overall_confidence = oc;

    // Check for required missing fields
    const hasRequiredMissing = missingFields.some((mf: any) => mf.severity === "required");

    // Check for critical fields below confidence threshold
    const hasCriticalLowConfidence = quality.critical_fields_below_threshold?.length > 0;

    // Use validated confidence
    const overallConfidence = oc;

    // Check if any labour hours have confidence < 0.6
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

    // Determine final status
    let finalStatus = "extracted";
    let requiresReview = false;

    // CRITICAL: If user has provided corrections, honor their confirmation and skip confidence checks
    // This breaks the infinite review loop for complete but low-confidence transcripts
    const userHasConfirmed = user_corrections_json !== undefined && user_corrections_json !== null;

    if (userHasConfirmed) {
      console.log("[REVIEW_FLOW] User corrections provided, honoring confirmation regardless of confidence");
      finalStatus = "extracted";
      requiresReview = false;

      // Set quality flag to indicate user confirmation was required
      if (!extractedData.quality) extractedData.quality = {};
      extractedData.quality.requires_user_confirmation = false; // Now confirmed
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

    // Update intake with extraction results
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
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Extraction error:", error);

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