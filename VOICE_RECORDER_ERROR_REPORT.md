# Voice Recorder Error - Technical Deep Dive Report

**Date**: 2025-12-15
**Issue**: Voice-to-Quote feature failing with "OPENAI_API_KEY not configured" error
**Severity**: Critical - Feature completely non-functional

---

## Executive Summary

The voice recording feature fails at the transcription stage because the OpenAI API key is not configured in the Supabase Edge Functions environment. This is a **deployment/configuration issue**, not a code bug.

---

## Error Details

### Primary Error
```
OpenAI transcription failed: {"error":"OPENAI_API_KEY not configured"}
```

### Error Origin
- **File**: `supabase/functions/openai-proxy/index.ts`
- **Line**: 23-26
- **Function**: `openai-proxy` Edge Function

### Call Stack
1. User stops voice recording in `voicerecorder.tsx`
2. `processRecording()` uploads audio to Supabase Storage (line 109-153)
3. Calls `transcribe-voice-intake` Edge Function (line 160-170)
4. That function downloads audio and proxies to `openai-proxy` (line 79-86 in transcribe-voice-intake/index.ts)
5. `openai-proxy` checks for `OPENAI_API_KEY` environment variable
6. **ERROR**: Environment variable not found → throws error

---

## Root Cause Analysis

### 1. Missing Configuration
The `OPENAI_API_KEY` secret is **not configured** in the Supabase project's Edge Functions secrets.

**Evidence**:
```typescript
// openai-proxy/index.ts:23-26
const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiApiKey) {
  throw new Error("OPENAI_API_KEY not configured");
}
```

### 2. Environment Separation
The `.env` file in the project root only contains **frontend** environment variables:
```env
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_URL=...
```

These are NOT available to Edge Functions. Edge Functions require secrets to be configured separately through Supabase.

### 3. Architecture Context

**Frontend → Edge Function Communication**:
```
┌─────────────────┐
│  voicerecorder  │
│     .tsx        │
└────────┬────────┘
         │ HTTP POST with JWT
         ▼
┌──────────────────────────┐
│ transcribe-voice-intake  │
│   Edge Function          │
└────────┬─────────────────┘
         │ HTTP POST with FormData
         ▼
┌──────────────────────────┐
│   openai-proxy           │
│   Edge Function          │◄──── NEEDS OPENAI_API_KEY
└────────┬─────────────────┘
         │ HTTPS
         ▼
┌──────────────────────────┐
│   OpenAI Whisper API     │
│   api.openai.com/v1      │
└──────────────────────────┘
```

---

## Required Fix

### Step 1: Obtain OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key (or use existing)
3. Copy the key (starts with `sk-...`)

### Step 2: Configure in Supabase
The key must be added as a secret in the Supabase project. This is typically done via:

**Option A - Supabase CLI**:
```bash
supabase secrets set OPENAI_API_KEY=sk-...your-key-here
```

**Option B - Supabase Dashboard**:
1. Navigate to Project Settings → Edge Functions
2. Add secret: `OPENAI_API_KEY` = `sk-...your-key-here`

**Option C - Deployment Tool**:
If using a deployment platform (like bolt.new), configure through their secrets management UI.

### Step 3: Verify Configuration
Use the `test-secrets` Edge Function to verify:

```bash
curl -X POST \
  'https://rhijyaoguokspapkwtrt.supabase.co/functions/v1/test-secrets' \
  -H 'Authorization: Bearer [YOUR_ANON_KEY]' \
  -H 'Content-Type: application/json'
```

Expected response should show:
```json
{
  "OPENAI_API_KEY": "[EXISTS]",
  ...
}
```

---

## Files Involved

### 1. `supabase/functions/openai-proxy/index.ts`
**Purpose**: Secure proxy for OpenAI API calls
**Issue**: Lines 23-26 validate presence of `OPENAI_API_KEY`
**Status**: Code is correct; configuration is missing

### 2. `supabase/functions/transcribe-voice-intake/index.ts`
**Purpose**: Orchestrates audio transcription workflow
**Issue**: Calls `openai-proxy` which fails
**Status**: Code is correct; depends on openai-proxy working

### 3. `src/screens/voicerecorder.tsx`
**Purpose**: Frontend voice recording UI and workflow
**Issue**: Lines 160-175 handle transcription call and error display
**Status**: Code is correct; properly displays upstream errors

### 4. `supabase/functions/test-secrets/index.ts`
**Purpose**: Diagnostic tool to check secret configuration
**Usage**: Can be called from Settings screen to verify setup
**Status**: Working as designed

---

## Additional Context

### Why Use a Proxy?
The `openai-proxy` Edge Function exists to:
1. **Secure API keys**: Never expose OpenAI keys to frontend
2. **Authenticate users**: Verify Supabase JWT before allowing API access
3. **Centralize costs**: Track/limit OpenAI usage per user
4. **Add monitoring**: Log requests for debugging

### Security Model
```
Frontend (untrusted)
    ↓ [Supabase JWT]
Edge Function (validates user)
    ↓ [OpenAI API Key]
OpenAI API (external)
```

This is the correct architecture. The API key should NEVER be in frontend code or `.env` files committed to git.

---

## Testing Checklist

After configuring the API key:

- [ ] Test voice recording through UI
- [ ] Verify transcription completes successfully
- [ ] Check quote creation from voice intake
- [ ] Verify `test-secrets` endpoint shows `OPENAI_API_KEY: [EXISTS]`
- [ ] Monitor Supabase Edge Function logs for errors
- [ ] Check OpenAI usage dashboard for API calls

---

## Related Issues

### React Warning (RESOLVED)
A separate React warning about `<select>` elements was fixed by removing the disabled placeholder option from `src/components/inputs.tsx:33`.

**Before**:
```jsx
<option value="" disabled>Select an option</option>
```

**After**:
```jsx
// Removed - not needed since all selects have values from state
```

---

## Deployment Notes

### For Development
If running locally with Supabase CLI:
```bash
echo "OPENAI_API_KEY=sk-your-key" >> supabase/.env.local
supabase functions serve
```

### For Production
Configure through Supabase Dashboard or CLI as described above. Secrets are encrypted and never exposed to frontend.

---

## Support Information

**Supabase Project**: `rhijyaoguokspapkwtrt`
**Edge Functions**:
- `openai-proxy` - Requires `OPENAI_API_KEY`
- `transcribe-voice-intake` - Depends on openai-proxy
- `extract-quote-data` - Depends on openai-proxy
- `create-draft-quote` - Depends on openai-proxy
- `test-secrets` - Diagnostic tool (no dependencies)

**OpenAI Model Used**: `whisper-1` (audio transcription)

---

## Conclusion

This is a **configuration issue**, not a code defect. The application code is correctly implemented and follows security best practices. The fix requires adding the `OPENAI_API_KEY` secret to the Supabase Edge Functions environment through the appropriate deployment/configuration interface.

**Estimated Time to Fix**: 5 minutes (once API key is obtained)
**Risk Level**: Low (configuration-only change)
**User Impact**: Blocks entire voice-to-quote feature until resolved
