import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface JobProgress {
  progress: number;
  currentStep: string | null;
  stepsCompleted: string[];
  isComplete: boolean;
  quoteId: string | null;
  error: string | null;
}

export function useJobProgress(jobId: string | null): JobProgress {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepsCompleted, setStepsCompleted] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    console.log('[useJobProgress] Subscribing to job:', jobId);

    let pollingInterval: NodeJS.Timeout;

    const fetchJobStatus = async () => {
      const { data, error: fetchError } = await supabase
        .from('quote_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (fetchError) {
        console.error('[useJobProgress] Fetch error:', fetchError);
        setError(fetchError.message);
        return;
      }

      if (data) {
        console.log('[useJobProgress] Job update:', {
          progress: data.progress_percent,
          step: data.current_step,
          status: data.status
        });

        setProgress(data.progress_percent || 0);
        setCurrentStep(data.current_step);
        setStepsCompleted(data.steps_completed || []);
        setQuoteId(data.quote_id);
        setError(data.error_message);

        if (data.status === 'complete') {
          console.log('[useJobProgress] Job complete!');
          setIsComplete(true);
          if (pollingInterval) clearInterval(pollingInterval);
        } else if (data.status === 'failed') {
          console.error('[useJobProgress] Job failed:', data.error_message);
          setError(data.error_message || 'Job failed');
          if (pollingInterval) clearInterval(pollingInterval);
        }
      }
    };

    fetchJobStatus();

    pollingInterval = setInterval(fetchJobStatus, 800);

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quote_generation_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          console.log('[useJobProgress] Realtime update:', payload.new);
          const job = payload.new as any;

          setProgress(job.progress_percent || 0);
          setCurrentStep(job.current_step);
          setStepsCompleted(job.steps_completed || []);
          setQuoteId(job.quote_id);
          setError(job.error_message);

          if (job.status === 'complete') {
            console.log('[useJobProgress] Job complete (realtime)!');
            setIsComplete(true);
            if (pollingInterval) clearInterval(pollingInterval);
          } else if (job.status === 'failed') {
            console.error('[useJobProgress] Job failed (realtime):', job.error_message);
            setError(job.error_message || 'Job failed');
            if (pollingInterval) clearInterval(pollingInterval);
          }
        }
      )
      .subscribe((status) => {
        console.log('[useJobProgress] Subscription status:', status);
      });

    return () => {
      console.log('[useJobProgress] Cleaning up');
      if (pollingInterval) clearInterval(pollingInterval);
      channel.unsubscribe();
    };
  }, [jobId]);

  return { progress, currentStep, stepsCompleted, isComplete, quoteId, error };
}
