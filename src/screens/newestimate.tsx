import React, { useState } from 'react';
import { Layout, Header } from '../components/layout';
import { Input } from '../components/inputs';
import { Button } from '../components/button';
import { ChevronLeft } from 'lucide-react';

interface NewEstimateProps {
  onBack: () => void;
  onStartRecording: (clientName: string, address: string) => void;
}

export const NewEstimate: React.FC<NewEstimateProps> = ({ onBack, onStartRecording }) => {
  const [clientName, setClientName] = useState('');

  const canStart = clientName.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canStart) {
      onStartRecording(clientName.trim(), '');
    }
  };

  return (
    <Layout showNav={false} className="bg-surface flex flex-col">
      <Header
        left={
          <button onClick={onBack} className="p-2 -ml-2 text-primary">
            <ChevronLeft size={24} />
          </button>
        }
        title="New Estimate"
      />

      <form onSubmit={handleSubmit} className="flex flex-col flex-1">
        <div className="px-6 mt-8 flex flex-col gap-4 flex-1">
          <div>
            <Input
              label="Client Name"
              placeholder="e.g. Sarah Jones"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              autoFocus
            />
            <p className="text-[13px] text-tertiary mt-2 px-1">
              You can add phone, email, and address details later
            </p>
          </div>
        </div>

        <div className="p-6 mt-auto bg-surface">
          <Button
            type="submit"
            fullWidth
            variant="primary"
            disabled={!canStart}
          >
            Start Recording
          </Button>
        </div>
      </form>
    </Layout>
  );
};