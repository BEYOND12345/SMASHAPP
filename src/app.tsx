import React, { useState, useEffect } from 'react';
import { AppState, Estimate, Invoice, Customer, JobStatus, ScreenName, UserProfile } from './types';
import { Login } from './screens/login';
import { Signup } from './screens/signup';
import { Onboarding } from './screens/onboarding';
import { EstimatesList } from './screens/estimateslist';
import { InvoicesList } from './screens/invoiceslist';
import { CustomersList } from './screens/customerslist';
import { CustomerProfile } from './screens/customerprofile';
import { NewEstimate } from './screens/newestimate';
import { EditEstimate } from './screens/editestimate';
import { VoiceRecorder } from './screens/voicerecorder';
import { EditTranscript } from './screens/edittranscript';
import { Processing } from './screens/processing';
import { EstimatePreview } from './screens/estimatepreview';
import { JobCard } from './screens/jobcard';
import { SendEstimate } from './screens/sendestimate';
import { InvoicePreview } from './screens/invoicepreview';
import { PublicQuoteView } from './screens/publicquoteview';
import { PublicInvoiceView } from './screens/publicinvoiceview';
import { Settings } from './screens/settings';
import { ReviewQuote } from './screens/reviewquote';
import { ReviewDraft } from './screens/reviewdraft';
import { MaterialsCatalog } from './screens/materialscatalog';
import { supabase } from './lib/supabase';
import { parsePublicRoute } from './lib/utils/routeHelpers';

// Mock Data
const MOCK_ESTIMATES: Estimate[] = [
  {
    id: '1',
    jobTitle: 'Deck Replacement',
    clientName: 'Alex River',
    clientAddress: '42 High St, Northcote',
    clientPhone: '0400 123 456',
    status: JobStatus.SENT, // Changed to SENT to demo the 'Mark Approved' flow
    date: '12 Oct',
    timeline: '3 days',
    scopeOfWork: [
      'Demolish existing rotten decking',
      'Reinforce sub-floor structure',
      'Install new Merbau decking boards (90mm)',
      'Oil and finish'
    ],
    materials: [
      { id: 'm1', name: 'Merbau Decking (LM)', quantity: 200, unit: 'm', rate: 8.50 },
      { id: 'm2', name: 'Screws & Fixings', quantity: 1, unit: 'box', rate: 120.00 },
      { id: 'm3', name: 'Decking Oil', quantity: 2, unit: 'can', rate: 85.00 },
    ],
    labour: { hours: 24, rate: 85.00 },
    gstRate: 0.10
  }
];

