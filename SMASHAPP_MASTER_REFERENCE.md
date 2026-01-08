# SMASHAPP MASTER REFERENCE
## Complete Context & Feature Overview for Cursor

---

## 🎯 WHAT IS SMASHAPP?

**The 30-second pitch:**
Voice-to-quote software for tradies (contractors/handymen). Record a 30-second description of a job, get a professional quote ready to send in 45 seconds total. No typing. No forms. Just voice.

**The problem it solves:**
Tradies lose thousands of dollars in potential work because creating quotes is tedious. They're busy on job sites, covered in sawdust or paint, and can't be bothered opening a laptop to type quotes. By the time they get home, they've forgotten details or the customer has moved on.

**The solution:**
Pull out phone → Tap record → Describe job naturally → Quote auto-generated with pricing, materials, GST → Send to customer. Done in under a minute.

---

## 👥 TARGET USERS

**Primary:** Solo tradies and small trade businesses in Australia
- Handymen
- Carpenters
- Painters  
- Electricians
- Plumbers
- Landscapers
- General contractors

**Characteristics:**
- Mobile-first (always on job sites)
- Not tech-savvy (prefer simple tools)
- Time-poor (every minute counts)
- Price-sensitive (want affordable software)
- Voice-comfortable (already use voice messages daily)

---

## ⚡ CORE FEATURES

### Phase 1: MVP (CURRENT FOCUS)
**Status: 80% complete, needs bug fixes**

#### 1. Voice-to-Quote Generation ⭐ FLAGSHIP FEATURE
**What:** Record voice describing a job, AI generates structured quote
**How:**
- Tap record button
- Speak: "Quote for [customer] at [location]. [Scope]. Need [materials]. About [time] work. Plus [fees]."
- See checklist tick in real-time as AI extracts data
- Auto-navigate to pre-filled quote
- Review/edit → Send

**Tech:**
- OpenAI Whisper (transcription)
- GPT-4 (structured extraction)
- Supabase (storage & database)
- Real-time polling for progress updates

**Status:** ✅ Recording works, ✅ Transcription works, ✅ Extraction works, ❌ Quote creation broken

---

#### 2. Material Catalog & Auto-Pricing
**What:** 200+ common materials with Australian pricing
**How:**
- AI extracts materials from voice ("10 sheets treated pine")
- System matches to catalog ("Treated Pine Decking 90x45mm - $45/sheet")
- Calculates line item (10 × $45 = $450)
- Falls back to AI estimation if not in catalog

**Status:** ✅ Catalog exists, ❌ Matching integration incomplete

---

#### 3. Quote Editor
**What:** Mobile-optimized quote editing interface
**How:**
- All fields editable inline (click to edit)
- Add/remove line items
- Adjust quantities and prices
- Auto-calculates subtotals and GST
- Clean professional layout

**Status:** ✅ Basic editor exists, ❌ Not receiving data from voice intake

---

#### 4. Quote Sending (via SMS/Email)
**What:** Send quote directly to customer
**How:**
- Customer receives link to view quote online
- Professional PDF available
- Tracks sent/viewed status

**Status:** 🚧 Partially implemented

---

### Phase 2: Essential Features (NEXT)
**Timeline: After MVP bugs fixed**

#### 5. Quote Acceptance & Job Creation
**What:** Customer can accept quote online, creates job automatically
**How:**
- Customer clicks "Accept Quote" on public link
- Quote converts to Invoice
- Job appears in tradie's job list
- Notifications sent

**Status:** 📋 Planned

---

#### 6. Invoice Management
**What:** Convert quotes to invoices, track payments
**How:**
- One-click convert quote → invoice
- Send invoice to customer
- Mark as paid/unpaid
- Payment reminders

**Status:** 📋 Planned

---

#### 7. Job Tracking
**What:** Simple job management (scheduled/in-progress/complete)
**How:**
- Calendar view of jobs
- Add notes and photos
- Mark complete
- Link to original quote/invoice

**Status:** 📋 Planned

---

### Phase 3: Advanced Features (FUTURE)
**Timeline: 3-6 months post-launch**

8. Recurring Quotes (monthly maintenance, etc.)
9. Multi-currency support (expand beyond Australia)
10. Team management (multiple users per business)
11. Customer database (CRM-lite)
12. Analytics & reporting
13. Integrations (Xero, MYOB accounting software)

