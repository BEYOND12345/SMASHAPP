import React, { useState, useRef, useEffect } from 'react';
import { Mic, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface VoiceRecorderProps {
  onBack: () => void;
  onQuoteCreated?: (quoteId: string) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onBack, onQuoteCreated }) => {
  /**
   * SAFETY FLAGS
   * - Default OFF to avoid breaking the working pipeline.
   * - Enable by setting VITE_ENABLE_INCREMENTAL_EXTRACTION / VITE_ENABLE_AI_MATERIAL_PRICING to "true".
   */
  // Default ON for "magic" live progress. Disable by setting VITE_ENABLE_INCREMENTAL_EXTRACTION="false".
  const ENABLE_INCREMENTAL_EXTRACTION = import.meta.env.VITE_ENABLE_INCREMENTAL_EXTRACTION !== 'false';
  // Default ON (restores "never empty prices"). Disable by setting VITE_ENABLE_AI_MATERIAL_PRICING="false".
  const ENABLE_AI_MATERIAL_PRICING = import.meta.env.VITE_ENABLE_AI_MATERIAL_PRICING !== 'false';

  // "Never empty prices" safety net (cents). If everything fails, we still price it.
  const DEFAULT_FALLBACK_MATERIAL_UNIT_PRICE_CENTS = (() => {
    const vRaw = (import.meta.env.VITE_DEFAULT_FALLBACK_PRICE_CENTS ?? import.meta.env.VITE_DEFAULT_FALLBACK_PRICE) as
      | string
      | undefined;
    const v = vRaw ? Number(vRaw) : NaN;
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 1000; // default $10.00
  })();

  const currencyToRegionCode = (currency?: string | null): 'AU' | 'US' | 'UK' | 'NZ' => {
    const c = (currency || '').toUpperCase();
    if (c === 'USD') return 'US';
    if (c === 'GBP') return 'UK';
    if (c === 'NZD') return 'NZ';
    return 'AU';
  };

  const regionCodeToName = (region: string): string => {
    switch (region) {
      case 'US':
        return 'United States';
      case 'UK':
        return 'United Kingdom';
      case 'NZ':
        return 'New Zealand';
      case 'AU':
      default:
        return 'Australia';
    }
  };

  type AiPriceConfidence = 'low' | 'medium' | 'high';
  type AiPriceResult = { unit_price_cents: number; confidence: AiPriceConfidence; reasoning: string };

  const estimateMaterialUnitPricesBatch = async (args: {
    regionName: string;
    currency: string;
    items: Array<{ description: string; unit: string; quantity: number }>;
  }): Promise<AiPriceResult[] | null> => {
    try {
      const { regionName, currency, items } = args;
      if (!items || items.length === 0) return [];

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: 'chat/completions',
          body: {
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 500,
            messages: [
              {
                role: 'system',
                content:
                  'You are a construction materials pricing expert. Estimate realistic UNIT prices (not totals). Be conservative and practical. Return JSON only.',
              },
              {
                role: 'user',
                content:
                  `Estimate unit prices for these materials in ${regionName}. ` +
                  `Currency: ${currency}. ` +
                  `Return JSON with EXACT shape:\n` +
                  `{\n  "items": [\n    { "unit_price_cents": number, "confidence": "low|medium|high", "reasoning": string }\n  ]\n}\n` +
                  `Rules:\n` +
                  `- Keep order aligned with input items.\n` +
                  `- unit_price_cents must be > 0.\n` +
                  `- If unsure, still guess and set confidence="low".\n\n` +
                  `Items:\n${items
                    .map((it, i) => `${i + 1}. ${it.description} — qty ${it.quantity} ${it.unit}`)
                    .join('\n')}`,
              },
            ],
            response_format: { type: 'json_object' },
          },
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      const out = Array.isArray(parsed?.items) ? parsed.items : null;
      if (!out) return null;

      return out
        .map((x: any) => ({
          unit_price_cents: typeof x?.unit_price_cents === 'number' ? Math.max(1, Math.round(x.unit_price_cents)) : 0,
          confidence: (x?.confidence === 'low' || x?.confidence === 'medium' || x?.confidence === 'high')
            ? x.confidence
            : 'low',
          reasoning: typeof x?.reasoning === 'string' ? x.reasoning : '',
        }))
        .slice(0, items.length);
    } catch (e) {
      console.warn('[VoiceRecorder] AI pricing batch failed (non-fatal):', e);
      return null;
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  const [checklistItems, setChecklistItems] = useState([
    { id: 1, label: 'Job address', status: 'waiting' },
    { id: 2, label: 'Customer name', status: 'waiting' },
    { id: 3, label: 'Scope of work', status: 'waiting' },
    { id: 4, label: 'Materials needed', status: 'waiting' },
    { id: 5, label: 'Time to complete', status: 'waiting' },
    { id: 6, label: 'Additional charges', status: 'waiting' }
  ]);

  // Reduce re-render + console spam in hot path
  const DEBUG_VOICE = import.meta.env.VITE_DEBUG_VOICE === 'true';

  // Throttle real-time detection so UI feels smooth (not spammy)
  const detectThrottleTimeoutRef = useRef<number | null>(null);
  const pendingDetectTranscriptRef = useRef<string>('');

  // Live preview data for "ticks as items are added" (throttled)
  const [liveQuotePreview, setLiveQuotePreview] = useState<any>(null);
  const livePreviewTimeoutRef = useRef<number | null>(null);
  const livePreviewPendingRef = useRef<any>(null);

  // Even if words are messy (mumbling/slang), show "we're hearing you"
  const [lastHeardAt, setLastHeardAt] = useState<number>(0);
  const lastHeardAtRef = useRef<number>(0);
  const heardThrottleRef = useRef<number | null>(null);

  const bumpHeard = () => {
    const now = Date.now();
    lastHeardAtRef.current = now;
    if (heardThrottleRef.current) return;
    heardThrottleRef.current = window.setTimeout(() => {
      setLastHeardAt(lastHeardAtRef.current);
      heardThrottleRef.current = null;
    }, 220);
  };

  const scheduleLivePreviewUpdate = (qd: any) => {
    livePreviewPendingRef.current = qd;
    if (livePreviewTimeoutRef.current) return;
    livePreviewTimeoutRef.current = window.setTimeout(() => {
      setLiveQuotePreview(livePreviewPendingRef.current);
      livePreviewTimeoutRef.current = null;
    }, 180);
  };

  const [currentVoiceQuoteId, setCurrentVoiceQuoteId] = useState<string | null>(null);
  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const detectionTimeoutsRef = useRef<Map<string, number>>(new Map());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef(false);
  const speechRecognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);

  // Bar DOM refs for ultra-smooth visual updates (avoid React re-render)
  const visualizerBarsRef = useRef<Array<HTMLDivElement | null>>([]);

  // Live mic visualizer (WebAudio analyser)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  // Phase B (safe): build a "draft" while recording; best-effort only.
  const liveSpeechTranscriptRef = useRef<string>('');
  const incrementalExtractTimeoutRef = useRef<number | null>(null);
  const incrementalExtractInFlightRef = useRef(false);
  const incrementalExtractCountRef = useRef(0);
  const MAX_INCREMENTAL_EXTRACT_CALLS = 6; // hard cap per recording to prevent runaway costs/latency
  const draftQuoteDataRef = useRef<any>(null);

  const mergeQuoteData = (base: any, patch: any, opts?: { preferPatch?: boolean }) => {
    const preferPatch = !!opts?.preferPatch;
    const out: any = { ...(base || {}) };
    const safeStr = (v: any) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
    const safeNum = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

    const setValue = (key: string, value: any) => {
      if (out[key] === null || out[key] === undefined || (typeof out[key] === 'string' && out[key].trim() === '')) {
        if (value !== null && value !== undefined) out[key] = value;
        return;
      }
      if (preferPatch && value !== null && value !== undefined) {
        out[key] = value;
      }
    };

    setValue('customerName', safeStr(patch?.customerName));
    setValue('jobLocation', safeStr(patch?.jobLocation));
    setValue('jobTitle', safeStr(patch?.jobTitle));
    setValue('timeline', safeStr(patch?.timeline));

    // scopeOfWork can be string or array
    if (
      !out.scopeOfWork ||
      (Array.isArray(out.scopeOfWork) && out.scopeOfWork.length === 0) ||
      preferPatch
    ) {
      const sow = patch?.scopeOfWork;
      if (Array.isArray(sow)) {
        const normalized = sow.filter((s: any) => typeof s === 'string' && s.trim().length > 0).map((s: string) => s.trim());
        if (normalized.length > 0) out.scopeOfWork = normalized;
      } else if (typeof sow === 'string' && sow.trim().length > 0) {
        out.scopeOfWork = [sow.trim()];
      }
    }

    // Materials: merge by name (avoid duplicates like unit vs pcs)
    const incomingMaterials = Array.isArray(patch?.materials) ? patch.materials : [];
    if (!Array.isArray(out.materials)) out.materials = [];
    for (const m of incomingMaterials) {
      const name = safeStr(m?.name);
      if (!name) continue;
      const unit = safeStr(m?.unit) || 'unit';
      const qty = safeNum(m?.quantity) ?? 1;
      const existsIdx = out.materials.findIndex((x: any) => (x?.name || '').toLowerCase() === name.toLowerCase());
      if (existsIdx === -1) out.materials.push({ name, unit, quantity: qty });
      else {
        // Prefer patch unit if we explicitly prefer patch (final extraction)
        if (preferPatch && unit) out.materials[existsIdx].unit = unit;
        // Prefer larger/realistic quantity
        const existingQty = typeof out.materials[existsIdx]?.quantity === 'number' ? out.materials[existsIdx].quantity : 0;
        if (qty > existingQty) out.materials[existsIdx].quantity = qty;
      }
    }

    setValue('laborHours', safeNum(patch?.laborHours));

    // Fees: allow either `fees` or `additionalFees`
    if (!Array.isArray(out.fees) || out.fees.length === 0) {
      const fees = Array.isArray(patch?.fees) ? patch.fees : Array.isArray(patch?.additionalFees) ? patch.additionalFees : [];
      const normalizedFees = fees
        .map((f: any) => ({
          description: safeStr(f?.description),
          amount: safeNum(f?.amount),
        }))
        .filter((f: any) => f.description);
      if (normalizedFees.length > 0) out.fees = normalizedFees;
    }

    return out;
  };

  useEffect(() => {
    console.log('[VERIFICATION] Old polling system removed - only useEffect polling remains');
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      detectionTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (detectThrottleTimeoutRef.current) {
        clearTimeout(detectThrottleTimeoutRef.current);
        detectThrottleTimeoutRef.current = null;
      }
      if (livePreviewTimeoutRef.current) {
        clearTimeout(livePreviewTimeoutRef.current);
        livePreviewTimeoutRef.current = null;
      }
      if (heardThrottleRef.current) {
        clearTimeout(heardThrottleRef.current);
        heardThrottleRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {
          // noop
        }
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      analyserDataRef.current = null;
    };
  }, []);

  const stopVisualizer = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Reset bar heights quickly
    for (let i = 0; i < visualizerBarsRef.current.length; i++) {
      const el = visualizerBarsRef.current[i];
      if (el) el.style.height = '12%';
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // noop
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    analyserDataRef.current = null;
  };

  const startVisualizer = (stream: MediaStream) => {
    try {
      stopVisualizer();

      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      // Best-effort resume (some browsers start suspended)
      ctx.resume().catch(() => undefined);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; // Smaller for smoother freq bars
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const tick = (ts: number) => {
        const a = analyserRef.current;
        const arr = analyserDataRef.current;
        if (!isRecordingRef.current || !a || !arr) {
          rafRef.current = null;
          return;
        }

        a.getByteFrequencyData(arr as any);

        // Voice-activity hint (audio-driven): makes UI feel in-sync even if speech recognition lags.
        // Compute a simple average energy over lower-mid bins.
        let energy = 0;
        const sampleCount = Math.min(arr.length, 48);
        for (let i = 2; i < sampleCount; i++) energy += arr[i];
        const normEnergy = (energy / Math.max(1, sampleCount - 2)) / 255; // ~0..1
        if (normEnergy > 0.06) {
          // Above a small threshold → treat as "we're hearing you"
          bumpHeard();
        }
        
        // Use frequency bins to drive the bars
        // We have 16 bars, we'll map them to the lower-middle frequency range
        for (let j = 0; j < 16; j++) {
          const el = visualizerBarsRef.current[j];
          if (!el) continue;
          
          // Sample from the frequency array (skip lowest and highest for better visual balance)
          const sampleIdx = Math.floor(j * (arr.length * 0.6) / 16);
          const val = arr[sampleIdx] / 255; // 0..1
          
          // Add a tiny bit of movement even if silent
          const idle = 0.05 * Math.sin(ts / 200 + j);
          const height = Math.max(12, Math.min(100, (val + idle) * 100));
          el.style.height = `${height}%`;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn('[VoiceRecorder] Visualizer init failed (non-fatal):', e);
    }
  };

  useEffect(() => {
    // Count required items (items 1-5) - item 6 (Additional charges) is optional
    const requiredItems = checklistItems.filter(item => item.id <= 5);
    const requiredComplete = requiredItems.every(item => item.status === 'complete');
    const allComplete = checklistItems.every(item => item.status === 'complete');
    const completeCount = checklistItems.filter(item => item.status === 'complete').length;
    
    if (DEBUG_VOICE) {
      console.log('[VoiceRecorder] Navigation check - requiredComplete:', requiredComplete, 'allComplete:', allComplete, 'completeCount:', completeCount, 'total:', checklistItems.length, 'currentVoiceQuoteId:', currentVoiceQuoteId, 'createdQuoteId:', createdQuoteId);
      console.log('[VoiceRecorder] Checklist statuses:', checklistItems.map(item => `${item.label}: ${item.status}`));
    }

    // Navigate once quote is created, regardless of checklist completion
    // The checklist is for real-time feedback, but once the quote is created, we should navigate
    // This allows navigation even if some optional items (materials, labor hours) weren't detected
    if (createdQuoteId) {
      console.log('[VoiceRecorder] v2 - Quote created, using callback navigation:', createdQuoteId);
      console.log('[VoiceRecorder] v2 - onQuoteCreated callback exists:', !!onQuoteCreated);
      stopPolling();

      // Use callback for internal navigation instead of window.location.href
      // This avoids triggering the public router and keeps us in the app
      if (onQuoteCreated) {
        console.log('[VoiceRecorder] v2 - Calling onQuoteCreated NOW');
        onQuoteCreated(createdQuoteId);
      } else {
        console.log('[VoiceRecorder] v2 - No onQuoteCreated callback, calling onBack');
        onBack();
      }
    } else if ((requiredComplete || allComplete) && currentVoiceQuoteId && !createdQuoteId) {
      // Checklist complete but quote not created yet - log for debugging
      console.log('[VoiceRecorder] Checklist complete but quote not created yet. Waiting for quote creation...', {
        voiceQuoteId: currentVoiceQuoteId,
        createdQuoteId: createdQuoteId
      });
    }
  }, [checklistItems, currentVoiceQuoteId, createdQuoteId]);

  // Real-time keyword detection for checklist items with context requirements
  const detectKeywordsInSpeech = (transcript: string) => {
    const lowerTranscript = transcript.toLowerCase();
    
    // "Magic" live detection: detect content, not labels.
    // Keep patterns high-signal to avoid noisy UI.
    const keywordPatterns: Record<number, Array<{ pattern: RegExp; requiresContext: boolean }>> = {
      1: [
        // Address-like: street number + street type
        {
          pattern:
            /\b(\d{1,5}\s+[a-z0-9\s]{2,40}\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|way|place|pl|boulevard|blvd)\b(?:\s+[a-z]+){0,3})\b/i,
          requiresContext: true,
        },
        { pattern: /\baddress\s*(?:is|at)?\s*([0-9][^.,]{6,80})/i, requiresContext: true },
      ],
      2: [
        // "name is David Smith" or "customer name David Smith"
        { pattern: /\bname\s+is\s+([a-z]+(?:\s+[a-z]+){0,2})\b/i, requiresContext: true },
        { pattern: /\b(?:customer|client)\s+name\s*(?:is)?\s*([a-z]+(?:\s+[a-z]+){0,2})\b/i, requiresContext: true },
        // Common mis-hear: "custom name"
        { pattern: /\bcustom\s+name\s*(?:is)?\s*([a-z]+(?:\s+[a-z]+){0,2})\b/i, requiresContext: true },
      ],
      3: [
        // Scope: verb phrase (install/build/repair/etc)
        {
          pattern:
            /\b((?:build|install|repair|replace|paint|fix|remove|demolish|construct|fit|hang|mount|plaster|tile|wire|plumb)[^.,]{6,80})/i,
          requiresContext: true,
        },
        { pattern: /\bscope(?:\s+of)?\s+work\s*(?:is|:)?\s*([^.,]{6,120})/i, requiresContext: true },
      ],
      4: [
        // Materials: "materials needed include screws, nails"
        { pattern: /\bmaterials?\s*(?:needed|are|include|includes|:)\s*([^.,]{3,120})/i, requiresContext: true },
        { pattern: /\bneed\s+(?:some\s+)?(?:materials?|)([^.,]{3,120})/i, requiresContext: true },
        // Common mis-hear: "material list"
        { pattern: /\bmaterial\s+list\s*(?:is|:)?\s*([^.,]{3,120})/i, requiresContext: true },
      ],
      5: [
        // Time: numbers OR word numbers
        { pattern: /\b(\d+\s*(?:hours?|days?|weeks?))\b/i, requiresContext: true },
        { pattern: /\b((?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hours?|days?|weeks?))\b/i, requiresContext: true },
        { pattern: /\btime(?:\s+to)?\s+complete\s*(?:is|:)?\s*([^.,]{3,40})/i, requiresContext: true },
      ],
      6: [
        // Fees: travel/callout/waste etc
        { pattern: /\b(?:fees?|charges?)\s*(?:include|are|is|:)?\s*([^.,]{3,80})/i, requiresContext: true },
        { pattern: /\b(travel\s+time|travel\s+fee|callout\s+fee|waste\s+disposal|delivery\s+fee)\b/i, requiresContext: true },
        // Slang-ish
        { pattern: /\bbunnings\s+run\b/i, requiresContext: true },
      ]
    };
    
    setChecklistItems(prev => {
      return prev.map(item => {
        // Skip if already complete
        if (item.status === 'complete') return item;
        
        const patterns = keywordPatterns[item.id as keyof typeof keywordPatterns] || [];
        
        // Check patterns - prefer high confidence matches
        let highConfidenceMatch = false;
        // low-confidence matching removed for accuracy
        
        for (const patternObj of patterns) {
          const match = lowerTranscript.match(patternObj.pattern);
          if (match) {
            if (patternObj.requiresContext) {
              // High confidence - has actual data (or at least a real match)
              // NOTE: some regexes don't have capture groups; fall back to match[0].
              const captured = (match[1] || match[0] || '').trim();
              if (captured.length > 2) {
                highConfidenceMatch = true;
                break;
              }
            }
          }
        }
        
        // During recording, mark as "detecting" on HIGH confidence matches.
        // "complete" is reserved for confirmed extracted data (Whisper/GPT).
        if (highConfidenceMatch) {
          // Only log + update on state change (reduces spam / improves responsiveness)
          if (DEBUG_VOICE && isRecordingRef.current && item.status === 'waiting') {
            console.log(`[VoiceRecorder] ✓ Real-time detection: "${item.label}" - confidence: high`);
          }
          if (isRecordingRef.current && item.status === 'waiting') {
            return { ...item, status: 'detecting' };
          }
          // If we're already detecting, keep it there until confirmed by quote_data.
          return item;
        }

        // Fallback: if the user said the section label (even if recognition is messy),
        // mark as detecting so the UI feels responsive.
        if (isRecordingRef.current && item.status === 'waiting') {
          const t = lowerTranscript;
          const saidLabel =
            (item.id === 2 && (t.includes('customer name') || t.includes('client name') || t.includes('custom name') || t.includes('customer') || t.includes('client'))) ||
            (item.id === 3 && (t.includes('scope of work') || t.includes('scope') || t.includes('work'))) ||
            (item.id === 4 && (t.includes('materials') || t.includes('material') || t.includes('supplies'))) ||
            (item.id === 5 && (t.includes('time to complete') || t.includes('time') || t.includes('days') || t.includes('hours'))) ||
            (item.id === 6 && (t.includes('additional') || t.includes('fees') || t.includes('fee') || t.includes('charges') || t.includes('bunnings')));

          if (saidLabel) {
            return { ...item, status: 'detecting' };
          }
        }
        
        return item;
      });
    });
  };

  // NOTE: We do NOT auto-promote detecting → complete.
  // "complete" should be reserved for confirmed extracted data (Whisper/GPT),
  // otherwise the checklist feels inaccurate.

  const scheduleIncrementalExtraction = () => {
    if (!ENABLE_INCREMENTAL_EXTRACTION) return;
    if (!liveSpeechTranscriptRef.current || liveSpeechTranscriptRef.current.trim().length < 12) return;
    if (incrementalExtractInFlightRef.current) return;
    if (incrementalExtractCountRef.current >= MAX_INCREMENTAL_EXTRACT_CALLS) return;

    if (incrementalExtractTimeoutRef.current) {
      clearTimeout(incrementalExtractTimeoutRef.current);
    }

    incrementalExtractTimeoutRef.current = window.setTimeout(async () => {
      try {
        incrementalExtractInFlightRef.current = true;
        incrementalExtractCountRef.current += 1;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const snippet = liveSpeechTranscriptRef.current.trim().slice(-1200);

        const extractionResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: 'chat/completions',
              body: {
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content:
                      'Extract structured quote details from partial speech text (may include mumbling, slang, abbreviations). Be conservative: only fill fields if clearly mentioned, but DO handle common trade slang and casual phrasing. Write scope items as professional action phrases (e.g., "Build and install custom shelving" instead of "and shelves"). Do not drop descriptive adjectives like "custom", "premium", or "detailed".\n\nIMPORTANT: scopeOfWork can be very detailed. When you can, split into multiple short deliverables (each <= 90 chars). Prefer 3–8 items for partial snippets.\n\nFor fuzzy quantities: "a couple"=2, "a few"=3, "some"=1, "heaps"=10 (choose a reasonable number). Keep vague materials like "fixings/hardware/glue/paint" as material items (never drop them). Return JSON only.'
                  },
                  {
                    role: 'user',
                    content: `Partial transcript (may be incomplete):\n\n${snippet}\n\nReturn JSON with this exact structure:\n{\n  "customerName": "string or null",\n  "jobTitle": "string or null",\n  "jobLocation": "string or null",\n  "scopeOfWork": ["string"] or null,\n  "timeline": "string or null",\n  "materials": [{"name": "string", "quantity": number, "unit": "string"}],\n  "laborHours": number or null,\n  "fees": [{"description": "string", "amount": number}] or null\n}`
                  }
                ],
                response_format: { type: 'json_object' }
              }
            }),
          }
        );

        if (!extractionResponse.ok) return;
        const extractionData = await extractionResponse.json();
        const partial = JSON.parse(extractionData.choices?.[0]?.message?.content || '{}');

        const merged = mergeQuoteData(draftQuoteDataRef.current, partial);
        draftQuoteDataRef.current = merged;

        // Update checklist locally for faster perceived progress (no DB writes here).
        updateChecklistFromQuoteData(merged, { confirmed: false });
      } catch (e) {
        // Fail open: never block recording for incremental extraction
        console.warn('[VoiceRecorder] Incremental extraction failed (non-fatal):', e);
      } finally {
        incrementalExtractInFlightRef.current = false;
      }
    }, 900); // debounce to avoid spamming OpenAI while user speaks
  };

  // Helper function to update checklist based on quote_data
  const updateChecklistFromQuoteData = (qd: any, opts?: { confirmed?: boolean }) => {
    const confirmed = !!opts?.confirmed;
    scheduleLivePreviewUpdate(qd);
    if (DEBUG_VOICE) {
      console.log('[VoiceRecorder] FULL quote_data structure:', JSON.stringify(qd, null, 2));
      console.log('[VoiceRecorder] Field checks:', {
      jobLocation: !!qd.jobLocation,
      customerName: !!qd.customerName,
      jobTitle: !!qd.jobTitle,
      materials: !!qd.materials?.length,
      laborHours: !!qd.laborHours,
      fees: !!qd.fees,
      feesType: typeof qd.fees,
      feesIsArray: Array.isArray(qd.fees)
      });
    }
    
    setChecklistItems(prev => {
      if (DEBUG_VOICE) {
        console.log('[VoiceRecorder] Current checklist before update:', prev.map(i => `${i.id}:${i.label}:${i.status}`));
      }
      const updated = prev.map(item => {
        // Skip items that are already complete
        if (item.status === 'complete') return item;
        // IMPORTANT: Do NOT auto-promote detecting -> complete from partial/draft data.
        // Only allow "complete" when confirmed by Whisper/GPT or server status indicates extraction complete.
        
        let shouldDetect = false;
        let detectionReason = '';
        if (item.id === 1 && qd.jobLocation) {
          shouldDetect = true;
          detectionReason = 'jobLocation exists';
        }
        if (item.id === 2 && qd.customerName) {
          shouldDetect = true;
          detectionReason = 'customerName exists';
        }
        if (item.id === 3 && qd.jobTitle) {
          shouldDetect = true;
          detectionReason = 'jobTitle exists';
        }
        if (item.id === 4 && qd.materials?.length > 0) {
          shouldDetect = true;
          detectionReason = 'materials array has items';
        }
        if (item.id === 5 && (qd.laborHours || qd.timeline)) {
          shouldDetect = true;
          detectionReason = qd.laborHours ? 'laborHours exists' : 'timeline exists';
        }
        // Fees are optional. Only mark complete if we actually extracted a fee.
        if (item.id === 6) {
          if (qd.fees && (Array.isArray(qd.fees) ? qd.fees.length > 0 : Object.keys(qd.fees).length > 0)) {
            shouldDetect = true;
            detectionReason = 'fees exists';
          } else {
            shouldDetect = false;
          }
        }
      
        if (shouldDetect) {
          if (DEBUG_VOICE) {
            console.log('[VoiceRecorder] ✓ Detected data for:', item.label, '- reason:', detectionReason, confirmed ? '- marking COMPLETE (confirmed)' : '- marking DETECTING (draft)');
          }
          // Clear any existing timeout for this item
          const existingTimeout = detectionTimeoutsRef.current.get(`item-${item.id}`);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            detectionTimeoutsRef.current.delete(`item-${item.id}`);
          }
          // Only mark complete for confirmed data; otherwise keep detecting for "alive" UI.
          if (confirmed) return { ...item, status: 'complete' };
          return item.status === 'detecting' ? item : { ...item, status: 'detecting' };
        } else if (item.status === 'waiting') {
          if (DEBUG_VOICE) {
            console.log('[VoiceRecorder] ✗ Item NOT detected:', item.label, 'shouldDetect:', shouldDetect);
          }
        }
        return item;
      });
      if (DEBUG_VOICE) {
        console.log('[VoiceRecorder] Checklist after update:', updated.map(i => `${i.id}:${i.label}:${i.status}`));
      }
      return updated;
    });
  };

  // New polling useEffect - polls for quote_data and updates checklist
  useEffect(() => {
    if (!currentVoiceQuoteId) return;
    
    const startTime = Date.now();
    // Use ref to persist timeouts across re-renders
    const detectionTimeouts = detectionTimeoutsRef.current;
    
    const pollInterval = window.setInterval(async () => {
      const elapsed = Date.now() - startTime;
      
      // Stop after 60 seconds
      if (elapsed > 60000) {
        console.log('[VoiceRecorder] Polling timeout reached (60s)');
        clearInterval(pollInterval);
        pollingIntervalRef.current = null;
        return;
      }
      
      const { data, error } = await supabase
        .from('voice_quotes')
        .select('quote_data, status')
        .eq('id', currentVoiceQuoteId)
        .single();
      
      if (error) {
        console.error('[VoiceRecorder] Polling error:', error);
        return;
      }
      
      console.log('POLLING RESULT:', data);

      // Update checklist items when quote_data is found
      if (data && data.quote_data) {
        const confirmed = data.status === 'extracted' || data.status === 'complete' || data.status === 'creating_quote';
        updateChecklistFromQuoteData(data.quote_data, { confirmed });
      } else {
        console.log('[VoiceRecorder] No quote_data found in polling result, status:', data?.status);
      }
    }, 2000);
    
    // Store interval reference so navigation check can work
    pollingIntervalRef.current = pollInterval;
    
    return () => {
      console.log('[VoiceRecorder] Cleanup: clearing interval and timeouts');
      clearInterval(pollInterval);
      pollingIntervalRef.current = null;
      // Clear all pending detection timeouts
      const timeoutCount = detectionTimeouts.size;
      detectionTimeouts.forEach(timeout => clearTimeout(timeout));
      detectionTimeouts.clear();
      console.log('[VoiceRecorder] Cleanup: cleared', timeoutCount, 'timeouts');
    };
  }, [currentVoiceQuoteId]);

  const startRecording = async () => {
    try {
      console.log('[VoiceRecorder] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      streamRef.current = stream;
      console.log('[VoiceRecorder] Microphone access granted');
      startVisualizer(stream);

      audioChunksRef.current = [];
      isStoppingRef.current = false;
      
      // Reset checklist items for new recording
      setChecklistItems([
        { id: 1, label: 'Job address', status: 'waiting' },
        { id: 2, label: 'Customer name', status: 'waiting' },
        { id: 3, label: 'Scope of work', status: 'waiting' },
        { id: 4, label: 'Materials needed', status: 'waiting' },
        { id: 5, label: 'Time to complete', status: 'waiting' },
        { id: 6, label: 'Additional charges', status: 'waiting' }
      ]);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      console.log('[VoiceRecorder] Using MIME type:', mimeType || 'default');

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        console.log('[VoiceRecorder] Data available:', event.data.size, 'bytes');
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstart = () => {
        console.log('[VoiceRecorder] Recording started');
        // Reset draft accumulation per recording
        liveSpeechTranscriptRef.current = '';
        draftQuoteDataRef.current = null;
        incrementalExtractCountRef.current = 0;
        
        // Start real-time speech recognition for checklist updates
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
          const recognition = new SpeechRecognition();
          
          recognition.continuous = true;
          recognition.interimResults = true;
          // AU-first (helps a bit with local accents/phrasing)
          recognition.lang = 'en-AU';

          // Best-effort: bias recognition towards our domain vocabulary (helps with "customer/materials/fees" etc.)
          try {
            const GrammarList = (window as any).webkitSpeechGrammarList || (window as any).SpeechGrammarList;
            if (GrammarList) {
              const list = new GrammarList();
              const phrases = [
                'job address',
                'address',
                'customer name',
                'custom name',
                'client name',
                'scope of work',
                'scope',
                'materials needed',
                'material list',
                'materials',
                'time to complete',
                'timeline',
                'additional charges',
                'fees',
                'bunnings run',
                'travel fee',
                'callout fee',
                'fixings',
                'gyprock',
                'liquid nails',
              ];
              // JSGF grammar
              const jsgf = `#JSGF V1.0; grammar smash; public <phrase> = ${phrases.join(' | ')} ;`;
              list.addFromString(jsgf, 1);
              recognition.grammars = list;
            }
          } catch {
            // non-fatal
          }
          
          recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
              } else {
                interimTranscript += transcript;
              }
            }
            
            // Prioritize final transcripts for accuracy.
            // Throttle detection to feel responsive (avoid state churn on every interim chunk).
            const scheduleDetect = (text: string) => {
              pendingDetectTranscriptRef.current = text;
              if (detectThrottleTimeoutRef.current) return;
              detectThrottleTimeoutRef.current = window.setTimeout(() => {
                const t = pendingDetectTranscriptRef.current;
                pendingDetectTranscriptRef.current = '';
                detectThrottleTimeoutRef.current = null;
                if (t && t.trim()) detectKeywordsInSpeech(t.trim());
              }, 140);
            };

            if (finalTranscript.trim()) {
              if (DEBUG_VOICE) console.log('[VoiceRecorder] Final speech detected:', finalTranscript.trim());
              bumpHeard();
              scheduleDetect(finalTranscript.trim());

              // Build a live transcript buffer for optional incremental extraction
              liveSpeechTranscriptRef.current = `${liveSpeechTranscriptRef.current} ${finalTranscript.trim()}`.trim();
              scheduleIncrementalExtraction();
            } else if (interimTranscript.trim()) {
              // Interim results: still drive "detecting" state, but throttled
              if (DEBUG_VOICE) console.log('[VoiceRecorder] Interim speech detected:', interimTranscript.trim());
              bumpHeard();
              scheduleDetect(interimTranscript.trim());
            }
          };
          
          recognition.onerror = (event: any) => {
            console.warn('[VoiceRecorder] Speech recognition error:', event.error);
            // Don't stop recording if speech recognition fails
          };
          
          recognition.onend = () => {
            // Restart recognition if still recording
            if (isRecordingRef.current && !isStoppingRef.current) {
              try {
                recognition.start();
              } catch (e) {
                console.warn('[VoiceRecorder] Could not restart speech recognition:', e);
              }
            }
          };
          
          try {
            recognition.start();
            speechRecognitionRef.current = recognition;
            console.log('[VoiceRecorder] Real-time speech recognition started');
          } catch (e) {
            console.warn('[VoiceRecorder] Could not start speech recognition:', e);
          }
        } else {
          console.warn('[VoiceRecorder] Speech recognition not supported in this browser');
        }
      };

      recorder.onstop = async () => {
        console.log('[VoiceRecorder] Recording stopped, total chunks:', audioChunksRef.current.length);

        if (isStoppingRef.current) {
          return;
        }
        isStoppingRef.current = true;

        if (audioChunksRef.current.length === 0) {
          console.error('[VoiceRecorder] No audio data captured');
          alert('No audio was captured. Please try again.');
          setIsRecording(false);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        console.log('[VoiceRecorder] Created audio blob:', audioBlob.size, 'bytes');

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        stopVisualizer();

        await uploadAudio(audioBlob);
      };

      recorder.onerror = (event: any) => {
        console.error('[VoiceRecorder] Recorder error:', event.error);
        alert('Recording error: ' + event.error);
      };

      recorder.start(1000);
      console.log('[VoiceRecorder] Recorder.start() called with 1000ms timeslice');

      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);

      const startTime = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);

        if (elapsed >= 60) {
          console.log('[VoiceRecorder] Max time reached, stopping...');
          stopRecording();
        }
      }, 1000);

    } catch (error) {
      console.error('[VoiceRecorder] Error starting recording:', error);
      alert('Could not access microphone. Please check permissions and try again.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    console.log('[VoiceRecorder] stopRecording called');

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
        console.log('[VoiceRecorder] Speech recognition stopped');
      } catch (e) {
        console.warn('[VoiceRecorder] Error stopping speech recognition:', e);
      }
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    isRecordingRef.current = false;
    stopVisualizer();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('[VoiceRecorder] Stopping MediaRecorder');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    console.log('[VoiceRecorder] Starting upload, blob size:', audioBlob.size);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      console.log('[VoiceRecorder] User ID:', user.id);

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (userError) {
        console.error('[VoiceRecorder] User query error:', userError);
        throw new Error('Failed to get user organization: ' + userError.message);
      }

      if (!userData) {
        throw new Error('User organization not found');
      }

      const orgId = userData.org_id;
      console.log('[VoiceRecorder] Org ID:', orgId);

      const fileName = `${crypto.randomUUID()}.webm`;
      const filePath = `${orgId}/${fileName}`;
      console.log('[VoiceRecorder] Upload path:', filePath);

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, audioBlob, {
          contentType: audioBlob.type || 'audio/webm',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('[VoiceRecorder] Upload error:', uploadError);
        throw uploadError;
      }

      console.log('[VoiceRecorder] Upload successful');

      const { data: { publicUrl } } = supabase.storage
        .from('audio')
        .getPublicUrl(filePath);

      console.log('[VoiceRecorder] Public URL:', publicUrl);

      await saveToDatabase(publicUrl, orgId, audioBlob);

    } catch (error: any) {
      console.error('[VoiceRecorder] Upload failed:', error);
      alert('Failed to upload recording: ' + (error.message || 'Unknown error'));
      setIsProcessing(false);
      setIsRecording(false);
    }
  };

  const saveToDatabase = async (audioUrl: string, orgId: string, audioBlob: Blob) => {
    try {
      console.log('[VoiceRecorder] Saving to database:', { audioUrl, orgId });

      const { data, error } = await supabase
        .from('voice_quotes')
        .insert({
          org_id: orgId,
          audio_url: audioUrl,
          status: 'recorded'
        })
        .select()
        .single();

      if (error) {
        console.error('[VoiceRecorder] Database insert error:', error);
        throw error;
      }

      console.log('[VoiceRecorder] Recording saved to database:', data);

      setCurrentVoiceQuoteId(data.id);
      // Removed - using useEffect polling instead
      // startPolling(data.id);

      // SAFETY: If we have a draft from incremental extraction, persist it early (best-effort).
      // This improves perceived speed post-stop without risking the core pipeline.
      if (ENABLE_INCREMENTAL_EXTRACTION && draftQuoteDataRef.current) {
        try {
          await supabase
            .from('voice_quotes')
            .update({ quote_data: draftQuoteDataRef.current })
            .eq('id', data.id);
        } catch (e) {
          console.warn('[VoiceRecorder] Failed to persist draft quote_data (non-fatal):', e);
        }
      }

      // Pass the original blob forward to avoid re-downloading from storage.
      // (This is a local perf win; does not change DB behavior.)
      await processRecording(data.id, audioUrl, audioBlob);
    } catch (error) {
      console.error('[VoiceRecorder] Database save failed:', error);
      throw error;
    }
  };

  const processRecording = async (voiceQuoteId: string, audioUrl: string, localAudioBlob?: Blob) => {
    try {
      console.log('[VoiceRecorder] Starting transcription for:', voiceQuoteId);

      await supabase
        .from('voice_quotes')
        .update({ status: 'transcribing' })
        .eq('id', voiceQuoteId);

      // SPEED SAFETY: Prefer the local blob (no re-download) when available.
      const audioBlob = localAudioBlob
        ? localAudioBlob
        : await (async () => {
            const audioResponse = await fetch(audioUrl);
            if (!audioResponse.ok) {
              throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
            }
            return await audioResponse.blob();
          })();

      const formData = new FormData();
      formData.append('endpoint', 'audio/transcriptions');
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const openaiProxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`;
      console.log('[VoiceRecorder] Calling OpenAI proxy:', openaiProxyUrl);

      const transcriptionResponse = await fetch(openaiProxyUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text().catch(() => 'Unknown error');
        throw new Error(`Transcription failed: ${transcriptionResponse.status} ${transcriptionResponse.statusText} - ${errorText}`);
      }

      const transcriptionData = await transcriptionResponse.json();
      const transcriptText = transcriptionData.text;

      if (!transcriptText) {
        throw new Error('Transcription returned empty text');
      }

      console.log('[VoiceRecorder] Transcript:', transcriptText);
      setTranscript(transcriptText);

      await supabase
        .from('voice_quotes')
        .update({
          status: 'transcribed',
          transcript: transcriptText
        })
        .eq('id', voiceQuoteId);

      await extractQuoteData(voiceQuoteId, transcriptText);

    } catch (error: any) {
      console.error('[VoiceRecorder] Processing failed:', error);
      const errorMessage = error?.message || String(error);
      console.error('[VoiceRecorder] Error details:', { 
        message: errorMessage, 
        stack: error?.stack,
        voiceQuoteId 
      });
      
      // Update status to failed, but don't block navigation
      try {
        const { error: updateError } = await supabase
          .from('voice_quotes')
          .update({ status: 'failed' })
          .eq('id', voiceQuoteId);
        
        if (updateError) {
          console.error('[VoiceRecorder] Failed to update status:', updateError);
        } else {
          console.log('[VoiceRecorder] Updated voice quote status to failed');
        }
      } catch (updateError: any) {
        console.error('[VoiceRecorder] Failed to update status:', updateError);
      }
    }
  };

  const extractQuoteData = async (voiceQuoteId: string, transcript: string) => {
    try {
      console.log('[VoiceRecorder] Extracting quote data...');
      setIsExtracting(true);

      await supabase
        .from('voice_quotes')
        .update({ status: 'extracting' })
        .eq('id', voiceQuoteId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const extractionResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: 'chat/completions',
            body: {
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'Extract structured quote information from voice transcripts (mumbling/slang/abbreviations possible). Write professional, high-detail action items for jobTitle and scopeOfWork. Preserve verbs + adjectives exactly (e.g., if the user says "build and fit custom shelves", keep that meaning, not "and shelves"). Ensure items are grammatically complete and do not start with fragments like "and".\n\nIMPORTANT: Scope of work can be very detailed. Produce a list of deliverables:\n- scopeOfWork MUST be an array of short, clear deliverables (split big sentences into multiple items).\n- Prefer 4–12 items when possible.\n- Each item should be <= 90 characters.\n\nBe tolerant:\n- Understand common AU trade slang: bunnings run, fixings, hardware, sparky, chippy, arvo, reno, studs, noggins, gyprock, liquid nails/goop.\n- Keep vague materials as material items (never drop them): "fixings", "hardware", "glue", "paint", "timber".\n- Convert fuzzy quantities to reasonable numbers: "a couple"=2, "a few"=3, "some"=1, "heaps"=10.\n- If a material has no explicit quantity, use 1.\n- If a unit is unclear, use "unit".\n- For time ranges like "three to four days", set timeline as "3-4 days".\n- If a fee is described without an amount, include it with amount null.\n\nIf a field is not mentioned, use null. Return JSON only.'
                },
                {
                  role: 'user',
                  content: `Extract quote information from this transcript:\n\n${transcript}\n\nReturn JSON with this exact structure:\n{\n  "customerName": "string or null",\n  "jobTitle": "string or null (brief description of the work)",\n  "jobLocation": "string or null (address or location)",\n  "scopeOfWork": ["string"] or null,\n  "timeline": "string or null",\n  "materials": [{"name": "string", "quantity": number, "unit": "string"}],\n  "laborHours": number or null,\n  "fees": [{"description": "string", "amount": number}] or null\n}`
                }
              ],
              response_format: { type: 'json_object' }
            }
          }),
        }
      );

      if (!extractionResponse.ok) {
        throw new Error('Extraction failed');
      }

      const extractionData = await extractionResponse.json();
      const quoteData = JSON.parse(extractionData.choices[0].message.content);

      console.log('[VoiceRecorder] Extracted data:', quoteData);

      // Merge with any draft extracted during recording (if enabled)
      // IMPORTANT: final (Whisper-based) extraction must win over draft snippets.
      const finalQuoteData = ENABLE_INCREMENTAL_EXTRACTION
        ? mergeQuoteData(draftQuoteDataRef.current, quoteData, { preferPatch: true })
        : quoteData;

      // Update database with extracted data
      const { error: updateError } = await supabase
        .from('voice_quotes')
        .update({ 
          quote_data: finalQuoteData,
          status: 'extracted'
        })
        .eq('id', voiceQuoteId);

      if (updateError) {
        console.error('[VoiceRecorder] Failed to update quote_data:', updateError);
      } else {
        console.log('[VoiceRecorder] Successfully updated quote_data in database');
        // Immediately update checklist with extracted data (confirmed)
        updateChecklistFromQuoteData(finalQuoteData, { confirmed: true });
        
        // Create the actual quote from extracted data
        await createQuoteFromVoiceData(voiceQuoteId, finalQuoteData);
      }

    } catch (error) {
      console.error('[VoiceRecorder] Extraction failed:', error);
      await supabase
        .from('voice_quotes')
        .update({ status: 'failed' })
        .eq('id', voiceQuoteId);
    }
  };

  const createQuoteFromVoiceData = async (voiceQuoteId: string, quoteData: any) => {
    try {
      console.log('[VoiceRecorder] Creating quote from extracted data...');
      setIsExtracting(false);
      setIsCreatingQuote(true);
      
      // Get the voice_quote record to get org_id
      const { data: voiceQuote, error: voiceQuoteError } = await supabase
        .from('voice_quotes')
        .select('org_id, customer_id')
        .eq('id', voiceQuoteId)
        .single();

      if (voiceQuoteError || !voiceQuote) {
        throw new Error('Failed to fetch voice quote: ' + voiceQuoteError?.message);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Call create-draft-quote edge function
      // First, we need to create a voice_intake record for the edge function to work
      // Or we can create the quote directly from voice_quotes data
      
      // For now, let's create the quote directly using the extracted data
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Best-effort pricing profile (used for labour rate and optional markup).
      let pricingProfile: any = null;
      try {
        const { data: pp, error: ppError } = await supabase.rpc('get_effective_pricing_profile', { p_user_id: user.id });
        if (!ppError) pricingProfile = pp;
      } catch (e) {
        console.warn('[VoiceRecorder] Pricing profile fetch failed (non-fatal):', e);
      }

      // Create or find customer (required - quotes table has NOT NULL constraint)
      let customerId = voiceQuote.customer_id;
      
      if (!customerId) {
        if (quoteData.customerName) {
          // Try to find existing customer by name
          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('org_id', voiceQuote.org_id)
            .ilike('name', quoteData.customerName)
            .maybeSingle();

          if (existingCustomer) {
            customerId = existingCustomer.id;
          } else {
            // Create new customer with extracted name
            const { data: newCustomer, error: customerError } = await supabase
              .from('customers')
              .insert({
                org_id: voiceQuote.org_id,
                name: quoteData.customerName,
                created_by_user_id: user.id
              })
              .select()
              .single();

            if (customerError || !newCustomer) {
              throw new Error('Failed to create customer: ' + customerError?.message);
            }
            customerId = newCustomer.id;
          }
        } else {
          // No customer name extracted - create placeholder customer
          const { data: placeholderCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              org_id: voiceQuote.org_id,
              name: 'Voice Quote Customer', // Placeholder name
              created_by_user_id: user.id
            })
            .select()
            .single();

          if (customerError || !placeholderCustomer) {
            throw new Error('Failed to create placeholder customer: ' + customerError?.message);
          }
          customerId = placeholderCustomer.id;
        }
      }

      // Generate quote number using the database function
      const { data: quoteNumberData, error: quoteNumberError } = await supabase
        .rpc('generate_quote_number', { p_org_id: voiceQuote.org_id });
      
      if (quoteNumberError || !quoteNumberData) {
        throw new Error('Failed to generate quote number: ' + quoteNumberError?.message);
      }

      // Create the quote
      const normalizedScopeOfWork =
        Array.isArray(quoteData?.scopeOfWork)
          ? quoteData.scopeOfWork.filter((s: any) => typeof s === 'string' && s.trim().length > 0).map((s: string) => s.trim())
          : (typeof quoteData?.scopeOfWork === 'string' && quoteData.scopeOfWork.trim().length > 0)
            ? [quoteData.scopeOfWork.trim()]
            : (typeof quoteData?.jobTitle === 'string' && quoteData.jobTitle.trim().length > 0)
              ? [quoteData.jobTitle.trim()]
              : null;

      const { data: newQuote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          org_id: voiceQuote.org_id,
          customer_id: customerId,
          quote_number: quoteNumberData,
          title: quoteData.jobTitle || 'Voice Quote',
          scope_of_work: normalizedScopeOfWork,
          site_address: quoteData.jobLocation || null,
          source: 'voice',
          created_by_user_id: user.id
        })
        .select()
        .single();

      if (quoteError) {
        throw new Error('Failed to create quote: ' + quoteError.message);
      }

      console.log('[VoiceRecorder] Quote created:', newQuote.id);

      // Create line items
      const lineItems = [];

      // Add materials line items
      if (quoteData.materials && Array.isArray(quoteData.materials)) {
        const materials = quoteData.materials
          .filter((m: any) => typeof m?.name === 'string' && m.name.trim().length > 0)
          .map((m: any) => ({
            description: m.name.trim(),
            quantity: typeof m.quantity === 'number' && Number.isFinite(m.quantity) && m.quantity > 0 ? m.quantity : 1,
            unit: typeof m.unit === 'string' && m.unit.trim().length > 0 ? m.unit.trim() : 'unit',
          }));

        // Region/currency context for pricing
        const currency: string = (pricingProfile?.default_currency || 'AUD').toUpperCase();
        const regionCode = currencyToRegionCode(currency);
        const regionName = regionCodeToName(regionCode);

        // Tier 1: match materials to catalog and price if possible (fail-open).
        let matchedCatalog: any[] | null = null;
        const matchedCatalogItemsById: Record<string, any> = {};

        if (materials.length > 0) {
          try {
            const payload = materials.map((m: any) => ({
              description: m.description,
              unit: m.unit,
            }));

            const { data: matchRes, error: matchErr } = await supabase.rpc('match_catalog_items_for_quote_materials', {
              p_org_id: voiceQuote.org_id,
              p_region_code: regionCode,
              p_materials: payload,
            });

            if (!matchErr && Array.isArray(matchRes)) {
              matchedCatalog = matchRes;
              const ids = matchRes
                .map((r: any) => r?.catalog_item_id)
                .filter((id: any) => typeof id === 'string');

              if (ids.length > 0) {
                const { data: items } = await supabase
                  .from('material_catalog_items')
                  .select('id, unit_price_cents, typical_low_price_cents, typical_high_price_cents, unit')
                  .in('id', ids);
                (items || []).forEach((it: any) => {
                  matchedCatalogItemsById[it.id] = it;
                });
              }
            }
          } catch (e) {
            console.warn('[VoiceRecorder] Catalog matching failed (non-fatal):', e);
          }
        }

        // Precompute per-item prices + metadata
        const priced: Array<{
          description: string;
          quantity: number;
          unit: string;
          unitPriceCents: number;
          catalogItemId: string | null;
          notes: string | null;
          needsReview: boolean;
        }> = materials.map((m: { description: string; quantity: number; unit: string }, idx: number) => {
          let unitPriceCents = 0;
          let catalogItemId: string | null = null;
          let notes: string | null = null;
          let needsReview = false;

          if (matchedCatalog) {
            const match = matchedCatalog[idx];
            catalogItemId = typeof match?.catalog_item_id === 'string' ? match.catalog_item_id : null;

            if (catalogItemId && matchedCatalogItemsById[catalogItemId]) {
              const cat = matchedCatalogItemsById[catalogItemId];
              const direct = typeof cat.unit_price_cents === 'number' ? cat.unit_price_cents : null;
              const low = typeof cat.typical_low_price_cents === 'number' ? cat.typical_low_price_cents : null;
              const high = typeof cat.typical_high_price_cents === 'number' ? cat.typical_high_price_cents : null;
              const midpoint = low !== null && high !== null ? Math.round((low + high) / 2) : null;
              unitPriceCents = direct ?? midpoint ?? 0;
            }
          }

          return {
            description: m.description,
            quantity: m.quantity,
            unit: m.unit,
            unitPriceCents: typeof unitPriceCents === 'number' && Number.isFinite(unitPriceCents) ? Math.max(0, Math.round(unitPriceCents)) : 0,
            catalogItemId,
            notes,
            needsReview,
          };
        });

        // Tier 2: AI estimation for any missing prices (optional, behind flag)
        const missingIdx = priced
          .map((p, idx) => ({ p, idx }))
          .filter(({ p }) => !p.unitPriceCents || p.unitPriceCents <= 0)
          .map(({ idx }) => idx);

        if (ENABLE_AI_MATERIAL_PRICING && missingIdx.length > 0) {
          const aiItems = missingIdx.map((idx) => ({
            description: priced[idx].description,
            unit: priced[idx].unit,
            quantity: priced[idx].quantity,
          }));

          const aiRes = await estimateMaterialUnitPricesBatch({
            regionName,
            currency,
            items: aiItems,
          });

          if (aiRes && aiRes.length > 0) {
            for (let k = 0; k < missingIdx.length; k++) {
              const idx = missingIdx[k];
              const r = aiRes[k];
              if (r && typeof r.unit_price_cents === 'number' && r.unit_price_cents > 0) {
                priced[idx].unitPriceCents = Math.max(1, Math.round(r.unit_price_cents));
                priced[idx].needsReview = r.confidence === 'low';
                priced[idx].notes =
                  `AI estimated (${r.confidence} confidence) - ${r.reasoning}. Please review and adjust if needed.`;
              }
            }
          }
        }

        // Tier 3: Safe fallback (always on)
        for (const p of priced) {
          if (!p.unitPriceCents || p.unitPriceCents <= 0) {
            p.unitPriceCents = DEFAULT_FALLBACK_MATERIAL_UNIT_PRICE_CENTS;
            p.needsReview = true;
            p.notes = 'Default price applied (AI/catalog unavailable). Please update with actual pricing.';
          }
        }

        // Debug (high-signal): prove we are never inserting $0 materials
        console.log(
          '[VoiceRecorder] Material pricing decisions:',
          priced.map((p) => ({
            description: p.description,
            unit: p.unit,
            quantity: p.quantity,
            unitPriceCents: p.unitPriceCents,
            source: p.catalogItemId
              ? 'catalog'
              : (typeof p.notes === 'string' && p.notes.toLowerCase().startsWith('ai estimated'))
                ? 'ai'
                : 'fallback',
            needsReview: p.needsReview,
          }))
        );

        // Optional markup from pricing profile (applies to ALL materials prices)
        const markup = pricingProfile?.materials_markup_percent;
        if (typeof markup === 'number' && Number.isFinite(markup) && markup > 0) {
          for (const p of priced) {
            if (p.unitPriceCents > 0) {
              p.unitPriceCents = Math.round(p.unitPriceCents * (1 + markup / 100));
            }
          }
        }

        // Create line items with GUARANTEED pricing (never null/zero)
        for (const p of priced) {
          const qty = p.quantity;
          const unitPriceCents = p.unitPriceCents;
          lineItems.push({
            org_id: voiceQuote.org_id,
            quote_id: newQuote.id,
            position: lineItems.length + 1,
            item_type: 'materials',
            description: p.description,
            quantity: qty,
            unit: p.unit,
            catalog_item_id: p.catalogItemId,
            unit_price_cents: unitPriceCents,
            line_total_cents: Math.max(0, Math.round(unitPriceCents * qty)),
            notes: p.notes,
            is_needs_review: p.needsReview,
            is_placeholder: false,
          });
        }
      }

      // Add labor line item
      if (quoteData.laborHours) {
        const labourRateCents =
          typeof pricingProfile?.hourly_rate_cents === 'number' && Number.isFinite(pricingProfile.hourly_rate_cents)
            ? Math.round(pricingProfile.hourly_rate_cents)
            : 0;
        lineItems.push({
          org_id: voiceQuote.org_id,
          quote_id: newQuote.id,
          position: lineItems.length + 1,
          item_type: 'labour',
          description: 'Labor',
          quantity: quoteData.laborHours,
          unit: 'hours',
          unit_price_cents: labourRateCents,
          line_total_cents: Math.max(0, Math.round(labourRateCents * quoteData.laborHours))
        });
      }

      // Add additional fees (if extracted)
      if (Array.isArray(quoteData?.fees) && quoteData.fees.length > 0) {
        for (const fee of quoteData.fees) {
          const desc = typeof fee?.description === 'string' ? fee.description.trim() : '';
          const amount = typeof fee?.amount === 'number' && Number.isFinite(fee.amount) ? fee.amount : null;
          if (!desc) continue;
          const cents = amount !== null ? Math.max(0, Math.round(amount * 100)) : 0;
          lineItems.push({
            org_id: voiceQuote.org_id,
            quote_id: newQuote.id,
            position: lineItems.length + 1,
            item_type: 'fee',
            description: desc,
            quantity: 1,
            unit: 'service',
            unit_price_cents: cents,
            line_total_cents: cents
          });
        }
      }

      if (lineItems.length > 0) {
        const { error: lineItemsError } = await supabase
          .from('quote_line_items')
          .insert(lineItems);

        if (lineItemsError) {
          console.error('[VoiceRecorder] Failed to create line items:', lineItemsError);
        } else {
          console.log('[VoiceRecorder] Created', lineItems.length, 'line items');
        }
      }

      // Update voice_quotes with quote_id and mark as complete
      await supabase
        .from('voice_quotes')
        .update({ 
          status: 'complete',
          // Store quote_id in quote_data for reference
          quote_data: {
            ...quoteData,
            created_quote_id: newQuote.id
          }
        })
        .eq('id', voiceQuoteId);

      console.log('[VoiceRecorder] Quote creation complete');

      // Only now that the quote + line items are created, trigger navigation
      setCreatedQuoteId(newQuote.id);

    } catch (error) {
      console.error('[VoiceRecorder] Quote creation failed:', error);
      await supabase
        .from('voice_quotes')
        .update({ status: 'failed' })
        .eq('id', voiceQuoteId);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // OLD POLLING SYSTEM - REMOVED (using useEffect polling now)
  /*
  const startPolling = (voiceQuoteId: string) => {
    console.log('[VoiceRecorder] Starting polling for voice quote:', voiceQuoteId);
    pollingStartTimeRef.current = Date.now();

    const pollVoiceQuote = async () => {
      try {
        const elapsed = Date.now() - (pollingStartTimeRef.current || 0);
        if (elapsed > 60000) {
          console.log('[VoiceRecorder] Polling timeout reached (60s)');
          stopPolling();
          return;
        }

        const { data, error } = await supabase
          .from('voice_quotes')
          .select('status, quote_data')
          .eq('id', voiceQuoteId)
          .maybeSingle();

        if (error) {
          console.error('[VoiceRecorder] Polling error:', error);
          return;
        }

        if (!data) {
          console.error('[VoiceRecorder] Voice quote not found');
          stopPolling();
          return;
        }

        console.log('[VoiceRecorder] Poll result - status:', data.status, 'has data:', !!data.quote_data);

        const quoteData = data.quote_data;
        if (quoteData) {
          updateChecklistFromData(quoteData);
        }

        if (data.status === 'extracted') {
          console.log('[VoiceRecorder] Extraction complete, waiting for all checklist items...');
        }
      } catch (error) {
        console.error('[VoiceRecorder] Polling exception:', error);
      }
    };

    pollVoiceQuote();
    pollingIntervalRef.current = window.setInterval(pollVoiceQuote, 2000);
  };
  */

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      console.log('[VoiceRecorder] Stopping polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // OLD FUNCTION REMOVED - updateChecklistFromData was used by old polling system
  // The new useEffect polling (lines 63-120) handles checklist updates directly

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 shrink-0">
        <h1 className="text-2xl font-bold text-slate-900">Voice Quote</h1>
        <button
          onClick={onBack}
          disabled={isProcessing}
          className="text-[15px] font-medium text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 flex flex-col px-6 pb-8 overflow-y-auto custom-scrollbar">
        {!isProcessing ? (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center mb-10 pt-4">
              <div className="relative">
                {/* Immersive Waveform / Visualizer */}
                <div className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-700 ease-out ${isRecording ? 'bg-primary/10 scale-110 shadow-[0_0_40px_rgba(var(--primary-rgb),0.2)]' : 'bg-slate-50'}`}>
                  {isRecording ? (
                    <div className="flex gap-1 items-center h-16">
                      {[...Array(16)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-primary rounded-full transition-all duration-75"
                          ref={(el) => { visualizerBarsRef.current[i] = el; }}
                          style={{ height: '12%' }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-300 animate-pulse" />
                  )}
                </div>
              </div>
              
              <div className="text-center mt-8">
                <h2 className={`text-xl font-bold transition-colors duration-500 ${isRecording ? 'text-primary' : 'text-slate-900'}`}>
                  {isRecording ? 'Listening...' : 'Ready to record'}
                </h2>
                <p className="mt-2 text-[15px] text-slate-500 leading-relaxed max-w-[280px]">
                  Mention the address, client name, and job details.
                </p>
              </div>
            </div>

            {/* Checklist with smooth transitions */}
            <div className="flex flex-col gap-3 mb-8">
              <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                {isRecording ? 'Detecting items...' : 'Required items:'}
              </div>
              {checklistItems.map((item) => (
                <div 
                  key={item.id}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 ease-out ${
                    item.status === 'complete' 
                      ? 'bg-primary/[0.03] border-primary/20 shadow-sm translate-x-1' 
                      : item.status === 'detecting'
                        ? 'bg-primary/[0.04] border-primary/10 shadow-sm translate-x-0'
                        : 'bg-slate-50 border-transparent shadow-none translate-x-0'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-700 transform ${
                    item.status === 'complete' 
                      ? 'bg-primary text-white scale-110 rotate-0' 
                      : item.status === 'detecting'
                        ? 'bg-primary/10 text-primary scale-105 shadow-sm'
                        : 'bg-white text-slate-300 scale-100 shadow-sm'
                  }`}>
                    {item.status === 'complete' ? (
                      <Check size={16} strokeWidth={3} className="animate-in zoom-in duration-300" />
                    ) : item.status === 'detecting' ? (
                      <Check size={16} strokeWidth={3} className="opacity-80 animate-pulse" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`block text-[15px] font-semibold transition-colors duration-500 ${
                      item.status === 'complete' ? 'text-primary' : item.status === 'detecting' ? 'text-slate-900' : 'text-slate-600'
                    }`}>
                      {item.label}
                    </span>

                    {/* If the user is speaking but we haven't mapped it yet, show a subtle "audio heard" pulse */}
                    {isRecording && item.status === 'waiting' && Date.now() - lastHeardAt < 900 && (
                      <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400">
                        <span className="relative inline-flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-primary/30 animate-ping" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary/60" />
                        </span>
                        Hearing you…
                      </div>
                    )}

                    {/* Safer preview: show counts (less misleading than listing partial items) */}
                    {item.id === 3 && Array.isArray(liveQuotePreview?.scopeOfWork) && liveQuotePreview.scopeOfWork.length > 0 && (
                      <div className="mt-1 text-[12px] text-slate-500">
                        {liveQuotePreview.scopeOfWork.length} scope item{liveQuotePreview.scopeOfWork.length === 1 ? '' : 's'} captured
                      </div>
                    )}

                    {item.id === 4 && Array.isArray(liveQuotePreview?.materials) && liveQuotePreview.materials.length > 0 && (
                      <div className="mt-1 text-[12px] text-slate-500">
                        {liveQuotePreview.materials.length} material{liveQuotePreview.materials.length === 1 ? '' : 's'} captured
                      </div>
                    )}

                    {item.id === 1 && typeof liveQuotePreview?.jobLocation === 'string' && liveQuotePreview.jobLocation.trim() && (
                      <div className="mt-1 text-[12px] text-slate-500 truncate">{liveQuotePreview.jobLocation}</div>
                    )}
                    {item.id === 2 && typeof liveQuotePreview?.customerName === 'string' && liveQuotePreview.customerName.trim() && (
                      <div className="mt-1 text-[12px] text-slate-500 truncate">{liveQuotePreview.customerName}</div>
                    )}
                    {item.id === 5 && (typeof liveQuotePreview?.timeline === 'string' || typeof liveQuotePreview?.laborHours === 'number') && (
                      <div className="mt-1 text-[12px] text-slate-500 truncate">
                        {typeof liveQuotePreview?.timeline === 'string' && liveQuotePreview.timeline
                          ? liveQuotePreview.timeline
                          : typeof liveQuotePreview?.laborHours === 'number'
                            ? `${liveQuotePreview.laborHours} hours`
                            : ''}
                      </div>
                    )}
                    {item.id === 6 && Array.isArray(liveQuotePreview?.fees) && liveQuotePreview.fees.length > 0 && (
                      <div className="mt-1 text-[12px] text-slate-500 truncate">
                        {String(liveQuotePreview.fees[0]?.description || 'Additional fees')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Sticky Action Bar */}
            <div className="mt-auto py-4">
              {isRecording && (
                <div className="flex flex-col items-center mb-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-3xl font-bold text-slate-900 tabular-nums mb-1">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="text-[13px] font-bold text-slate-400 uppercase tracking-widest">
                    Recording
                  </div>
                </div>
              )}
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-full h-18 rounded-3xl flex items-center justify-center gap-4 font-extrabold text-lg shadow-xl transition-all active:scale-95 active:shadow-inner ${
                  isRecording 
                    ? 'bg-white border-2 border-red-500 text-red-500' 
                    : 'bg-primary text-white'
                }`}
              >
                {isRecording ? (
                  <>
                    <div className="w-4 h-4 rounded-[3px] bg-red-500 animate-pulse" />
                    Finish Recording
                  </>
                ) : (
                  <>
                    <Mic size={22} strokeWidth={2.5} />
                    Start Recording
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-1000">
             <div className="w-24 h-24 relative mb-12">
               <div className="absolute inset-0 border-[3px] border-primary/5 rounded-full" />
               <div className="absolute inset-0 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
               <div className="absolute inset-0 flex items-center justify-center">
                 <Mic size={32} className="text-primary/20" />
               </div>
             </div>

             <div className="text-center space-y-3">
               <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                 Generating Estimate
               </h2>
               <p className="text-[16px] text-slate-400 font-medium max-w-[260px] mx-auto leading-relaxed">
                 Turning your voice recording into a professional quote...
               </p>
             </div>

             {/* Minimalist Magic Progress Bar */}
             <div className="mt-16 w-full max-w-[240px]">
               <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                 <div 
                   className="h-full bg-primary transition-all duration-1000 ease-out"
                   style={{ 
                     width: isCreatingQuote ? '90%' : isExtracting ? '60%' : transcript ? '40%' : '15%' 
                   }}
                 />
               </div>
               <div className="mt-4 flex justify-between items-center px-1">
                 <span className="text-[11px] font-bold text-primary uppercase tracking-widest">
                   {isCreatingQuote ? 'Finalizing' : isExtracting ? 'Extracting' : 'Analyzing'}
                 </span>
                 <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                   Almost there
                 </span>
               </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
