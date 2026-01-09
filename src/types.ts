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
  // Pricing metadata (used to restore "never empty prices" magic)
  catalogItemId?: string | null;
  pricingSource?: 'catalog' | 'ai' | 'fallback';
  pricingNotes?: string | null;
  needsReview?: boolean;
}

export interface LabourItem {
  hours: number;
  rate: number;
}

export interface FeeItem {
  id: string;
  description: string;
  amount: number;
}

export interface Estimate {
  id: string;
  jobTitle: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  status: JobStatus;
  date: string;
  timeline: string; // e.g., "2 days"
  scopeOfWork: string[];
  materials: MaterialItem[];
  labour: LabourItem;
  additionalFees?: FeeItem[]; // Bunnings run, travel, callout, etc.
  gstRate: number; // 0.10 for 10%
}

export type ScreenName =
  | 'Login'
  | 'Signup'
  | 'Onboarding'
  | 'Settings'
  | 'MaterialsCatalog'
  | 'EstimatesList'
  | 'EditEstimate'
  | 'VoiceRecorder'
  | 'VoiceQuotesList'
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
  | 'InvoicesList'
  | 'CustomersList'
  | 'CustomerProfile';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobTitle: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  status: 'draft' | 'issued' | 'sent' | 'paid' | 'overdue';
  date: string;
  dueDate?: string;
  materials: MaterialItem[];
  labour: LabourItem;
  gstRate: number;
  quoteId?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

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
  selectedInvoiceId: string | null;
  selectedCustomerId: string | null;
  estimates: Estimate[];
  invoices: Invoice[];
  customers: Customer[];
  user: UserProfile | null;
  isAuthenticated: boolean;
}
