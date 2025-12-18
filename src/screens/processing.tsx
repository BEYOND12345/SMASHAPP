import React, { useEffect, useState } from 'react';
import { Layout } from '../components/layout';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/button';
import { supabase } from '../lib/supabase';

interface ProcessingProps {
  intakeId: string;
  onComplete: (quoteId: string, intakeId: string) => void;
}

type ProcessingStep = 'extracting' | 'creating' | 'success' | 'error';

export const Processing: React.FC<ProcessingProps> = ({ intakeId, onComplete }) => {
  const [step, setStep] = useState<ProcessingStep>('extracting');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    processIntake();
  }, [intakeId]);

  const processIntake = async () => {
    try {
      setStep('extracting');
      setError('');

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Retry logic for extraction (handles cold starts and transient failures)
      let extractResponse;
      let lastError;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[Processing] Extraction attempt ${attempt}/3`);

          extractResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-quote-data`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ intake_id: intakeId }),
            }
          );

          if (extractResponse.ok) {
            break; // Success!
          }

          // For 503 (service unavailable) or 429 (rate limit), retry
          if (extractResponse.status === 503 || extractResponse.status === 429) {
            const waitTime = attempt * 2000; // 2s, 4s, 6s
            console.log(`[Processing] Got ${extractResponse.status}, retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          // For other errors, don't retry
          const errorData = await extractResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Extraction failed (${extractResponse.status})`);
        } catch (err) {
          lastError = err;
          if (attempt === 3) throw err;

          // Wait before retry
          const waitTime = attempt * 2000;
          console.log(`[Processing] Attempt ${attempt} failed, retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!extractResponse || !extractResponse.ok) {
        throw lastError || new Error('Extraction failed after retries');
      }

      const extractData = await extractResponse.json();

      console.log('[Processing] Extract response:', extractData);
      console.log('[Processing] Extraction successful, proceeding to create quote');
      setStep('creating');

      console.log('[Processing] Calling create-draft-quote with intake_id:', intakeId);

      // Retry logic for quote creation
      let createResponse;
      let lastCreateError;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[Processing] Create quote attempt ${attempt}/3`);

          createResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-draft-quote`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ intake_id: intakeId }),
            }
          );

          console.log('[Processing] Create-draft-quote response status:', createResponse.status);

          if (createResponse.ok) {
            break; // Success!
          }

          // For 503 (service unavailable) or 429 (rate limit), retry
          if (createResponse.status === 503 || createResponse.status === 429) {
            const waitTime = attempt * 2000;
            console.log(`[Processing] Got ${createResponse.status}, retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          // For other errors, don't retry
          const errorData = await createResponse.json().catch(() => ({}));
          console.error('[Processing] Create-draft-quote failed:', errorData);
          throw new Error(errorData.error || `Quote creation failed (${createResponse.status})`);
        } catch (err) {
          lastCreateError = err;
          if (attempt === 3) throw err;

          const waitTime = attempt * 2000;
          console.log(`[Processing] Attempt ${attempt} failed, retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!createResponse || !createResponse.ok) {
        throw lastCreateError || new Error('Quote creation failed after retries');
      }

      const createData = await createResponse.json();

      console.log('[Processing] Create quote response:', createData);

      if (!createData.quote_id) {
        throw new Error('No quote_id returned from server');
      }

      setStep('success');
      console.log('[Processing] Quote created successfully, navigating to ReviewDraft with quoteId:', createData.quote_id, 'intakeId:', intakeId);
      setTimeout(() => {
        onComplete(createData.quote_id, intakeId);
      }, 1000);

    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Processing failed');
      setStep('error');
    }
  };

  if (step === 'error') {
    return (
      <Layout showNav={false} className="bg-surface flex flex-col items-center justify-center h-full px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="text-red-500" size={48} strokeWidth={2} />
          <div>
            <h2 className="text-[18px] font-semibold text-primary mb-1">Processing Failed</h2>
            <p className="text-[14px] text-secondary">{error}</p>
          </div>
          <Button onClick={() => processIntake()} variant="secondary" className="mt-4">
            Try Again
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showNav={false} className="bg-surface flex flex-col items-center justify-center h-full">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-brand/20 blur-xl rounded-full" />
          <Loader2 className="animate-spin text-brand relative z-10" size={48} strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <h2 className="text-[20px] font-semibold text-primary mb-2">
            {step === 'extracting' && 'Analyzing transcript...'}
            {step === 'creating' && 'Creating your quote...'}
            {step === 'success' && 'Quote ready!'}
          </h2>
          <p className="text-[14px] text-secondary">
            {step === 'extracting' && 'Extracting job details...'}
            {step === 'creating' && 'Building your estimate...'}
            {step === 'success' && 'Redirecting...'}
          </p>
        </div>
      </div>
    </Layout>
  );
};