---

## 🛠️ TECHNICAL STACK

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Routing:** React Router v6
- **UI Library:** Tailwind CSS
- **Icons:** Lucide React
- **State Management:** React hooks (useState, useEffect)
- **Audio Recording:** MediaRecorder API

### Backend
- **Platform:** Supabase (PostgreSQL database + Edge Functions)
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage (audio files)
- **API:** Supabase REST API + Realtime
- **Edge Functions:** Deno (TypeScript)

### AI Services
- **Transcription:** OpenAI Whisper API
- **Extraction:** OpenAI GPT-4 (structured output)
- **Fallback Pricing:** GPT-4 (when material not in catalog)

### Infrastructure
- **Hosting:** Vercel (frontend)
- **Database:** Supabase (managed PostgreSQL)
- **CDN:** Vercel Edge Network
- **Domain:** TBD

---

## 🗄️ DATABASE SCHEMA

### Core Tables

#### `users`
```sql
id: uuid (primary key)
email: text
full_name: text
phone: text
business_name: text
hourly_rate: numeric (default: 85.00)
created_at: timestamp
```

#### `voice_quotes`
```sql
id: uuid (primary key)
user_id: uuid (foreign key → users)
audio_url: text (Supabase Storage path)
transcript: text
quote_data: jsonb (extracted structured data)
  ├─ customer_name: string
  ├─ location: string
  ├─ scope: string
  ├─ materials: array
  ├─ labor_hours: number
  └─ additional_fees: array
status: enum ('recording', 'transcribing', 'extracting', 'extracted', 'error')
progress: integer (0-100)
created_at: timestamp
updated_at: timestamp
```

#### `quotes`
```sql
id: uuid (primary key)
user_id: uuid (foreign key → users)
voice_quote_id: uuid (foreign key → voice_quotes, nullable)
quote_number: text (auto-generated: Q-2026-001)
customer_name: text
customer_email: text
customer_phone: text
location: text
scope: text
valid_until: date (default: 30 days from creation)
subtotal: numeric
gst_amount: numeric (10% of subtotal)
total: numeric (subtotal + gst)
status: enum ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')
sent_at: timestamp
accepted_at: timestamp
created_at: timestamp
updated_at: timestamp
```

#### `quote_line_items`
```sql
id: uuid (primary key)
quote_id: uuid (foreign key → quotes)
line_type: enum ('material', 'labor', 'fee', 'other')
description: text
quantity: numeric
unit: text ('each', 'hours', 'metres', 'litres', etc.)
unit_price: numeric
line_total: numeric (quantity × unit_price)
sort_order: integer
created_at: timestamp
```

#### `material_catalog_items`
```sql
id: uuid (primary key)
country: text (default: 'AU')
trade_type: text ('Handyman', 'Electrician', 'Plumber', etc.)
category: text ('Timber', 'Fasteners', 'Paint', etc.)
subcategory: text ('building_materials', 'hardware', etc.)
name: text (primary name)
unit: text
price_min: numeric (cents)
price_max: numeric (cents)
price_type: enum ('ex_gst', 'inc_gst')
search_aliases: text (comma-separated variations)
is_common: boolean
created_at: timestamp
updated_at: timestamp
```

#### `invoices`
```sql
id: uuid (primary key)
quote_id: uuid (foreign key → quotes)
user_id: uuid (foreign key → users)
invoice_number: text (auto-generated: INV-2026-001)
due_date: date
amount_paid: numeric
paid_at: timestamp
status: enum ('unpaid', 'partial', 'paid', 'overdue')
created_at: timestamp
updated_at: timestamp
```

#### `jobs`
```sql
id: uuid (primary key)
quote_id: uuid (foreign key → quotes)
user_id: uuid (foreign key → users)
job_number: text
scheduled_date: date
status: enum ('scheduled', 'in_progress', 'completed', 'cancelled')
notes: text
completed_at: timestamp
created_at: timestamp
updated_at: timestamp
```

### Database Functions

#### `get_public_quote(quote_id uuid)`
Returns quote details for customer view (public-facing)

#### `calculate_quote_totals(quote_id uuid)`
Recalculates subtotal, GST, and total when line items change

---

## 🎨 DESIGN SYSTEM

