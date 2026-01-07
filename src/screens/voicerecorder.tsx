import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ProgressChecklist } from '../components/progresschecklist';

interface VoiceRecorderProps {
  onBack: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onBack }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [checklistItems, setChecklistItems] = useState([
    { id: 'location', label: '1. Job address', state: 'waiting' as const },
    { id: 'customer', label: '2. Customer name', state: 'waiting' as const },
    { id: 'description', label: '3. Scope of work', state: 'waiting' as const },
    { id: 'materials', label: '4. Materials needed', state: 'waiting' as const },
    { id: 'labor', label: '5. Time to complete', state: 'waiting' as const },
    { id: 'fees', label: '6. Additional charges', state: 'waiting' as const },
  ]);

  const [currentVoiceQuoteId, setCurrentVoiceQuoteId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null);
  const detectionTimeoutsRef = useRef<Map<string, number>>(new Map());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef(false);

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
    };
  }, []);

  useEffect(() => {
    const allComplete = checklistItems.every(item => item.state === 'complete');

    if (allComplete && currentVoiceQuoteId && pollingIntervalRef.current) {
      console.log('[VoiceRecorder] All checklist items complete, navigating...');
      stopPolling();

      setTimeout(() => {
        window.location.href = `/voice-quote/editor/${currentVoiceQuoteId}`;
      }, 1000);
    }
  }, [checklistItems, currentVoiceQuoteId]);

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

      audioChunksRef.current = [];
      isStoppingRef.current = false;

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

        await uploadAudio(audioBlob);
      };

      recorder.onerror = (event: any) => {
        console.error('[VoiceRecorder] Recorder error:', event.error);
        alert('Recording error: ' + event.error);
      };

      recorder.start(1000);
      console.log('[VoiceRecorder] Recorder.start() called with 1000ms timeslice');

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

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('[VoiceRecorder] Stopping MediaRecorder');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudio = async (audioBlob: Blob) => {
    setIsUploading(true);
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

      await saveToDatabase(publicUrl, orgId);

      setUploadSuccess(true);

      setTimeout(() => {
        onBack();
      }, 1500);

    } catch (error: any) {
      console.error('[VoiceRecorder] Upload failed:', error);
      alert('Failed to upload recording: ' + (error.message || 'Unknown error'));
      setIsUploading(false);
      setIsRecording(false);
    }
  };

  const saveToDatabase = async (audioUrl: string, orgId: string) => {
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
      startPolling(data.id);

      await processRecording(data.id, audioUrl);
    } catch (error) {
      console.error('[VoiceRecorder] Database save failed:', error);
      throw error;
    }
  };

  const processRecording = async (voiceQuoteId: string, audioUrl: string) => {
    try {
      console.log('[VoiceRecorder] Starting transcription for:', voiceQuoteId);

      await supabase
        .from('voice_quotes')
        .update({ status: 'transcribing' })
        .eq('id', voiceQuoteId);

      const audioResponse = await fetch(audioUrl);
      const audioBlob = await audioResponse.blob();

      const formData = new FormData();
      formData.append('endpoint', 'audio/transcriptions');
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const transcriptionResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      if (!transcriptionResponse.ok) {
        throw new Error('Transcription failed');
      }

      const transcriptionData = await transcriptionResponse.json();
      const transcript = transcriptionData.text;

      console.log('[VoiceRecorder] Transcript:', transcript);

      await supabase
        .from('voice_quotes')
        .update({
          status: 'transcribed',
          transcript: transcript
        })
        .eq('id', voiceQuoteId);

      await extractQuoteData(voiceQuoteId, transcript);

    } catch (error) {
      console.error('[VoiceRecorder] Processing failed:', error);
      await supabase
        .from('voice_quotes')
        .update({ status: 'failed' })
        .eq('id', voiceQuoteId);
    }
  };

  const extractQuoteData = async (voiceQuoteId: string, transcript: string) => {
    try {
      console.log('[VoiceRecorder] Extracting quote data...');

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
                  content: 'You are a helpful assistant that extracts structured quote information from voice transcripts. Extract all available information including customer name, job title/description, job location/address, materials with quantities, and labor hours. If a field is not mentioned, use null. Return JSON only.'
                },
                {
                  role: 'user',
                  content: `Extract quote information from this transcript:\n\n${transcript}\n\nReturn JSON with this exact structure:\n{\n  "customerName": "string or null",\n  "jobTitle": "string or null (brief description of the work)",\n  "jobLocation": "string or null (address or location)",\n  "materials": [{"name": "string", "quantity": number, "unit": "string"}],\n  "laborHours": number or null\n}`
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

      await supabase
        .from('voice_quotes')
        .update({
          status: 'extracted',
          quote_data: quoteData
        })
        .eq('id', voiceQuoteId);

    } catch (error) {
      console.error('[VoiceRecorder] Extraction failed:', error);
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

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      console.log('[VoiceRecorder] Stopping polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const updateChecklistFromData = (quoteData: any) => {
    setChecklistItems(prev => prev.map(item => {
      if (item.state === 'complete') return item;

      let shouldComplete = false;

      if (item.id === 'location' && quoteData.jobLocation) {
        shouldComplete = true;
      } else if (item.id === 'customer' && quoteData.customerName) {
        shouldComplete = true;
      } else if (item.id === 'description' && quoteData.scope?.length > 0) {
        shouldComplete = true;
      } else if (item.id === 'materials' && quoteData.materials?.length > 0) {
        shouldComplete = true;
      } else if (item.id === 'labor' && quoteData.laborHours) {
        shouldComplete = true;
      } else if (item.id === 'fees' && quoteData.fees?.length > 0) {
        shouldComplete = true;
      }

      if (shouldComplete && item.state === 'waiting') {
        console.log('[VoiceRecorder] Detected data for:', item.label);

        const timeout = window.setTimeout(() => {
          setChecklistItems(current => current.map(i =>
            i.id === item.id ? { ...i, state: 'complete' as const } : i
          ));
          detectionTimeoutsRef.current.delete(item.id);
        }, 1200);

        detectionTimeoutsRef.current.set(item.id, timeout);

        return { ...item, state: 'in_progress' as const };
      }

      return item;
    }));
  };

  return (
    <div className="h-full w-full bg-[#FAFAFA] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto py-8 px-5">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-8 shadow-sm w-full">

            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-[#0f172a]">Voice Quote</h1>
              <button
                onClick={onBack}
                disabled={isUploading}
                className="text-[15px] font-medium text-[#64748b] hover:text-[#0f172a] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <div className="text-center">
              <p className="text-[15px] text-[#64748b] mb-8">
                {isUploading ? 'Processing recording...' :
                 uploadSuccess ? 'Recording saved!' :
                 'Speak naturally. We\'ll build the quote.'}
              </p>

              {uploadSuccess ? (
                <div className="w-[120px] h-[120px] rounded-full mx-auto flex items-center justify-center bg-[#10b981] text-white mb-6">
                  <Check size={60} strokeWidth={3} />
                </div>
              ) : isUploading ? (
                <div className="w-[120px] h-[120px] rounded-full mx-auto flex items-center justify-center bg-[#f1f5f9] mb-6">
                  <div className="w-12 h-12 border-4 border-[#94a3b8] border-t-[#0f172a] rounded-full animate-spin"></div>
                </div>
              ) : (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isUploading}
                  className="w-[120px] h-[120px] rounded-full mx-auto flex items-center justify-center transition-all duration-200 active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mb-6"
                  style={{
                    background: isRecording ? '#ef4444' : '#84cc16',
                  }}
                >
                  {isRecording ? (
                    <Square size={48} fill="white" />
                  ) : (
                    <Mic size={48} strokeWidth={2} className="text-white" />
                  )}
                </button>
              )}

              {isRecording && (
                <div className="space-y-2 mb-6">
                  <div className="text-4xl font-bold text-[#0f172a] tabular-nums">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="text-sm text-[#64748b]">
                    {60 - recordingTime}s remaining
                  </div>
                </div>
              )}

              {!isRecording && !isUploading && !uploadSuccess && (
                <div className="text-sm text-[#94a3b8] mb-6">
                  <p>Maximum: 60 seconds</p>
                </div>
              )}

              {!isUploading && !uploadSuccess && (
                <ProgressChecklist items={checklistItems} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
