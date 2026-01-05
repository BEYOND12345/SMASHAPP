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
  "8. FEES EXTRACTION:",
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

//... rest of the file content