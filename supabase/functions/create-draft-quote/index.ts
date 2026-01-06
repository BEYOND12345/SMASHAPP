import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const DRAFT_VERSION = "v2.5-2026-01-05-batched-ai-plus-customer-extraction";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateDraftRequest {
  intake_id: string;
  trace_id?: string;
}

async function estimateMaterialPrice(
  material: {
    description: string;
    quantity: number;
    unit: string;
  },
  region: string = 'Australia'
): Promise<{ unit_price_cents: number; confidence: string; notes: string }> {
  try {
    const prompt = `You are a construction materials pricing expert. Estimate the unit price for this material in ${region}.

Material: ${material.description}
Quantity needed: ${material.quantity} ${material.unit}
Region: ${region}

Provide ONLY a JSON response in this exact format:
{
  "unit_price_cents": <number>,
  "confidence": "<low|medium|high>",
  "reasoning": "<brief explanation>"
}

Consider:
- Current market prices in ${region}
- Typical retail pricing for trades
- Standard pack sizes and quantities
- Regional pricing variations

Be realistic and conservative. Return price in cents (e.g., $15.50 = 1550).`;

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('[AI_PRICING_ERROR] OPENAI_API_KEY not configured');
      return {
        unit_price_cents: 1000,
        confidence: 'low',
        notes: 'Default price - please update',
      };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);

    return {
      unit_price_cents: aiResponse.unit_price_cents,
      confidence: aiResponse.confidence,
      notes: `Estimate - please check pricing`,
    };
  } catch (error) {
    console.error('[AI_PRICING_ERROR]', error);
    return {
      unit_price_cents: 1000,
      confidence: 'low',
      notes: 'Default price - please update',
    };
  }
}

