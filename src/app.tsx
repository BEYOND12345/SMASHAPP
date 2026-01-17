import React, { useState, useEffect, useRef } from 'react';
import { AppState, Estimate, Invoice, Customer, JobStatus, ScreenName, UserProfile } from './types';
import { Login } from './screens/login';
import { Signup } from './screens/signup';
import { Onboarding } from './screens/onboarding';
import { EstimatesList } from './screens/estimateslist';
import { InvoicesList } from './screens/invoiceslist';
import { CustomersList } from './screens/customerslist';
import { CustomerProfile } from './screens/customerprofile';
import { EditEstimate } from './screens/editestimate';
import { EstimatePreview } from './screens/estimatepreview';
import { JobCard } from './screens/jobcard';
import { InvoicePreview } from './screens/invoicepreview';
import { PublicQuoteView } from './screens/publicquoteview';
import { PublicInvoiceView } from './screens/publicinvoiceview';
import { Settings } from './screens/settings';
import { MaterialsCatalog } from './screens/materialscatalog';
import { VoiceQuotesList } from './screens/voicequoteslist';
import { VoiceRecorder } from './screens/voicerecorder';
import { Layout } from './components/layout';
import { ConfirmDialog } from './components/confirmdialog';
import { SendDrawer } from './components/senddrawer';
import { SendSuccessSheet } from './components/sendsuccesssheet';
import { SendingOverlay } from './components/sendingoverlay';
import { SendPreferenceSheet } from './components/sendpreferencesheet';
import { NoticeOverlay } from './components/noticeoverlay';
import { CustomerPickerSheet } from './components/customerpickersheet';
import { supabase } from './lib/supabase';
import { parsePublicRoute } from './lib/utils/routeHelpers';
import { buildPublicQuoteUrl } from './lib/utils/publicLinks';
import { generateEstimatePDF } from './lib/utils/pdfGenerator';
import { DocType, DeliveryMethod, getDefaultDeliveryMethod, getDeliveryMethod, setDeliveryMethod } from './lib/utils/deliveryPrefs';

