import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface VoiceRecorderProps {
  onBack: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onBack }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      console.log('[VoiceRecorder] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log('[VoiceRecorder] Microphone access granted');

      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
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

      recorder.start(100);
      console.log('[VoiceRecorder] Recorder.start() called with 100ms timeslice');

      setIsRecording(true);
      setRecordingTime(0);

      const startTime = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);
        console.log('[VoiceRecorder] Timer tick:', elapsed);

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
    console.log('[VoiceRecorder] stopRecording called, isRecording:', isRecording);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('[VoiceRecorder] Stopping MediaRecorder, state:', mediaRecorderRef.current.state);
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
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
      }, 2000);

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
    } catch (error) {
      console.error('[VoiceRecorder] Database save failed:', error);
      throw error;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">

            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-[#0f172a]">Voice Quote</h1>
              <button
                onClick={onBack}
                className="text-[15px] font-medium text-[#64748b] hover:text-[#0f172a] transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="text-center">
              <p className="text-[15px] font-medium text-[#64748b] mb-8">
                {isUploading ? 'Saving recording...' :
                 uploadSuccess ? 'Recording saved!' :
                 'Speak naturally. We\'ll build the quote.'}
              </p>

              {uploadSuccess ? (
                <div className="w-[100px] h-[100px] rounded-full mx-auto flex items-center justify-center bg-[#10b981] text-white text-4xl">
                  ✓
                </div>
              ) : isUploading ? (
                <div className="w-[100px] h-[100px] rounded-full mx-auto flex items-center justify-center bg-[#e2e8f0]">
                  <div className="w-8 h-8 border-4 border-[#64748b] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isUploading}
                  className="w-[100px] h-[100px] rounded-full mx-auto flex items-center justify-center text-4xl transition-all duration-200 active:scale-[0.98] shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: isRecording ? '#ef4444' : '#d4ff00',
                    color: isRecording ? 'white' : '#1a2e05',
                    animation: isRecording ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                  }}
                >
                  {isRecording ? <Square size={40} fill="white" /> : <Mic size={40} />}
                </button>
              )}

              {isRecording && (
                <div className="mt-4">
                  <div className="text-2xl font-bold text-[#ef4444]">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="text-sm text-[#64748b] mt-1">
                    {recordingTime >= 60 ? 'Maximum recording time reached' : `${60 - recordingTime}s remaining`}
                  </div>
                </div>
              )}

              {!isRecording && !isUploading && !uploadSuccess && (
                <div className="mt-6 text-sm text-[#64748b]">
                  <p>Maximum recording time: 60 seconds</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
};
