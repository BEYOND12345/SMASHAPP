import React from 'react';
import { Estimate, UserProfile } from '../types';
import { EstimatePreview } from './estimatepreview';

interface InvoicePreviewProps {
  estimate: Estimate;
  userProfile?: UserProfile;
  onBack: () => void;
  onEdit: () => void;
  onSend: () => void;
  onDelete?: () => void;
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({ estimate, userProfile, onBack, onEdit, onSend, onDelete }) => {
  return (
    <EstimatePreview
      estimate={{...estimate, jobTitle: `Invoice #${estimate.id.substring(0,4)}`}}
      userProfile={userProfile}
      onBack={onBack}
      onEdit={onEdit}
      onSend={onSend}
      onDelete={onDelete}
      type="invoice"
    />
  );
};