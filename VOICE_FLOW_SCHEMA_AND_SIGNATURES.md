# Voice Intake Flow: Schema and Edge Function Signatures

## Current voice_intakes Table Schema

```sql
CREATE TABLE voice_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,

  -- Recording metadata
  source text NOT NULL CHECK (source IN ('mobile', 'web')),
  audio_storage_path text NOT NULL,
  audio_duration_seconds int CHECK (audio_duration_seconds > 0),

  -- Transcription data
  transcript_text text,
  transcript_model text,
  transcript_language text,
  transcript_confidence numeric CHECK (transcript_confidence >= 0 AND transcript_confidence <= 1),

  -- Extraction data
  extraction_json jsonb,
  extraction_model text,
  extraction_confidence numeric CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  missing_fields jsonb,
  assumptions jsonb,

  -- State machine
  status text NOT NULL DEFAULT 'captured' CHECK (status IN (
    'captured',         -- Audio uploaded, not yet transcribed
    'transcribed',      -- Transcript ready, not yet extracted
    'extracted',        -- Data extracted, ready to create quote
    'quote_created',    -- Quote successfully created
    'needs_user_review',-- Extraction confidence low, needs review
    'failed'            -- Pipeline failed
  )),

  -- Outputs
  created_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,

  -- Error handling
  error_code text,
  error_message text,

  -- User corrections
  user_corrections_json jsonb,

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
```

**Indexes:**
```sql
CREATE INDEX voice_intakes_org_id_idx ON voice_intakes(org_id);
CREATE INDEX voice_intakes_user_id_idx ON voice_intakes(user_id);
CREATE INDEX voice_intakes_customer_id_idx ON voice_intakes(customer_id);
CREATE INDEX voice_intakes_status_idx ON voice_intakes(status);
CREATE INDEX voice_intakes_created_quote_id_idx ON voice_intakes(created_quote_id);
CREATE INDEX voice_intakes_created_at_idx ON voice_intakes(created_at DESC);
```

---

## Mobile Voice Flow: 3-Step Pipeline

### Step 1: Upload and Transcribe

**Client Action:**
1. Records audio in mobile app
2. Uploads audio file to `voice-intakes` storage bucket
3. Creates `voice_intakes` record with `status = 'captured'` and `audio_storage_path`
4. Calls `transcribe-voice-intake` Edge Function

**Edge Function:** `transcribe-voice-intake`

**Request Interface:**
```typescript
interface TranscribeRequest {
  intake_id: string;
}
```

