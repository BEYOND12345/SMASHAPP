import React from 'react';
import { CustomerSelection } from '../components/customerselection';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface NewEstimateProps {
  onBack: () => void;
  onStartRecording: (clientName: string, address: string, customerId?: string) => void;
}

export const NewEstimate: React.FC<NewEstimateProps> = ({ onBack, onStartRecording }) => {
  const handleSelectCustomer = (customer: Customer | null) => {
    if (customer) {
      onStartRecording(customer.name, customer.address || '', customer.id);
    }
  };

  const handleSkip = () => {
    onStartRecording('', '');
  };

  return (
    <CustomerSelection
      onSelectCustomer={handleSelectCustomer}
      onSkip={handleSkip}
    />
  );
};