### Brand Colors
```css
--primary-dark: #0f172a    /* slate-900 - Headers, primary text */
--primary-light: #f1f5f9   /* slate-100 - Backgrounds */
--accent: #d4ff00          /* Lime - Buttons, highlights */
--success: #22c55e         /* green-500 - Checkmarks, success states */
--processing: #86efac      /* green-300 - Processing states */
--error: #ef4444           /* red-500 - Errors */
--warning: #f59e0b         /* amber-500 - Warnings */
--text-primary: #0f172a    /* slate-900 - Body text */
--text-secondary: #64748b  /* slate-500 - Secondary text */
```

### Typography
```css
Font Family: Inter (Google Fonts)

Headings:
  - H1: 32px, Bold (700)
  - H2: 24px, Bold (700)  
  - H3: 20px, SemiBold (600)

Body:
  - Regular: 16px, Regular (400)
  - Small: 14px, Regular (400)
  - Label: 14px, Medium (500)

Numbers/Prices:
  - Price: 18px, SemiBold (600)
  - Total: 24px, Bold (700)
```

### Spacing Scale
```css
--space-1: 4px    /* Tight spacing */
--space-2: 8px    /* Small gaps */
--space-3: 12px   /* Default spacing */
--space-4: 16px   /* Card padding */
--space-5: 20px   /* Section spacing */
--space-6: 24px   /* Large sections */
--space-8: 32px   /* Page margins */
```

### Component Sizes
```css
Button Height: 48px (minimum for mobile)
Input Height: 44px
Tap Target: 44px minimum (mobile accessibility)
Card Border Radius: 12px
Button Border Radius: 8px
```

### Animations
```css
Fast: 150ms ease-out
Standard: 300ms ease-in-out
Slow: 500ms ease-in-out

Checklist Tick: 300ms ease-out
Page Transitions: 400ms slide
Color Transitions: 200ms ease-in-out
```

---

## 📱 USER FLOW (COMPLETE)

### Main User Journey

```
1. DASHBOARD (Home Screen)
   ├─ [+ New Quote] button (prominent)
   ├─ Recent quotes list
   ├─ Stats (quotes sent, accepted, revenue)
   └─ Quick actions (view jobs, invoices)

2. VOICE RECORDER (Screen 1)
   ├─ 🎤 Record button (large, center)
   ├─ Real-time checklist:
   │  ├─ ⭕ 📍 Job location
   │  ├─ ⭕ 👤 Customer name
   │  ├─ ⭕ 🔨 Scope of work
   │  ├─ ⭕ 📦 Materials
   │  ├─ ⭕ ⏱️ Labour estimate
   │  └─ ⭕ 💰 Additional fees
   ├─ Recording timer (0:00)
   ├─ [Stop Recording] button
   └─ Processing indicator after stop

3. QUOTE EDITOR (Screen 2)
   ├─ Quote header:
   │  ├─ Quote #Q-2026-XXX
   │  ├─ Date
   │  └─ Valid until
   ├─ Customer details (editable):
   │  ├─ Name
   │  ├─ Email
   │  ├─ Phone
   │  └─ Location
   ├─ Scope of work (editable)
   ├─ Line items (editable):
   │  ├─ Description
   │  ├─ Quantity
   │  ├─ Unit price
   │  └─ Line total
   ├─ Totals:
   │  ├─ Subtotal
   │  ├─ GST (10%)
   │  └─ TOTAL
   ├─ [+ Add Line Item] button
   ├─ [Save Draft] button
   └─ [Send to Customer] button (primary)

4. QUOTE SENT CONFIRMATION
   ├─ Success message
   ├─ Quote number
   ├─ Customer details
   ├─ [View Quote] button
   └─ [Back to Dashboard] button

5. CUSTOMER VIEW (Public Link)
   ├─ Quote details (read-only)
   ├─ Professional formatting
   ├─ [Download PDF] button
   ├─ [Accept Quote] button
   └─ [Request Changes] button
```

---

## 🔄 TECHNICAL WORKFLOWS

### Voice-to-Quote Pipeline

