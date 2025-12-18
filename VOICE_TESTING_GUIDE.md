# Voice-to-Quote Testing Guide

Quick guide to verify the voice reliability fixes are working.

---

## Test 1: Clear Speech (Happy Path)

**Goal:** Verify high-confidence extraction creates quote immediately without review

**Steps:**
1. Click microphone button
2. Say clearly: "This is a quote for painting two bedrooms. It will take 8 hours. I'll use white paint, need about 10 liters. Customer is John Smith."
3. Stop recording

**Expected:**
- Transcript appears complete
- System extracts data
- Quote created immediately (no review screen)
- All values populated correctly

**Check console logs for:**
```
[VOICE_CAPTURE] ✓ Transcription complete
[EXTRACTION] Status: extracted (all quality checks passed)
[QUOTE_CREATE] Proceeding with quote creation
```

---

## Test 2: Vague Speech (Extraction with Defaults)

**Goal:** Verify system handles vague speech with reasonable estimates

**Steps:**
1. Click microphone button
2. Say: "Deck rebuild for Kate. A couple weeks work. I'll drive there, about two hours. Need some blackbutt timber and screws."
3. Stop recording

**Expected:**
- Transcript appears complete
- System routes to review screen
- Extracted values:
  - Duration: ~14 days (2 weeks)
  - Travel: ~2 hours
  - Materials: blackbutt timber (quantity may be flagged), screws (quantity needs pricing)
- Confidence scores visible (amber/yellow for estimates)

**Check console logs for:**
```
[TRANSCRIPT] Transcription complete
[EXTRACTION] Status: needs_user_review (reason: overall confidence < 0.7)
[REVIEW_FLOW] Loading intake data
```

---

## Test 3: User Corrections

**Goal:** Verify user edits are applied and not overwritten

**Steps:**
1. Record any voice quote that routes to review
2. On review screen, edit a labour hours value (e.g., change 8 to 10)
3. Edit a material quantity (e.g., change 5 to 7)
4. Click "Confirm & Continue"

**Expected:**
- Quote created with YOUR edited values (not original extraction)
- No loop back to review
- Line items show your corrected numbers

**Check console logs for:**
```
[REVIEW_FLOW] User clicked Confirm
{
  has_corrections: true
}
[REVIEW_FLOW] Marking intake as user-confirmed (no extraction re-run)
[QUOTE_CREATE] Applying user corrections
{
  labour_overrides: X,
  materials_overrides: Y
}
[QUOTE_CREATE] User has confirmed - skipping quality guards
```

---

## Test 4: Empty/Silent Audio

**Goal:** Verify system fails gracefully with clear error message

**Steps:**
1. Click microphone button
2. Don't say anything (stay silent)
3. Stop after 5 seconds

**Expected:**
- Error message: "Transcription returned empty text. Audio may be silent or corrupted."
- Does NOT proceed to extraction or review
- Clear error visible to user

**Check console logs for:**
```
[TRANSCRIPT] CRITICAL: Empty transcript returned
{
  intake_id: "...",
  audio_size_bytes: X,
  audio_duration: Y
}
```

---

## Test 4b: Nearly Empty Transcript (Poor Audio Quality)

**Goal:** Verify system catches useless transcripts

**Steps:**
1. Click microphone button
2. Say something but with very poor audio (far from mic, mumbling, background noise)
3. If Whisper only captures 1-2 words from 10+ seconds of audio

**Expected:**
- Error message: "Transcription failed - only captured 'you' from 10 seconds of audio. Please try recording again and speak clearly."
- Does NOT proceed to extraction or review
- Error tells user what went wrong

**Check console logs for:**
```
[TRANSCRIPT] CRITICAL: Transcript too short for audio duration
{
  intake_id: "...",
  transcript_length: 3,
  audio_duration: 10,
  transcript_preview: "you"
}
```

**Note:** If you encounter this, re-record and speak more clearly, or use the transcript editing screen to manually type what you said.

---

## Test 5: Already Confirmed (No Re-Review)

**Goal:** Verify idempotent behavior - can't review same intake twice

**Steps:**
1. Record voice quote that goes to review
2. Confirm it (quote gets created)
3. Try to navigate back to review screen for same intake_id

**Expected:**
- System detects intake already confirmed
- Shows message: "This intake has already been confirmed"
- Automatically proceeds forward (doesn't show review form)

**Check console logs for:**
```
[REVIEW_FLOW] GUARD: Already user-confirmed
{
  intake_id: "...",
  confirmed_at: "..."
}
```

---

## Test 6: Confidence Bypass After Confirm

**Goal:** Verify user confirmation overrides all confidence checks

**Steps:**
1. Record vague voice quote (low confidence)
2. Review screen appears
3. DON'T edit anything, just click "Confirm & Continue"
4. Quote should be created even though values have low confidence

**Expected:**
- Quote created successfully
- No second review prompt
- All original extracted values used (since you didn't edit)

**Check console logs for:**
```
[QUOTE_CREATE] User has confirmed - skipping quality guards
{
  user_confirmed_at: "..."
}
[QUOTE_CREATE] Proceeding with quote creation
{
  user_confirmed: true
}
```

---

## What to Look For in Console

### Good Signs ✅
- Each step logs with prefix: `[VOICE_CAPTURE]`, `[TRANSCRIPT]`, `[EXTRACTION]`, etc.
- Clear decision points logged: "Blocked: ...", "Proceeding: ...", "Skipping: ..."
- intake_id tracked through entire pipeline
- Checkmarks in logs: `✓ Pipeline complete`

### Bad Signs ⚠️
- Same function called twice for same intake_id (except idempotent replays)
- Confidence reset after user confirmation
- Quality guards blocking after user_confirmed = true
- Re-extraction happening in review flow
- Empty transcript proceeding to extraction

---

## Quick Verification Checklist

After testing, verify:

- [ ] Can record and transcribe successfully
- [ ] Empty audio fails with clear message
- [ ] Vague speech extracted with reasonable defaults
- [ ] Review screen shows all extracted data
- [ ] User edits persist in final quote
- [ ] Confirm button creates quote (no loop)
- [ ] Already-confirmed intakes skip review
- [ ] Console logs show clear decision flow
- [ ] No errors in browser console
- [ ] No duplicate API calls for same operation

---

## Common Issues (If Tests Fail)

**Issue:** Quote loops back to review after confirm
**Check:** Console should show `[QUOTE_CREATE] User has confirmed - skipping quality guards`
**If missing:** User confirmation flag may not be set correctly in reviewquote.tsx

**Issue:** User edits not applied to quote
**Check:** Console should show `[QUOTE_CREATE] Applying user corrections`
**If missing:** create-draft-quote may not be reading user_corrections_json

**Issue:** Silent audio creates quote anyway
**Check:** Console should show `[TRANSCRIPT] CRITICAL: Empty transcript`
**If missing:** Transcript validation not working

---

## Success Criteria

**The system is working correctly if:**

1. You can say vague things like "a couple hours" and system estimates reasonably
2. Missing customer contact does NOT block quote creation
3. You can confirm a review ONCE and quote is created
4. Your edits in review are reflected in the final quote
5. Empty audio fails loudly with clear error
6. Console logs clearly show what's happening at each step
7. No infinite loops or stuck states

**The system now treats voice input as messy but authoritative, not fragile.**
