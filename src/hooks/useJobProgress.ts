import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface JobProgress {
  progress: number;
  currentStep: string | null;
  stepsCompleted: string[];
  isComplete: boolean;
  quoteId: string | null;
}

export function useJobProgress(jobId: string | null): JobProgress {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepsCompleted, setStepsCompleted] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [quoteId, setQuoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let pollingInterval: NodeJS.Timeout;

    const fetchJobStatus = async () => {
      const { data } = await supabase
        .from('quote_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (data) {
        setProgress(data.progress_percent || 0);
        setCurrentStep(data.current_step);
        setStepsCompleted(data.steps_completed || []);
        setQuoteId(data.quote_id);

        if (data.status === 'complete') {
          setIsComplete(true);
          if (pollingInterval) clearInterval(pollingInterval);
        }
      }
    };

    fetchJobStatus();

    pollingInterval = setInterval(fetchJobStatus, 800);

    const subscription = supabase
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quote_generation_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          const job = payload.new;
          setProgress(job.progress_percent || 0);
          setCurrentStep(job.current_step);
          setStepsCompleted(job.steps_completed || []);
          setQuoteId(job.quote_id);

          if (job.status === 'complete') {
            setIsComplete(true);
            if (pollingInterval) clearInterval(pollingInterval);
          }
        }
      )
      .subscribe();

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
      subscription.unsubscribe();
    };
  }, [jobId]);

  return { progress, currentStep, stepsCompleted, isComplete, quoteId };
}
