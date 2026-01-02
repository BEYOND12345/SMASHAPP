import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateDraftRequest {
  intake_id: string;
  trace_id?: string;
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

    const { data: intakeRows, error: lockError } = await supabase.rpc(
      "lock_voice_intake_for_quote_creation",
      {
        p_intake_id: intake_id,
        p_user_id: user.id,
      }
    );

    if (lockError || !intakeRows || intakeRows.length === 0) {
      console.error("[REVIEW_FLOW] Failed to lock intake", {
        intake_id,
        error: lockError?.message
      });
      throw new Error("Voice intake not found or could not be locked");
    }

    const intake = intakeRows[0];

    console.log(`[REVIEW_FLOW] CREATE_DRAFT_QUOTE_LOCK_ACQUIRED intake_id=${intake_id}`);

    let existingQuoteId = intake.created_quote_id;
    let isUpdatingShell = false;

    if (existingQuoteId) {
      const { count: lineItemsCount } = await supabase
        .from("quote_line_items")
        .select("*", { count: "exact", head: true })
        .eq("quote_id", existingQuoteId);

      if (lineItemsCount && lineItemsCount > 0) {
        console.log(`Idempotent replay detected for intake ${intake_id}, quote ${existingQuoteId} already has ${lineItemsCount} line items`);

        const { data: existingQuote, error: quoteError } = await supabase
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
      } else {
        console.log(`[QUOTE_CREATE] Found quote shell ${existingQuoteId} with no line items, will update it`);
        isUpdatingShell = true;
      }
    }

    const validStatuses = ["extracted", "needs_user_review"];
    if (!validStatuses.includes(intake.status)) {
      throw new Error(
        `Cannot create quote from intake with status '${intake.status}'. Valid statuses: ${validStatuses.join(", ")}`
      );
    }

    if (!intake.extraction_json) {
      throw new Error("No extraction data available");
    }

    let extracted = intake.extraction_json as any;
    const userCorrections = intake.user_corrections_json as any;

    console.log("[QUOTE_CREATE] Starting quote creation", {
      intake_id,
      status: intake.status,
      has_user_corrections: !!userCorrections,
      user_confirmed: extracted.quality?.user_confirmed || false,
    });

    if (userCorrections) {
      console.log("[QUOTE_CREATE] Applying user corrections", {
        intake_id,
        labour_overrides: Object.keys(userCorrections.labour_overrides || {}).length,
        materials_overrides: Object.keys(userCorrections.materials_overrides || {}).length,
        travel_overrides: Object.keys(userCorrections.travel_overrides || {}).length,
      });

      extracted = JSON.parse(JSON.stringify(extracted));

      if (userCorrections.labour_overrides && extracted.time?.labour_entries) {
        Object.entries(userCorrections.labour_overrides).forEach(([key, value]: [string, any]) => {
          const match = key.match(/^labour_(\d+)_(hours|days|people)$/);
          if (match) {
            const [, idxStr, field] = match;
            const idx = parseInt(idxStr, 10);
            if (extracted.time.labour_entries[idx]) {
              const entry = extracted.time.labour_entries[idx];
              if (typeof entry[field] === 'object') {
                entry[field] = { value, confidence: 1.0 };
              } else {
                entry[field] = { value, confidence: 1.0 };
              }
              console.log("[QUOTE_CREATE] Applied labour correction", {
                index: idx,
                field,
                value,
              });
            }
          }
        });
      }

      if (userCorrections.materials_overrides && extracted.materials?.items) {
        Object.entries(userCorrections.materials_overrides).forEach(([key, value]: [string, any]) => {
          const match = key.match(/^material_(\d+)_quantity$/);
          if (match) {
            const idx = parseInt(match[1], 10);
            if (extracted.materials.items[idx]) {
              const item = extracted.materials.items[idx];
              if (typeof item.quantity === 'object') {
                item.quantity = { value, confidence: 1.0 };
              } else {
                item.quantity = { value, confidence: 1.0 };
              }
              console.log("[QUOTE_CREATE] Applied material correction", {
                index: idx,
                value,
              });
            }
          }
        });
      }

      if (userCorrections.travel_overrides && extracted.fees?.travel) {
        if (userCorrections.travel_overrides.travel_hours !== undefined) {
          const travel = extracted.fees.travel;
          if (typeof travel.hours === 'object') {
            travel.hours = { value: userCorrections.travel_overrides.travel_hours, confidence: 1.0 };
          } else {
            travel.hours = { value: userCorrections.travel_overrides.travel_hours, confidence: 1.0 };
          }
          console.log("[QUOTE_CREATE] Applied travel correction", {
            hours: userCorrections.travel_overrides.travel_hours,
          });
        }
      }
    }

    const missingFields = intake.missing_fields || [];
    const assumptions = intake.assumptions || [];
    const userConfirmed = extracted.quality?.user_confirmed || false;

    if (userConfirmed) {
      console.log("[QUOTE_CREATE] User has confirmed - skipping quality guards", {
        intake_id,
        user_confirmed_at: extracted.quality?.user_confirmed_at,
      });
    } else {
      console.log("[QUOTE_CREATE] Checking voice quality guards (user NOT confirmed)", { intake_id });

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

        await supabase
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

    const { data: profileData, error: profileError } = await supabase
      .rpc("get_effective_pricing_profile", { p_user_id: user.id });

    console.log(`Pricing profile lookup for user ${user.id}:`, {
      success: !profileError && !!profileData,
      has_data: !!profileData,
      error: profileError?.message || null,
    });

    if (profileError) {
      console.error("[PRICING_ERROR] PRICING_PROFILE_RPC_ERROR", { user_id: user.id, error: profileError });
      throw new Error(`[PRICING_ERROR] Failed to retrieve pricing profile: ${profileError.message}. Please complete setup in Settings.`);
    }

    if (!profileData) {
      console.error("[PRICING_ERROR] PRICING_PROFILE_NULL", { user_id: user.id });
      throw new Error("[PRICING_ERROR] No pricing profile found. Please complete setup in Settings.");
    }

    const profile = profileData as PricingProfile;

    if (!profile.hourly_rate_cents || profile.hourly_rate_cents <= 0) {
      console.error("[PRICING_ERROR] INVALID_HOURLY_RATE", {
        user_id: user.id,
        profile_id: profile.profile_id,
        hourly_rate_cents: profile.hourly_rate_cents
      });
      throw new Error(`[PRICING_ERROR] Invalid hourly rate: ${profile.hourly_rate_cents}. Please set a valid hourly rate in Settings.`);
    }

    const pricingSnapshot = {
      profile_id: profile.profile_id,
      timestamp: new Date().toISOString(),
      hourly_rate_cents: profile.hourly_rate_cents,
      callout_fee_cents: profile.callout_fee_cents,
      travel_rate_cents: profile.travel_rate_cents,
      travel_is_time: profile.travel_is_time,
      materials_markup_percent: profile.materials_markup_percent,
      default_tax_rate: profile.default_tax_rate,
      currency: profile.default_currency,
      bunnings_run_enabled: profile.bunnings_run_enabled,
      bunnings_run_minutes_default: profile.bunnings_run_minutes_default,
      workday_hours_default: profile.workday_hours_default,
      org_tax_inclusive: profile.org_tax_inclusive,
    };

    console.log("Using pricing profile:", pricingSnapshot);

    let customerId = intake.customer_id;

    if (!customerId && extracted.customer) {
      const customerData = extracted.customer;

      if (customerData.email) {
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("org_id", profile.org_id)
          .eq("email", customerData.email)
          .maybeSingle();

        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }

      if (!customerId && customerData.name) {
        const { data: newCustomer, error: customerError } = await supabase
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
      }
    }

    if (!customerId) {
      const { data: placeholderCustomer, error: placeholderError } = await supabase
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

    const quoteTitle = extracted.job?.title || "Voice Quote";
    const quoteDescription = extracted.job?.summary || "";
    const scopeOfWork = extracted.job?.scope_of_work || [];

    let quote: any;

    if (isUpdatingShell && existingQuoteId) {
      console.log(`[QUOTE_CREATE] Updating quote shell ${existingQuoteId} with extracted data`);

      const { data: updatedQuote, error: updateError } = await supabase
        .from("quotes")
        .update({
          customer_id: customerId,
          title: quoteTitle,
          description: quoteDescription,
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

      const { data: quoteNumber, error: quoteNumberError } = await supabase
        .rpc("generate_quote_number", { p_org_id: profile.org_id });

      if (quoteNumberError || !quoteNumber) {
        throw new Error(`Failed to generate quote number: ${quoteNumberError?.message}`);
      }

      const { data: newQuote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          org_id: profile.org_id,
          customer_id: customerId,
          quote_number: quoteNumber,
          title: quoteTitle,
          description: quoteDescription,
          scope_of_work: scopeOfWork,
          status: "draft",
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

    const lineItems = [];
    const warnings = [];
    let position = 0;

    if (extracted.time?.labour_entries) {
      for (const labour of extracted.time.labour_entries) {
        let hours = typeof labour.hours === "object" ? labour.hours?.value : labour.hours;
        let days = typeof labour.days === "object" ? labour.days?.value : labour.days;
        let people = typeof labour.people === "object" ? labour.people?.value : labour.people;

        if ((!hours || hours === 0) && days) {
          hours = days * profile.workday_hours_default;
          warnings.push(`Converted ${days} days to ${hours} hours using workday default`);
        }

        if (hours && hours > 0) {
          const peopleCount = people || 1;
          const totalHours = hours * peopleCount;
          const lineTotalCents = Math.round(totalHours * profile.hourly_rate_cents) || 0;

          lineItems.push({
            org_id: profile.org_id,
            quote_id: quote.id,
            item_type: "labour",
            description: labour.description || "Labour",
            quantity: totalHours,
            unit: "hours",
            unit_price_cents: profile.hourly_rate_cents,
            line_total_cents: lineTotalCents,
            position: position++,
            notes: labour.note || null,
          });
        }
      }
    }

    if (extracted.materials?.items) {
      for (const material of extracted.materials.items) {
        let quantity = typeof material.quantity === "object" ? material.quantity?.value : material.quantity;
        const unit = typeof material.unit === "object" ? material.unit?.value : material.unit;

        if (quantity === null || quantity === undefined || isNaN(quantity)) {
          quantity = 1;
          warnings.push(`Material "${material.description}" had no quantity, defaulted to 1`);
        }

        let unitPriceCents = 0;
        let notes = material.notes || null;
        const catalogItemId = material.catalog_item_id || null;
        const matchConfidence = material.catalog_match_confidence || null;

        if (catalogItemId && (!material.unit_price_cents || material.unit_price_cents === 0)) {
          console.log("[QUOTE_CREATE] Fetching catalog price for item", { catalogItemId });
          const { data: catalogItem } = await supabase
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
              console.log("[QUOTE_CREATE] Using catalog price midpoint", {
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
          unitPriceCents = Math.round(basePrice * markupMultiplier);

          const markupText = `Base: $${(basePrice / 100).toFixed(2)}, Markup: ${profile.materials_markup_percent}%`;
          notes = notes ? `${markupText} - ${notes}` : markupText;
        } else if (material.estimated_cost_cents && material.estimated_cost_cents > 0) {
          const baseCost = material.estimated_cost_cents;
          const markupMultiplier = 1 + (profile.materials_markup_percent / 100);
          unitPriceCents = Math.round(baseCost * markupMultiplier);

          const markupText = `Base estimate: $${(baseCost / 100).toFixed(2)}, Markup: ${profile.materials_markup_percent}%`;
          notes = notes ? `${markupText} - ${notes}` : markupText;
        } else if (material.needs_pricing) {
          unitPriceCents = 0;
          notes = `Needs pricing${notes ? ` - ${notes}` : ''}`;
          warnings.push(`Material "${material.description}" needs pricing`);
        }

        if (catalogItemId && matchConfidence) {
          const confidenceText = matchConfidence >= 0.8
            ? 'From catalog'
            : `Matched from catalog (${Math.round(matchConfidence * 100)}% confidence)`;
          notes = notes ? `${confidenceText} - ${notes}` : confidenceText;
        }

        const lineTotalCents = Math.round(quantity * unitPriceCents) || 0;

        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "materials",
          description: material.description,
          quantity: quantity,
          unit: unit || 'unit',
          unit_price_cents: unitPriceCents,
          line_total_cents: lineTotalCents,
          catalog_item_id: catalogItemId,
          position: position++,
          notes: notes,
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
        const lineTotalCents = Math.round(travelHours * travelRate) || 0;

        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "labour",
          description: "Travel Time",
          quantity: travelHours,
          unit: "hours",
          unit_price_cents: travelRate,
          line_total_cents: lineTotalCents,
          position: position++,
        });
      } else if (!profile.travel_is_time && profile.travel_rate_cents) {
        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "fee",
          description: "Travel Fee",
          quantity: 1,
          unit: "fixed",
          unit_price_cents: profile.travel_rate_cents,
          line_total_cents: profile.travel_rate_cents,
          position: position++,
        });
      } else if (travel.fee_cents) {
        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "fee",
          description: "Travel Fee",
          quantity: 1,
          unit: "fixed",
          unit_price_cents: travel.fee_cents,
          line_total_cents: travel.fee_cents,
          position: position++,
        });
      }
    }

    if (profile.bunnings_run_enabled && extracted.fees?.materials_pickup?.enabled) {
      const pickup = extracted.fees.materials_pickup;
      const pickupMinutes = typeof pickup.minutes === "object" ? pickup.minutes?.value : pickup.minutes;
      const minutes = pickupMinutes || profile.bunnings_run_minutes_default;
      const hours = minutes / 60;
      const lineTotalCents = Math.round(hours * profile.hourly_rate_cents);

      const pickupNotes = pickupMinutes
        ? null
        : `Default ${profile.bunnings_run_minutes_default} minutes used`;

      lineItems.push({
        org_id: profile.org_id,
        quote_id: quote.id,
        item_type: "labour",
        description: "Materials Run",
        quantity: hours,
        unit: "hours",
        unit_price_cents: profile.hourly_rate_cents,
        line_total_cents: lineTotalCents,
        position: position++,
        notes: pickupNotes,
      });
    }

    if (extracted.fees?.callout_fee_cents || profile.callout_fee_cents) {
      const calloutFee = extracted.fees?.callout_fee_cents || profile.callout_fee_cents;

      if (calloutFee > 0) {
        lineItems.push({
          org_id: profile.org_id,
          quote_id: quote.id,
          item_type: "fee",
          description: "Callout Fee",
          quantity: 1,
          unit: "fixed",
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
          });
          warnings.push("Created placeholder materials item - extraction confidence was too low");
        }
      }
    }

    if (lineItems.length > 0) {
      console.log(`[QUOTE_CREATE] Inserting ${lineItems.length} line items for quote ${quote.id}`);

      const hasRealItems = lineItems.some(item =>
        !item.notes || !item.notes.includes("Placeholder")
      );

      if (hasRealItems) {
        console.log("[QUOTE_CREATE] Evicting placeholder items before inserting real items");

        const { error: deleteError } = await supabase
          .from("quote_line_items")
          .delete()
          .eq("quote_id", quote.id)
          .ilike("notes", "%Placeholder%");

        if (deleteError) {
          console.warn("[QUOTE_CREATE] Failed to delete placeholders (non-fatal):", deleteError);
        } else {
          console.log("[QUOTE_CREATE] Placeholder eviction complete");
        }
      }

      const { data: insertedItems, error: lineItemsError } = await supabase
        .from("quote_line_items")
        .insert(lineItems)
        .select("id, org_id, quote_id");

      if (lineItemsError) {
        console.error("[QUOTE_CREATE] Line items insert failed:", lineItemsError);
        throw new Error(`Failed to create line items: ${lineItemsError.message}`);
      }

      console.log(`[QUOTE_CREATE] Insert returned ${insertedItems?.length || 0} items`);

      const { count: readableCount, error: countError } = await supabase
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

    await supabase
      .from("voice_intakes")
      .update({
        created_quote_id: quote.id,
        customer_id: customerId,
        status: finalIntakeStatus,
        extraction_json: updatedExtractionJson,
      })
      .eq("id", intake_id);

    const totalDuration = Date.now() - startTime;
    console.log(`[PERF] trace_id=${trace_id || 'none'} step=create_draft_complete intake_id=${intake_id} quote_id=${quote.id} ms=${totalDuration} line_items_count=${lineItems.length}`);

    const { count: finalCount } = await supabase
      .from("quote_line_items")
      .select("*", { count: "exact", head: true })
      .eq("quote_id", quote.id);

    return new Response(
      JSON.stringify({
        success: true,
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