```
1. USER RECORDS AUDIO
   ├─ RecordScreen component renders
   ├─ MediaRecorder API starts
   ├─ Audio chunks collected
   └─ Audio blob created on stop

2. AUDIO UPLOADED TO STORAGE
   ├─ POST to Supabase Storage
   ├─ File saved: audio/[user-id]/[timestamp].webm
   ├─ voice_quotes record created:
   │  ├─ status: 'recording'
   │  ├─ audio_url: storage path
   │  └─ user_id: current user
   └─ Returns voice_quote_id

3. TRANSCRIPTION (Edge Function: openai-proxy)
   ├─ Frontend calls Edge Function
   ├─ Edge Function downloads audio from storage
   ├─ Sends to OpenAI Whisper API
   ├─ Receives transcript text
   ├─ Updates voice_quotes:
   │  ├─ transcript: [text]
   │  ├─ status: 'transcribing' → 'extracting'
   │  └─ progress: 20
   └─ Returns transcript

4. EXTRACTION (Edge Function: openai-proxy)
   ├─ Frontend calls Edge Function with transcript
   ├─ Sends to GPT-4 with structured prompt
   ├─ Receives JSON:
   │  ├─ customer_name
   │  ├─ location
   │  ├─ scope
   │  ├─ materials: [{item, quantity, unit}]
   │  ├─ labor_hours
   │  └─ additional_fees: [{description, amount}]
   ├─ Updates voice_quotes incrementally:
   │  ├─ quote_data: [extracted JSON]
   │  ├─ status: 'extracted'
   │  └─ progress: 100
   └─ Returns extracted data

5. MATERIAL MATCHING (Background)
   ├─ For each material in extracted data
   ├─ Search material_catalog_items:
   │  ├─ Match by name or search_aliases
   │  ├─ Fuzzy matching (Levenshtein distance)
   │  └─ Filter by user's trade_type
   ├─ If match found:
   │  ├─ Use catalog price
   │  └─ Calculate line_total
   └─ If no match:
      ├─ Use GPT-4 to estimate price
      └─ Flag for manual review

6. QUOTE CREATION (Frontend)
   ├─ Create quotes record:
   │  ├─ user_id
   │  ├─ voice_quote_id
   │  ├─ customer details from extracted data
   │  ├─ quote_number: auto-generated
   │  ├─ valid_until: +30 days
   │  └─ status: 'draft'
   ├─ Create quote_line_items:
   │  ├─ Materials (from catalog match)
   │  ├─ Labor (hours × hourly_rate)
   │  └─ Additional fees
   ├─ Call calculate_quote_totals()
   └─ Navigate to /quotes/[quote_id]

7. QUOTE EDITOR LOADS
   ├─ Fetch quote with line items
   ├─ Render editable form
   ├─ User reviews/edits
   ├─ Auto-saves changes
   └─ User clicks "Send to Customer"

8. QUOTE SENDING
   ├─ Update quotes.status = 'sent'
   ├─ Set quotes.sent_at = NOW()
   ├─ Generate public link: /public/quotes/[id]
   ├─ Send SMS/Email to customer:
   │  ├─ Quote details
   │  ├─ Public link
   │  └─ Business info
   └─ Return to dashboard
```

---

## ✅ CURRENT STATUS (As of Jan 8, 2026)

### What's Working ✅
- User authentication (Supabase Auth)
- Dashboard layout
- Voice recording (MediaRecorder API)
- Audio upload to Supabase Storage
- Transcription via OpenAI Whisper
- Data extraction via GPT-4
- Real-time checklist animations (basic)
- Quote editor UI (layout exists)
- Material catalog (200+ items in database)

### What's Broken ❌
**CRITICAL BUG: Quote not being created from voice_quotes data**
- Voice recording completes ✅
- Transcription completes ✅
- Extraction completes ✅
- Data saved to voice_quotes.quote_data ✅
- **Quote creation from extracted data ❌ FAILS**
- Auto-navigation to quote editor ❌ DOESN'T HAPPEN

**Suspected Issues:**
1. Quote creation logic not implemented in frontend
2. Missing step between extraction and quote editor
3. Database function error (column name mismatch?)
4. Quote editor not loading data from voice_quote_id

**Recent Migration Fix Applied:**
- Fixed column name: `qli.unit_price` → correct column reference
- Migration file: `20260108000000_fix_get_public_quote_created_by_column.sql`
- Needs to be run in Supabase SQL Editor

### What Needs Testing 🧪
- End-to-end voice → quote flow
- Material catalog matching accuracy
- Real-time checklist during recording
- Quote totals calculation
- Quote sending (SMS/Email)

