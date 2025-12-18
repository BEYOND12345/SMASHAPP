export enum JobStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  APPROVED = 'Approved',
  PAID = 'Paid'
}

export interface MaterialItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
}

export interface LabourItem {
  hours: number;
  rate: number;
}

export interface Estimate {
  id: string;
  jobTitle: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  status: JobStatus;
  date: string;
  timeline: string; // e.g., "2 days"
  scopeOfWork: string[];
  materials: MaterialItem[];
  labour: LabourItem;
  gstRate: number; // 0.10 for 10%
}

export type ScreenName =
  | 'Login'
  | 'Signup'
  | 'Onboarding'
  | 'Settings'
  | 'MaterialsCatalog'
  | 'EstimatesList'
  | 'NewEstimate'
  | 'EditEstimate'
  | 'VoiceRecorder'
  | 'EditTranscript'
  | 'Processing'
  | 'ReviewQuote'
  | 'ReviewDraft'
  | 'EstimatePreview'
  | 'SendEstimate'
  | 'JobCard'
  | 'InvoicePreview'
  | 'PublicQuoteView'
  | 'PublicInvoiceView'
  | 'InvoicesList';

export interface UserProfile {
  id: string;
  email: string;
  businessName: string;
  tradeType: string;
  phone: string;
  logoUrl?: string;
  createdAt?: string;
  hourlyRate?: number;
  dayRate?: number;
  weekendRate?: number;
  travelRate?: number;
  materialMarkup?: number;
  currency?: string;
  businessAddress?: string;
  abn?: string;
  website?: string;
  paymentTerms?: string;
  bankName?: string;
  accountName?: string;
  bsbRouting?: string;
  accountNumber?: string;
  paymentInstructions?: string;
}

export interface AppState {
  currentScreen: ScreenName;
  selectedEstimateId: string | null;
  estimates: Estimate[];
  user: UserProfile | null;
  isAuthenticated: boolean;
}
