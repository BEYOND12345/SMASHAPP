import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { supabase } from '../../../../src/lib/supabase';

export default function RecordingPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [time, setTime] = useState(0);
  const [status, setStatus] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await saveRecording(blob);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      recorder.start(1000);
      setIsRecording(true);
      setTime(0);

      timerRef.current = window.setInterval(() => {
        setTime(t => t + 1);
      }, 1000);

    } catch (err) {
      setStatus('Microphone access denied');
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const saveRecording = async (blob: Blob) => {
    setStatus('Saving...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData) throw new Error('User organization not found');

      const orgId = userData.org_id;
      const fileName = `${crypto.randomUUID()}.webm`;
      const filePath = `${orgId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, blob, {
          contentType: 'audio/webm',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('audio')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('voice_quotes')
        .insert({
          org_id: orgId,
          audio_url: publicUrl,
          status: 'recorded'
        });

      if (dbError) throw dbError;

      setStatus('Saved successfully!');
      setTimeout(() => {
        setStatus('');
        setTime(0);
      }, 2000);

    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
      console.error(err);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Voice Quote Recording
        </h1>

        <div className="flex flex-col items-center space-y-6">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!!status && status !== 'Saved successfully!'}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
          >
            {isRecording ? <Square size={32} /> : <Mic size={32} />}
          </button>

          <div className="text-center">
            <div className="text-4xl font-mono font-bold text-gray-900">
              {formatTime(time)}
            </div>
            {isRecording && (
              <div className="text-sm text-gray-500 mt-2">Recording...</div>
            )}
          </div>

          {status && (
            <div
              className={`text-sm font-medium ${
                status.includes('Error')
                  ? 'text-red-600'
                  : status.includes('successfully')
                  ? 'text-green-600'
                  : 'text-blue-600'
              }`}
            >
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