**Example Request:**
```json
{
  "intake_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Process:**
1. Validates `intake_id` belongs to authenticated user
2. Checks `status === 'captured'` (prevents re-transcription)
3. Downloads audio from storage bucket using `audio_storage_path`
4. Calls OpenAI Whisper API via `openai-proxy`
5. Updates `voice_intakes` with:
   - `transcript_text`
   - `transcript_model = 'whisper-1'`
   - `transcript_language`
   - `audio_duration_seconds`
   - `status = 'transcribed'`

**Response:**
```typescript
{
  success: true,
  intake_id: string,
  transcript: string,
  language: string,
  duration: number
}
```

---

### Step 2: Extract Structured Data

**Client Action:**
Calls `extract-quote-data` Edge Function with `intake_id`

**Edge Function:** `extract-quote-data`

**Request Interface:**
```typescript
interface ExtractRequest {
  intake_id: string;
  user_corrections_json?: any;
}
```

**Example Request:**
```json
{
  "intake_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_corrections_json": null  // Optional: user edits from review screen
}
```

**Process:**
1. Validates `intake_id` belongs to authenticated user
2. Checks `transcript_text` exists
3. Calls `get_effective_pricing_profile` RPC for user's pricing
4. Fetches user's material catalog items
5. Calls OpenAI GPT-4o via `openai-proxy` with:
   - Transcript text
   - Pricing profile context
   - Material catalog for matching
   - User corrections (if provided)
6. Updates `voice_intakes` with:
   - `extraction_json` (structured quote data)
   - `extraction_model = 'gpt-4o'`
   - `extraction_confidence`
   - `missing_fields`
   - `assumptions`
   - `user_corrections_json` (if provided)
   - `status = 'extracted'` OR `'needs_user_review'` (if confidence low)

**Response:**
```typescript
{
  success: true,
  intake_id: string,
  extracted_data: {
    customer: {
      name: string | null,
      email: string | null,
      phone: string | null
    },
    job: {
      title: string,
      summary: string,
      site_address: string | null,
      estimated_days_min: number | null,
      estimated_days_max: number | null,
      job_date: string | null,
      assumptions: string[],
      scope_of_work: string[]
    },
    time: {
      labour_entries: Array<{
        description: string,
        hours: number | null,
        days: number | null,
        people: number | null,
        note: string | null
      }>
    },
    materials: {
      items: Array<{
        description: string,
        quantity: number,
        unit: string,
        unit_price_cents: number | null,
        estimated_cost_cents: number | null,
        needs_pricing: boolean,
        source_store: string | null,
        notes: string | null,
        catalog_item_id: string | null,
        catalog_match_confidence: number | null
      }>
    },
    fees: {
      travel: {
        is_time: boolean,
        hours: number | null,
        fee_cents: number | null
      },
      materials_pickup: {
        enabled: boolean,
        minutes: number | null,
        fee_cents: number | null
      },
      callout_fee_cents: number | null
    },
    pricing_defaults_used: {
      hourly_rate_cents: number | null,
      materials_markup_percent: number | null,
      tax_rate_percent: number | null,
      currency: string | null
    },
    quality: {
      confidence: number,  // 0-1
      missing_fields: string[],
      ambiguous_fields: string[],
      requires_user_confirmation: boolean
    }
  },
  requires_review: boolean
}
```

---

### Step 3: Create Draft Quote

**Client Action:**
Calls `create-draft-quote` Edge Function with `intake_id`

**Edge Function:** `create-draft-quote`

**Request Interface:**
```typescript
interface CreateDraftRequest {
  intake_id: string;
}
```

**Example Request:**
```json
{
  "intake_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Process:**
1. Validates `intake_id` belongs to authenticated user
2. Checks `extraction_json` exists
3. **CRITICAL:** Calls `get_effective_pricing_profile` RPC at runtime
4. Fails hard if `hourly_rate_cents` is null or <= 0
5. Creates pricing snapshot for audit trail
6. Handles customer creation/lookup (or creates placeholder)
7. Generates quote number
8. Creates `quotes` record with profile defaults:
   - `currency = profile.default_currency`
   - `default_tax_rate = profile.default_tax_rate`
   - `tax_inclusive = profile.org_tax_inclusive`
   - `terms_and_conditions = profile.default_payment_terms`
9. Creates `quote_line_items` with profile-aware pricing:
   - **Labour:** `hours × profile.hourly_rate_cents`
   - **Materials:** Applies `profile.materials_markup_percent` to base prices
   - **Travel:** Respects `profile.travel_is_time` flag
   - **Bunnings Run:** Uses `profile.bunnings_run_enabled` and defaults
   - **Callout Fee:** Uses `profile.callout_fee_cents`
10. Stores pricing snapshot in `extraction_json.pricing_used`
11. Updates `voice_intakes` with:
    - `created_quote_id`
    - `customer_id`
    - `status = 'quote_created'` OR `'needs_user_review'`
    - `extraction_json` (with pricing_used snapshot added)

**Response:**
```typescript
{
  success: true,
  quote_id: string,
  intake_id: string,
  requires_review: boolean,
  line_items_count: number,
  warnings: string[],
  pricing_used: {
    hourly_rate: string,        // e.g., "$120.00"
    materials_markup: string,   // e.g., "15%"
    tax_rate: string,           // e.g., "10%"
    currency: string,           // e.g., "AUD"
    travel_rate: string,        // e.g., "$150.00" or "Same as hourly"
    travel_is_time: boolean
  }
}
```

---

## Status Machine Flow

```
captured
   ↓ (transcribe-voice-intake)
transcribed
   ↓ (extract-quote-data)
extracted OR needs_user_review
   ↓ (create-draft-quote)
quote_created OR needs_user_review
```

**Failed State:**
Any step can transition to `failed` with `error_code` and `error_message` populated.

---

## Typical Mobile Client Flow

```typescript
// 1. Upload audio and create intake
const { data: intake } = await supabase
  .from('voice_intakes')
  .insert({
    org_id: userOrgId,
    user_id: userId,
    source: 'mobile',
    audio_storage_path: `${userId}/${timestamp}.webm`,
    status: 'captured'
  })
  .select()
  .single();

const intakeId = intake.id;

// 2. Transcribe
const transcribeResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-voice-intake`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ intake_id: intakeId })
});

// 3. Extract
const extractResponse = await fetch(`${supabaseUrl}/functions/v1/extract-quote-data`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ intake_id: intakeId })
});

const extractData = await extractResponse.json();

// 4. Optional: User review if requires_review is true
// User can edit extracted data, then re-call extract-quote-data with user_corrections_json

// 5. Create draft quote
const draftResponse = await fetch(`${supabaseUrl}/functions/v1/create-draft-quote`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ intake_id: intakeId })
});

const draftData = await draftResponse.json();

// 6. Navigate to quote editor
router.push(`/quotes/${draftData.quote_id}/edit`);
```

---

## Where Idempotency Key Would Fit

Currently, the flow is NOT idempotent. If a client retries any step:
- **transcribe-voice-intake:** Fails if status !== 'captured'
- **extract-quote-data:** Can be called multiple times (overwrites extraction_json)
- **create-draft-quote:** Creates duplicate quotes on retry

### Suggested Idempotency Key Approach

Add column to `voice_intakes`:
```sql
ALTER TABLE voice_intakes
ADD COLUMN idempotency_key text UNIQUE;
```

Client generates UUID once and passes it through all three steps:
```typescript
const idempotencyKey = generateUUID();

// All three calls use same key
{ intake_id, idempotency_key }
```

Each Edge Function checks:
1. If idempotency_key exists and step already completed → return cached result
2. If idempotency_key exists and step in progress → wait or return 409 Conflict
3. If new → proceed and store idempotency_key

This prevents:
- Duplicate transcriptions (wastes OpenAI credits)
- Duplicate extractions (wastes GPT-4o credits)
- Duplicate quotes (corrupts data)
