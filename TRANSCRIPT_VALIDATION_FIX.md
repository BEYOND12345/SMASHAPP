# Transcript Validation Fix - Catches Useless Transcripts

**Date:** 2025-12-17
**Issue:** Whisper transcription returning nearly empty results (e.g., just "you")
**Status:** ✅ FIXED

---

## The Problem

User recorded a voice quote but Whisper only transcribed "you" (3 characters) from what was likely 10+ seconds of audio. The previous validation only checked for completely empty transcripts (length 0), so this useless transcript passed validation and proceeded to the edit screen.

**Why this happened:**
- Poor audio quality (too far from mic, background noise, mumbling)
- Whisper API couldn't understand the speech
- Previous validation: `if (length === 0) fail` ← This passes "you" (length 3)

---

## The Fix

Added stricter validation that compares transcript length to audio duration:

### New Validation Rules

**FAIL - Useless Transcript:**
```
IF audio_duration > 3 seconds AND transcript_length < 10 characters
THEN fail with clear error message
```

**WARN - Suspicious but Might Be Valid:**
```
IF audio_duration > 10 seconds AND transcript_length < 30 characters
THEN log warning but allow (might be "No thanks, goodbye")
```

### Error Message

Now users see:
```
Transcription failed - only captured "you" from 10 seconds of audio.
Please try recording again and speak clearly.
```

Instead of proceeding to edit screen with useless transcript.

---

## Code Changes

**File:** `supabase/functions/transcribe-voice-intake/index.ts`

**Before:**
```typescript
// Only caught completely empty transcripts
if (transcriptLength === 0) {
  throw new Error("Transcription returned empty text.");
}

// Warned but didn't fail for short transcripts
if (transcriptLength < 20 && audioDuration > 5) {
  console.warn("Very short transcript");
}
```

**After:**
```typescript
// Catches completely empty
if (transcriptLength === 0) {
  throw new Error("Transcription returned empty text. Audio may be silent or corrupted.");
}

// NEW: Catches useless transcripts (< 10 chars from > 3 sec audio)
if (audioDuration > 3 && transcriptLength < 10) {
  console.error("[TRANSCRIPT] CRITICAL: Transcript too short for audio duration", {
    transcript_length: transcriptLength,
    audio_duration: audioDuration,
    transcript_preview: transcriptText,
  });
  throw new Error(
    `Transcription failed - only captured "${transcriptText}" from ${audioDuration} seconds of audio. ` +
    `Please try recording again and speak clearly.`
  );
}

// Warns for suspicious but possibly valid short transcripts
if (transcriptLength < 30 && audioDuration > 10) {
  console.warn("[TRANSCRIPT] WARNING: Short transcript for audio length", {
    transcript_preview: transcriptText,
  });
}
```

---

## Why These Thresholds?

**10 characters minimum for > 3 seconds:**
- Even short quotes should be at least 10 characters
- "Paint wall" (10 chars) is reasonable minimum
- "you" (3 chars) is clearly useless

**30 characters warning for > 10 seconds:**
- "I need to fix the door handle" (32 chars) is valid but short for 10 seconds
- Warns but doesn't block in case user spoke very quickly or paused a lot
- Admin can investigate in logs if needed

---

## User Experience

### Before Fix:
1. User records voice quote with poor audio
2. Whisper transcribes only "you"
3. System proceeds to "Review Transcript" screen
4. User sees "you" and realizes transcription failed
5. User must cancel and re-record OR manually type entire quote

### After Fix:
1. User records voice quote with poor audio
2. Whisper transcribes only "you"
3. **System immediately fails with clear error message**
4. Error explains what went wrong and tells user to re-record
5. User re-records with better audio quality

**Result:** Faster feedback, clearer guidance, better UX.

---

## For Current Stuck Users

If you're currently on the "Review Transcript" screen with a useless transcript:

**Option 1: Re-record** (Recommended)
1. Click X to cancel
2. Start a new recording
3. Speak clearly and closer to the microphone

**Option 2: Manual Edit**
1. Delete the useless text ("you")
2. Type what you actually said in the text box
3. Continue to extraction

After this fix deploys, future recordings will catch this error earlier.

---

## Console Logs

**When useless transcript is caught:**
```
[TRANSCRIPT] Transcription complete
{
  intake_id: "abc-123",
  transcript_length: 3,
  audio_duration: 12,
  language: "en",
  has_content: true
}

[TRANSCRIPT] CRITICAL: Transcript too short for audio duration
{
  intake_id: "abc-123",
  transcript_length: 3,
  audio_duration: 12,
  transcript_preview: "you"
}

[TRANSCRIPT] ✗ Pipeline failed
{
  error: "Transcription failed - only captured 'you' from 12 seconds of audio..."
}
```

---

## Build Status

✅ **Build successful** - Fix deployed

---

## Testing

To verify this fix works:

1. Record audio with very poor quality (whisper from far away)
2. If Whisper captures < 10 characters from > 3 seconds
3. Should see error immediately, not proceed to edit screen

---

## Summary

Stricter validation now catches nearly-empty transcripts and fails early with a helpful error message, instead of letting users proceed with useless data.

**Validation flow:**
- Empty transcript (0 chars) → FAIL
- Nearly empty (< 10 chars from > 3 sec) → FAIL ← **NEW**
- Short but might be valid (< 30 chars from > 10 sec) → WARN
- Reasonable length → PASS
