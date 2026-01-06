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
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudio(audioBlob);

        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      startTimeRef.current = Date.now();

      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);

        if (elapsed >= 60) {
          stopRecording();
        }
      }, 100);

    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Please allow microphone access to record voice quotes.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const uploadAudio = async (audioBlob: Blob) => {
    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (userError || !userData) {
        throw new Error('Failed to get user organization');
      }

      const orgId = userData.org_id;
      const fileName = `${crypto.randomUUID()}.webm`;
      const filePath = `${orgId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, audioBlob, {
          contentType: 'audio/webm',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('audio')
        .getPublicUrl(filePath);

      await saveToDatabase(publicUrl, orgId);

      setUploadSuccess(true);

      setTimeout(() => {
        onBack();
      }, 2000);

    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload recording. Please try again.');
      setIsUploading(false);
    }
  };

  const saveToDatabase = async (audioUrl: string, orgId: string) => {
    try {
      const { error } = await supabase
        .from('voice_quotes')
        .insert({
          org_id: orgId,
          audio_url: audioUrl,
          status: 'recorded'
        });

      if (error) {
        throw error;
      }

      console.log('Recording saved successfully to database');
    } catch (error) {
      console.error('Database save failed:', error);
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