const App: React.FC = () => {
  const [state, setState] = useState<AppState & { sendingType?: 'estimate' | 'invoice'; activeTab: 'estimates' | 'invoices' | 'customers'; editReturnScreen?: 'EstimatePreview' | 'InvoicePreview'; loading: boolean }>({
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
    loading: true
  });

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; estimateId: string | null }>({
    isOpen: false,
    estimateId: null
  });

  const [sendDrawer, setSendDrawer] = useState<{ 
    isOpen: boolean; 
    estimateId: string | null;
    type: 'estimate' | 'invoice';
  }>({
    isOpen: false,
    estimateId: null,
    type: 'estimate'
  });

  const [sendSuccess, setSendSuccess] = useState<{ 
    isOpen: boolean; 
    estimateId: string | null;
    intent: 'estimate' | 'approval' | null;
    type: 'estimate' | 'invoice';
  }>({
    isOpen: false,
    estimateId: null,
    intent: null,
    type: 'estimate'
  });

  const [sendingOverlay, setSendingOverlay] = useState<{
    isOpen: boolean;
    message: string;
    variant?: 'loading' | 'success';
  }>({
    isOpen: false,
    message: 'Sending…',
    variant: 'loading'
  });

  const [sendNotice, setSendNotice] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const [prefSheet, setPrefSheet] = useState<{ isOpen: boolean; docType: DocType }>({
    isOpen: false,
    docType: 'estimate'
  });

  const [customerPicker, setCustomerPicker] = useState<{ isOpen: boolean; quoteId: string | null }>({
    isOpen: false,
    quoteId: null
  });
  const signupGraceRef = useRef(0);
  const screenRef = useRef<ScreenName>('Login');

  useEffect(() => {
    screenRef.current = state.currentScreen;
  }, [state.currentScreen]);

  // Auto-dismiss success after 2000ms - stay on current screen instead of navigating away
  // Slightly longer so the user can actually see the success checkmark
  useEffect(() => {
    if (!sendSuccess.isOpen) return;

    const timeout = window.setTimeout(() => {
      setSendSuccess(prev => ({ ...prev, isOpen: false }));
      // Don't navigate away - let user stay where they are
      // They can use the back button if they want to return to the list
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [sendSuccess.isOpen]);

  const quoteToEstimate = (quoteData: any): Estimate => ({
    id: quoteData.id,
    customerId: quoteData.customer_id ?? quoteData.customer?.id ?? null,
    shortCode: quoteData.short_code ?? undefined,
    jobTitle: quoteData.title || 'Untitled Job',
    clientName: quoteData.customer?.name || 'No Customer',
    clientAddress: quoteData.site_address || '',
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
        catalogItemId: item.catalog_item_id ?? null,
        needsReview: !!item.is_needs_review,
        pricingNotes: item.notes ?? null,
        pricingSource: item.catalog_item_id
          ? 'catalog'
          : (typeof item.notes === 'string' && item.notes.toLowerCase().startsWith('ai estimated'))
            ? 'ai'
            : (typeof item.notes === 'string' && item.notes.toLowerCase().startsWith('default price'))
              ? 'fallback'
              : undefined,
      })) || [],
    labour: {
      hours: quoteData.line_items
        ?.filter((item: any) => item.item_type === 'labour')
        .reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
      rate: quoteData.line_items
        ?.find((item: any) => item.item_type === 'labour')?.unit_price_cents / 100 || 0,
    },
    additionalFees: quoteData.line_items
      ?.filter((item: any) => item.item_type === 'fee')
      .map((item: any) => ({
        id: item.id,
        description: item.description,
        amount: (typeof item.line_total_cents === 'number' ? item.line_total_cents : (item.unit_price_cents || 0) * (item.quantity || 1)) / 100,
      })) || [],
    status:
      quoteData.status === 'sent' ? JobStatus.SENT :
      quoteData.status === 'accepted' ? JobStatus.APPROVED :
      quoteData.status === 'approved' ? JobStatus.APPROVED :
      quoteData.status === 'paid' ? JobStatus.PAID :
      quoteData.status === 'declined' ? JobStatus.DECLINED :
      quoteData.status === 'expired' ? JobStatus.EXPIRED :
      quoteData.status === 'invoiced' ? JobStatus.INVOICED :
      JobStatus.DRAFT,
    sentIntent: quoteData.sent_intent ?? undefined,
    sentVia: quoteData.sent_via ?? undefined,
    approvalRequested: quoteData.approval_requested ?? undefined,
    approvalStatus: quoteData.approval_status ?? undefined,
    date: new Date(quoteData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    gstRate: quoteData.default_tax_rate || 0.10,
    currency: quoteData.default_currency || 'AUD',
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

      const estimates: Estimate[] = quotesData.map((q: any) => quoteToEstimate(q));

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

  // Fast-path: load a single quote by ID and upsert into state (prevents "No estimate found" after voice creation)
  const loadQuoteById = async (quoteId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: quoteData, error } = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers!customer_id(*),
          line_items:quote_line_items(*)
        `)
        .eq('id', quoteId)
        .maybeSingle();

      if (error) {
        console.error('[App] Failed to load quote by id:', error);
        return;
      }
      if (!quoteData) {
        console.warn('[App] Quote not found by id:', quoteId);
        return;
      }

      const estimate = quoteToEstimate(quoteData);
      setState(prev => ({
        ...prev,
        estimates: [estimate, ...prev.estimates.filter(e => e.id !== estimate.id)]
      }));
    } catch (e) {
      console.error('[App] Error loading quote by id:', e);
    }
  };

  // Fast-path: load a single invoice by ID and upsert into state (prevents blank/loader loops after invoice creation)
  const loadInvoiceById = async (invoiceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: invoiceData, error } = await supabase
        .from('invoices')
        .select(`
          *,
          quote:quotes!source_quote_id(
            *,
            customer:customers!customer_id(*)
          ),
          line_items:invoice_line_items(*)
        `)
        .eq('id', invoiceId)
        .maybeSingle();

      if (error) {
        console.error('[App] Failed to load invoice by id:', error);
        return;
      }
      if (!invoiceData) {
        console.warn('[App] Invoice not found by id:', invoiceId);
        return;
      }

      const dbStatus = invoiceData.status as 'draft' | 'issued' | 'sent' | 'paid' | 'overdue';
      let displayStatus = dbStatus;
      if ((dbStatus === 'issued' || dbStatus === 'sent') && invoiceData.due_date) {
        const dueDate = new Date(invoiceData.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dueDate < today) displayStatus = 'overdue';
      }

      const inv: Invoice = {
        id: invoiceData.id,
        shortCode: invoiceData.short_code || undefined,
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
          ?.filter((item: any) => item.item_type === 'material' || item.item_type === 'materials')
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

      setState(prev => ({
        ...prev,
        invoices: [inv, ...prev.invoices.filter(i => i.id !== inv.id)]
      }));
    } catch (e) {
      console.error('[App] Error loading invoice by id:', e);
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
          shortCode: invoiceData.short_code || undefined,
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
          ?.filter((item: any) => item.item_type === 'material' || item.item_type === 'materials')
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
        .is('deleted_at', null)
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

  const hardResetToLogin = async (reason: string) => {
    console.warn('[App] Forcing sign-out:', reason);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('[App] Sign-out error (non-fatal):', error);
    }
    setSendNotice({
      isOpen: true,
      title: 'Session reset required',
      message:
        'Your local database was reset, so your current login is no longer valid. Please sign in or sign up again.'
    });
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
      loading: false
    });
  };

  const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) =>
        window.setTimeout(() => reject(new Error(`Timeout while waiting for ${label}`)), ms)
      ),
    ]);
  };

  const validateSessionProfile = async (
    session: { user: { id: string } },
    authEvent?: string
  ) => {
    try {
      const userId = session.user.id;
      const signupPending =
        typeof window !== 'undefined' &&
        window.localStorage.getItem('smash.signupPending') === '1';
      if (authEvent === 'SIGNED_UP') {
        console.log('[App] Skipping profile validation for SIGNED_UP');
        return true;
      }
      if (signupPending) {
        console.log('[App] Skipping profile validation (signup pending)');
        return true;
      }
      let userData: { org_id: string | null } | null = null;
      let profileError: { message: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await supabase
          .from('users')
          .select('org_id')
          .eq('id', userId)
          .maybeSingle();
        userData = result.data as any;
        profileError = result.error as any;
        if (profileError) break;
        if (userData?.org_id) break;
        await sleep(500);
      }

      if (profileError) {
        console.warn('[App] User profile error (soft pass):', profileError.message);
        return true;
      }

      if (!userData?.org_id) {
        const now = Date.now();
        const inGrace = now < signupGraceRef.current;
        if (inGrace) {
          console.warn('[App] User profile missing org_id (grace period)');
          return true;
        }
        console.warn('[App] User profile missing org_id, routing to onboarding');
        setState(prev => ({ ...prev, currentScreen: 'Onboarding' }));
        return true;
      }

      return true;
    } catch (error: any) {
      const message = String(error?.message || 'unknown');
      console.warn('[App] Session validation failed (soft pass):', message);
      return true;
    }
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        console.log('[App] Initializing session...');
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 4000, 'auth.getSession()');

        if (session?.user) {
          console.log('[App] Session found for user:', session.user.id);
          const signupPending =
            typeof window !== 'undefined' &&
            window.localStorage.getItem('smash.signupPending') === '1';
          let isValid = true;
          try {
            isValid = await withTimeout(
              validateSessionProfile(session, 'INITIAL_SESSION'),
              4000,
              'validateSessionProfile(INITIAL_SESSION)'
            );
          } catch (e) {
            console.warn('[App] Session validation timed out (soft pass):', e);
            isValid = true;
          }
          if (!isValid) {
            return;
          }
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
            currentScreen: signupPending ? 'Onboarding' : 'EstimatesList',
            loading: false
          }));
          if (signupPending) {
            window.localStorage.removeItem('smash.signupPending');
          }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        console.log('[App] Auth state change - user logged in:', session.user.id);
        if (event === 'SIGNED_UP') {
          signupGraceRef.current = Date.now() + 8000;
        }
        const signupPending =
          typeof window !== 'undefined' &&
          window.localStorage.getItem('smash.signupPending') === '1';
        // Prevent stuck "Syncing" UI if validation hangs.
        setState(prev => {
          return prev.loading ? { ...prev, loading: false } : prev;
        });
        let isValid = true;
        try {
          isValid = await withTimeout(
            validateSessionProfile(session, event),
            4000,
            `validateSessionProfile(${event})`
          );
        } catch (e) {
          console.warn('[App] Session validation timed out (soft pass):', e);
          isValid = true;
        }
        if (!isValid) {
          return;
        }
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
          currentScreen: signupPending
            ? 'Onboarding'
            : (prev.currentScreen === 'Login' || prev.currentScreen === 'Signup' ? 'EstimatesList' : prev.currentScreen),
          loading: false
        }));
        if (signupPending) {
          window.localStorage.removeItem('smash.signupPending');
        }
      } else {
        // Only hard-reset on explicit sign out / delete.
        // Some auth events (e.g. SIGNED_UP with email confirmations) can have no session.
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          console.log('[App] Auth state change - user logged out:', event);
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
            loading: false
          });
        } else {
          console.log('[App] Auth state change - no session (non-logout):', event);
          setState(prev => ({ ...prev, loading: false }));
        }
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

  const handleLogout = async () => {
    const authTokenKey = (() => {
      try {
        const url = new URL(import.meta.env.VITE_SUPABASE_URL);
        const ref = url.hostname.split('.')[0];
        return `sb-${ref}-auth-token`;
      } catch {
        return null;
      }
    })();
    try {
      // Be explicit: clear the local session in this browser.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[App] Sign-out error (non-fatal):', e);
    }
    // Best-effort cleanup: clear any Supabase auth storage keys + app signup flag.
    try {
      if (authTokenKey) {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith(authTokenKey)) {
            window.localStorage.removeItem(key);
          }
        }
      }
      window.localStorage.removeItem('smash.signupPending');
    } catch {
      // ignore localStorage failures
    }
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
      loading: false
    });
  };

  // Actions
  const handleSelectEstimate = (id: string) => {
    // Clicking an estimate should open the estimate view (not a legacy/intermediate screen)
    setState(prev => ({ ...prev, selectedEstimateId: id, currentScreen: 'EstimatePreview' }));
  };

  const handleStatusChange = async (newStatus: JobStatus) => {
    const estimateId = state.selectedEstimateId;
    if (!estimateId) return;
    const localEstimate = state.estimates.find(e => e.id === estimateId);

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

      const closeSendingOverlay = () =>
        setSendingOverlay({ isOpen: false, message: 'Sending…', variant: 'loading' });

      // For approve → invoice creation, show a deliberate transition so it doesn’t feel abrupt.
      const approvalStartedAt = Date.now();
      if (dbStatus === 'accepted') {
        setSendingOverlay({ isOpen: true, message: 'Approving…', variant: 'loading' });
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
        closeSendingOverlay();
        // Revert optimistic update on error
        if (state.user?.id) {
          await loadQuotesFromDatabase(state.user.id);
        }
        return;
      }

      if (!quoteData) {
        console.error('[App] Quote not found');
        alert('Quote not found. Please try again.');
        closeSendingOverlay();
        if (state.user?.id) {
          await loadQuotesFromDatabase(state.user.id);
        }
        return;
      }

      const currentDbStatus = quoteData.status;

      // If no customer link yet, try to link from local estimate data before approval.
      let effectiveCustomerId: string | null = quoteData.customer_id || null;
      if (!effectiveCustomerId && localEstimate) {
        const linked = await ensureCustomerLink(localEstimate, estimateId);
        effectiveCustomerId = linked?.customerId || effectiveCustomerId;
      }

      // Fetch customer data separately (using effectiveCustomerId)
      const { data: customerData, error: customerError } = effectiveCustomerId
        ? await supabase
            .from('customers')
            .select('email, name, phone')
            .eq('id', effectiveCustomerId)
            .maybeSingle()
        : { data: null as any, error: null as any };

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
          closeSendingOverlay();
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
        closeSendingOverlay();
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
            closeSendingOverlay();

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
            const createdId =
              typeof invoiceId === 'string'
                ? invoiceId
                : (invoiceId as any)?.id || (Array.isArray(invoiceId) ? invoiceId[0] : null);

            if (!createdId) {
              console.warn('[App] Invoice created but id missing:', invoiceId);
              alert('Invoice created, but we could not load it. Please check the Invoices tab.');
              closeSendingOverlay();
              setState(prev => ({
                ...prev,
                currentScreen: 'EstimatesList',
                activeTab: 'invoices'
              }));
              return;
            }

            console.log('[App] Invoice created successfully:', createdId);
            await loadInvoiceById(createdId);

            // Minimum timing so the user witnesses the transition.
            const elapsed = Date.now() - approvalStartedAt;
            const remaining = Math.max(0, 800 - elapsed);
            if (remaining > 0) await sleep(remaining);

            setSendingOverlay({ isOpen: true, message: 'Approved', variant: 'success' });
            await sleep(450);

            // Success - navigate to invoice
            setState(prev => ({
              ...prev,
              currentScreen: 'InvoicePreview',
              activeTab: 'invoices',
              selectedInvoiceId: createdId,
              sendingType: 'invoice'
            }));
            closeSendingOverlay();
            return;
          }
        } catch (invoiceErr) {
          console.error('[App] Exception creating invoice:', invoiceErr);
          const errorMsg = invoiceErr instanceof Error ? invoiceErr.message : 'Unknown error';
          alert(`Quote approved successfully!\n\nHowever, invoice creation encountered an issue:\n${errorMsg}\n\nThe invoice can be created later from the job card.`);
          closeSendingOverlay();

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
      setSendingOverlay({ isOpen: false, message: 'Sending…', variant: 'loading' });
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
          tax_total_cents,
          grand_total_cents,
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
        tax_cents: quoteData.tax_total_cents,
        total_cents: quoteData.grand_total_cents,
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

      const createdId =
        typeof invoiceId === 'string'
          ? invoiceId
          : (invoiceId as any)?.id || (Array.isArray(invoiceId) ? invoiceId[0] : null);

      if (!createdId) {
        console.warn('[App] Invoice created but id missing:', invoiceId);
        alert('Invoice created, but we could not load it. Please check the Invoices tab.');
        setState(prev => ({ ...prev, currentScreen: 'EstimatesList', activeTab: 'invoices' }));
        return;
      }

      console.log('[App] Invoice created successfully:', createdId);

      // Reload invoice data to ensure it's available
      await loadInvoiceById(createdId);
      if (state.user?.id) {
        await loadQuotesFromDatabase(state.user.id);
      }

      // Navigate to InvoicePreview (more predictable than jumping straight to Send)
      setState(prev => ({
        ...prev,
        currentScreen: 'InvoicePreview',
        activeTab: 'invoices',
        selectedInvoiceId: createdId,
        sendingType: 'invoice'
      }));
    } catch (err) {
      console.error('[App] Exception in handleConvertToInvoiceDirectly:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to create invoice: ${errorMsg}`);
    }
  };

  const openSendDrawer = (id: string, type: 'estimate' | 'invoice' = 'estimate') => {
    setSendDrawer({ isOpen: true, estimateId: id, type });
  };

  const performQuickSend = async (args: {
    docType: DocType;
    docId: string;
    intent: 'estimate' | 'approval';
  }) => {
    const describeSendError = (err: any): { title: string; message: string } => {
      const rawMsg = String(err?.message || '');
      const lower = rawMsg.toLowerCase();

      // Supabase Functions errors often stash the real payload in err.context/body/response.
      const body =
        err?.context?.body ??
        err?.context?.response?.body ??
        err?.context?.response ??
        err?.body ??
        err?.data ??
        null;

      const bodyText =
        typeof body === 'string'
          ? body
          : body && typeof body === 'object'
            ? (body.error || body.message ? `${body.error || body.message}` : null)
            : null;

      const providerText =
        body && typeof body === 'object' && body.provider
          ? (() => {
              try {
                return `\n\n${JSON.stringify(body.provider)}`;
              } catch {
                return '';
              }
            })()
          : '';

      const looksLikeEmailConfig =
        lower.includes('email provider not configured') ||
        lower.includes('missing resend') ||
        lower.includes('resend_api_key') ||
        lower.includes('resend_from') ||
        String(bodyText || '').toLowerCase().includes('email provider not configured');

      if (looksLikeEmailConfig) {
        return {
          title: 'Send failed',
          message:
            `Email sending isn’t configured yet.\n\n` +
            `Quick dev fix (no real emails): add DEV_SKIP_EMAIL_SEND=true to supabase/functions/.env then restart Supabase.\n\n` +
            `Real email fix: add RESEND_API_KEY + RESEND_FROM to supabase/functions/.env then restart Supabase.`
        };
      }

      const msg =
        (bodyText ? `${bodyText}${providerText}` : '') ||
        (err?.details ? String(err.details) : '') ||
        rawMsg ||
        'Failed to send. Please try again.';

      return { title: 'Send failed', message: msg };
    };

    const { docType, docId, intent } = args;
    const kind = intent === 'estimate' ? 'pdf' : 'link';
    const preferredMethod: DeliveryMethod =
      getDeliveryMethod(docType, kind) || getDefaultDeliveryMethod(docType, kind);
    // Today: PDFs are emailed in the background (single default path).
    const method: DeliveryMethod = kind === 'pdf' ? 'email' : preferredMethod;

    const startedAt = Date.now();
    setSendingOverlay({ isOpen: true, message: 'Sending…', variant: 'loading' });

    try {
      const isInvoice = docType === 'invoice';
      const navAny = navigator as any;
      const sendDocumentEmail = async (payload: any) => {
        const looksLikeInvalidJwt = (status: number, json: any, text: string) => {
          const raw = `${text || ''} ${json ? JSON.stringify(json) : ''}`.toLowerCase();
          return status === 401 || status === 403 || raw.includes('invalid jwt') || raw.includes('jwt expired');
        };

        // Use the same env access pattern as supabase.ts (Vite replaces at build time)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Restart npm run dev after editing .env.local');
        }

        const baseUrl = String(supabaseUrl).replace(/\/+$/, '');
        const doFetch = async (token: string) => {
          const resp = await fetch(`${baseUrl}/functions/v1/send-document`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': String(supabaseAnonKey),
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          const text = await resp.text().catch(() => '');
          let json: any = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

          return { resp, text, json };
        };

        const { data: { session } } = await supabase.auth.getSession();
        let accessToken = session?.access_token;
        if (!accessToken) {
          // Attempt a refresh once (helps with stale local sessions)
          const { data } = await supabase.auth.refreshSession();
          accessToken = data.session?.access_token;
        }
        if (!accessToken) throw new Error('Not signed in');

        // Attempt #1
        let { resp, text, json } = await doFetch(accessToken);

        // Temporary patch: if JWT is invalid/expired, refresh and retry once.
        if (!resp.ok && looksLikeInvalidJwt(resp.status, json, text)) {
          const { data } = await supabase.auth.refreshSession();
          const nextToken = data.session?.access_token;
          if (nextToken) {
            ({ resp, text, json } = await doFetch(nextToken));
          }
        }

        if (!resp.ok) {
          const msg = json?.error || json?.message || text || `send-document failed (${resp.status})`;
          const provider = json?.provider ? `\n\n${JSON.stringify(json.provider)}` : '';
          // Make JWT errors readable (temporary)
          if (looksLikeInvalidJwt(resp.status, json, text)) {
            throw new Error('Session expired. Please refresh the app (or log out/in) and try again.');
          }
          throw new Error(`${msg}${provider}`);
        }

        if (json?.error) {
          const provider = json?.provider ? `\n\n${JSON.stringify(json.provider)}` : '';
          throw new Error(`${json.error}${provider}`);
        }
      };

      const estimate =
        docType === 'invoice'
          ? (invoiceToEstimate(state.invoices.find(i => i.id === docId) as any) as any)
          : (state.estimates.find(e => e.id === docId) as any);

      console.log('[App] performQuickSend: estimate object:', {
        docType,
        docId,
        estimateId: estimate?.id,
        clientEmail: estimate?.clientEmail,
        customerId: estimate?.customerId,
        clientName: estimate?.clientName
      });

      const shortCode =
        docType === 'invoice'
          ? state.invoices.find(i => i.id === docId)?.shortCode
          : state.estimates.find(e => e.id === docId)?.shortCode;

      const shareUrl = shortCode ? buildPublicQuoteUrl(shortCode, docType) : '';

      // Helper: blob -> base64 (no data: prefix)
      const blobToBase64 = (b: Blob) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onerror = () => reject(new Error('Failed to read file'));
          r.onload = () => {
            const s = String(r.result || '');
            const idx = s.indexOf('base64,');
            resolve(idx >= 0 ? s.slice(idx + 7) : s);
          };
          r.readAsDataURL(b);
        });

      const resolveCustomerEmail = async () => {
        let localEmail = (estimate?.clientEmail || '').trim();

        const quoteId = docType === 'invoice'
          ? state.invoices.find(i => i.id === docId)?.quoteId
          : docId;

        console.log('[App] resolveCustomerEmail START:', {
          docType,
          docId,
          quoteId,
          localEmail,
          estimateClientEmail: estimate?.clientEmail,
          estimateCustomerId: estimate?.customerId
        });

        // CRITICAL FIX: Always check the database for the latest customer_id first,
        // since handleEstimateSave may have just linked a customer but local state hasn't updated yet.
        let customerId: string | null = null;
        if (quoteId) {
          console.log('[App] Fetching latest customer_id from quotes table...');
          const { data } = await supabase
            .from('quotes')
            .select('customer_id')
            .eq('id', quoteId)
            .maybeSingle();
          customerId = data?.customer_id || null;
          console.log('[App] Fetched customer_id from quotes:', customerId);
        }

        // If there is no linked customer yet, but user entered an email, persist it by linking/creating customer.
        if (!customerId && estimate && quoteId && localEmail) {
          console.log('[App] No customerId but have localEmail, calling ensureCustomerLink...');
          const linked = await ensureCustomerLink({ ...estimate, clientEmail: localEmail }, quoteId);
          console.log('[App] ensureCustomerLink returned:', linked);
          if (linked?.customerId) customerId = linked.customerId;
          if (linked?.email) return linked.email;
          return localEmail;
        }

        // If there is no linked customer and no local email, still attempt best-effort linking (name/phone).
        if (!customerId && estimate && quoteId) {
          console.log('[App] No customerId and no localEmail, attempting best-effort link...');
          const linked = await ensureCustomerLink(estimate, quoteId);
          console.log('[App] best-effort ensureCustomerLink returned:', linked);
          if (linked?.customerId) customerId = linked.customerId;
          if (linked?.email) return linked.email;
        }

        let email = localEmail;
        if (customerId) {
          if (!localEmail) {
            const cached = state.customers.find(c => c.id === customerId)?.email;
            if (cached) {
              localEmail = String(cached).trim();
              console.log('[App] Using cached customer email from state:', localEmail);
            }
          }
          console.log('[App] Have customerId, fetching customer data...');
          const { data } = await supabase
            .from('customers')
            .select('email, name, phone')
            .eq('id', customerId)
            .maybeSingle();
          const dbEmail = (data?.email || '').trim();
          console.log('[App] Customer data fetched:', { dbEmail, localEmail, customerData: data });
          // If DB email is missing but user typed one, keep the typed value and persist it.
          if (!dbEmail && localEmail) {
            console.log('[App] DB email missing but have localEmail, persisting...');
            await ensureCustomerLink({ ...estimate, customerId, clientEmail: localEmail }, quoteId || docId);
            email = localEmail;
          } else {
            email = dbEmail;
          }

          if (email) {
            setState(prev => ({
              ...prev,
              estimates: prev.estimates.map(e =>
                e.id === docId || e.id === quoteId
                  ? { ...e, customerId, clientEmail: email, clientName: data?.name || e.clientName, clientPhone: data?.phone || e.clientPhone }
                  : e
              )
            }));
          }
        }

        console.log('[App] resolveCustomerEmail FINAL:', email);
        return email;
      };

      const customerEmail = await resolveCustomerEmail();

      if (intent === 'estimate') {
        // PDF send via background email (no native chooser).
        if (!customerEmail) {
          setSendingOverlay(prev => ({ ...prev, isOpen: false }));
          setSendNotice({
            isOpen: true,
            title: 'Can’t send yet',
            message: 'This customer has no email address. Add an email on the quote, then tap Send again.'
          });
          return;
        }

        const pdfBlob = await generateEstimatePDF(estimate, state.user || undefined, docType);
        const fileName = docType === 'invoice'
          ? `Invoice #${docId.substring(0, 6).toUpperCase()}.pdf`
          : `Estimate #${docId.substring(0, 6).toUpperCase()}.pdf`;
        const b64 = await blobToBase64(pdfBlob);

        await sendDocumentEmail({
          to: customerEmail,
          subject: docType === 'invoice' ? `Invoice from ${state.user?.businessName || 'SMASH'}` : `Estimate from ${state.user?.businessName || 'SMASH'}`,
          text: docType === 'invoice'
            ? 'Please find your invoice attached.'
            : 'Please find your estimate attached.',
          attachments: [{ filename: fileName, content: b64, contentType: 'application/pdf' }],
        });
      } else {
        // Link send via background email (default) or other methods if user selected.
        if (!shareUrl) throw new Error('Link not ready yet. Try again.');

        if (method === 'copy') {
          await navigator.clipboard.writeText(shareUrl);
        } else if (method === 'sms') {
          setSendingOverlay(prev => ({ ...prev, isOpen: false }));
          const body = encodeURIComponent(`${isInvoice ? 'View invoice:' : 'Please review and approve:'} ${shareUrl}`);
          window.location.href = `sms:&body=${body}`;
        } else if (method === 'share') {
          setSendingOverlay(prev => ({ ...prev, isOpen: false }));
          await (navigator as any).share?.({ url: shareUrl });
        } else {
          // email (default) via background send if we have customer email, otherwise mailto.
          if (customerEmail) {
            await sendDocumentEmail({
              to: customerEmail,
              subject: isInvoice ? 'Invoice link' : 'Estimate for approval',
              text: `${isInvoice ? 'View invoice:' : 'Review and approve:'}\n\n${shareUrl}`,
            });
          } else {
            setSendingOverlay(prev => ({ ...prev, isOpen: false }));
            const subject = encodeURIComponent(isInvoice ? 'Invoice link' : 'Estimate for approval');
            const body = encodeURIComponent(`${isInvoice ? 'View invoice:' : 'Review and approve:'}\n\n${shareUrl}`);
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
          }
        }
      }

      // Minimum timing (feels intentional)
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 800 - elapsed);
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

      // DB updates (same as drawer)
      const patch: any = {
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_via: method,
        sent_intent: intent,
      };

      if (docType === 'estimate') {
        if (intent === 'approval') {
          patch.approval_requested = true;
          patch.approval_sent_at = new Date().toISOString();
          patch.approval_status = 'awaiting';
        }
        await supabase.from('quotes').update(patch).eq('id', docId);
        setState(prev => ({
          ...prev,
          selectedEstimateId: docId,
          estimates: prev.estimates.map(e =>
            e.id === docId
              ? {
                  ...e,
                  status: JobStatus.SENT,
                  sentIntent: intent,
                  sentVia: method as any,
                  approvalRequested: intent === 'approval' ? true : e.approvalRequested,
                  approvalStatus: intent === 'approval' ? 'awaiting' : e.approvalStatus,
                }
              : e
          ),
        }));
      } else {
        await supabase.from('invoices').update({ status: 'sent', sent_at: patch.sent_at }).eq('id', docId);
        setState(prev => ({
          ...prev,
          selectedInvoiceId: docId,
          invoices: prev.invoices.map(i => (i.id === docId ? { ...i, status: 'sent' } : i)),
        }));
      }

      // Brief success state so the transition feels intentional.
      setSendingOverlay({ isOpen: true, message: 'Sent', variant: 'success' });
      await sleep(400);
      setSendingOverlay({ isOpen: false, message: 'Sending…', variant: 'loading' });
      setSendSuccess({ isOpen: true, estimateId: docId, intent, type: docType });
    } catch (e) {
      // If the user cancels the OS share sheet, do nothing (no error modal).
      if ((e as any)?.name === 'AbortError') {
        setSendingOverlay({ isOpen: false, message: 'Sending…', variant: 'loading' });
        return;
      }

      setSendingOverlay({ isOpen: false, message: 'Sending…', variant: 'loading' });
      console.error('[App] quick send failed:', e);
      const { title, message } = describeSendError(e);
      setSendNotice({
        isOpen: true,
        title,
        message
      });
    }
  };

  const handleDeleteEstimate = async (estimateId: string) => {
    setDeleteConfirmation({ isOpen: true, estimateId });
  };

  const confirmDeleteEstimate = async () => {
    const estimateId = deleteConfirmation.estimateId;
    if (!estimateId) {
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
    } finally {
      setDeleteConfirmation({ isOpen: false, estimateId: null });
    }
  };

  const handleEstimateSave = async (updatedEstimate: Estimate, returnScreen: 'EstimatePreview' | 'InvoicePreview' = 'EstimatePreview') => {
    try {
      console.log('[App] Saving estimate:', updatedEstimate.id);
      
      // Update local state first for immediate UI response
      setState(prev => ({
        ...prev,
        estimates: prev.estimates.map(e => e.id === updatedEstimate.id ? updatedEstimate : e),
        currentScreen: returnScreen
      }));

      // Map local Estimate object back to database schema
      const updatePayload: Record<string, any> = {
        title: updatedEstimate.jobTitle,
        site_address: updatedEstimate.clientAddress || null,
        // Note: line items are updated separately via triggers or RPCs if we were doing a full sync,
        // but for now we at least update the header fields.
      };

      // Avoid status writes when editing from InvoicePreview (invoiced quotes are locked server-side).
      if (returnScreen !== 'InvoicePreview') {
        updatePayload.status =
          updatedEstimate.status === JobStatus.DRAFT ? 'draft' :
          updatedEstimate.status === JobStatus.SENT ? 'sent' :
          updatedEstimate.status === JobStatus.APPROVED ? 'accepted' :
          updatedEstimate.status === JobStatus.PAID ? 'paid' :
          updatedEstimate.status === JobStatus.DECLINED ? 'declined' :
          updatedEstimate.status === JobStatus.EXPIRED ? 'expired' :
          updatedEstimate.status === JobStatus.INVOICED ? 'invoiced' : 'draft';
      }

      const { error } = await supabase
        .from('quotes')
        .update(updatePayload)
        .eq('id', updatedEstimate.id);

      if (error) {
        console.error('[App] Failed to save estimate to database:', error);
        alert(`Failed to save changes: ${error.message}`);
        return;
      }

      // IMPORTANT: persist contact info to a real customer record.
      // Sending/approval reads from the customer table, so typed emails must be saved there.
      const hasContact =
        (updatedEstimate.clientName && updatedEstimate.clientName.trim()) ||
        (updatedEstimate.clientEmail && updatedEstimate.clientEmail.trim()) ||
        (updatedEstimate.clientPhone && updatedEstimate.clientPhone.trim());

      console.log('[App] handleEstimateSave: checking contact persistence', {
        hasContact,
        clientEmail: updatedEstimate.clientEmail,
        customerId: updatedEstimate.customerId,
        estimateId: updatedEstimate.id
      });

      if (hasContact) {
        console.log('[App] handleEstimateSave: calling ensureCustomerLink...');
        const result = await ensureCustomerLink(updatedEstimate, updatedEstimate.id);
        console.log('[App] handleEstimateSave: ensureCustomerLink result:', result);
        
        // CRITICAL: Update local state immediately with the customerId to avoid race conditions
        // when user quickly navigates to preview and tries to send.
        if (result?.customerId && result.customerId !== updatedEstimate.customerId) {
          console.log('[App] handleEstimateSave: updating local state with new customerId:', result.customerId);
          setState(prev => ({
            ...prev,
            estimates: prev.estimates.map(e =>
              e.id === updatedEstimate.id
                ? {
                    ...e,
                    customerId: result.customerId,
                    clientEmail: result.email || e.clientEmail,
                    clientName: result.name || e.clientName,
                    clientPhone: result.phone || e.clientPhone,
                  }
                : e
            )
          }));
        }

        // Keep local customer list in sync so CustomerProfile shows latest email/phone.
        if (result?.customerId) {
          setState(prev => {
            const exists = prev.customers.some(c => c.id === result.customerId);
            const nextCustomers = exists
              ? prev.customers.map(c =>
                  c.id === result.customerId
                    ? {
                        ...c,
                        name: result.name || c.name,
                        email: result.email || c.email,
                        phone: result.phone || c.phone,
                      }
                    : c
                )
              : [
                  {
                    id: result.customerId,
                    name: result.name || updatedEstimate.clientName || 'Customer',
                    email: result.email || updatedEstimate.clientEmail || undefined,
                    phone: result.phone || updatedEstimate.clientPhone || undefined,
                    company_name: undefined,
                    notes: undefined,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  } as Customer,
                  ...prev.customers,
                ];

            return {
              ...prev,
              customers: nextCustomers,
            };
          });
        }
      }
    } catch (err) {
      console.error('[App] Exception in handleEstimateSave:', err);
    }
  };

  async function ensureCustomerLink(estimate: Estimate, quoteId: string) {
    const hasContact =
      (estimate.clientName && estimate.clientName.trim()) ||
      (estimate.clientEmail && estimate.clientEmail.trim()) ||
      (estimate.clientPhone && estimate.clientPhone.trim());

    console.log('[App] ensureCustomerLink called:', {
      quoteId,
      hasContact,
      clientEmail: estimate.clientEmail,
      clientName: estimate.clientName,
      customerId: estimate.customerId
    });

    if (!hasContact) {
      console.log('[App] ensureCustomerLink: no contact info, returning null');
      return null;
    }
    // If we already have a linked customer, make sure their contact info is actually saved.
    // This prevents "I typed an email, it looked saved, but send says missing" race conditions.
    if (estimate.customerId) {
      const desiredEmail = estimate.clientEmail?.trim() || null;
      const desiredName = estimate.clientName?.trim() || null;
      const desiredPhone = estimate.clientPhone?.trim() || null;

      console.log('[App] ensureCustomerLink: updating existing customer:', {
        customerId: estimate.customerId,
        desiredEmail,
        desiredName,
        desiredPhone
      });

      const { error: custErr } = await supabase
        .from('customers')
        .update({
          name: desiredName,
          email: desiredEmail,
          phone: desiredPhone,
        })
        .eq('id', estimate.customerId);

      if (custErr) {
        console.warn('[App] Failed to update existing customer contact info (non-fatal):', custErr);
        // WORKAROUND: If update fails due to missing database function (local dev issue),
        // try using RPC with service role to bypass the trigger
        if (custErr.message?.includes('check_if_customer_synced') || custErr.code === '42883') {
          console.log('[App] Attempting workaround: updating via direct SQL...');
          try {
            const { error: rpcErr } = await supabase.rpc('update_customer_contact_info', {
              p_customer_id: estimate.customerId,
              p_name: desiredName,
              p_email: desiredEmail,
              p_phone: desiredPhone
            });
            if (rpcErr) {
              console.warn('[App] RPC fallback also failed:', rpcErr);
              // Last resort: The customer exists but can't be updated.
              // We'll let the send flow handle it by fetching what's in the DB.
            } else {
              console.log('[App] Successfully updated customer via RPC fallback');
            }
          } catch (e) {
            console.warn('[App] Exception in RPC fallback:', e);
          }
        }
      } else {
        console.log('[App] Successfully updated existing customer contact info');
      }

      return {
        customerId: estimate.customerId,
        email: desiredEmail || '',
        name: estimate.clientName,
        phone: desiredPhone || ''
      };
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      const orgId = userData?.org_id;
      if (!orgId) return null;

      const email = estimate.clientEmail?.trim() || null;
      const name = estimate.clientName?.trim() || 'Customer';

      let matched = null as any;
      if (email) {
        const { data } = await supabase
          .from('customers')
          .select('id, name, email, phone')
          .eq('org_id', orgId)
          .eq('email', email)
          .maybeSingle();
        matched = data || null;
      }
      if (!matched && name) {
        const { data } = await supabase
          .from('customers')
          .select('id, name, email, phone')
          .eq('org_id', orgId)
          .eq('name', name)
          .maybeSingle();
        matched = data || null;
      }

      let customerId = matched?.id || null;
      if (!customerId) {
        const { data: created, error: createErr } = await supabase
          .from('customers')
          .insert({
            org_id: orgId,
            name,
            email,
            phone: estimate.clientPhone?.trim() || null,
          })
          .select('id, name, email, phone')
          .single();
        if (createErr) {
          console.warn('[App] Failed to create customer (non-fatal):', createErr);
          return null;
        }
        customerId = created?.id || null;
        matched = created;
      }

      if (!customerId) return null;

      const { error: linkErr } = await supabase
        .from('quotes')
        .update({ customer_id: customerId })
        .eq('id', quoteId);
      if (linkErr) {
        console.warn('[App] Failed to link customer to quote (non-fatal):', linkErr);
        return null;
      }

      // Don't update state here - let the caller do it to avoid race conditions
      return {
        customerId,
        email: matched?.email || email || '',
        name: matched?.name || name,
        phone: matched?.phone || estimate.clientPhone || '',
      };
    } catch (e) {
      console.warn('[App] Failed to auto-link customer (non-fatal):', e);
      return null;
    }
  }

  const invoiceToEstimate = (inv: Invoice): Estimate => ({
    id: inv.id,
    shortCode: inv.shortCode,
    jobTitle: inv.jobTitle || 'Invoice',
    clientName: inv.clientName || '',
    clientAddress: inv.clientAddress || '',
    clientEmail: inv.clientEmail || '',
    clientPhone: inv.clientPhone || '',
    status:
      inv.status === 'paid' ? JobStatus.PAID :
      inv.status === 'sent' || inv.status === 'issued' ? JobStatus.APPROVED :
      JobStatus.DRAFT,
    date: inv.date,
    timeline: inv.dueDate ? `Due: ${inv.dueDate}` : '',
    scopeOfWork: [],
    materials: inv.materials || [],
    labour: inv.labour || { hours: 0, rate: 0 },
    gstRate: inv.gstRate || 0.10,
  });

  const getSelectedEstimate = () => state.estimates.find(e => e.id === state.selectedEstimateId);
  const getSelectedInvoice = () => state.invoices.find(i => i.id === state.selectedInvoiceId);
  const getSelectedCustomer = () => state.customers.find(c => c.id === state.selectedCustomerId);

  useEffect(() => {
    const needsEstimate =
      (state.currentScreen === 'EstimatePreview' || state.currentScreen === 'EditEstimate') &&
      !!state.selectedEstimateId;

    if (needsEstimate) {
      const exists = state.estimates.some(e => e.id === state.selectedEstimateId);
      if (!exists && state.selectedEstimateId) loadQuoteById(state.selectedEstimateId);
    }
  }, [state.currentScreen, state.selectedEstimateId, state.estimates]);

  useEffect(() => {
    const needsInvoice =
      (state.currentScreen === 'InvoicePreview') &&
      !!state.selectedInvoiceId;

    if (needsInvoice) {
      const exists = state.invoices.some(i => i.id === state.selectedInvoiceId);
      if (!exists && state.selectedInvoiceId) loadInvoiceById(state.selectedInvoiceId);
    }
  }, [state.currentScreen, state.selectedInvoiceId, state.invoices]);

  const handleSelectCustomer = (id: string) => {
    setState(prev => ({ ...prev, selectedCustomerId: id, currentScreen: 'CustomerProfile' }));
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      console.log('[App] Soft deleting customer:', customerId);

      const { error } = await supabase
        .from('customers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', customerId);

      if (error) {
        console.error('[App] Failed to delete customer:', error);
        alert(`Failed to delete customer: ${error.message}`);
        return;
      }

      console.log('[App] Customer soft deleted successfully');

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
    const selectedInvoice = getSelectedInvoice();
    const selectedInvoiceAsEstimate = selectedInvoice ? invoiceToEstimate(selectedInvoice) : null;

    return (
      <div key={state.currentScreen} className="animate-in fade-in duration-300 h-full w-full">
        {(() => {
          switch (state.currentScreen) {
            case 'Login':
              return <Login onLogin={handleLogin} onSignupClick={() => navigate('Signup')} />;

            case 'Signup':
              return (
                <Signup
                  onSignup={handleSignup}
                  onBack={() => navigate('Login')}
                  onAlreadySignedIn={(target) => navigate(target)}
                />
              );

            case 'Onboarding':
              return <Onboarding onComplete={handleOnboardingComplete} />;

            case 'Settings':
              return <Settings onBack={() => navigate('EstimatesList')} onNavigate={navigate} onLogout={handleLogout} />;

            case 'MaterialsCatalog':
              return <MaterialsCatalog onBack={() => navigate('Settings')} />;

            case 'VoiceRecorder':
              return (
                <VoiceRecorder
                  onBack={() => navigate('EstimatesList')}
                  activeTab={state.activeTab}
                  onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab, currentScreen: 'EstimatesList' }))}
                  onProfileClick={() => navigate('Settings')}
                  onQuoteCreated={async (quoteId) => {
                    console.log('[App] Quote created from voice, navigating to edit:', quoteId);
                    await loadQuoteById(quoteId);
                    setState(prev => ({
                      ...prev,
                      selectedEstimateId: quoteId,
                      currentScreen: 'EditEstimate',
                      editReturnScreen: prev.editReturnScreen
                    }));
                    if (state.user?.id) {
                      loadQuotesFromDatabase(state.user.id);
                    }
                  }}
                />
              );

            case 'VoiceQuotesList':
              return <VoiceQuotesList
                onProfileClick={() => navigate('Settings')}
                activeTab={state.activeTab}
                onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab, currentScreen: 'EstimatesList' }))}
                onNewRecord={() => navigate('VoiceRecorder')}
              />;

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
                  onNewEstimate={() => navigate('VoiceRecorder')}
                  onSelectEstimate={handleSelectEstimate}
                  activeTab={state.activeTab}
                  onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab }))}
                  onProfileClick={() => navigate('Settings')}
                  onQuickRecord={() => navigate('VoiceRecorder')}
                />
              ) : state.activeTab === 'invoices' ? (
                <InvoicesList
                  invoices={state.invoices}
                  onNewEstimate={() => navigate('VoiceRecorder')}
                  onQuickRecord={() => navigate('VoiceRecorder')}
                  onSelectInvoice={(id) => setState(prev => ({ ...prev, selectedInvoiceId: id, currentScreen: 'InvoicePreview', activeTab: 'invoices' }))}
                  activeTab={state.activeTab}
                  onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab }))}
                  onProfileClick={() => navigate('Settings')}
                />
              ) : (
                <CustomersList
                  customers={state.customers}
                  onNewEstimate={() => navigate('VoiceRecorder')}
                  onSelectCustomer={handleSelectCustomer}
                  activeTab={state.activeTab}
                  onTabChange={(tab) => setState(prev => ({ ...prev, activeTab: tab }))}
                  onProfileClick={() => navigate('Settings')}
                />
              );

            case 'CustomerProfile': {
              const selectedCustomer = getSelectedCustomer();
              return selectedCustomer ? (
                <CustomerProfile
                  customer={selectedCustomer}
                  quotes={state.estimates}
                  invoices={state.invoices}
                  onBack={() => setState(prev => ({ ...prev, currentScreen: 'EstimatesList', activeTab: 'customers' }))}
                  onNewQuote={() => navigate('VoiceRecorder')}
                  onSelectQuote={(id) => setState(prev => ({ ...prev, selectedEstimateId: id, currentScreen: 'EstimatePreview' }))}
                  onSelectInvoice={(id) => setState(prev => ({ ...prev, selectedInvoiceId: id, currentScreen: 'InvoicePreview' }))}
                  onDeleteCustomer={handleDeleteCustomer}
                />
              ) : null;
            }
            
            case 'EditEstimate': {
              const isEditingInvoice = state.editReturnScreen === 'InvoicePreview';
              const invoiceForEdit = isEditingInvoice
                ? state.invoices.find(i => i.id === state.selectedInvoiceId)
                : null;
              const sourceQuoteId = invoiceForEdit?.quoteId;
              const linkedQuote = sourceQuoteId
                ? state.estimates.find(e => e.id === sourceQuoteId)
                : undefined;

              const editableEstimate = isEditingInvoice
                ? (selectedInvoiceAsEstimate
                    ? {
                        ...selectedInvoiceAsEstimate,
                        // Ensure we save back to the source quote, not the invoice ID.
                        id: sourceQuoteId || selectedInvoiceAsEstimate.id,
                        customerId: linkedQuote?.customerId ?? selectedInvoiceAsEstimate.customerId ?? null,
                      }
                    : null)
                : selectedEstimate;

              if (isEditingInvoice && !sourceQuoteId) {
                return (
                  <Layout showNav={false}>
                    <div className="flex-1 flex items-center justify-center bg-[#FAFAFA]">
                      <div className="text-center px-6">
                        <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em]">Invoice not linked</p>
                        <p className="mt-3 text-[14px] font-medium text-slate-600">
                          This invoice isn’t linked to a quote yet, so it can’t be edited here.
                        </p>
                        <button
                          onClick={() => navigate('InvoicePreview')}
                          className="mt-6 inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900 text-white text-[12px] font-bold uppercase tracking-widest"
                        >
                          Back to Invoice
                        </button>
                      </div>
                    </div>
                  </Layout>
                );
              }

              if (!editableEstimate) {
                return (
                  <Layout showNav={false}>
                    <div className="flex-1 flex items-center justify-center bg-[#FAFAFA]">
                      <div className="text-center">
                        <div className="w-10 h-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-[13px] font-black text-slate-400 uppercase tracking-[0.2em]">
                          {isEditingInvoice ? 'Loading invoice' : 'Loading quote'}
                        </p>
                      </div>
                    </div>
                  </Layout>
                );
              }

              return (
                <EditEstimate
                  estimate={editableEstimate}
                  returnScreen={state.editReturnScreen}
                  onBack={() => navigate(state.editReturnScreen || 'EstimatesList')}
                  onSave={async (estimate) => {
                    await handleEstimateSave(estimate, state.editReturnScreen);
                    if (isEditingInvoice && state.selectedInvoiceId) {
                      await loadInvoiceById(state.selectedInvoiceId);
                    }
                  }}
                  onChangeCustomer={() => {
                    const quoteIdForCustomer = editableEstimate.id;
                    if (!quoteIdForCustomer) return;
                    setCustomerPicker({ isOpen: true, quoteId: quoteIdForCustomer });
                  }}
                  onSend={async (estimate) => {
                    // PREVIEW (label-only change): save + navigate to preview.
                    // Sending only happens from the Preview screen.
                    const target = isEditingInvoice ? 'InvoicePreview' : 'EstimatePreview';
                    await handleEstimateSave(estimate, target);
                    if (isEditingInvoice && state.selectedInvoiceId) {
                      await loadInvoiceById(state.selectedInvoiceId);
                    }
                    navigate(target);
                  }}
                />
              );
            }

            case 'EstimatePreview':
              return selectedEstimate ? (
                <EstimatePreview
                  estimate={selectedEstimate}
                  userProfile={state.user || undefined}
                  onBack={() => navigate('EstimatesList')}
                  onEdit={() => setState(prev => ({ ...prev, currentScreen: 'EditEstimate', editReturnScreen: 'EstimatePreview' }))}
                  onChangeCustomer={() => setCustomerPicker({ isOpen: true, quoteId: selectedEstimate.id })}
                  onSend={() => selectedEstimate && openSendDrawer(selectedEstimate.id, 'estimate')}
                  onStatusChange={handleStatusChange}
                  onViewInvoice={() => navigate('InvoicePreview')}
                  onDelete={() => handleDeleteEstimate(selectedEstimate.id)}
                />
              ) : (
                <Layout showNav={false}>
                  <div className="flex-1 flex items-center justify-center bg-[#FAFAFA]">
                    <div className="text-center">
                      <div className="w-10 h-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-[13px] font-black text-slate-400 uppercase tracking-[0.2em]">Loading estimate</p>
                    </div>
                  </div>
                </Layout>
              );

            case 'JobCard':
              return selectedEstimate ? (
                <JobCard 
                  estimate={selectedEstimate} 
                  onBack={() => navigate('EstimatesList')} 
                  onViewEstimate={() => navigate('EstimatePreview')}
                  onViewInvoice={() => navigate('InvoicePreview')}
                  // One-tap send (mirrors estimate)
                  onSendInvoice={() => selectedEstimate && performQuickSend({ docType: 'invoice', docId: selectedEstimate.id, intent: 'estimate' })}
                  onStatusChange={handleStatusChange}
                />
              ) : null;

            case 'InvoicePreview':
              return selectedInvoiceAsEstimate ? (
                 <InvoicePreview
                   estimate={selectedInvoiceAsEstimate}
                   userProfile={state.user || undefined}
                   onBack={() => navigate('EstimatesList')}
                   onEdit={() => setState(prev => ({ ...prev, currentScreen: 'EditEstimate', editReturnScreen: 'InvoicePreview' }))}
                   onSend={() => selectedInvoiceAsEstimate && openSendDrawer(selectedInvoiceAsEstimate.id, 'invoice')}
                   onDelete={() => handleDeleteEstimate(selectedInvoiceAsEstimate.id)}
                   invoiceStatus={state.invoices.find(i => i.id === selectedInvoiceAsEstimate.id)?.status}
                 />
              ) : (
                <Layout showNav={false}>
                  <div className="flex-1 flex items-center justify-center bg-[#FAFAFA]">
                    <div className="text-center">
                      <div className="w-10 h-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-[13px] font-black text-slate-400 uppercase tracking-[0.2em]">Loading invoice</p>
                    </div>
                  </div>
                </Layout>
              );
              
            default:
              return <div className="p-10 text-center">Screen not implemented yet</div>;
          }
        })()}
      </div>
    );
  };

  if (state.loading) {
    return (
      <Layout showNav={false}>
        <div className="flex-1 flex flex-col items-center justify-center bg-[#FAFAFA]">
          <div className="text-center">
            <h1 className="text-[28px] font-black text-slate-900 tracking-tighter uppercase flex items-center justify-center gap-1.5 mb-1">
              <span>SMASH</span>
              <span className="w-[6px] h-[6px] rounded-full bg-accent mt-2 shadow-[0_0_15px_rgba(212,255,0,0.6)]" />
            </h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Syncing</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <>
      {renderScreen()}
      <SendingOverlay
        isOpen={sendingOverlay.isOpen}
        message={sendingOverlay.message}
        variant={sendingOverlay.variant}
      />
      <NoticeOverlay
        isOpen={sendNotice.isOpen}
        title={sendNotice.title}
        message={sendNotice.message}
        variant="error"
        onClose={() => setSendNotice(prev => ({ ...prev, isOpen: false }))}
      />
      <ConfirmDialog
        isOpen={deleteConfirmation.isOpen}
        title="Delete Estimate"
        message="Are you sure you want to delete this estimate? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteEstimate}
        onCancel={() => setDeleteConfirmation({ isOpen: false, estimateId: null })}
      />
      {sendDrawer.isOpen && sendDrawer.estimateId && (
        <SendDrawer
          isOpen={sendDrawer.isOpen}
          type={sendDrawer.type}
          estimate={
            (sendDrawer.type === 'invoice' 
              ? state.invoices.find(i => i.id === sendDrawer.estimateId)
              : state.estimates.find(e => e.id === sendDrawer.estimateId)) as any
          }
          shortCode={
            (sendDrawer.type === 'invoice' 
              ? state.invoices.find(i => i.id === sendDrawer.estimateId)?.shortCode
              : state.estimates.find(e => e.id === sendDrawer.estimateId)?.shortCode) || null
          }
          customerName={
            (sendDrawer.type === 'invoice' 
              ? state.invoices.find(i => i.id === sendDrawer.estimateId)?.clientName
              : state.estimates.find(e => e.id === sendDrawer.estimateId)?.clientName)
          }
          onClose={() => setSendDrawer({ isOpen: false, estimateId: null, type: 'estimate' })}
          onPrimarySend={async (intent) => {
            const documentId = sendDrawer.estimateId;
            const docType = sendDrawer.type;
            if (!documentId) return;
            // Use the existing one-tap background send (PDF email or secure link).
            await performQuickSend({
              docType,
              docId: documentId,
              intent: intent === 'approval' ? 'approval' : 'estimate',
            });
          }}
        />
      )}
      {sendSuccess.isOpen && sendSuccess.estimateId && (
        <SendSuccessSheet
          isOpen={sendSuccess.isOpen}
          type={sendSuccess.type}
          onClose={() => {
            // Just close - don't navigate away to prevent "reset" feeling
            setSendSuccess(prev => ({ ...prev, isOpen: false }));
          }}
          intent={sendSuccess.intent || 'estimate'}
          customerName={
            sendSuccess.type === 'invoice'
              ? state.invoices.find(i => i.id === sendSuccess.estimateId)?.clientName
              : state.estimates.find(e => e.id === sendSuccess.estimateId)?.clientName
          }
          onViewEstimate={() => {
            setSendSuccess(prev => ({ ...prev, isOpen: false }));
            // We are already on the preview screen
          }}
          onApproveToInvoice={async () => {
            setSendSuccess(prev => ({ ...prev, isOpen: false }));
          }}
        />
      )}
      <CustomerPickerSheet
        isOpen={customerPicker.isOpen}
        currentCustomerId={
          customerPicker.quoteId
            ? state.estimates.find(e => e.id === customerPicker.quoteId)?.customerId || undefined
            : undefined
        }
        onClose={() => setCustomerPicker({ isOpen: false, quoteId: null })}
        onSelectCustomer={async (customerId, customerName) => {
          const quoteId = customerPicker.quoteId;
          if (!quoteId) {
            setCustomerPicker({ isOpen: false, quoteId: null });
            return;
          }

          // For new customers (just created), refresh the customers list first
          let chosen = customerId ? state.customers.find(c => c.id === customerId) : undefined;
          
          // If customer not found in local state but we have an ID, it's newly created
          // Fetch their details from the database
          if (customerId && !chosen) {
            try {
              const { data: newCustomer } = await supabase
                .from('customers')
                .select('*')
                .eq('id', customerId)
                .maybeSingle();
              
              if (newCustomer) {
                chosen = {
                  id: newCustomer.id,
                  name: newCustomer.name,
                  email: newCustomer.email,
                  phone: newCustomer.phone,
                  company_name: newCustomer.company_name,
                  notes: newCustomer.notes,
                  created_at: newCustomer.created_at,
                  updated_at: newCustomer.updated_at
                };
                // Add to customers state
                setState(prev => ({
                  ...prev,
                  customers: [chosen!, ...prev.customers.filter(c => c.id !== customerId)]
                }));
              }
            } catch (e) {
              console.warn('[App] Failed to fetch new customer details:', e);
            }
          }

          // Close the sheet first
          setCustomerPicker({ isOpen: false, quoteId: null });

          // Optimistic update (so the header updates immediately)
          setState(prev => ({
            ...prev,
            estimates: prev.estimates.map(e =>
              e.id !== quoteId
                ? e
                : {
                    ...e,
                    customerId: customerId || null,
                    clientName: customerId ? (chosen?.name || customerName || e.clientName) : 'No Customer',
                    clientEmail: customerId ? (chosen?.email || '') : '',
                    clientPhone: customerId ? (chosen?.phone || '') : '',
                  }
            )
          }));

          // Update database in background - don't await to prevent UI blocking
          supabase
            .from('quotes')
            .update({ customer_id: customerId ? customerId : null })
            .eq('id', quoteId)
            .then(({ error }) => {
              if (error) {
                console.warn('[App] Failed to update quote customer_id:', error);
              }
            });
          
          // Don't reload quote - trust the optimistic update to prevent "reset" feeling
        }}
      />
      <SendPreferenceSheet
        isOpen={prefSheet.isOpen}
        onClose={() => setPrefSheet(prev => ({ ...prev, isOpen: false }))}
        title="Change delivery method"
        pdfValue="email"
        linkValue={getDeliveryMethod(prefSheet.docType, 'link') || getDefaultDeliveryMethod(prefSheet.docType, 'link')}
        onChangePdf={() => setDeliveryMethod(prefSheet.docType, 'pdf', 'email')}
        onChangeLink={(m) => setDeliveryMethod(prefSheet.docType, 'link', m)}
      />
    </>
  );
};

export default App;