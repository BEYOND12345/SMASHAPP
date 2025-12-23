import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { Mic, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ExtractionMetadata {
  overall_confidence: number;
  requires_review: boolean;
  has_required_missing: boolean;
}

interface VoiceRecorderProps {
  onCancel: () => void;
  onSuccess: (intakeId: string, quoteId: string, traceId: string, recordStopTime: number) => void;
  customerId?: string;
}

type RecordingState = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'extracting' | 'success' | 'error';

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onCancel, onSuccess, customerId }) => {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string>('');
  const [bars, setBars] = useState<number[]>(new Array(16).fill(10));
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>();
  const timerRef = useRef<NodeJS.Timeout>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordedMimeTypeRef = useRef<string>('audio/webm');
  const recordingStartTimeRef = useRef<number>(0);

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
        await processRecording();
      };

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

      let customerId_for_quote = customerId;

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
        try {
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
              customer_id: customerId || null,
              source: 'web',
              audio_storage_path: storagePath,
              status: 'captured',
              created_quote_id: quoteId,
            });

          if (intakeError) {
            console.error('[BACKGROUND_PROCESSING] Failed to create intake', { error: intakeError });
            throw intakeError;
          }

          console.warn(`[PERF] trace_id=${traceId} step=intake_insert_complete intake_id=${intakeId} ms=${Date.now() - uploadStartTime} total_ms=${Date.now() - recordStopTime}`);

          // Now start transcription
          const transcribeStartTime = Date.now();
          console.warn(`[BACKGROUND_PROCESSING] Starting transcription for intake ${intakeId}`);

          const transcribeResponse = await fetch(
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

          if (!transcribeResponse.ok) {
            const errorText = await transcribeResponse.text();
            console.error('[BACKGROUND_PROCESSING] Transcription failed:', transcribeResponse.status, errorText);
            return;
          }

          const transcribeResult = await transcribeResponse.json();
          const transcribeElapsed = Date.now() - transcribeStartTime;
          const transcribeTotalMs = Date.now() - recordStopTime;
          console.warn(`[PERF] trace_id=${traceId} step=transcription_complete intake_id=${intakeId} ms=${transcribeElapsed} total_ms=${transcribeTotalMs}`);
          console.log('[BACKGROUND_PROCESSING] Transcription result:', transcribeResult);

          const extractStartTime = Date.now();

          console.warn(`[BACKGROUND_PROCESSING] Starting extraction for intake ${intakeId}`);
          const extractResponse = await fetch(
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

          if (!extractResponse.ok) {
            const errorText = await extractResponse.text();
            console.error('[BACKGROUND_PROCESSING] Extraction failed:', extractResponse.status, errorText);
            return;
          }

          const extractResult = await extractResponse.json();
          const extractElapsed = Date.now() - extractStartTime;
          const extractTotalMs = Date.now() - recordStopTime;
          console.warn(`[PERF] trace_id=${traceId} step=extraction_complete intake_id=${intakeId} ms=${extractElapsed} total_ms=${extractTotalMs}`);
          console.log('[BACKGROUND_PROCESSING] Extraction result:', extractResult);

          const createQuoteStartTime = Date.now();

          console.warn(`[BACKGROUND_PROCESSING] Starting quote creation for intake ${intakeId}`);
          const createResponse = await fetch(
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

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.error('[BACKGROUND_PROCESSING] Quote creation failed:', createResponse.status, errorText);
            return;
          }

          const createResult = await createResponse.json();
          const createElapsed = Date.now() - createQuoteStartTime;
          const createTotalMs = Date.now() - recordStopTime;
          console.warn(`[PERF] trace_id=${traceId} step=quote_creation_complete intake_id=${intakeId} quote_id=${quoteId} ms=${createElapsed} total_ms=${createTotalMs}`);
          console.log('[BACKGROUND_PROCESSING] Quote creation result:', createResult);
        } catch (err) {
          console.error('[BACKGROUND_PROCESSING] Exception:', err);
          console.error('[BACKGROUND_PROCESSING] Error details:', {
            name: err instanceof Error ? err.name : 'unknown',
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
          });
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
      case 'success': return 'Quote ready!';
      case 'error': return 'Error occurred';
    }
  };

  const getStatusDescription = () => {
    switch (state) {
      case 'idle': return 'Tap the button to start';
      case 'recording': return 'Speak clearly about the job';
      case 'uploading': return 'Saving your recording...';
      case 'transcribing': return 'Converting speech to text...';
      case 'extracting': return 'Extracting quote details...';
      case 'success': return 'Creating your quote draft';
      case 'error': return error || 'Something went wrong';
    }
  };

  const isProcessing = ['uploading', 'transcribing', 'extracting'].includes(state);

  return (
    <Layout showNav={false} className="bg-surface flex flex-col items-center justify-between h-full pb-10">
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

      <div className="flex-1 flex flex-col items-center justify-center w-full px-6 gap-12">
        <div className="h-40 flex items-center justify-center gap-1.5 w-full">
          {bars.map((height, i) => (
            <div
              key={i}
              className={`w-[6px] rounded-full transition-all duration-300 ease-in-out ${
                state === 'recording' ? 'bg-brand' :
                isProcessing ? 'bg-brand/40' :
                state === 'success' ? 'bg-green-500' :
                state === 'error' ? 'bg-red-500' :
                'bg-tertiary/40'
              }`}
              style={{
                height: `${height}%`,
                transform: state === 'recording' ? 'scaleY(1)' : 'scaleY(0.5)'
              }}
            />
          ))}
        </div>

        <div className="text-center space-y-2">
          <h2 className={`text-[24px] font-bold tracking-tight transition-colors duration-300 ${
            state === 'recording' ? 'text-brand' :
            state === 'success' ? 'text-green-600' :
            state === 'error' ? 'text-red-600' :
            'text-primary'
          }`}>
            {getStatusText()}
          </h2>
          <p className="text-[15px] font-medium text-secondary">
            {getStatusDescription()}
          </p>
          {state === 'recording' && (
            <p className="text-[18px] font-mono text-brand mt-4">
              {formatTime(recordingTime)}
            </p>
          )}
        </div>

        {(state === 'idle' || state === 'recording') && (
          <div className="bg-white border border-divider rounded-2xl p-6 max-w-md w-full shadow-sm">
            <h3 className="text-[16px] font-semibold text-primary mb-3">What to say:</h3>
            <ul className="space-y-2 text-[14px] text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-brand mt-0.5">•</span>
                <span>Describe the job and what needs to be done</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand mt-0.5">•</span>
                <span>List materials needed and quantities</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand mt-0.5">•</span>
                <span><strong>Include rough time</strong> like "2 hours" or "1 day"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand mt-0.5">•</span>
                <span>Mention any travel or special requirements</span>
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="mb-12 relative">
        {state === 'recording' && (
          <>
            <div className="absolute inset-0 rounded-full bg-brand/20 animate-ping" />
            <div className="absolute inset-0 rounded-full bg-brand/10 animate-[ping_1.5s_ease-in-out_infinite_0.5s]" />
          </>
        )}

        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-float transition-all duration-300 transform bg-brand hover:bg-brandDark hover:scale-105"
            aria-label="Start recording"
          >
            <Mic size={40} className="text-white drop-shadow-sm" strokeWidth={2.5} />
          </button>
        )}

        {state === 'recording' && (
          <button
            onClick={stopRecording}
            className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-float transition-all duration-300 transform bg-brandDark scale-105"
            aria-label="Stop recording"
          >
            <div className="w-8 h-8 bg-white rounded-sm" />
          </button>
        )}

        {isProcessing && (
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-float bg-brand">
            <Loader2 size={40} className="text-white animate-spin" strokeWidth={2.5} />
          </div>
        )}

        {state === 'success' && (
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-float bg-green-500">
            <Check size={40} className="text-white" strokeWidth={2.5} />
          </div>
        )}

        {state === 'error' && (
          <button
            onClick={resetAndRetry}
            className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-float bg-red-500 hover:bg-red-600 transition-colors"
            aria-label="Try again"
          >
            <AlertCircle size={40} className="text-white" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {state === 'error' && (
        <div className="fixed bottom-32 left-0 right-0 flex justify-center px-6">
          <button
            onClick={resetAndRetry}
            className="bg-brand hover:bg-brandDark text-white px-8 py-3 rounded-full font-semibold text-[15px] shadow-lg transition-all transform hover:scale-105"
          >
            Try Again
          </button>
        </div>
      )}
    </Layout>
  );
};