---

## 🎯 IMMEDIATE PRIORITIES (This Week)

### Priority 1: Fix Quote Creation
**Task:** After extraction completes, create quote from voice_quotes.quote_data
**Location:** voicerecorder.tsx
**Steps:**
1. When status = 'extracted' detected
2. Create quotes record with extracted customer details
3. Create quote_line_items for each material/labor/fee
4. Run calculate_quote_totals()
5. Store quote_id in voice_quotes
6. Navigate to /quotes/[quote_id]

### Priority 2: Test End-to-End Flow
**Task:** Record → Transcribe → Extract → Quote → Send
**Test Cases:**
- Simple job (1 material, basic labor)
- Complex job (multiple materials, fees)
- Missing information (no customer name, etc.)
- Invalid data (garbage input)

### Priority 3: Polish Checklist UI
**Task:** Improve visual feedback during recording
**Requirements:**
- Smooth animations (gray → light green → dark green)
- Clear visual states (empty, processing, complete)
- Timing feels natural (not too fast/slow)
- Mobile-optimized (large enough to see clearly)

---

## 🚫 WHAT TO AVOID

### Development Anti-Patterns
❌ Don't add features not in this doc without approval
❌ Don't change the 2-screen voice flow structure
❌ Don't add emoji to the actual quote document
❌ Don't create multi-step wizards (keep it simple)
❌ Don't make users confirm every action (trust AI extraction)
❌ Don't show empty quotes that populate later
❌ Don't require separate "edit mode" toggle
❌ Don't mix old voice_intakes table with new voice_quotes

### Technical Anti-Patterns
❌ Don't use localStorage (causes issues in production)
❌ Don't make sequential API calls (use single structured call)
❌ Don't block UI waiting for processing (use polling)
❌ Don't create database triggers (client-driven flow)
❌ Don't use deprecated Edge Functions (transcribe-voice-intake, extract-quote-data)

### UX Anti-Patterns
❌ Don't show live transcription (distracting)
❌ Don't add unnecessary confirmation screens
❌ Don't hide the "Send" button behind menus
❌ Don't require login to view public quotes
❌ Don't make forms with 20+ fields (voice does the work)

---

## 📐 ARCHITECTURE DECISIONS

### Why Client-Driven (Not Database Triggers)?
**Decision:** Frontend calls Edge Functions directly, not via database triggers

**Reasons:**
1. **Faster feedback:** Immediate response to user actions
2. **Easier debugging:** Clear call stack, simpler error handling
3. **More flexible:** Can retry failures, show progress
4. **Better UX:** Can update UI during processing
5. **Simpler:** No hidden triggers that fire mysteriously

**Trade-offs:**
- Frontend must handle orchestration
- More complex frontend code
- Network latency affects speed

**Verdict:** Worth it for better UX and debugging

---

### Why Single Structured Extraction (Not Multiple Calls)?
**Decision:** One GPT-4 call returning JSON, not 5-7 separate calls

**Reasons:**
1. **10x faster:** 10 seconds vs 60 seconds
2. **Cheaper:** 1 API call vs 7 = 7x cost savings
3. **More consistent:** All fields extracted with same context
4. **Easier to debug:** Single API call to inspect
5. **Better results:** Model sees full context at once

**Trade-offs:**
- Single point of failure (but can retry)
- Must handle partial data in JSON

**Verdict:** Clear winner for speed and cost

---

### Why Material Catalog (Not Always AI Pricing)?
**Decision:** 200+ item catalog with real Australian pricing

**Reasons:**
1. **More accurate:** Real prices beat AI estimates
2. **Faster:** Database lookup vs AI call
3. **Consistent:** Same material always same price
4. **Professional:** Customers trust accurate pricing
5. **Scalable:** Can expand to any country/currency

**Trade-offs:**
- Must maintain catalog
- Limited to cataloged items
- May not have latest prices

**Solution:** AI fallback for items not in catalog

**Verdict:** Hybrid approach (catalog + AI) is best

---

## 🌍 MARKET STRATEGY

### Geographic Focus
**Phase 1:** Australia only
- Material prices in AUD
- GST (10%) compliance
- Australian trade terminology
- Mobile numbers (+61 format)

**Phase 2:** Expand to:
- New Zealand (similar market)
- UK (different tax system)
- USA (different terminology, units)

