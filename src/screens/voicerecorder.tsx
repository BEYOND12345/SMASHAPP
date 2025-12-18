import React, { useState, useEffect, useRef } from 'react';
import { Layout, Header } from '../components/layout';
import { Mic, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface VoiceRecorderProps {
  onCancel: () => void;
  onSuccess: (intakeId: string) => void;
}

type RecordingState = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'success' | 'error';

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onCancel, onSuccess }) => {
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
      setError('Microphone access denied');
      setState('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const processRecording = async () => {
    try {
      setState('uploading');

      const actualDurationSeconds = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);

      const mimeType = recordedMimeTypeRef.current;
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      // Determine file extension from mime type
      let fileExtension = 'webm';
      if (mimeType.includes('mp4')) {
        fileExtension = 'm4a';
      } else if (mimeType.includes('ogg')) {
        fileExtension = 'ogg';
      } else if (mimeType.includes('webm')) {
        fileExtension = 'webm';
      }

      console.log('[VOICE_CAPTURE] Audio recording complete', {
        size_bytes: audioBlob.size,
        size_kb: Math.round(audioBlob.size / 1024),
        duration_seconds_timer: recordingTime,
        duration_seconds_actual: actualDurationSeconds,
        mime_type: mimeType,
        file_extension: fileExtension,
        chunks_count: audioChunksRef.current.length,
      });

      if (audioBlob.size === 0) {
        console.error('[VOICE_CAPTURE] No audio recorded');
        throw new Error('No audio recorded');
      }

      if (actualDurationSeconds < 2) {
        console.error('[VOICE_CAPTURE] Recording too short', {
          actual_duration: actualDurationSeconds,
        });
        throw new Error('Recording too short. Please record for at least 3 seconds.');
      }

      const bytesPerSecond = audioBlob.size / Math.max(actualDurationSeconds, 1);
      console.log('[VOICE_CAPTURE] Audio quality check', {
        bytes_per_second: Math.round(bytesPerSecond),
        expected_min: 4000,
      });

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
      const intakeId = crypto.randomUUID();
      const storagePath = `${profile.org_id}/${user.id}/voice_intakes/${intakeId}/audio.${fileExtension}`;

      console.log('[VOICE_CAPTURE] Uploading audio to storage', {
        intake_id: intakeId,
        path: storagePath,
      });

      const { error: uploadError } = await supabase.storage
        .from('voice-intakes')
        .upload(storagePath, audioBlob, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error('[VOICE_CAPTURE] Upload failed', { error: uploadError });
        throw uploadError;
      }

      console.log('[VOICE_CAPTURE] Creating voice intake record', { intake_id: intakeId });

      const { error: intakeError } = await supabase
        .from('voice_intakes')
        .insert({
          id: intakeId,
          org_id: profile.org_id,
          user_id: user.id,
          source: 'web',
          audio_storage_path: storagePath,
          status: 'captured',
        });

      if (intakeError) {
        console.error('[VOICE_CAPTURE] Failed to create intake', { error: intakeError });
        throw intakeError;
      }

      console.log('[VOICE_CAPTURE] ✓ Capture complete, starting transcription', {
        intake_id: intakeId,
      });

      setState('transcribing');

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const transcribeResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-voice-intake`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ intake_id: intakeId }),
        }
      );

      if (!transcribeResponse.ok) {
        const errorData = await transcribeResponse.json();
        console.error('[VOICE_CAPTURE] Transcription failed', {
          intake_id: intakeId,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Transcription failed');
      }

      const transcribeData = await transcribeResponse.json();
      console.log('[VOICE_CAPTURE] ✓ Transcription complete', {
        intake_id: intakeId,
        transcript_length: transcribeData.transcript?.length || 0,
      });

      setState('success');
      setTimeout(() => {
        onSuccess(intakeId);
      }, 1000);

    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Processing failed');
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
      case 'success': return 'Transcription complete!';
      case 'error': return 'Error occurred';
    }
  };

  const getStatusDescription = () => {
    switch (state) {
      case 'idle': return 'Tap the button to start';
      case 'recording': return 'Speak clearly about the job';
      case 'uploading': return 'Saving your recording...';
      case 'transcribing': return 'Converting speech to text...';
      case 'success': return 'Review your transcript next';
      case 'error': return error || 'Something went wrong';
    }
  };

  const isProcessing = ['uploading', 'transcribing'].includes(state);

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
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-float bg-red-500">
            <AlertCircle size={40} className="text-white" strokeWidth={2.5} />
          </div>
        )}
      </div>
    </Layout>
  );
};