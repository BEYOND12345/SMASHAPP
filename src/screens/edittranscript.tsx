import React, { useState, useEffect } from 'react';
import { Layout, Header } from '../components/layout';
import { Button } from '../components/button';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EditTranscriptProps {
  intakeId: string;
  onCancel: () => void;
  onContinue: (intakeId: string) => void;
}

export const EditTranscript: React.FC<EditTranscriptProps> = ({ intakeId, onCancel, onContinue }) => {
  const [transcript, setTranscript] = useState('');
  const [originalTranscript, setOriginalTranscript] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadTranscript();
  }, [intakeId]);

  const loadTranscript = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('voice_intakes')
        .select('transcript_text, status')
        .eq('id', intakeId)
        .single();

      if (fetchError) throw fetchError;
      if (!data?.transcript_text) {
        throw new Error(`No transcript found. Status: ${data?.status || 'unknown'}`);
      }

      setTranscript(data.transcript_text);
      setOriginalTranscript(data.transcript_text);
      setLoading(false);
    } catch (err) {
      console.error('Error loading transcript:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transcript');
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    try {
      setSaving(true);
      setError('');

      // Only update if transcript was edited
      if (transcript !== originalTranscript) {
        const { error: updateError } = await supabase
          .from('voice_intakes')
          .update({ transcript_text: transcript })
          .eq('id', intakeId);

        if (updateError) throw updateError;
      }

      onContinue(intakeId);
    } catch (err) {
      console.error('Error saving transcript:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout showNav={false} className="bg-surface flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand" size={40} strokeWidth={2.5} />
          <p className="text-[15px] text-secondary">Loading transcript...</p>
        </div>
      </Layout>
    );
  }

  if (error && !transcript) {
    return (
      <Layout showNav={false} className="bg-surface flex items-center justify-center h-full px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="text-red-500" size={48} strokeWidth={2} />
          <div>
            <h2 className="text-[18px] font-semibold text-primary mb-1">Error Loading Transcript</h2>
            <p className="text-[14px] text-secondary">{error}</p>
          </div>
          <Button onClick={onCancel} variant="secondary" className="mt-4">
            Go Back
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showNav={false} className="bg-surface flex flex-col h-full">
      <Header
        transparent
        left={
          <button
            onClick={onCancel}
            disabled={saving}
            className="p-2 -ml-2 text-secondary hover:text-primary transition-colors disabled:opacity-50"
          >
            <X size={24} />
          </button>
        }
      />

      <div className="flex-1 flex flex-col px-6 pt-4 pb-8 overflow-hidden">
        <div className="mb-6">
          <h1 className="text-[24px] font-bold text-primary mb-2">Review Transcript</h1>
          <p className="text-[15px] text-secondary">
            Check the transcript for accuracy. You can edit any mistakes before continuing.
          </p>
        </div>

        <div className="flex-1 mb-6 overflow-hidden">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            disabled={saving}
            className="w-full h-full p-4 bg-white border border-divider rounded-xl text-[15px] text-primary placeholder:text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Transcript will appear here..."
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-[14px] text-red-700">{error}</p>
          </div>
        )}

        <Button
          onClick={handleContinue}
          disabled={!transcript.trim() || saving}
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Continue to Quote'
          )}
        </Button>

        <p className="text-[13px] text-tertiary text-center mt-3">
          {transcript !== originalTranscript ? 'Changes will be saved' : 'No changes made'}
        </p>
      </div>
    </Layout>
  );
};
