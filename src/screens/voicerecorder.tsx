import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { Mic, X, Loader2, Check, AlertCircle, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CustomerPickerSheet } from '../components/customerpickersheet';
import { ProgressChecklist, ChecklistItem } from '../components/progresschecklist';

interface ExtractionMetadata {
  overall_confidence: number;
  requires_review: boolean;
  has_required_missing: boolean;
}

interface VoiceRecorderProps {
  onCancel: () => void;
  onSuccess: (intakeId: string, quoteId: string, traceId: string, recordStopTime: number) => void;
  customerId?: string;
  autoStart?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'extracting' | 'success' | 'error';

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onCancel, onSuccess, customerId: initialCustomerId, autoStart = false }) => {
  const [state, setState] = useState<RecordingState>(autoStart ? 'recording' : 'idle');
  const [currentCustomerId, setCurrentCustomerId] = useState<string | undefined>(initialCustomerId);
  const [customerName, setCustomerName] = useState<string>('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [error, setError] = useState<string>('');
  const [bars, setBars] = useState<number[]>(new Array(16).fill(10));
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: 'job', label: 'Job identified', state: 'waiting' },
    { id: 'materials', label: 'Materials detected', state: 'waiting' },
    { id: 'labour', label: 'Labour detected', state: 'waiting' },
    { id: 'totals', label: 'Totals ready', state: 'waiting' },
  ]);
  const [showChecklist, setShowChecklist] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>();
  const timerRef = useRef<NodeJS.Timeout>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordedMimeTypeRef = useRef<string>('audio/webm');
  const recordingStartTimeRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef<boolean>(false);

  useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  useEffect(() => {
    if (transcriptBoxRef.current && state === 'recording') {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [liveTranscript, interimTranscript, state]);

  useEffect(() => {
    const loadCustomerName = async () => {
      if (currentCustomerId) {
        try {
          const { data } = await supabase
            .from('customers')
            .select('name')
            .eq('id', currentCustomerId)
            .maybeSingle();

          if (data?.name) {
            setCustomerName(data.name);
          }
        } catch (err) {
          console.error('[VoiceRecorder] Failed to load customer name:', err);
        }
      }
    };

    loadCustomerName();
  }, [currentCustomerId]);

  useEffect(() => {
    if (autoStart && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startRecording();
    }
  }, [autoStart]);

  useEffect(() => {
    if (state !== 'recording' || !liveTranscript) return;

    const fullTranscript = (liveTranscript + ' ' + interimTranscript).toLowerCase();
    const wordCount = liveTranscript.split(' ').filter(w => w.length > 0).length;

    const locationPattern = /\b(\d+\s+\w+\s+(street|st|road|rd|avenue|ave|drive|dr|lane|ln|way|court|ct|place|pl|boulevard|blvd|terrace|crescent|close)|at\s+(number\s+)?\d+|address|located|location|site)\b/;
    const jobPattern = /\b(install|repair|fix|build|replace|replacement|service|maintenance|construction|renovation|painting|plumbing|electrical|roofing|flooring|cabinet|deck|fence|drywall|tile|bathroom|kitchen|remodel|window|door|wall|floor|ceiling)\b/;
    const materialPattern = /\b(timber|wood|lumber|paint|sheet|sheets|plywood|concrete|cement|brick|tile|insulation|drywall|gyprock|screw|nail|bolt|pipe|wire|cable|material|supply|board|panel|window|windows)\b|\b(\d+)\s*(sheets?|boards?|windows?|doors?|litres?|liters?|meters?|metres?|tonnes?|tons?|pieces?|units?|bags?)\b/;
    const labourPattern = /\b(\d+)\s*(hour|hours|hr|hrs|day|days|week|weeks)\b/;
    const namePattern = /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;

    const hasLocation = locationPattern.test(fullTranscript);
    const hasJobName = jobPattern.test(fullTranscript);
    const hasMaterials = materialPattern.test(fullTranscript);
    const hasLabour = labourPattern.test(fullTranscript);
    const hasCustomerName = namePattern.test(liveTranscript);

    setChecklistItems((prev) => {
      const updated = [...prev];

      const locationItem = updated.find(i => i.id === 'location');
      if (locationItem && hasLocation) {
        if (locationItem.state === 'waiting') {
          locationItem.state = 'in_progress';
          setTimeout(() => {
            setChecklistItems((current) => {
              const copy = [...current];
              const loc = copy.find(i => i.id === 'location');
              if (loc && loc.state === 'in_progress') {
                loc.state = 'complete';
              }
              return copy;
            });
          }, 800);
        }
      }

      const jobnameItem = updated.find(i => i.id === 'jobname');
      if (jobnameItem && hasJobName) {
        if (jobnameItem.state === 'waiting') {
          jobnameItem.state = 'in_progress';
          setTimeout(() => {
            setChecklistItems((current) => {
              const copy = [...current];
              const job = copy.find(i => i.id === 'jobname');
              if (job && job.state === 'in_progress') {
                job.state = 'complete';
              }
              return copy;
            });
          }, 800);
        }
      }

      const materialsItem = updated.find(i => i.id === 'materials');
      if (materialsItem && hasMaterials) {
        if (materialsItem.state === 'waiting') {
          materialsItem.state = 'in_progress';
          setTimeout(() => {
            setChecklistItems((current) => {
              const copy = [...current];
              const mat = copy.find(i => i.id === 'materials');
              if (mat && mat.state === 'in_progress') {
                mat.state = 'complete';
              }
              return copy;
            });
          }, 800);
        }
      }

      const labourItem = updated.find(i => i.id === 'labour');
      if (labourItem && hasLabour) {
        if (labourItem.state === 'waiting') {
          labourItem.state = 'in_progress';
          setTimeout(() => {
            setChecklistItems((current) => {
              const copy = [...current];
              const lab = copy.find(i => i.id === 'labour');
              if (lab && lab.state === 'in_progress') {
                lab.state = 'complete';
              }
              return copy;
            });
          }, 800);
        }
      }

      return updated;
    });
  }, [liveTranscript, interimTranscript, state]);

  useEffect(() => {
    if (state === 'recording' && analyserRef.current) {
      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const animate = () => {
        analyser.getByteFrequencyData(dataArray);

        setBars(prev => prev.map((_, i) => {
          const index = Math.floor((i / prev.length) * dataArray.length);
          const value = dataArray[index] || 0;
          return Math.max(15, (value / 255) * 100);
        }));

        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } else {
      setBars(new Array(16).fill(10));
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [state]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        }
      });

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Try different formats with fallback for best compatibility
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/ogg;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = ''; // Use default
            }
          }
        }
      }

      console.log('[VOICE_RECORDER] Using audio format:', mimeType || 'default');

      const options: MediaRecorderOptions = mimeType
        ? { mimeType, audioBitsPerSecond: 128000 }
        : { audioBitsPerSecond: 128000 };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordedMimeTypeRef.current = mimeType || 'audio/webm';

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        await processRecording();
      };

      setLiveTranscript('');
      setInterimTranscript('');
      setChecklistItems([
        { id: 'location', label: 'Job location', state: 'waiting' },
        { id: 'jobname', label: 'Job name', state: 'waiting' },
        { id: 'materials', label: 'Materials & quantities', state: 'waiting' },
        { id: 'labour', label: 'Labour & time', state: 'waiting' },
        { id: 'fees', label: 'Additional fees', state: 'waiting' },
      ]);
      setShowChecklist(true);

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-AU';

          recognition.onresult = (event: any) => {
            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                final += transcript + ' ';
              } else {
                interim += transcript;
              }
            }

            if (final) {
              setLiveTranscript(prev => prev + final);
            }
            setInterimTranscript(interim);
          };

          recognition.onerror = (event: any) => {
            console.warn('[SPEECH_RECOGNITION] Error:', event.error);
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (err) {
          console.warn('[SPEECH_RECOGNITION] Failed to start:', err);
        }
      }

      recordingStartTimeRef.current = Date.now();
      mediaRecorder.start(1000);
      setState('recording');
    } catch (err) {
      setError('Microphone access denied. Please allow microphone access in your browser settings.');
      setState('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const resetAndRetry = () => {
    setError('');
    setState('idle');
    audioChunksRef.current = [];
    setShowChecklist(false);
    setChecklistItems([
      { id: 'location', label: 'Job location', state: 'waiting' },
      { id: 'jobname', label: 'Job name', state: 'waiting' },
      { id: 'materials', label: 'Materials & quantities', state: 'waiting' },
      { id: 'labour', label: 'Labour & time', state: 'waiting' },
      { id: 'fees', label: 'Additional fees', state: 'waiting' },
    ]);
  };

  const handleCustomerSelect = (customerId: string, name: string) => {
    setCurrentCustomerId(customerId || undefined);
    setCustomerName(name);
    setShowCustomerPicker(false);
  };

  const processRecording = async () => {
    const traceId = crypto.randomUUID();
    const recordStopTime = Date.now();

    console.warn(`[PERF] trace_id=${traceId} step=record_stop ms=0 intake_id=null quote_id=null`);

    try {
      setState('uploading');

      const actualDurationSeconds = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);

      const mimeType = recordedMimeTypeRef.current;
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      let fileExtension = 'webm';
      if (mimeType.includes('mp4')) {
        fileExtension = 'm4a';
      } else if (mimeType.includes('ogg')) {
        fileExtension = 'ogg';
      } else if (mimeType.includes('webm')) {
        fileExtension = 'webm';
      }

      console.warn(`[PERF] trace_id=${traceId} step=audio_validated size_kb=${Math.round(audioBlob.size / 1024)} duration_s=${actualDurationSeconds} total_ms=${Date.now() - recordStopTime}`);

      if (audioBlob.size === 0) {
        console.error('[VOICE_CAPTURE] No audio recorded');
        throw new Error('No audio detected. Please check your microphone and try again.');
      }

      if (actualDurationSeconds < 2) {
        console.error('[VOICE_CAPTURE] Recording too short', {
          actual_duration: actualDurationSeconds,
        });
        throw new Error('Could not hear you. Please record for at least 3 seconds and speak clearly.');
      }

      const bytesPerSecond = audioBlob.size / Math.max(actualDurationSeconds, 1);
      if (bytesPerSecond < 500) {
        console.error('[VOICE_CAPTURE] Audio quality too low', {
          bytes_per_second: bytesPerSecond,
        });
        throw new Error('Audio quality too low. Please check your microphone and try again.');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[VOICE_CAPTURE] User not authenticated');
        throw new Error('Not authenticated');
      }

      const { data: profileData, error: profileError } = await supabase
        .rpc('get_effective_pricing_profile', { p_user_id: user.id });

      if (profileError || !profileData) {
        throw new Error('No pricing profile found. Please complete setup in Settings.');
      }

      const profile = profileData as any;

      console.warn(`[PERF] trace_id=${traceId} step=profile_loaded total_ms=${Date.now() - recordStopTime}`);

      // Create quote shell IMMEDIATELY (before upload)
      const quoteShellStartTime = Date.now();

      let customerId_for_quote = currentCustomerId;

      if (!customerId_for_quote) {
        const { data: placeholderCustomer } = await supabase
          .from('customers')
          .insert({
            org_id: profile.org_id,
            name: null,
            email: null,
            phone: null,
          })
          .select('id')
          .single();

        customerId_for_quote = placeholderCustomer?.id;
      }

      const { data: quoteNumber } = await supabase
        .rpc('generate_quote_number', { p_org_id: profile.org_id });

      const { data: quoteShell, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          org_id: profile.org_id,
          customer_id: customerId_for_quote,
          quote_number: quoteNumber,
          title: 'Processing job',
          description: '',
          scope_of_work: [],
          status: 'draft',
          currency: 'AUD',
          default_tax_rate: 10,
          tax_inclusive: false,
        })
        .select('id')
        .single();

      if (quoteError || !quoteShell) {
        console.error('[VOICE_CAPTURE] Failed to create quote shell', { error: quoteError });
        throw new Error('Failed to create quote shell');
      }

      const quoteId = quoteShell.id;

      console.warn(`[PERF] trace_id=${traceId} step=quote_shell_created quote_id=${quoteId} ms=${Date.now() - quoteShellStartTime} total_ms=${Date.now() - recordStopTime}`);

      // Pre-generate intake ID and storage path for background processing
      const intakeId = crypto.randomUUID();
      const storagePath = `${profile.org_id}/${user.id}/voice_intakes/${intakeId}/audio.${fileExtension}`;

      setState('success');

      const navTime = Date.now() - recordStopTime;
      console.warn(`[PERF] trace_id=${traceId} step=nav_to_reviewdraft intake_id=${intakeId} quote_id=${quoteId} total_ms=${navTime}`);

      // Navigate immediately
      setTimeout(() => {
        onSuccess(intakeId, quoteId, traceId, recordStopTime);
      }, 50);

      // Start background processing (non-blocking) - Upload + Transcribe in parallel
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('[BACKGROUND_PROCESSING] No access token available');
      }

      (async () => {
        const updateStage = async (stage: string, error?: string) => {
          try {
            await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-intake-stage`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  intake_id: intakeId,
                  stage,
                  trace_id: traceId,
                  last_error: error || null,
                }),
              }
            );
          } catch (e) {
            console.error('[STAGE_UPDATE] Failed to update stage:', stage, e);
          }
        };

        try {
          await updateStage('recorder_started');
          console.log(`[VOICE_FLOW_DIAGNOSTIC] background_block_started intake_id=${intakeId} quote_id=${quoteId} trace_id=${traceId}`);

          // Upload audio and create intake record in background
          const uploadStartTime = Date.now();
          console.warn(`[BACKGROUND_PROCESSING] Starting upload for intake ${intakeId}`);

          const { error: uploadError } = await supabase.storage
            .from('voice-intakes')
            .upload(storagePath, audioBlob, {
              contentType: mimeType,
              upsert: false,
            });

          if (uploadError) {
            console.error('[BACKGROUND_PROCESSING] Upload failed', { error: uploadError });
            throw uploadError;
          }

          console.warn(`[PERF] trace_id=${traceId} step=upload_complete intake_id=${intakeId} ms=${Date.now() - uploadStartTime} total_ms=${Date.now() - recordStopTime}`);

          const { error: intakeError } = await supabase
            .from('voice_intakes')
            .insert({
              id: intakeId,
              org_id: profile.org_id,
              user_id: user.id,
              customer_id: currentCustomerId || null,
              source: 'web',
              audio_storage_path: storagePath,
              status: 'captured',
              created_quote_id: quoteId,
              stage: 'recorder_started',
              trace_id: traceId,
            });

          if (intakeError) {
            console.error('[BACKGROUND_PROCESSING] Failed to create intake', { error: intakeError });
            await updateStage('failed', `Intake creation failed: ${intakeError.message}`);
            throw intakeError;
          }

          console.warn(`[PERF] trace_id=${traceId} step=intake_insert_complete intake_id=${intakeId} ms=${Date.now() - uploadStartTime} total_ms=${Date.now() - recordStopTime}`);

          await updateStage('transcribe_started');

          // Now start transcription
          const transcribeStartTime = Date.now();
          console.warn(`[BACKGROUND_PROCESSING] Starting transcription for intake ${intakeId}`);

          let transcribeResponse;
          try {
            transcribeResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-voice-intake`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ intake_id: intakeId, trace_id: traceId }),
              }
            );
          } catch (fetchError) {
            const errorMsg = `Transcription network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
            console.error('[BACKGROUND_PROCESSING]', errorMsg);
            console.error('  This usually means: CORS failure, network timeout, or Edge Function not responding');
            await updateStage('failed', errorMsg);
            return;
          }

          console.log(`[VOICE_FLOW_DIAGNOSTIC] transcribe_returned status=${transcribeResponse.status} ok=${transcribeResponse.ok}`);

          if (!transcribeResponse.ok) {
            let errorText = 'No error body';
            try {
              errorText = await transcribeResponse.text();
            } catch (e) {
              errorText = 'Failed to read error response';
            }
            console.error('[BACKGROUND_PROCESSING] Transcription failed:');
            console.error('  Status:', transcribeResponse.status);
            console.error('  Status Text:', transcribeResponse.statusText);
            console.error('  Error Body:', errorText);
            await updateStage('failed', `Transcription failed: ${transcribeResponse.status} ${errorText}`);
            return;
          }

          const transcribeResult = await transcribeResponse.json();
          const transcribeElapsed = Date.now() - transcribeStartTime;
          const transcribeTotalMs = Date.now() - recordStopTime;
          console.warn(`[PERF] trace_id=${traceId} step=transcription_complete intake_id=${intakeId} ms=${transcribeElapsed} total_ms=${transcribeTotalMs}`);
          console.log('[BACKGROUND_PROCESSING] Transcription result:', transcribeResult);

          await updateStage('transcribe_done');
          await updateStage('extract_started');

          const extractStartTime = Date.now();

          console.warn(`[BACKGROUND_PROCESSING] Starting extraction for intake ${intakeId}`);
          let extractResponse;
          try {
            extractResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-quote-data`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ intake_id: intakeId, trace_id: traceId }),
              }
            );
          } catch (fetchError) {
            const errorMsg = `Extraction network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
            console.error('[BACKGROUND_PROCESSING]', errorMsg);
            console.error('  This usually means: CORS failure, network timeout, or Edge Function not responding');
            await updateStage('failed', errorMsg);
            return;
          }

          console.log(`[VOICE_FLOW_DIAGNOSTIC] extract_returned status=${extractResponse.status} ok=${extractResponse.ok}`);

          if (!extractResponse.ok) {
            let errorText = 'No error body';
            try {
              errorText = await extractResponse.text();
            } catch (e) {
              errorText = 'Failed to read error response';
            }
            console.error('[BACKGROUND_PROCESSING] Extraction failed:');
            console.error('  Status:', extractResponse.status);
            console.error('  Status Text:', extractResponse.statusText);
            console.error('  Error Body:', errorText);
            await updateStage('failed', `Extraction failed: ${extractResponse.status} ${errorText}`);
            return;
          }

          const extractResult = await extractResponse.json();
          const extractElapsed = Date.now() - extractStartTime;
          const extractTotalMs = Date.now() - recordStopTime;
          console.warn(`[PERF] trace_id=${traceId} step=extraction_complete intake_id=${intakeId} ms=${extractElapsed} total_ms=${extractTotalMs}`);
          console.log('[BACKGROUND_PROCESSING] Extraction result:', extractResult);

          await updateStage('extract_done');
          await updateStage('draft_started');

          const createQuoteStartTime = Date.now();

          console.warn(`[BACKGROUND_PROCESSING] Starting quote creation for intake ${intakeId}`);
          let createResponse;
          try {
            createResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-draft-quote`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ intake_id: intakeId, trace_id: traceId }),
              }
            );
          } catch (fetchError) {
            const errorMsg = `Quote creation network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
            console.error('[BACKGROUND_PROCESSING]', errorMsg);
            console.error('  This usually means: CORS failure, network timeout, or Edge Function not responding');
            await updateStage('failed', errorMsg);
            return;
          }

          console.log(`[VOICE_FLOW_DIAGNOSTIC] create_draft_returned status=${createResponse.status} ok=${createResponse.ok}`);

          if (!createResponse.ok) {
            let errorText = 'No error body';
            try {
              errorText = await createResponse.text();
            } catch (e) {
              errorText = 'Failed to read error response';
            }
            console.error('[BACKGROUND_PROCESSING] Quote creation failed:');
            console.error('  Status:', createResponse.status);
            console.error('  Status Text:', createResponse.statusText);
            console.error('  Error Body:', errorText);
            console.error('  URL:', createResponse.url);
            console.error('  Headers:', Object.fromEntries(createResponse.headers.entries()));
            await updateStage('failed', `Quote creation failed: ${createResponse.status} ${errorText}`);
            return;
          }

          const createResult = await createResponse.json();
          const createElapsed = Date.now() - createQuoteStartTime;
          const createTotalMs = Date.now() - recordStopTime;
          console.warn(`[PERF] trace_id=${traceId} step=quote_creation_complete intake_id=${intakeId} quote_id=${quoteId} ms=${createElapsed} total_ms=${createTotalMs}`);
          console.log('[BACKGROUND_PROCESSING] Quote creation result:', createResult);

          await updateStage('draft_done');
        } catch (err) {
          console.error('[BACKGROUND_PROCESSING] Exception:', err);
          console.error('[BACKGROUND_PROCESSING] Error details:', {
            name: err instanceof Error ? err.name : 'unknown',
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
          });
          await updateStage('failed', `Exception: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();

    } catch (err) {
      console.error('Processing error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(errorMessage);
      setState('error');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (state) {
      case 'idle': return 'Ready to record';
      case 'recording': return 'Listening...';
      case 'uploading': return 'Uploading...';
      case 'transcribing': return 'Transcribing audio...';
      case 'extracting': return 'Analyzing details...';
      case 'success': return 'Job captured!';
      case 'error': return 'Error occurred';
    }
  };

  const getStatusDescription = () => {
    switch (state) {
      case 'idle': return 'Tap the button to start';
      case 'recording': return 'Speak clearly about the job';
      case 'uploading': return 'Saving your recording...';
      case 'transcribing': return 'Converting speech to text...';
      case 'extracting': return 'Extracting job details...';
      case 'success': return 'Preparing job details';
      case 'error': return error || 'Something went wrong';
    }
  };

  const isProcessing = ['uploading', 'transcribing', 'extracting'].includes(state);

  return (
    <Layout showNav={false} className="bg-surface">
      <Header
        transparent
        left={
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="p-2 -ml-2 text-secondary hover:text-primary transition-colors disabled:opacity-50"
          >
            <X size={24} />
          </button>
        }
      />

      <div className="flex flex-col items-center px-6 pt-4 pb-8 min-h-[calc(100vh-80px)]">
        {/* Idle State - Unified Design */}
        {state === 'idle' && (
          <div className="flex flex-col items-center w-full max-w-md flex-1 justify-center space-y-6">
            {/* Customer Selection - Integrated */}
            <button
              onClick={() => setShowCustomerPicker(true)}
              className="px-4 py-2.5 rounded-full bg-white border border-divider hover:border-brand transition-colors flex items-center gap-2 shadow-sm"
            >
              <User size={16} className="text-secondary" />
              <span className="text-[14px] text-primary font-medium">
                {currentCustomerId && customerName ? customerName : 'No customer'}
              </span>
              <span className="text-[12px] text-tertiary">• Tap to change</span>
            </button>

            {/* Main Content Card */}
            <div className="bg-white border border-border rounded-3xl p-8 w-full shadow-sm space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-[28px] font-bold text-primary tracking-tight">Record Job Details</h1>
                <p className="text-[15px] text-secondary leading-relaxed">
                  Speak naturally. We'll capture the job and build your quote next.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-[13px] font-semibold text-tertiary uppercase tracking-wide">
                  Include the following:
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-2 flex-shrink-0" />
                    <span className="text-[14px] text-primary">Job description and scope</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-2 flex-shrink-0" />
                    <span className="text-[14px] text-primary">Materials and quantities</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-2 flex-shrink-0" />
                    <span className="text-[14px] text-primary">
                      Estimated time (e.g., "2 hours" or "1 day")
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-2 flex-shrink-0" />
                    <span className="text-[14px] text-primary">Any special requirements</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center pt-4">
                <button
                  onClick={startRecording}
                  className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 transform bg-brand hover:bg-brandDark hover:scale-105 active:scale-95"
                  aria-label="Start recording"
                >
                  <Mic size={40} className="text-white drop-shadow-sm" strokeWidth={2.5} />
                </button>
                <p className="text-[13px] text-tertiary mt-4">Tap to start recording</p>
              </div>
            </div>
          </div>
        )}

        {/* Recording State - Live Feedback */}
        {state === 'recording' && (
          <div className="flex flex-col items-center w-full max-w-md flex-1 justify-center space-y-6">
            {/* Customer Selection - Integrated */}
            <button
              onClick={() => setShowCustomerPicker(true)}
              className="px-4 py-2.5 rounded-full bg-white border border-divider hover:border-brand transition-colors flex items-center gap-2 shadow-sm"
            >
              <User size={16} className="text-secondary" />
              <span className="text-[14px] text-primary font-medium">
                {currentCustomerId && customerName ? customerName : 'No customer'}
              </span>
              <span className="text-[12px] text-tertiary">• Tap to change</span>
            </button>

            {/* Recording Indicator */}
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-3 h-3 rounded-full bg-brand animate-ping" />
                <div className="w-3 h-3 rounded-full bg-brand" />
              </div>
              <p className="text-[18px] font-semibold text-primary">Recording</p>
              <p className="text-[18px] font-mono text-brand font-semibold">
                {formatTime(recordingTime)}
              </p>
            </div>

            <div className="h-24 flex items-center justify-center gap-1.5 w-full max-w-[280px]">
              {bars.map((height, i) => (
                <div
                  key={i}
                  className="w-[6px] rounded-full transition-all duration-150 ease-in-out bg-brand"
                  style={{
                    height: `${height}%`,
                  }}
                />
              ))}
            </div>

            <div className="flex-1 w-full space-y-4 flex flex-col">
              {(liveTranscript || interimTranscript) ? (
                <div className="flex-1 bg-white border border-border rounded-2xl p-5 overflow-hidden flex flex-col">
                  <p className="text-[12px] font-semibold text-tertiary uppercase tracking-wide mb-3">
                    Live Transcript
                  </p>
                  <div
                    ref={transcriptBoxRef}
                    className="flex-1 overflow-y-auto text-[15px] text-primary leading-relaxed"
                  >
                    {liveTranscript}
                    {interimTranscript && (
                      <span className="text-secondary italic">{interimTranscript}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 bg-brand/5 border border-brand/20 rounded-2xl p-6 flex items-center justify-center">
                  <p className="text-[14px] text-secondary text-center">
                    Start speaking to see your words appear here...
                  </p>
                </div>
              )}

              {showChecklist && (
                <ProgressChecklist items={checklistItems} className="max-w-xs mx-auto" />
              )}
            </div>

            <button
              onClick={stopRecording}
              className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform bg-brand hover:bg-brandDark active:scale-95"
              aria-label="Stop recording"
            >
              <div className="w-7 h-7 bg-white rounded-sm" />
            </button>

            <p className="text-[13px] text-tertiary">Tap to stop recording</p>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="flex flex-col items-center space-y-6 w-full max-w-md flex-1 justify-center">
            <div className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg bg-brand">
              <Loader2 size={36} className="text-white animate-spin" strokeWidth={2.5} />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-[22px] font-bold text-primary">
                {getStatusText()}
              </h2>
              <p className="text-[14px] text-secondary">
                {getStatusDescription()}
              </p>
            </div>
            {showChecklist && (
              <ProgressChecklist items={checklistItems} className="max-w-xs" />
            )}
          </div>
        )}

        {/* Success State */}
        {state === 'success' && (
          <div className="flex flex-col items-center space-y-6 w-full max-w-md flex-1 justify-center">
            <div className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg bg-green-500">
              <Check size={36} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-[22px] font-bold text-green-600">
                Job Captured!
              </h2>
              <p className="text-[14px] text-secondary">
                Preparing job details
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div className="flex flex-col items-center space-y-6 w-full max-w-md flex-1 justify-center">
            <button
              onClick={resetAndRetry}
              className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg bg-red-500 hover:bg-red-600 transition-colors"
              aria-label="Try again"
            >
              <AlertCircle size={36} className="text-white" strokeWidth={2.5} />
            </button>
            <div className="text-center space-y-2">
              <h2 className="text-[22px] font-bold text-red-600">
                Error Occurred
              </h2>
              <p className="text-[14px] text-secondary px-6">
                {error || 'Something went wrong'}
              </p>
            </div>
            <button
              onClick={resetAndRetry}
              className="bg-brand hover:bg-brandDark text-white px-8 py-3 rounded-full font-semibold text-[15px] shadow-lg transition-all transform hover:scale-105 active:scale-95"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <CustomerPickerSheet
        isOpen={showCustomerPicker}
        onClose={() => setShowCustomerPicker(false)}
        onSelectCustomer={handleCustomerSelect}
        currentCustomerId={currentCustomerId}
      />
    </Layout>
  );
};