### Pricing Strategy
**Target:** $29-49 AUD/month per user
**Model:** Subscription (monthly/annual)
**Free Trial:** 14 days, 10 quotes

**Competitors:**
- Tradify: $59/month (complex, job management focus)
- ServiceM8: $49/month (heavy on features, slow)
- SimPRO: $89/month (enterprise, overkill for solos)

**Positioning:** Simpler, faster, voice-first, affordable

---

## 🎓 KEY LEARNINGS (Avoid Past Mistakes)

### 1. Don't Mix Old & New Code
**Mistake:** Had voice_intakes table + voice_quotes table causing confusion
**Fix:** Deleted voice_intakes entirely, clean start with voice_quotes
**Lesson:** When refactoring, delete old code completely

### 2. Test End-to-End Early
**Mistake:** Built features in isolation, integration failed
**Fix:** Now testing full pipeline before adding features
**Lesson:** Working E2E flow > perfect individual features

### 3. Trust But Verify AI
**Mistake:** Assumed AI extraction was always perfect
**Reality:** ~90% accurate, needs manual review option
**Fix:** Allow editing extracted data before quote creation
**Lesson:** AI is assistant, not replacement for human judgment

### 4. Mobile-First is Non-Negotiable
**Mistake:** Initially designed for desktop
**Reality:** Tradies only use phones on job sites
**Fix:** All tap targets 44px+, large buttons, thumb-friendly
**Lesson:** If it doesn't work on mobile, it doesn't work

### 5. Speed Perception Matters
**Mistake:** Fast backend but felt slow (no feedback)
**Fix:** Real-time checklist, progress indicators
**Lesson:** Perceived speed > actual speed

---

## 📞 SUPPORT & RESOURCES

### Documentation
- Supabase Docs: https://supabase.com/docs
- OpenAI API Docs: https://platform.openai.com/docs
- React Router Docs: https://reactrouter.com
- Tailwind CSS Docs: https://tailwindcss.com

### Project Files
- **User Flow Brief:** `SMASHAPP_USER_FLOW_BRIEF.md` (detailed UX)
- **This Document:** `SMASHAPP_MASTER_REFERENCE.md` (complete overview)
- **Migration Files:** `supabase/migrations/`
- **Edge Functions:** `supabase/functions/`

### Environment Variables
```env
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[key]
VITE_OPENAI_API_KEY=[key]
```

---

## ✨ THE VISION (Why This Matters)

**Problem:** Tradies waste 5-10 hours per week on admin (quoting, invoicing, paperwork) instead of earning money doing actual work.

**Solution:** SMASHAPP reduces that to 30 minutes per week by automating the boring stuff with voice AI.

**Impact:**
- **More money:** Tradies earn $500-1000 more per week (less admin, more jobs)
- **Less stress:** No more laptop at night doing paperwork
- **Better customer experience:** Instant professional quotes
- **Work-life balance:** Home by dinner, not stuck doing admin

**This isn't just software. It's giving tradies their time back.**

---

## 🎯 SUCCESS METRICS

### Technical
- Voice → Quote in < 60 seconds (target: 45s)
- 95%+ successful quote generations
- 90%+ extraction accuracy
- Zero data loss

### Business  
- 100 active users by Month 3
- 1000 quotes generated by Month 6
- 10% conversion (quote → job)
- $5K MRR by Month 6

### User Experience
- 4.5+ star rating (App Store)
- < 2% churn rate
- 80%+ daily active usage
- "Easy to use" #1 feedback theme

---

## 📋 CURSOR CHECKLIST

Before starting any work, verify:

- [ ] Read this Master Reference document
- [ ] Read SMASHAPP_USER_FLOW_BRIEF.md
- [ ] Understand the 2-screen voice flow
- [ ] Know what's working vs broken (Current Status section)
- [ ] Check Immediate Priorities for focus
- [ ] Review What To Avoid (anti-patterns)
- [ ] Confirm changes align with Architecture Decisions
- [ ] Test on mobile (primary device)
- [ ] Verify no localStorage usage
- [ ] Ensure no emoji in quote documents

**When in doubt:** Refer back to this doc. Stay focused. Keep it simple.

---

**END OF MASTER REFERENCE**

*Last Updated: Jan 8, 2026*
*Version: 1.0*