interface PricingProfile {
  profile_id: string;
  org_id: string;
  user_id: string;
  hourly_rate_cents: number;
  callout_fee_cents: number;
  travel_rate_cents: number | null;
  travel_is_time: boolean;
  materials_markup_percent: number;
  default_tax_rate: number;
  default_currency: string;
  default_payment_terms: string | null;
  default_unit_preference: string;
  bunnings_run_enabled: boolean;
  bunnings_run_minutes_default: number;
  workday_hours_default: number;
  org_name: string;
  org_tax_inclusive: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseAnonKey) {
      console.error("[FATAL] SUPABASE_ANON_KEY environment variable is not set");
      throw new Error("Server misconfiguration: SUPABASE_ANON_KEY is required. Please configure it as a Supabase secret.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[AUTH] Missing authorization header");
      throw new Error("Missing authorization header");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      console.error("[AUTH] Unauthorized request", { error: userError?.message });
      throw new Error("Unauthorized");
    }

    console.log("[AUTH] User authenticated", { user_id: user.id });

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    console.log("[AUTH] User-scoped client created for RLS operations");

    const { data: rateLimitResult, error: rateLimitError } = await supabaseAdmin
      .rpc("check_rate_limit", {
        p_user_id: user.id,
        p_endpoint: "create-draft-quote",
        p_max_calls: 10,
        p_window_minutes: 60,
      });

    if (rateLimitError) {
      console.error("[SECURITY] Rate limit check failed", { error: rateLimitError.message });
    } else if (rateLimitResult && !rateLimitResult.allowed) {
      console.warn("[SECURITY] RATE_LIMIT user_id=" + user.id + " endpoint=create-draft-quote");
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

    const { intake_id, trace_id }: CreateDraftRequest = await req.json();
    const startTime = Date.now();

    console.log(`[PERF] trace_id=${trace_id || 'none'} step=create_draft_start intake_id=${intake_id} user_id=${user.id}`);

    if (!intake_id) {
      throw new Error("Missing intake_id");
    }

    const { data: intakeRows, error: lockError } = await supabaseUser.rpc(
      "lock_voice_intake_for_quote_creation",
      {
        p_intake_id: intake_id,
        p_user_id: user.id,
      }
    );

    if (lockError || !intakeRows || intakeRows.length === 0) {
      console.error("[REVIEW_FLOW] Failed to lock intake", {
        intake_id,
        user_id: user.id,
        error: lockError?.message,
        error_details: lockError?.details,
        error_hint: lockError?.hint,
      });
      throw new Error(`Voice intake not found or could not be locked: ${lockError?.message || 'Unknown error'}`);
    }

    const intake = intakeRows[0];

    console.log(`[REVIEW_FLOW] CREATE_DRAFT_QUOTE_LOCK_ACQUIRED intake_id=${intake_id}`);

    await supabaseAdmin
      .from("voice_intakes")
      .update({ stage: "draft_started" })
      .eq("id", intake_id);

    console.log(`[STAGE_TRACKING] intake_id=${intake_id} stage=draft_started`);

    let existingQuoteId = intake.created_quote_id;
    let isUpdatingShell = false;

    if (existingQuoteId) {
      const { count: lineItemsCount } = await supabaseAdmin
        .from("quote_line_items")
        .select("*", { count: "exact", head: true })
        .eq("quote_id", existingQuoteId)
        .eq("is_placeholder", false);

      console.log(`[IDEMPOTENCY_CHECK] quote_id=${existingQuoteId} non_placeholder_items=${lineItemsCount || 0}`);

      if (lineItemsCount && lineItemsCount > 0) {
        console.log(`[IDEMPOTENCY_REPLAY] intake=${intake_id} quote=${existingQuoteId} has ${lineItemsCount} real line items`);

        const { data: existingQuote, error: quoteError } = await supabaseAdmin
          .from("quotes")
          .select("*")
          .eq("id", existingQuoteId)
          .maybeSingle();

        if (quoteError || !existingQuote) {
          throw new Error("Existing quote not found");
        }

        const extractedData = intake.extraction_json as any;
        const pricingSnapshot = extractedData?.pricing_used || {};

        return new Response(
          JSON.stringify({
            success: true,
            draft_version: DRAFT_VERSION,
            quote_id: existingQuote.id,
            intake_id: intake.id,
            idempotent_replay: true,
            requires_review: intake.status === "needs_user_review",
            line_items_count: lineItemsCount || 0,
            readable_items_count: lineItemsCount || 0,
            warnings: ["Quote already created from this voice intake"],
            pricing_used: pricingSnapshot,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      isUpdatingShell = true;
    }

    const extracted = intake.extraction_json as any;
    if (!extracted) {
      throw new Error("No extraction data found for this voice intake");
    }

    const userCorrections = intake.user_corrections_json as any;
    const userConfirmed = intake.status === "quote_created";

    if (!userConfirmed && userCorrections) {
      console.log("[QUOTE_CREATE] User corrections provided - bypassing quality checks");
    } else if (!userConfirmed && extracted.quality) {
      const missingFields = extracted.missing_fields || [];
      const assumptions = extracted.assumptions || [];

      const requiredMissing = missingFields.filter((mf: any) => mf.severity === "required");
      if (requiredMissing.length > 0) {
        console.log("[QUOTE_CREATE] Blocked: required fields missing", requiredMissing);
        return new Response(
          JSON.stringify({
            success: false,
            requires_review: true,
            reason: "required_fields_missing",
            missing_fields: requiredMissing,
            assumptions: assumptions,
            message: "Cannot create quote - required fields are missing. Please review and provide missing information.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (extracted.time?.labour_entries) {
        for (const entry of extracted.time.labour_entries) {
          const hoursConf = entry.hours?.confidence || 0;
          const daysConf = entry.days?.confidence || 0;

          if ((hoursConf > 0 && hoursConf < 0.6) || (daysConf > 0 && daysConf < 0.6)) {
            console.log("[QUOTE_CREATE] Blocked: labour hours confidence too low", {
              description: entry.description,
              hoursConf,
              daysConf,
            });
            return new Response(
              JSON.stringify({
                success: false,
                requires_review: true,
                reason: "low_confidence_labour",
                missing_fields: missingFields,
                assumptions: assumptions,
                message: "Cannot create quote - labour estimates are too uncertain. Please review and confirm hours.",
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        }
      }

      if (extracted.quality?.requires_user_confirmation) {
        console.log("[QUOTE_CREATE] Low confidence detected - will create placeholder items", {
          intake_id,
          overall_confidence: extracted.quality?.overall_confidence,
          missing_fields_count: missingFields.length,
          assumptions_count: assumptions.length
        });

        await supabaseAdmin
          .from("voice_intakes")
          .update({
            status: "needs_user_review",
            extraction_json: extracted,
          })
          .eq("id", intake_id);
      }

      console.log("[QUOTE_CREATE] Quality checks complete", { intake_id });
    }

    const needsReview = !userConfirmed && extracted.quality?.requires_user_confirmation;

    console.log("[QUOTE_CREATE] Proceeding with quote creation", {
      intake_id,
      user_confirmed: userConfirmed,
      needs_review: needsReview,
    });

    const { data: profileData, error: profileError } = await supabaseAdmin
      .rpc("get_effective_pricing_profile", { p_user_id: user.id });

    if (profileError || !profileData) {
      throw new Error(`Failed to get pricing profile: ${profileError?.message}`);
    }

    const profile = profileData as PricingProfile;

    console.log("[QUOTE_CREATE] Using pricing profile", {
      org_id: profile.org_id,
      hourly_rate: profile.hourly_rate_cents,
      materials_markup: profile.materials_markup_percent,
    });

    const pricingSnapshot = {
      hourly_rate_cents: profile.hourly_rate_cents,
      materials_markup_percent: profile.materials_markup_percent,
      tax_rate_percent: profile.default_tax_rate,
      currency: profile.default_currency,
      travel_rate_cents: profile.travel_rate_cents,
      travel_is_time: profile.travel_is_time,
      callout_fee_cents: profile.callout_fee_cents,
    };

    let customerId = intake.customer_id;

    if (!customerId) {
      const customerData = extracted.customer;

      if (customerData?.email) {
        const { data: existingCustomer } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("org_id", profile.org_id)
          .eq("email", customerData.email)
          .maybeSingle();

        if (existingCustomer) {
          customerId = existingCustomer.id;
          console.log(`[CUSTOMER_EXTRACT] Found existing customer by email: ${customerData.email}`);
        }
      }

      if (!customerId && customerData?.name) {
        const { data: existingCustomerByName } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("org_id", profile.org_id)
          .ilike("name", customerData.name)
          .maybeSingle();

        if (existingCustomerByName) {
          customerId = existingCustomerByName.id;
          console.log(`[CUSTOMER_EXTRACT] Found existing customer by name: ${customerData.name}`);
        }
      }

      if (!customerId && customerData?.name) {
        const { data: newCustomer, error: customerError } = await supabaseAdmin
          .from("customers")
          .insert({
            org_id: profile.org_id,
            name: customerData.name,
            email: customerData.email || null,
            phone: customerData.phone || null,
          })
          .select("id")
          .single();

        if (customerError) {
          throw new Error(`Failed to create customer: ${customerError.message}`);
        }

        customerId = newCustomer.id;
        console.log(`[CUSTOMER_EXTRACT] Created new customer: ${customerData.name}`);
      }
    }

    if (!customerId) {
      const { data: placeholderCustomer, error: placeholderError } = await supabaseAdmin
        .from("customers")
        .insert({
          org_id: profile.org_id,
          name: null,
          email: null,
          phone: null,
        })
        .select("id")
        .single();

      if (placeholderError) {
        throw new Error(`Failed to create placeholder customer: ${placeholderError.message}`);
      }

      customerId = placeholderCustomer.id;
    }

    const customerName = extracted.customer?.name;
    const siteAddress = extracted.job?.site_address || extracted.job?.location;

    // Extract timeline description from natural language
    let timelineDescription = null;
    if (extracted.job?.estimated_days_min && extracted.job?.estimated_days_max) {
      if (extracted.job.estimated_days_min === extracted.job.estimated_days_max) {
        timelineDescription = `${extracted.job.estimated_days_min} ${extracted.job.estimated_days_min === 1 ? 'day' : 'days'}`;
      } else {
        timelineDescription = `${extracted.job.estimated_days_min}-${extracted.job.estimated_days_max} days`;
      }
    } else if (extracted.job?.estimated_days_max) {
      timelineDescription = `${extracted.job.estimated_days_max} ${extracted.job.estimated_days_max === 1 ? 'day' : 'days'}`;
    }

    console.log(`[CUSTOMER_EXTRACT] name=${customerName || 'none'} address=${siteAddress || 'none'} timeline=${timelineDescription || 'none'}`);

    const quoteTitle = extracted.job?.title || "Voice Quote";
    let quoteDescription = extracted.job?.summary || "";

    if (siteAddress && siteAddress.trim()) {
      quoteDescription = `Site: ${siteAddress}${quoteDescription ? '\n\n' + quoteDescription : ''}`;
    }

    const scopeOfWork = extracted.job?.scope_of_work || [];

    let quote: any;

    if (isUpdatingShell && existingQuoteId) {
      console.log(`[QUOTE_CREATE] Updating quote shell ${existingQuoteId} with extracted data`);

      const { data: updatedQuote, error: updateError } = await supabaseAdmin
        .from("quotes")
        .update({
          customer_id: customerId,
          title: quoteTitle,
          description: quoteDescription,
          site_address: siteAddress || null,
          timeline_description: timelineDescription || null,
          scope_of_work: scopeOfWork,
          currency: profile.default_currency,
          default_tax_rate: profile.default_tax_rate,
          tax_inclusive: profile.org_tax_inclusive,
          terms_and_conditions: profile.default_payment_terms || null,
        })
        .eq("id", existingQuoteId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update quote shell: ${updateError.message}`);
      }

      quote = updatedQuote;
    } else {
      console.log(`[QUOTE_CREATE] Creating new quote`);

      const { data: quoteNumber, error: quoteNumberError } = await supabaseAdmin
        .rpc("generate_quote_number", { p_org_id: profile.org_id });

      if (quoteNumberError || !quoteNumber) {
        throw new Error(`Failed to generate quote number: ${quoteNumberError?.message}`);
      }

      const { data: newQuote, error: quoteError } = await supabaseAdmin
        .from("quotes")
        .insert({
          org_id: profile.org_id,
          customer_id: customerId,
          quote_number: quoteNumber,
          title: quoteTitle,
          description: quoteDescription,
          site_address: siteAddress || null,
          timeline_description: timelineDescription || null,
          scope_of_work: scopeOfWork,
          status: "draft",
          source: "voice",
          currency: profile.default_currency,
          default_tax_rate: profile.default_tax_rate,
          tax_inclusive: profile.org_tax_inclusive,
          terms_and_conditions: profile.default_payment_terms || null,
        })
        .select()
        .single();

      if (quoteError) {
        throw new Error(`Failed to create quote: ${quoteError.message}`);
      }

      quote = newQuote;
    }

    console.log(`[PLACEHOLDER_CLEANUP] Checking for placeholder items on quote ${quote.id}`);

    const { data: placeholderItems, error: placeholderCheckError } = await supabaseAdmin
      .from("quote_line_items")
      .select("id, description, is_placeholder")
      .eq("quote_id", quote.id)
      .eq("is_placeholder", true);

    if (placeholderCheckError) {
      console.warn(`[PLACEHOLDER_CLEANUP] Failed to check for placeholders: ${placeholderCheckError.message}`);
    } else if (placeholderItems && placeholderItems.length > 0) {
      console.log(`[PLACEHOLDER_CLEANUP] Found ${placeholderItems.length} placeholder items, deleting now`);

      const placeholderIds = placeholderItems.map(item => item.id);
      const { error: deleteError, count: deletedCount } = await supabaseAdmin
        .from("quote_line_items")
        .delete({ count: "exact" })
        .eq("quote_id", quote.id)
        .eq("is_placeholder", true);

      if (deleteError) {
        console.error(`[PLACEHOLDER_CLEANUP] Failed to delete placeholders: ${deleteError.message}`);
        throw new Error(`Failed to delete placeholder items: ${deleteError.message}`);
      }

      console.log(`[PLACEHOLDER_CLEANUP] Successfully deleted ${deletedCount || placeholderItems.length} placeholder items`);
      console.log(`[PLACEHOLDER_CLEANUP] Deleted items:`, placeholderItems.map(i => i.description));
    } else {
      console.log(`[PLACEHOLDER_CLEANUP] No placeholder items found on quote ${quote.id}`);
    }

    const lineItems = [];
    const warnings = [];
    let position = 0;

    if (extracted.time?.labour_entries) {
      for (const labour of extracted.time.labour_entries) {
        let hours = typeof labour.hours === "object" ? labour.hours?.value : labour.hours;
        let days = typeof labour.days === "object" ? labour.days?.value : labour.days;
        let people = typeof labour.people === "object" ? labour.people?.value : labour.people;

        if (days && days > 0 && (!hours || hours === 0)) {
          hours = days * profile.workday_hours_default;
        }

        if (!hours || hours === 0) {
          warnings.push(`Labour entry "${labour.description}" has no hours, skipping`);
          continue;
        }

        const lineTotalCents = Math.round(hours * profile.hourly_rate_cents);

        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "labour",
          description: labour.description,
          quantity: hours,
          unit: "hours",
          unit_price_cents: profile.hourly_rate_cents,
          line_total_cents: lineTotalCents,
          position: position++,
          notes: labour.note || null,
        });
      }
    }

    if (extracted.materials?.items) {
      const catalogItems = [];
      const needsAiEstimation = [];

      for (const material of extracted.materials.items) {
        let quantity = typeof material.quantity === "object" ? material.quantity?.value : material.quantity;
        const unit = typeof material.unit === "object" ? material.unit?.value : material.unit;

        if (quantity === null || quantity === undefined || isNaN(quantity)) {
          quantity = 1;
          warnings.push(`Material "${material.description}" had no quantity, defaulted to 1`);
        }

        const catalogItemId = material.catalog_item_id || null;
        const matchConfidence = material.catalog_match_confidence || null;

        if (catalogItemId && (!material.unit_price_cents || material.unit_price_cents === 0)) {
          console.log("[CATALOG_MATCH] Fetching catalog price for item", { catalogItemId });
          const { data: catalogItem } = await supabaseAdmin
            .from("material_catalog_items")
            .select("unit_price_cents, typical_low_price_cents, typical_high_price_cents")
            .eq("id", catalogItemId)
            .maybeSingle();

          if (catalogItem) {
            if (catalogItem.unit_price_cents) {
              material.unit_price_cents = catalogItem.unit_price_cents;
            } else if (catalogItem.typical_low_price_cents && catalogItem.typical_high_price_cents) {
              material.unit_price_cents = Math.round(
                (catalogItem.typical_low_price_cents + catalogItem.typical_high_price_cents) / 2
              );
              console.log("[CATALOG_MATCH] Using catalog price midpoint", {
                material: material.description,
                low: catalogItem.typical_low_price_cents,
                high: catalogItem.typical_high_price_cents,
                midpoint: material.unit_price_cents
              });
            }
          }
        }

        if (material.unit_price_cents && material.unit_price_cents > 0) {
          const basePrice = material.unit_price_cents;
          const markupMultiplier = 1 + (profile.materials_markup_percent / 100);
          const unitPriceCents = Math.round(basePrice * markupMultiplier);

          const markupText = `Base: $${(basePrice / 100).toFixed(2)}, Markup: ${profile.materials_markup_percent}%`;
          let notes = material.notes || null;
          notes = notes ? `${markupText} - ${notes}` : markupText;

          if (catalogItemId && matchConfidence) {
            const confidenceText = matchConfidence >= 0.8
              ? 'From catalog'
              : `Matched from catalog (${Math.round(matchConfidence * 100)}% confidence)`;
            notes = `${confidenceText} - ${notes}`;
          }

          catalogItems.push({
            material,
            quantity,
            unit: unit || 'unit',
            unitPriceCents,
            notes,
            needsReview: false,
            catalogItemId,
          });
        } else if (material.estimated_cost_cents && material.estimated_cost_cents > 0) {
          const baseCost = material.estimated_cost_cents;
          const markupMultiplier = 1 + (profile.materials_markup_percent / 100);
          const unitPriceCents = Math.round(baseCost * markupMultiplier);

          const markupText = `Base estimate: $${(baseCost / 100).toFixed(2)}, Markup: ${profile.materials_markup_percent}%`;
          let notes = material.notes || null;
          notes = notes ? `${markupText} - ${notes}` : markupText;

          catalogItems.push({
            material,
            quantity,
            unit: unit || 'unit',
            unitPriceCents,
            notes,
            needsReview: false,
            catalogItemId: null,
          });
        } else {
          needsAiEstimation.push({
            material,
            quantity,
            unit: unit || 'unit',
            catalogItemId,
            matchConfidence,
          });
        }
      }

      console.log(`[PRICING_BATCH] catalog_matches=${catalogItems.length} ai_estimates_needed=${needsAiEstimation.length}`);

      if (needsAiEstimation.length > 0) {
        const aiStart = Date.now();
        const aiEstimates = await Promise.all(
          needsAiEstimation.map(({ material, quantity, unit }) =>
            estimateMaterialPrice(
              {
                description: material.description,
                quantity: quantity,
                unit: unit,
              },
              'Australia'
            )
          )
        );
        console.log(`[AI_PRICING_BATCH] Completed ${aiEstimates.length} estimates in ${Date.now() - aiStart}ms`);

        for (let i = 0; i < needsAiEstimation.length; i++) {
          const { material, quantity, unit, catalogItemId, matchConfidence } = needsAiEstimation[i];
          const aiEstimate = aiEstimates[i];

          const basePrice = aiEstimate.unit_price_cents;
          const markupMultiplier = 1 + (profile.materials_markup_percent / 100);
          const unitPriceCents = Math.round(basePrice * markupMultiplier);

          let notes = aiEstimate.notes;
          const needsReview = aiEstimate.confidence === 'low';

          console.log(`[AI_PRICING] ${material.description} → Base: $${(basePrice / 100).toFixed(2)}, After markup: $${(unitPriceCents / 100).toFixed(2)} (${aiEstimate.confidence} confidence)`);

          if (profile.materials_markup_percent > 0) {
            const markupText = `Base: $${(basePrice / 100).toFixed(2)}, Markup: ${profile.materials_markup_percent}%`;
            notes = `${markupText} - ${notes}`;
          }

          catalogItems.push({
            material,
            quantity,
            unit,
            unitPriceCents,
            notes,
            needsReview,
            catalogItemId,
          });
        }
      }

      for (const { material, quantity, unit, unitPriceCents, notes, needsReview, catalogItemId } of catalogItems) {
        const lineTotalCents = Math.round(quantity * unitPriceCents) || 0;

        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "materials",
          description: material.description,
          quantity: quantity,
          unit: unit,
          unit_price_cents: unitPriceCents,
          line_total_cents: lineTotalCents,
          catalog_item_id: catalogItemId,
          position: position++,
          notes: notes,
          is_needs_review: needsReview,
        });
      }
    }

    if (extracted.fees?.travel) {
      const travel = extracted.fees.travel;

      if (travel.is_time !== undefined ? travel.is_time : profile.travel_is_time) {
        let travelHours = typeof travel.hours === "object" ? travel.hours?.value : travel.hours;

        if (!travelHours || travelHours === 0) {
          travelHours = 0.5;
          warnings.push("Travel time not specified, defaulted to 0.5 hours");
        }

        const travelRate = profile.travel_rate_cents || profile.hourly_rate_cents;
        const lineTotalCents = Math.round(travelHours * travelRate);

        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "fee",
          description: "Travel time",
          quantity: travelHours,
          unit: "hours",
          unit_price_cents: travelRate,
          line_total_cents: lineTotalCents,
          position: position++,
          notes: "Travel to job site",
        });
      } else {
        const travelFee = profile.travel_rate_cents || 0;

        if (travelFee > 0) {
          lineItems.push({
            org_id: profile.org_id,
            quote_id: quote.id,
            item_type: "fee",
            description: "Travel fee",
            quantity: 1,
            unit: "trip",
            unit_price_cents: travelFee,
            line_total_cents: travelFee,
            position: position++,
            notes: "Fixed travel charge",
          });
        }
      }
    }

    if (extracted.fees?.materials_supply_hours) {
      let supplyHours = typeof extracted.fees.materials_supply_hours === "object"
        ? extracted.fees.materials_supply_hours?.value
        : extracted.fees.materials_supply_hours;

      if (supplyHours && supplyHours > 0) {
        const lineTotalCents = Math.round(supplyHours * profile.hourly_rate_cents);

        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "fee",
          description: "Materials supply",
          quantity: supplyHours,
          unit: "hours",
          unit_price_cents: profile.hourly_rate_cents,
          line_total_cents: lineTotalCents,
          position: position++,
          notes: "Time to pick up and supply materials",
        });
      }
    }

    if (extracted.fees?.callout_fee_cents || profile.callout_fee_cents) {
      const calloutFee = extracted.fees?.callout_fee_cents || profile.callout_fee_cents;

      if (calloutFee > 0) {
        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "fee",
          description: "Callout fee",
          quantity: 1,
          unit: "service",
          unit_price_cents: calloutFee,
          line_total_cents: calloutFee,
          position: position++,
        });
      }
    }

    if (lineItems.length === 0) {
      console.log("[QUOTE_CREATE] No line items from extraction, checking scope_of_work");

      if (scopeOfWork && scopeOfWork.length > 0) {
        console.log(`[QUOTE_CREATE] Creating ${scopeOfWork.length} structured items from scope_of_work`);

        for (const scopeItem of scopeOfWork) {
          const description = String(scopeItem).trim();
          if (!description) continue;

          const lowerDesc = description.toLowerCase();

          const hoursMatch = lowerDesc.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
          const daysMatch = lowerDesc.match(/(\d+(?:\.\d+)?)\s*(?:days?)\b/i);
          const weeksMatch = lowerDesc.match(/(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\b/i);

          let extractedHours = null;
          let timeUnit = null;

          if (hoursMatch) {
            extractedHours = parseFloat(hoursMatch[1]);
            timeUnit = "hours";
          } else if (daysMatch) {
            const days = parseFloat(daysMatch[1]);
            extractedHours = days * profile.workday_hours_default;
            timeUnit = "days";
          } else if (weeksMatch) {
            const weeks = parseFloat(weeksMatch[1]);
            extractedHours = weeks * 5 * profile.workday_hours_default;
            timeUnit = "weeks";
          }

          if (extractedHours && extractedHours > 0) {
            const lineTotalCents = Math.round(extractedHours * profile.hourly_rate_cents);

            lineItems.push({
              org_id: profile.org_id,
              quote_id: quote.id,
              item_type: "labour",
              description: description,
              quantity: extractedHours,
              unit: "hours",
              unit_price_cents: profile.hourly_rate_cents,
              line_total_cents: lineTotalCents,
              position: position++,
              notes: `Needs review - extracted ${hoursMatch ? hoursMatch[1] + ' ' + timeUnit : daysMatch ? daysMatch[1] + ' ' + timeUnit : weeksMatch[1] + ' ' + timeUnit} from scope`,
              is_needs_review: true,
            });

            warnings.push(`Created labour item from scope: "${description}" with ${extractedHours}hrs extracted from text`);
          } else {
            lineItems.push({
              org_id: profile.org_id,
              quote_id: quote.id,
              item_type: "materials",
              description: description,
              quantity: 1,
              unit: "item",
              unit_price_cents: 0,
              line_total_cents: 0,
              position: position++,
              notes: "Needs review - from scope, pricing required",
              is_needs_review: true,
            });

            warnings.push(`Created material/scope item from scope: "${description}" - pricing required`);
          }
        }
      }

      if (lineItems.length === 0) {
        console.log("[QUOTE_CREATE] EMERGENCY: No scope_of_work, creating generic placeholders");

        const hasNoLabour = !extracted.time?.labour_entries || extracted.time.labour_entries.length === 0;
        const hasNoMaterials = !extracted.materials?.items || extracted.materials.items.length === 0;

        if (hasNoLabour) {
          lineItems.push({
            org_id: profile.org_id,
            quote_id: quote.id,
            item_type: "labour",
            description: "Labour (needs estimation)",
            quantity: 1,
            unit: "hours",
            unit_price_cents: profile.hourly_rate_cents,
            line_total_cents: profile.hourly_rate_cents,
            position: position++,
            notes: "Placeholder - please update with actual labour estimate",
            is_placeholder: true,
          });
          warnings.push("Created placeholder labour item - extraction confidence was too low");
        }

        if (hasNoMaterials) {
          lineItems.push({
            org_id: profile.org_id,
            quote_id: quote.id,
            item_type: "materials",
            description: "Materials (needs pricing)",
            quantity: 1,
            unit: "item",
            unit_price_cents: 0,
            line_total_cents: 0,
            position: position++,
            notes: "Placeholder - please add actual materials and pricing",
            is_placeholder: true,
          });
          warnings.push("Created placeholder materials item - extraction confidence was too low");
        }
      }
    }

    if (lineItems.length > 0) {
      console.log(`[QUOTE_CREATE] Preparing to insert ${lineItems.length} line items for quote ${quote.id}`);
      console.log(`[QUOTE_CREATE] Line item breakdown:`, {
        labour: lineItems.filter(i => i.item_type === 'labour').length,
        materials: lineItems.filter(i => i.item_type === 'materials').length,
        fees: lineItems.filter(i => i.item_type === 'fee').length,
        placeholders: lineItems.filter(i => i.is_placeholder === true).length,
        needs_review: lineItems.filter(i => i.is_needs_review === true).length,
      });

      console.log(`[LINE_ITEMS_INSERT] BEFORE: Inserting ${lineItems.length} items into quote ${quote.id}`);

      const { data: insertedItems, error: lineItemsError } = await supabaseAdmin
        .from("quote_line_items")
        .insert(lineItems)
        .select("id, org_id, quote_id");

      if (lineItemsError) {
        console.error("[LINE_ITEMS_INSERT] FAILED:", lineItemsError);
        throw new Error(`Failed to create line items: ${lineItemsError.message}`);
      }

      console.log(`[LINE_ITEMS_INSERT] AFTER: Insert returned ${insertedItems?.length || 0} items (expected ${lineItems.length})`);

      const { count: readableCount, error: countError } = await supabaseAdmin
        .from("quote_line_items")
        .select("*", { count: "exact", head: true })
        .eq("quote_id", quote.id);

      console.log(`[QUOTE_CREATE] Readable line items count: ${readableCount}, insert count: ${lineItems.length}`);

      if (countError) {
        console.error("[QUOTE_CREATE] POSTCONDITION_CHECK_FAILED:", countError);
      } else if (readableCount === 0 && lineItems.length > 0) {
        console.error("[QUOTE_CREATE] RLS_BLOCKING_READS: Inserted items but count is zero");
        console.error("[QUOTE_CREATE] Diagnostic:", {
          quote_id: quote.id,
          quote_org_id: quote.org_id,
          user_id: user.id,
          attempted_inserts: lineItems.length,
          readable_count: readableCount,
        });
      } else if (readableCount !== lineItems.length) {
        console.warn("[QUOTE_CREATE] COUNT_MISMATCH:", {
          inserted: lineItems.length,
          readable: readableCount,
        });
      } else {
        console.log("[QUOTE_CREATE] POSTCONDITION_PASSED: All items readable");
      }
    } else {
      console.error("[QUOTE_CREATE] CRITICAL: Still no line items after placeholder creation");
      throw new Error("Failed to create any line items for quote");
    }

    const updatedExtractionJson = {
      ...extracted,
      pricing_used: pricingSnapshot,
    };

    const finalIntakeStatus = needsReview ? "needs_user_review" : "quote_created";

    await supabaseAdmin
      .from("voice_intakes")
      .update({
        created_quote_id: quote.id,
        customer_id: customerId,
        status: finalIntakeStatus,
        stage: "draft_done",
        extraction_json: updatedExtractionJson,
      })
      .eq("id", intake_id);

    console.log(`[STAGE_TRACKING] intake_id=${intake_id} stage=draft_done status=${finalIntakeStatus}`);

    // Complete job tracking (if job exists)
    const { data: job } = await supabaseAdmin
      .from("quote_generation_jobs")
      .select("id")
      .eq("intake_id", intake_id)
      .maybeSingle();

    if (job) {
      await supabaseAdmin.rpc("complete_job", {
        p_job_id: job.id,
        p_quote_id: quote.id,
      });
      console.log(`[JOB_TRACKING] job_id=${job.id} marked as complete for quote_id=${quote.id}`);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[PERF] trace_id=${trace_id || 'none'} step=create_draft_complete intake_id=${intake_id} quote_id=${quote.id} ms=${totalDuration} line_items_count=${lineItems.length}`);

    const { count: finalCount } = await supabaseAdmin
      .from("quote_line_items")
      .select("*", { count: "exact", head: true })
      .eq("quote_id", quote.id);

    return new Response(
      JSON.stringify({
        success: true,
        draft_version: DRAFT_VERSION,
        quote_id: quote.id,
        intake_id,
        idempotent_replay: false,
        requires_review: needsReview,
        line_items_count: lineItems.length,
        readable_items_count: finalCount || 0,
        org_id: quote.org_id,
        warnings,
        pricing_used: {
          hourly_rate: `$${(profile.hourly_rate_cents / 100).toFixed(2)}`,
          materials_markup: `${profile.materials_markup_percent}%`,
          tax_rate: `${profile.default_tax_rate}%`,
          currency: profile.default_currency,
          travel_rate: profile.travel_rate_cents
            ? `$${(profile.travel_rate_cents / 100).toFixed(2)}`
            : 'Same as hourly',
          travel_is_time: profile.travel_is_time,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Create draft quote error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const { intake_id } = await req.clone().json().catch(() => ({ intake_id: null }));

    if (intake_id) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        await supabaseAdmin
          .from("voice_intakes")
          .update({
            stage: "failed",
            error_message: errorMessage,
          })
          .eq("id", intake_id);

        console.log(`[STAGE_TRACKING] intake_id=${intake_id} stage=failed error="${errorMessage}"`);

        // Mark job as failed (if job exists)
        const { data: job } = await supabaseAdmin
          .from("quote_generation_jobs")
          .select("id")
          .eq("intake_id", intake_id)
          .maybeSingle();

        if (job) {
          await supabaseAdmin.rpc("mark_job_failed", {
            p_job_id: job.id,
            p_error_message: errorMessage,
          });
          console.log(`[JOB_TRACKING] job_id=${job.id} marked as failed`);
        }
      } catch (updateError) {
        console.error("[STAGE_TRACKING] Failed to update stage to failed:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});