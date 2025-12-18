# Quick Fix Guide - Voice Recorder Error

## The Problem
Voice recording fails with: `OPENAI_API_KEY not configured`

## The Solution
Add your OpenAI API key to Supabase Edge Functions secrets.

---

## Step-by-Step Fix

### 1. Get Your OpenAI API Key
- Go to: https://platform.openai.com/api-keys
- Sign in or create an account
- Click "Create new secret key"
- Copy the key (starts with `sk-`)
- **IMPORTANT**: Save it somewhere - you can only see it once!

### 2. Add to Supabase
You need to configure this secret in your Supabase project. The method depends on your deployment platform:

#### If Using Supabase Dashboard:
1. Go to your Supabase dashboard
2. Select your project
3. Navigate to: **Project Settings** → **Edge Functions**
4. Under "Secrets", add:
   - Name: `OPENAI_API_KEY`
   - Value: `sk-your-actual-key-here`
5. Click "Save"

#### If Using Supabase CLI:
```bash
supabase secrets set OPENAI_API_KEY=sk-your-actual-key-here
```

#### If Using bolt.new or Similar:
Contact your platform support for how to add Edge Function secrets.

### 3. Verify It Works
In the app:
1. Go to Settings (tap your profile icon)
2. Scroll to "Developer Tools" section
3. Tap "Test Environment Variables"
4. You should see: `"OPENAI_API_KEY": "[EXISTS]"`

### 4. Test Voice Recording
1. Tap the microphone button on the main screen
2. Record yourself describing a job
3. Stop recording
4. It should now transcribe successfully!

---

## Why This Happened
The app uses OpenAI's Whisper API to transcribe your voice recordings. For security, the API key is stored server-side (in Supabase Edge Functions), not in the app code. You need to configure this secret in your Supabase project.

## Cost Information
- OpenAI Whisper API charges per minute of audio
- Typical cost: ~$0.006 per minute ($0.36 per hour)
- A 2-minute quote recording costs about $0.012 (1.2 cents)

See current pricing at: https://openai.com/api/pricing/

---

## Still Having Issues?

### Check 1: API Key Valid?
- Make sure you copied the entire key (they're long!)
- Check for extra spaces at the beginning or end
- Verify the key is active in your OpenAI account

### Check 2: Supabase Configuration?
- Secrets may take a minute to propagate
- Try redeploying your Edge Functions
- Check Supabase logs for any errors

### Check 3: OpenAI Account?
- Ensure your OpenAI account is active
- Verify you have credits or a payment method set up
- Check if there are any API limits on your account

---

## Additional Notes

### Security
✅ **DO**: Store API keys in Supabase secrets
❌ **DON'T**: Put API keys in `.env` files or commit them to git
❌ **DON'T**: Put API keys in frontend code

### Testing
After fixing, test the complete flow:
1. Record voice → Should save
2. Transcribe → Should convert speech to text
3. Extract → Should parse job details
4. Create → Should generate quote draft

All four stages need to work for the feature to function.

---

## Quick Reference

**Your Supabase Project ID**: `rhijyaoguokspapkwtrt`
**Your Supabase URL**: `https://rhijyaoguokspapkwtrt.supabase.co`

**Edge Functions That Need This**:
- `openai-proxy` (main function that requires the key)
- `transcribe-voice-intake` (calls openai-proxy)
- `extract-quote-data` (calls openai-proxy)
- `create-draft-quote` (calls openai-proxy)

---

## Questions?

Check the detailed technical report: `VOICE_RECORDER_ERROR_REPORT.md`