const App: React.FC = () => {
  const [state, setState] = useState<AppState & { sendingType?: 'estimate' | 'invoice'; activeTab: 'estimates' | 'invoices' | 'customers'; editReturnScreen?: 'EstimatePreview' | 'InvoicePreview'; loading: boolean; voiceQuoteId?: string; voiceIntakeId?: string; voiceCustomerId?: string; autoStartRecording?: boolean }>({
    currentScreen: 'Login',
    selectedEstimateId: null,
    selectedInvoiceId: null,
    selectedCustomerId: null,
    estimates: [],
    invoices: [],
    customers: [],
    user: null,
    isAuthenticated: false,
    sendingType: 'estimate',
    activeTab: 'estimates',
    editReturnScreen: 'EstimatePreview',
    loading: true,
    voiceQuoteId: undefined,
    voiceIntakeId: undefined,
    voiceCustomerId: undefined,
    autoStartRecording: false
  });

  // Load quotes from database
  const loadQuotesFromDatabase = async (userId: string) => {
    try {
      console.log('[App] Loading quotes from database for user:', userId);

      // Verify we have an active session before loading
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[App] No active session, skipping quote load');
        return;
      }

      const { data: quotesData, error } = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers!customer_id(*),
          line_items:quote_line_items(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[App] Failed to load quotes:', error);
        // Don't throw - just return with mock data
        return;
      }

      console.log('[App] Loaded quotes:', quotesData?.length || 0);

      if (!quotesData || quotesData.length === 0) {
        console.log('[App] No quotes found in database');
        return;
      }

      const estimates: Estimate[] = quotesData.map((quoteData: any) => ({
        id: quoteData.id,
        jobTitle: quoteData.title || 'Untitled Job',
        clientName: quoteData.customer?.name || 'No Customer',
        clientAddress: '',
        clientEmail: quoteData.customer?.email || '',
        clientPhone: quoteData.customer?.phone || '',
        timeline: '2-3 days',
        scopeOfWork: Array.isArray(quoteData.scope_of_work) && quoteData.scope_of_work.length > 0
          ? quoteData.scope_of_work
          : (quoteData.description ? [quoteData.description] : []),
        materials: quoteData.line_items
          ?.filter((item: any) => item.item_type === 'materials')
          .map((item: any) => ({
            id: item.id,
            name: item.description,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.unit_price_cents / 100,
          })) || [],
        labour: {
          hours: quoteData.line_items
            ?.filter((item: any) => item.item_type === 'labour')
            .reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
          rate: quoteData.line_items
            ?.find((item: any) => item.item_type === 'labour')?.unit_price_cents / 100 || 0,
        },
        status:
          quoteData.status === 'sent' ? JobStatus.SENT :
          quoteData.status === 'accepted' ? JobStatus.APPROVED :
          quoteData.status === 'approved' ? JobStatus.APPROVED :
          quoteData.status === 'paid' ? JobStatus.PAID :
          JobStatus.DRAFT,
        date: new Date(quoteData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        gstRate: quoteData.default_tax_rate || 0.10,
      }));

      console.log('[App] Converted quotes to estimates:', estimates.length);

      setState(prev => ({
        ...prev,
        estimates: estimates
      }));
    } catch (err) {
      console.error('[App] Error loading quotes:', err);
      // Don't throw - continue with mock data
    }
  };

  // Load invoices from database
  const loadInvoicesFromDatabase = async (userId: string) => {
    try {
      console.log('[App] Loading invoices from database for user:', userId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[App] No active session, skipping invoice load');
        return;
      }

      const { data: invoicesData, error } = await supabase
        .from('invoices')
        .select(`
          *,
          quote:quotes!source_quote_id(
            *,
            customer:customers!customer_id(*)
          ),
          line_items:invoice_line_items(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[App] Failed to load invoices:', error);
        return;
      }

      console.log('[App] Loaded invoices:', invoicesData?.length || 0);

      if (!invoicesData || invoicesData.length === 0) {
        console.log('[App] No invoices found in database');
        setState(prev => ({ ...prev, invoices: [] }));
        return;
      }

      const invoices: Invoice[] = invoicesData.map((invoiceData: any) => {
        // Calculate if invoice is overdue
        const dbStatus = invoiceData.status as 'draft' | 'issued' | 'sent' | 'paid' | 'overdue';
        let displayStatus = dbStatus;

        // If invoice is issued/sent and has a past due date, mark as overdue
        if ((dbStatus === 'issued' || dbStatus === 'sent') && invoiceData.due_date) {
          const dueDate = new Date(invoiceData.due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (dueDate < today) {
            displayStatus = 'overdue';
          }
        }

        return {
        id: invoiceData.id,
        invoiceNumber: invoiceData.invoice_number || invoiceData.id.substring(0, 8),
        jobTitle: invoiceData.quote?.title || 'Invoice',
        clientName: invoiceData.quote?.customer?.name || 'Customer',
        clientAddress: '',
        clientEmail: invoiceData.quote?.customer?.email || '',
        clientPhone: invoiceData.quote?.customer?.phone || '',
        status: displayStatus,
        date: new Date(invoiceData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        dueDate: invoiceData.due_date ? new Date(invoiceData.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : undefined,
        materials: invoiceData.line_items
          ?.filter((item: any) => item.item_type === 'materials')
          .map((item: any) => ({
            id: item.id,
            name: item.description,
            quantity: item.quantity,
            unit: item.unit || 'item',
            rate: item.unit_price_cents / 100,
          })) || [],
        labour: {
          hours: invoiceData.line_items
            ?.filter((item: any) => item.item_type === 'labour')
            .reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
          rate: invoiceData.line_items
            ?.find((item: any) => item.item_type === 'labour')?.unit_price_cents / 100 || 0,
        },
        gstRate: invoiceData.default_tax_rate || 0.10,
        quoteId: invoiceData.source_quote_id || undefined,
        };
      });

      console.log('[App] Converted invoices:', invoices.length);

      setState(prev => ({
        ...prev,
        invoices: invoices
      }));
    } catch (err) {
      console.error('[App] Error loading invoices:', err);
    }
  };

  // Load customers from database
  const loadCustomersFromDatabase = async (userId: string) => {
    try {
      console.log('[App] Loading customers from database for user:', userId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[App] No active session, skipping customer load');
        return;
      }

      const { data: customersData, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('[App] Failed to load customers:', error);
        return;
      }

      console.log('[App] Loaded customers:', customersData?.length || 0);

      if (!customersData || customersData.length === 0) {
        console.log('[App] No customers found in database');
        setState(prev => ({ ...prev, customers: [] }));
        return;
      }

      const customers: Customer[] = customersData.map((customerData: any) => ({
        id: customerData.id,
        name: customerData.name || '',
        email: customerData.email || undefined,
        phone: customerData.phone || undefined,
        company_name: customerData.company_name || undefined,
        notes: customerData.notes || undefined,
        created_at: customerData.created_at,
        updated_at: customerData.updated_at
      }));

      console.log('[App] Converted customers:', customers.length);

      setState(prev => ({
        ...prev,
        customers: customers
      }));
    } catch (err) {
      console.error('[App] Error loading customers:', err);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        console.log('[App] Initializing session...');
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          console.log('[App] Session found for user:', session.user.id);
          const mockUser: UserProfile = {
            id: session.user.id,
            email: session.user.email || '',
            businessName: 'Demo Business',
            tradeType: 'Carpenter',
            phone: '0400 000 000'
          };

          // Load quotes, invoices, and customers from database with timeout
          const loadQuotesPromise = loadQuotesFromDatabase(session.user.id);
          const loadInvoicesPromise = loadInvoicesFromDatabase(session.user.id);
          const loadCustomersPromise = loadCustomersFromDatabase(session.user.id);
          const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));

          await Promise.race([Promise.all([loadQuotesPromise, loadInvoicesPromise, loadCustomersPromise]), timeoutPromise]);
          console.log('[App] Database load complete or timed out');

          setState(prev => ({
            ...prev,
            user: mockUser,
            isAuthenticated: true,
            currentScreen: 'EstimatesList',
            loading: false
          }));
        } else {
          console.log('[App] No session found');
          setState(prev => ({ ...prev, loading: false }));
        }
      } catch (err) {
        console.error('[App] Error in initSession:', err);
        setState(prev => ({ ...prev, loading: false }));
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        console.log('[App] Auth state change - user logged in:', session.user.id);
        const mockUser: UserProfile = {
          id: session.user.id,
          email: session.user.email || '',
          businessName: 'Demo Business',
          tradeType: 'Carpenter',
          phone: '0400 000 000'
        };

        // Load quotes, invoices, and customers from database with timeout
        const loadQuotesPromise = loadQuotesFromDatabase(session.user.id);
        const loadInvoicesPromise = loadInvoicesFromDatabase(session.user.id);
        const loadCustomersPromise = loadCustomersFromDatabase(session.user.id);
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));
        await Promise.race([Promise.all([loadQuotesPromise, loadInvoicesPromise, loadCustomersPromise]), timeoutPromise]);

        setState(prev => ({
          ...prev,
          user: mockUser,
          isAuthenticated: true,
          currentScreen: prev.currentScreen === 'Login' || prev.currentScreen === 'Signup' ? 'EstimatesList' : prev.currentScreen
        }));
      } else {
        console.log('[App] Auth state change - user logged out');
        // Clear ALL state on logout
        setState({
          currentScreen: 'Login',
          selectedEstimateId: null,
          selectedInvoiceId: null,
          selectedCustomerId: null,
          estimates: [],
          invoices: [],
          customers: [],
          user: null,
          isAuthenticated: false,
          sendingType: 'estimate',
          activeTab: 'estimates',
          editReturnScreen: 'EstimatePreview',
          loading: false,
          voiceQuoteId: undefined,
          voiceIntakeId: undefined,
          voiceCustomerId: undefined,
          autoStartRecording: false
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // URL Route Monitoring - Handle public share links when logged in
  useEffect(() => {
    const handleUrlChange = async () => {
      // Only handle URLs if user is authenticated
      if (!state.isAuthenticated || !state.user) {
        return;
      }

      const currentPath = window.location.pathname;
      const publicRoute = parsePublicRoute(currentPath);

      if (!publicRoute) {
        return; // Not a public route, nothing to do
      }

      console.log('[App] Public route detected while logged in:', publicRoute);

      try {
        if (publicRoute.type === 'quote') {
          // Look up quote by short code
          const { data: quoteData, error } = await supabase
            .from('quotes')
            .select('id')
            .eq('short_code', publicRoute.shortCode)
            .maybeSingle();

          if (error) {
            console.error('[App] Failed to lookup quote by short code:', error);
            alert('Failed to load quote. Please try again.');
            return;
          }

          if (!quoteData) {
            console.error('[App] Quote not found with short code:', publicRoute.shortCode);
            alert('Quote not found.');
            // Navigate to estimates list
            setState(prev => ({ ...prev, currentScreen: 'EstimatesList' }));
            // Clean up URL
            window.history.replaceState({}, '', '/');
            return;
          }

          console.log('[App] Found quote:', quoteData.id);

          // Load the full quote data
          await loadQuotesFromDatabase(state.user.id);

          // Navigate to JobCard with this quote
          setState(prev => ({
            ...prev,
            selectedEstimateId: quoteData.id,
            currentScreen: 'JobCard'
          }));

          // Clean up URL to avoid confusion
          window.history.replaceState({}, '', '/');
        } else if (publicRoute.type === 'invoice') {
          // Look up invoice by short code
          const { data: invoiceData, error } = await supabase
            .from('invoices')
            .select('id, source_quote_id')
            .eq('short_code', publicRoute.shortCode)
            .maybeSingle();

          if (error) {
            console.error('[App] Failed to lookup invoice by short code:', error);
            alert('Failed to load invoice. Please try again.');
            return;
          }

          if (!invoiceData) {
            console.error('[App] Invoice not found with short code:', publicRoute.shortCode);
            alert('Invoice not found.');
            // Navigate to invoices list
            setState(prev => ({ ...prev, currentScreen: 'EstimatesList', activeTab: 'invoices' }));
            // Clean up URL
            window.history.replaceState({}, '', '/');
            return;
          }

          console.log('[App] Found invoice:', invoiceData.id);

          // Load invoices and quotes
          await Promise.all([
            loadQuotesFromDatabase(state.user.id),
            loadInvoicesFromDatabase(state.user.id)
          ]);

          // Navigate to JobCard with the quote that has this invoice
          if (invoiceData.source_quote_id) {
            setState(prev => ({
              ...prev,
              selectedEstimateId: invoiceData.source_quote_id,
              currentScreen: 'InvoicePreview'
            }));
          } else {
            setState(prev => ({
              ...prev,
              selectedInvoiceId: invoiceData.id,
              currentScreen: 'InvoicePreview'
            }));
          }

          // Clean up URL
          window.history.replaceState({}, '', '/');
        }
      } catch (err) {
        console.error('[App] Error handling public route:', err);
        alert('An error occurred. Please try again.');
      }
    };

    // Check URL on mount and when authentication changes
    handleUrlChange();

    // Listen for browser back/forward navigation
    const handlePopState = () => {
      console.log('[App] Browser navigation detected');
      handleUrlChange();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [state.isAuthenticated, state.user]);

  // Navigation Helpers
  const navigate = (screen: ScreenName) => setState(prev => ({ ...prev, currentScreen: screen }));

  // Auth Actions
  const handleLogin = (userId: string, email: string) => {
    const mockUser: UserProfile = {
      id: userId,
      email,
      businessName: 'Demo Business',
      tradeType: 'Carpenter',
      phone: '0400 000 000'
    };
    setState(prev => ({
      ...prev,
      user: mockUser,
      isAuthenticated: true,
      currentScreen: 'EstimatesList'
    }));
  };

  const handleSignup = (userId: string, email: string) => {
    setState(prev => ({
      ...prev,
      user: {
        id: userId,
        email,
        businessName: '',
        tradeType: '',
        phone: ''
      },
      currentScreen: 'Onboarding'
    }));
  };

  const handleOnboardingComplete = async () => {
    setState(prev => ({
      ...prev,
      isAuthenticated: true,
      currentScreen: 'EstimatesList'
    }));

    // Reload user data after onboarding
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await loadQuotesFromDatabase(user.id);
    }
  };

  const handleProfileSave = (profile: UserProfile) => {
    setState(prev => ({ ...prev, user: profile }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setState({
      currentScreen: 'Login',
      selectedEstimateId: null,
      selectedInvoiceId: null,
      selectedCustomerId: null,
      estimates: [],
      invoices: [],
      customers: [],
      user: null,
      isAuthenticated: false,
      sendingType: 'estimate',
      activeTab: 'estimates',
      editReturnScreen: 'EstimatePreview',
      loading: false,
      voiceQuoteId: undefined,
      voiceIntakeId: undefined,
      voiceCustomerId: undefined,
      autoStartRecording: false
    });
  };

  // Actions
  const handleNewEstimate = () => navigate('NewEstimate');

  const handleQuickRecord = () => {
    setState(prev => ({
      ...prev,
      voiceCustomerId: undefined,
      autoStartRecording: true,
      currentScreen: 'VoiceRecorder'
    }));
  };

  const handleStartRecording = (clientName: string, _address: string, customerId?: string) => {
    setState(prev => ({
      ...prev,
      voiceCustomerId: customerId,
      autoStartRecording: false,
      currentScreen: 'VoiceRecorder'
    }));
  };

  const handleRecordingFinished = (intakeId: string, quoteId: string, traceId: string, recordStopTime: number) => {
    const totalMs = Date.now() - recordStopTime;
    console.warn(`[PERF] trace_id=${traceId} step=app_handle_recording_finished intake_id=${intakeId} quote_id=${quoteId} total_ms=${totalMs}`);

    // Store trace data for ReviewDraft
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('trace_id', traceId);
    urlParams.set('record_stop_time', recordStopTime.toString());
    urlParams.set('intake_id', intakeId);
    urlParams.set('quote_id', quoteId);
    window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);

    // Navigate directly to ReviewDraft with quote shell
    setState(prev => ({
      ...prev,
      voiceIntakeId: intakeId,
      voiceQuoteId: quoteId,
      currentScreen: 'ReviewDraft'
    }));
  };

  const handleTranscriptContinue = (intakeId: string) => {
    setState(prev => ({
      ...prev,
      voiceIntakeId: intakeId,
      currentScreen: 'Processing'
    }));
  };

  const handleProcessingFinished = (quoteId: string, intakeId: string) => {
    console.log('[App] handleProcessingFinished called with quoteId:', quoteId, 'intakeId:', intakeId);

    if (!quoteId) {
      console.log('[App] No quoteId, routing to ReviewQuote for user review');
      setState(prev => ({
        ...prev,
        voiceIntakeId: intakeId,
        currentScreen: 'ReviewQuote'
      }));
    } else {
      console.log('[App] Quote created, routing to ReviewDraft');
      setState(prev => ({
        ...prev,
        voiceQuoteId: quoteId,
        voiceIntakeId: intakeId,
        currentScreen: 'ReviewDraft'
      }));
    }
  };

  const handleReviewQuoteConfirmed = () => {
    console.log('[App] ReviewQuote confirmed, going back to Processing to create quote');
    setState(prev => ({
      ...prev,
      currentScreen: 'Processing'
    }));
  };

  const handleSelectEstimate = (id: string) => {
    setState(prev => ({ ...prev, selectedEstimateId: id, currentScreen: 'JobCard' }));
  };

  const handleStatusChange = async (newStatus: JobStatus) => {
    const estimateId = state.selectedEstimateId;
    if (!estimateId) return;

    // Optimistic UI update - update local state immediately
    setState(prev => ({
      ...prev,
      estimates: prev.estimates.map(e =>
        e.id === estimateId ? { ...e, status: newStatus } : e
      )
    }));

    // Update database in background
    try {
      // Map frontend status to database status
      let dbStatus = newStatus.toLowerCase();
      if (dbStatus === 'approved') {
        dbStatus = 'accepted'; // Database uses 'accepted' not 'approved'
      }

      // Get current quote - fetch customer data separately to avoid RLS join issues
      const { data: quoteData, error: fetchError } = await supabase
        .from('quotes')
        .select('customer_id, status')
        .eq('id', estimateId)
        .maybeSingle();

      if (fetchError) {
        console.error('[App] Failed to fetch quote:', fetchError);
        alert(`Failed to fetch quote: ${fetchError.message}`);
        // Revert optimistic update on error
        if (state.user?.id) {
          await loadQuotesFromDatabase(state.user.id);
        }
        return;
      }

      if (!quoteData) {
        console.error('[App] Quote not found');
        alert('Quote not found. Please try again.');
        if (state.user?.id) {
          await loadQuotesFromDatabase(state.user.id);
        }
        return;
      }

      const currentDbStatus = quoteData.status;

      // Fetch customer data separately
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('email, name')
        .eq('id', quoteData.customer_id)
        .maybeSingle();

      if (customerError) {
        console.error('[App] Failed to fetch customer:', customerError);
      }

      // Ensure quote is in 'sent' status before accepting
      // Valid transitions: draft→sent, sent→accepted, accepted→invoiced
      if (dbStatus === 'accepted' && currentDbStatus === 'draft') {
        // Auto-transition through 'sent' first
        console.log('[App] Quote is in draft status, transitioning to sent first');
        const { error: sendError } = await supabase
          .from('quotes')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', estimateId);

        if (sendError) {
          console.error('[App] Failed to mark quote as sent:', sendError);
          alert(`Failed to prepare quote: ${sendError.message}`);
          if (state.user?.id) {
            await loadQuotesFromDatabase(state.user.id);
          }
          return;
        }
      }

      // Prepare update data
      const updateData: any = { status: dbStatus };

      // If accepting, add required acceptance fields
      if (dbStatus === 'accepted') {
        // Use customer email if available, otherwise use a valid placeholder
        const customerEmail = customerData?.email?.trim();
        const customerName = customerData?.name?.trim();

        updateData.accepted_by_email = customerEmail || 'customer@approved.local';
        updateData.accepted_by_name = customerName || 'Customer';

        console.log('[App] Accepting quote with:', {
          email: updateData.accepted_by_email,
          name: updateData.accepted_by_name
        });
      }

      const { error } = await supabase
        .from('quotes')
        .update(updateData)
        .eq('id', estimateId);

      if (error) {
        console.error('[App] Failed to update quote status:', error);
        alert(`Failed to update status: ${error.message}`);
        // Revert optimistic update on error
        if (state.user?.id) {
          await loadQuotesFromDatabase(state.user.id);
        }
        return;
      }

      console.log('[App] Quote status updated:', newStatus);

      // If approved, create invoice automatically
      if (dbStatus === 'accepted') {
        try {
          console.log('[App] Creating invoice for quote:', estimateId);
          const { data: invoiceId, error: invoiceError } = await supabase
            .rpc('create_invoice_from_accepted_quote', { p_quote_id: estimateId });

          if (invoiceError) {
            console.error('[App] Failed to create invoice:', invoiceError);
            console.error('[App] Invoice error details:', {
              message: invoiceError.message,
              details: invoiceError.details,
              hint: invoiceError.hint,
              code: invoiceError.code
            });

            // Show more helpful error message
            const errorMsg = invoiceError.message || 'Unknown error';
            alert(`Quote approved successfully!\n\nHowever, invoice creation encountered an issue:\n${errorMsg}\n\nThe invoice can be created later from the job card.`);

            // Only reload on error
            if (state.user?.id) {
              await loadQuotesFromDatabase(state.user.id);
            }

            setState(prev => ({
              ...prev,
              currentScreen: 'JobCard'
            }));
            return;
          } else {
            console.log('[App] Invoice created successfully:', invoiceId);

            // Success - navigate to invoice (no reload needed, data already fresh)
            setState(prev => ({
              ...prev,
              currentScreen: 'InvoicePreview'
            }));
            return;
          }
        } catch (invoiceErr) {
          console.error('[App] Exception creating invoice:', invoiceErr);
          const errorMsg = invoiceErr instanceof Error ? invoiceErr.message : 'Unknown error';
          alert(`Quote approved successfully!\n\nHowever, invoice creation encountered an issue:\n${errorMsg}\n\nThe invoice can be created later from the job card.`);

          // Only reload on error
          if (state.user?.id) {
            await loadQuotesFromDatabase(state.user.id);
          }

          setState(prev => ({
            ...prev,
            currentScreen: 'JobCard'
          }));
          return;
        }
      }
    } catch (err) {
      console.error('[App] Error updating status:', err);
      alert('Failed to update status. Please try again.');
      // Revert optimistic update on error
      if (state.user?.id) {
        await loadQuotesFromDatabase(state.user.id);
      }
      return;
    }

    // Update local state (for non-approved status changes) - no database reload needed
    setState(prev => ({
      ...prev,
      currentScreen: newStatus === JobStatus.APPROVED ? 'JobCard' : prev.currentScreen
    }));
  };

  const handleConvertToInvoiceDirectly = async () => {
    const estimateId = state.selectedEstimateId;
    if (!estimateId) return;

    try {
      console.log('[App] Converting draft quote directly to invoice:', estimateId);

      const { data: quoteData, error: fetchError } = await supabase
        .from('quotes')
        .select(`
          id,
          customer_id,
          status,
          title,
          description,
          subtotal_cents,
          tax_cents,
          total_cents,
          currency,
          default_tax_rate,
          quote_line_items (*)
        `)
        .eq('id', estimateId)
        .maybeSingle();

      if (fetchError || !quoteData) {
        console.error('[App] Failed to fetch quote:', fetchError);
        alert(`Failed to load quote: ${fetchError?.message || 'Not found'}`);
        return;
      }

      const { data: customerData } = await supabase
        .from('customers')
        .select('email, name')
        .eq('id', quoteData.customer_id)
        .maybeSingle();

      if (quoteData.status === 'draft') {
        const { error: sendError } = await supabase
          .from('quotes')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', estimateId);

        if (sendError) {
          console.error('[App] Failed to mark as sent:', sendError);
          alert(`Failed to prepare quote: ${sendError.message}`);
          return;
        }
      }

      const snapshot = {
        quote_id: quoteData.id,
        title: quoteData.title,
        description: quoteData.description,
        subtotal_cents: quoteData.subtotal_cents,
        tax_cents: quoteData.tax_cents,
        total_cents: quoteData.total_cents,
        currency: quoteData.currency,
        default_tax_rate: quoteData.default_tax_rate,
        line_items: quoteData.quote_line_items,
        accepted_at: new Date().toISOString()
      };

      console.log('[App] Created acceptance snapshot:', { snapshot });

      const { error: acceptError } = await supabase
        .from('quotes')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          accepted_by_email: customerData?.email || 'internal@approved.local',
          accepted_by_name: customerData?.name || 'Internal Approval',
          accepted_quote_snapshot: snapshot
        })
        .eq('id', estimateId);

      if (acceptError) {
        console.error('[App] Failed to accept quote:', acceptError);
        alert(`Failed to approve quote: ${acceptError.message}`);
        return;
      }

      console.log('[App] Quote accepted with snapshot, creating invoice...');

      const { data: invoiceId, error: invoiceError } = await supabase
        .rpc('create_invoice_from_accepted_quote', { p_quote_id: estimateId });

      if (invoiceError) {
        console.error('[App] Failed to create invoice:', invoiceError);
        alert(`Quote approved but invoice creation failed:\n${invoiceError.message}\n\nYou can create the invoice later from the job card.`);

        if (state.user?.id) {
          await loadQuotesFromDatabase(state.user.id);
        }
        setState(prev => ({ ...prev, currentScreen: 'JobCard' }));
        return;
      }

      console.log('[App] Invoice created successfully:', invoiceId);

      // Navigate without reload - data is fresh
      setState(prev => ({
        ...prev,
        currentScreen: 'SendEstimate',
        sendingType: 'invoice'
      }));
    } catch (err) {
      console.error('[App] Exception in handleConvertToInvoiceDirectly:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to create invoice: ${errorMsg}`);
    }
  };

  const handleDeleteEstimate = async (estimateId: string) => {
    if (!confirm('Are you sure you want to delete this estimate? This cannot be undone.')) {
      return;
    }

    try {
      console.log('[App] Deleting quote:', estimateId);

      // Delete line items first (foreign key constraint)
      const { error: lineItemsError } = await supabase
        .from('quote_line_items')
        .delete()
        .eq('quote_id', estimateId);

      if (lineItemsError) {
        console.error('[App] Failed to delete line items:', lineItemsError);
        alert('Failed to delete estimate. Please try again.');
        return;
      }

      // Delete the quote
      const { error: quoteError } = await supabase
        .from('quotes')
        .delete()
        .eq('id', estimateId);

      if (quoteError) {
        console.error('[App] Failed to delete quote:', quoteError);
        alert('Failed to delete estimate. Please try again.');
        return;
      }

      console.log('[App] Quote deleted successfully');

      // Update local state and navigate back
      setState(prev => ({
        ...prev,
        estimates: prev.estimates.filter(e => e.id !== estimateId),
        selectedEstimateId: null,
        currentScreen: 'EstimatesList'
      }));
    } catch (err) {
      console.error('[App] Error deleting quote:', err);
      alert('Failed to delete estimate. Please try again.');
    }
  };

  const handleEstimateSave = (updatedEstimate: Estimate, returnScreen: 'EstimatePreview' | 'InvoicePreview' = 'EstimatePreview') => {
    setState(prev => ({
      ...prev,
      estimates: prev.estimates.map(e => e.id === updatedEstimate.id ? updatedEstimate : e),
      currentScreen: returnScreen
    }));
  };

  const getSelectedEstimate = () => state.estimates.find(e => e.id === state.selectedEstimateId);
  const getSelectedCustomer = () => state.customers.find(c => c.id === state.selectedCustomerId);

  const handleSelectCustomer = (id: string) => {
    setState(prev => ({ ...prev, selectedCustomerId: id, currentScreen: 'CustomerProfile' }));
  };

  const handleNewQuoteForCustomer = (customerId: string) => {
    // Go directly to voice recorder with customer pre-selected
    setState(prev => ({
      ...prev,
      voiceCustomerId: customerId,
      autoStartRecording: false,
      currentScreen: 'VoiceRecorder'
    }));
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      console.log('[App] Deleting customer:', customerId);

      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);

      if (error) {
        console.error('[App] Failed to delete customer:', error);
        alert('Failed to delete customer. Please try again.');
        return;
      }

      console.log('[App] Customer deleted successfully');

      // Update local state and navigate back
      setState(prev => ({
        ...prev,
        customers: prev.customers.filter(c => c.id !== customerId),
        selectedCustomerId: null,
        currentScreen: 'EstimatesList',
        activeTab: 'customers'
      }));
    } catch (err) {
      console.error('[App] Error deleting customer:', err);
      alert('Failed to delete customer. Please try again.');
    }
  };

  // Render Router
  const renderScreen = () => {
    const selectedEstimate = getSelectedEstimate();

    switch (state.currentScreen) {
      case 'Login':
        return <Login onLogin={handleLogin} onSignupClick={() => navigate('Signup')} />;

      case 'Signup':
        return <Signup onSignup={handleSignup} onBack={() => navigate('Login')} />;

      case 'Onboarding':
        return <Onboarding onComplete={handleOnboardingComplete} />;

      case 'Settings':
        return <Settings onBack={() => navigate('EstimatesList')} onNavigate={navigate} onLogout={handleLogout} />;

      case 'MaterialsCatalog':
        return <MaterialsCatalog onBack={() => navigate('Settings')} />;

      case 'PublicQuoteView':
        return selectedEstimate && state.user ? (
          <PublicQuoteView
            estimate={selectedEstimate}
            businessName={state.user.businessName}
            onApprove={() => {
              handleStatusChange(JobStatus.APPROVED);
              alert('Quote approved!');
            }}
          />
        ) : null;

      case 'PublicInvoiceView':
        return selectedEstimate && state.user ? (
          <PublicInvoiceView
            estimate={selectedEstimate}
            businessName={state.user.businessName}
            businessPhone={state.user.phone}
            invoiceNumber={selectedEstimate.id.substring(0, 6).toUpperCase()}
            onPaymentClick={() => alert('Payment gateway would open here')}
          />
        ) : null;

      case 'EstimatesList':
        return state.activeTab === 'estimates' ? (
          <EstimatesList
            estimates={state.estimates}
            onNewEstimate={handleNewEstimate}
            onSelectEstimate={handleSelectEstimate}
            activeTab={state.activeTab}
            onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab }))}
            onProfileClick={() => navigate('Settings')}
            onQuickRecord={handleQuickRecord}
          />
        ) : state.activeTab === 'invoices' ? (
          <InvoicesList
            invoices={state.invoices}
            onNewEstimate={handleNewEstimate}
            onSelectInvoice={(id) => setState(prev => ({ ...prev, selectedInvoiceId: id, currentScreen: 'InvoicePreview' }))}
            activeTab={state.activeTab}
            onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab }))}
            onProfileClick={() => navigate('Settings')}
            onQuickRecord={handleQuickRecord}
          />
        ) : (
          <CustomersList
            customers={state.customers}
            onNewEstimate={handleNewEstimate}
            onSelectCustomer={handleSelectCustomer}
            activeTab={state.activeTab}
            onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab }))}
            onProfileClick={() => navigate('Settings')}
          />
        );

      case 'CustomerProfile':
        const selectedCustomer = getSelectedCustomer();
        return selectedCustomer ? (
          <CustomerProfile
            customer={selectedCustomer}
            quotes={state.estimates}
            invoices={state.invoices}
            onBack={() => setState(prev => ({ ...prev, currentScreen: 'EstimatesList', activeTab: 'customers' }))}
            onNewQuote={handleNewQuoteForCustomer}
            onSelectQuote={(id) => setState(prev => ({ ...prev, selectedEstimateId: id, currentScreen: 'JobCard' }))}
            onSelectInvoice={(id) => setState(prev => ({ ...prev, selectedInvoiceId: id, currentScreen: 'InvoicePreview' }))}
            onDeleteCustomer={handleDeleteCustomer}
          />
        ) : null;
      
      case 'NewEstimate':
        return <NewEstimate
          onBack={() => navigate('EstimatesList')}
          onStartRecording={handleStartRecording}
        />;

      case 'EditEstimate':
        return selectedEstimate ? (
          <EditEstimate
            estimate={selectedEstimate}
            returnScreen={state.editReturnScreen}
            onBack={() => navigate(state.editReturnScreen || 'EstimatePreview')}
            onSave={(estimate) => handleEstimateSave(estimate, state.editReturnScreen)}
          />
        ) : null;

      case 'VoiceRecorder':
        return <VoiceRecorder
          onCancel={() => navigate('EstimatesList')}
          onSuccess={handleRecordingFinished}
          customerId={state.voiceCustomerId}
          autoStart={state.autoStartRecording}
        />;

      case 'EditTranscript':
        return state.voiceIntakeId ? (
          <EditTranscript
            intakeId={state.voiceIntakeId}
            onCancel={() => navigate('NewEstimate')}
            onContinue={handleTranscriptContinue}
          />
        ) : null;

      case 'Processing':
        return state.voiceIntakeId ? (
          <Processing
            intakeId={state.voiceIntakeId}
            onComplete={handleProcessingFinished}
          />
        ) : null;

      case 'ReviewQuote':
        return state.voiceIntakeId ? (
          <ReviewQuote
            intakeId={state.voiceIntakeId}
            onBack={() => navigate('NewEstimate')}
            onConfirmed={handleReviewQuoteConfirmed}
          />
        ) : null;

      case 'ReviewDraft':
        console.log('[App] Rendering ReviewDraft with voiceQuoteId:', state.voiceQuoteId, 'voiceIntakeId:', state.voiceIntakeId);
        if (!state.voiceQuoteId || !state.voiceIntakeId) {
          console.error('[App] Missing voiceQuoteId or voiceIntakeId, redirecting to EstimatesList');
          setTimeout(() => navigate('EstimatesList'), 0);
          return null;
        }
        return state.voiceQuoteId && state.voiceIntakeId ? (
          <ReviewDraft
            quoteId={state.voiceQuoteId}
            intakeId={state.voiceIntakeId}
            onBack={() => navigate('EstimatesList')}
            onContinue={async (quoteId) => {
              try {
                const { data: quoteData, error } = await supabase
                  .from('quotes')
                  .select(`
                    *,
                    customer:customers!customer_id(*),
                    line_items:quote_line_items(*)
                  `)
                  .eq('id', quoteId)
                  .maybeSingle();

                if (error || !quoteData) {
                  console.error('Failed to load quote:', error);
                  alert('Failed to load quote');
                  return;
                }

                const estimate: Estimate = {
                  id: quoteData.id,
                  jobTitle: quoteData.title || '',
                  clientName: quoteData.customer?.name || '',
                  clientAddress: '',
                  clientEmail: quoteData.customer?.email || '',
                  clientPhone: quoteData.customer?.phone || '',
                  timeline: '2-3 days',
                  scopeOfWork: Array.isArray(quoteData.scope_of_work) && quoteData.scope_of_work.length > 0
                    ? quoteData.scope_of_work
                    : (quoteData.description ? [quoteData.description] : []),
                  materials: quoteData.line_items
                    ?.filter((item: any) => item.item_type === 'materials')
                    .map((item: any) => ({
                      id: item.id,
                      name: item.description,
                      quantity: item.quantity,
                      unit: item.unit,
                      rate: item.unit_price_cents / 100,
                    })) || [],
                  labour: {
                    hours: quoteData.line_items
                      ?.filter((item: any) => item.item_type === 'labour')
                      .reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
                    rate: quoteData.line_items
                      ?.find((item: any) => item.item_type === 'labour')?.unit_price_cents / 100 || 0,
                  },
                  status: JobStatus.DRAFT,
                  date: new Date(quoteData.created_at).toLocaleDateString(),
                  gstRate: 0.10,
                };

                setState(prev => ({
                  ...prev,
                  selectedEstimateId: quoteId,
                  estimates: [...prev.estimates.filter(e => e.id !== quoteId), estimate],
                }));
                navigate('EditEstimate');
              } catch (err) {
                console.error('Error loading quote:', err);
                alert('Failed to load quote');
              }
            }}
          />
        ) : null;

      case 'EstimatePreview':
        return selectedEstimate ? (
          <EstimatePreview
            estimate={selectedEstimate}
            userProfile={state.user || undefined}
            onBack={() => navigate('JobCard')}
            onEdit={() => setState(prev => ({ ...prev, currentScreen: 'EditEstimate', editReturnScreen: 'EstimatePreview' }))}
            onSend={() => setState(prev => ({...prev, currentScreen: 'SendEstimate', sendingType: 'estimate'}))}
            onStatusChange={handleStatusChange}
            onViewInvoice={() => navigate('InvoicePreview')}
            onDelete={() => handleDeleteEstimate(selectedEstimate.id)}
            onConvertToInvoice={handleConvertToInvoiceDirectly}
          />
        ) : null;

      case 'JobCard':
        return selectedEstimate ? (
          <JobCard 
            estimate={selectedEstimate} 
            onBack={() => navigate('EstimatesList')} 
            onViewEstimate={() => navigate('EstimatePreview')}
            onViewInvoice={() => navigate('InvoicePreview')}
            onSendInvoice={() => setState(prev => ({...prev, currentScreen: 'SendEstimate', sendingType: 'invoice'}))}
            onStatusChange={handleStatusChange}
          />
        ) : null;

      case 'SendEstimate':
        return <SendEstimate
          onBack={() => navigate('JobCard')}
          type={state.sendingType}
          onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab, currentScreen: 'EstimatesList' }))}
          estimateId={state.selectedEstimateId || undefined}
          onSent={async () => {
            // Update status based on what we sent
            const newStatus = state.sendingType === 'invoice' ? JobStatus.PAID : JobStatus.SENT;

            // Optimistic UI update
            if (state.selectedEstimateId) {
              setState(prev => ({
                ...prev,
                estimates: prev.estimates.map(e =>
                  e.id === state.selectedEstimateId ? { ...e, status: newStatus } : e
                ),
                currentScreen: 'JobCard'
              }));

              // Save to database in background
              const dbStatus = newStatus === JobStatus.SENT ? 'sent' : 'paid';

              const { error } = await supabase
                .from('quotes')
                .update({
                  status: dbStatus,
                  sent_at: new Date().toISOString()
                })
                .eq('id', state.selectedEstimateId);

              if (error) {
                console.error('[App] Failed to update quote status:', error);
                alert('Failed to mark as sent. Please try again.');
                // Revert on error
                if (state.user?.id) {
                  await loadQuotesFromDatabase(state.user.id);
                }
                return;
              }
            } else {
              setState(prev => ({
                ...prev,
                currentScreen: 'JobCard'
              }));
            }
          }}
        />;

      case 'InvoicePreview':
        return selectedEstimate ? (
           <InvoicePreview
             estimate={selectedEstimate}
             userProfile={state.user || undefined}
             onBack={() => navigate('JobCard')}
             onEdit={() => setState(prev => ({ ...prev, currentScreen: 'EditEstimate', editReturnScreen: 'InvoicePreview' }))}
             onSend={() => setState(prev => ({...prev, currentScreen: 'SendEstimate', sendingType: 'invoice'}))}
             onDelete={() => handleDeleteEstimate(selectedEstimate.id)}
           />
        ) : null;
        
      default:
        return <div className="p-10 text-center">Screen not implemented yet</div>;
    }
  };

  if (state.loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <h1 className="text-[24px] font-bold text-primary">SMASH</h1>
          <p className="text-[14px] text-secondary mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderScreen()}
    </>
  );
};

export default App;