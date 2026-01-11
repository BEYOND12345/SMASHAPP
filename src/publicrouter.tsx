import React, { useState, useEffect } from 'react';
import { PublicQuoteView } from './screens/publicquoteview';
import { PublicInvoiceView } from './screens/publicinvoiceview';
import { supabase } from './lib/supabase';
import { Estimate, JobStatus } from './types';

export const PublicRouter: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [businessInfo, setBusinessInfo] = useState<{
    name: string;
    phone?: string;
    businessAddress?: string;
    email?: string;
    abn?: string;
    website?: string;
    logoUrl?: string;
    bankName?: string;
    accountName?: string;
    bsbRouting?: string;
    accountNumber?: string;
    paymentTerms?: string;
    paymentInstructions?: string;
  } | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [viewType, setViewType] = useState<'quote' | 'invoice'>('quote');

  useEffect(() => {
    const path = window.location.pathname;
    const quoteMatch = path.match(/^\/(?:quote|q)\/([a-zA-Z0-9-]+)$/i);
    const invoiceMatch = path.match(/^\/(?:invoice|i)\/([a-zA-Z0-9-]+)$/i);

    if (quoteMatch) {
      setViewType('quote');
      loadPublicQuote(quoteMatch[1]);
    } else if (invoiceMatch) {
      setViewType('invoice');
      loadPublicInvoice(invoiceMatch[1]);
    } else {
      setError('Invalid URL');
      setLoading(false);
    }
  }, []);

  const loadPublicQuote = async (identifier: string) => {
    try {
      const { data, error } = await supabase.rpc('get_public_quote', {
        identifier: identifier
      });

      if (error) {
        console.error('[PublicRouter] Error loading quote:', error);
        console.error('[PublicRouter] Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          identifier: identifier
        });
        setError(`Quote not found: ${error.message || 'Unknown error'}`);
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Quote not found');
        setLoading(false);
        return;
      }

      const quoteData = data;
      const lineItems = quoteData.line_items || [];

      const materials = lineItems
        .filter((item: any) => item.item_type === 'materials' || item.item_type === 'material')
        .map((item: any) => ({
          id: item.id,
          name: item.description,
          quantity: item.quantity,
          unit: item.unit || 'unit',
          rate: item.unit_price / 100,
        }));

      const labourItem = lineItems.find((item: any) => item.item_type === 'labour');

      const estimateObj: Estimate = {
        id: quoteData.id,
        jobTitle: quoteData.scope_of_work || 'Quote',
        clientName: quoteData.customer_name || '',
        clientAddress: '',
        timeline: '2-3 days',
        scopeOfWork: quoteData.scope_of_work ? [quoteData.scope_of_work] : [],
        materials,
        labour: {
          hours: labourItem?.quantity || 0,
          rate: (labourItem?.unit_price || 0) / 100,
        },
        status: quoteData.status === 'accepted' ? JobStatus.APPROVED : JobStatus.SENT,
        date: new Date(quoteData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        gstRate: 0.10,
      };

      setEstimate(estimateObj);
      setBusinessInfo({
        name: quoteData.organization.business_name,
        phone: quoteData.organization.phone,
        email: quoteData.organization.email,
        abn: quoteData.organization.business_number,
        website: quoteData.organization.website,
        businessAddress: [
          quoteData.organization.address_line1,
          quoteData.organization.address_line2,
          quoteData.organization.city,
          quoteData.organization.state,
          quoteData.organization.postal_code,
          quoteData.organization.country
        ].filter(Boolean).join(', ')
      });
      setLoading(false);
    } catch (err) {
      console.error('[PublicRouter] Exception loading quote:', err);
      setError('Failed to load quote');
      setLoading(false);
    }
  };

  const loadPublicInvoice = async (identifier: string) => {
    try {
      const { data, error } = await supabase.rpc('get_public_invoice', {
        identifier: identifier
      });

      if (error) {
        console.error('[PublicRouter] Error loading invoice:', error);
        setError('Invoice not found');
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Invoice not found');
        setLoading(false);
        return;
      }

      const invoiceData = data;
      const lineItems = invoiceData.line_items || [];

      const materials = lineItems
        .filter((item: any) => item.item_type === 'material' || item.item_type === 'materials')
        .map((item: any) => ({
          id: item.id,
          name: item.description,
          quantity: item.quantity,
          unit: 'unit',
          rate: item.unit_price / 100,
        }));

      const labourItem = lineItems.find((item: any) => item.item_type === 'labour');

      const estimateObj: Estimate = {
        id: invoiceData.id,
        jobTitle: 'Invoice',
        clientName: invoiceData.customer_name || '',
        clientAddress: '',
        timeline: '',
        scopeOfWork: [],
        materials,
        labour: {
          hours: labourItem?.quantity || 0,
          rate: (labourItem?.unit_price || 0) / 100,
        },
        status: invoiceData.status === 'paid' ? JobStatus.PAID : JobStatus.APPROVED,
        date: new Date(invoiceData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        gstRate: 0.10,
      };

      setEstimate(estimateObj);
      setBusinessInfo({
        name: invoiceData.organization.business_name,
        phone: invoiceData.organization.phone,
        businessAddress: [
          invoiceData.organization.address_line1,
          invoiceData.organization.address_line2,
          invoiceData.organization.city,
          invoiceData.organization.state,
          invoiceData.organization.postal_code,
          invoiceData.organization.country
        ].filter(Boolean).join(', '),
        email: invoiceData.organization.email,
        abn: invoiceData.organization.business_number,
        website: invoiceData.organization.website,
        bankName: invoiceData.organization.bank_name,
        accountName: invoiceData.organization.account_name,
        bsbRouting: invoiceData.organization.bsb,
        accountNumber: invoiceData.organization.account_number,
        paymentInstructions: invoiceData.organization.payment_instructions,
      });
      setInvoiceNumber(invoiceData.invoice_number);
      setLoading(false);
    } catch (err) {
      console.error('[PublicRouter] Exception loading invoice:', err);
      setError('Failed to load invoice');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <h1 className="text-[24px] font-bold text-primary flex items-center justify-center gap-1">
            <span>SMASH</span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shadow-[0_0_12px_rgba(212,255,0,0.5)]" />
          </h1>
          <p className="text-[14px] text-secondary mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !estimate || !businessInfo) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="text-center p-6">
          <h1 className="text-[24px] font-bold text-primary mb-4 flex items-center justify-center gap-1">
            <span>SMASH</span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shadow-[0_0_12px_rgba(212,255,0,0.5)]" />
          </h1>
          <p className="text-[16px] text-secondary">{error || 'Not found'}</p>
        </div>
      </div>
    );
  }

  if (viewType === 'invoice') {
    return (
      <PublicInvoiceView
        estimate={estimate}
        businessName={businessInfo.name}
        businessPhone={businessInfo.phone}
        invoiceNumber={invoiceNumber}
        businessInfo={{
          businessAddress: businessInfo.businessAddress,
          email: businessInfo.email,
          abn: businessInfo.abn,
          website: businessInfo.website,
          logoUrl: businessInfo.logoUrl,
          bankName: businessInfo.bankName,
          accountName: businessInfo.accountName,
          bsbRouting: businessInfo.bsbRouting,
          accountNumber: businessInfo.accountNumber,
          paymentTerms: businessInfo.paymentTerms,
          paymentInstructions: businessInfo.paymentInstructions,
        }}
        onPaymentClick={() => alert('Payment gateway would open here')}
      />
    );
  }

  const handleApproveQuote = async () => {
    if (!estimate) return;

    try {
      const path = window.location.pathname;
      const quoteMatch = path.match(/^\/(?:quote|q)\/([a-zA-Z0-9-]+)$/i);
      if (!quoteMatch) {
        alert('Invalid quote URL');
        return;
      }

      const identifier = quoteMatch[1];

      const { data: quoteData, error: quoteError } = await supabase
        .rpc('get_public_quote', { identifier: identifier });

      if (quoteError || !quoteData) {
        console.error('[PublicRouter] Failed to get quote for approval:', quoteError);
        alert('Failed to load quote details. Please try again.');
        return;
      }

      const quoteId = quoteData.id;
      const lineItems = quoteData.line_items || [];

      const acceptedSnapshot = {
        quote_id: quoteId,
        quote_number: quoteData.quote_number,
        customer_name: quoteData.customer_name,
        line_items: lineItems,
        totals: {
          subtotal: quoteData.subtotal,
          tax: quoteData.tax,
          total: quoteData.total,
        },
        accepted_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          accepted_by_name: quoteData.customer_name || 'Customer',
          accepted_by_email: quoteData.customer_email,
          accepted_quote_snapshot: acceptedSnapshot
        })
        .eq('id', quoteId);

      if (updateError) {
        console.error('[PublicRouter] Failed to approve quote:', updateError);
        alert('Failed to approve quote. Please try again.');
        return;
      }

      const { data: invoiceId, error: invoiceError } = await supabase
        .rpc('create_invoice_from_accepted_quote', { p_quote_id: quoteId });

      if (invoiceError) {
        console.error('[PublicRouter] Failed to create invoice:', invoiceError);
        console.error('[PublicRouter] Full error object:', JSON.stringify(invoiceError, null, 2));
        const errorMsg = invoiceError.message || invoiceError.hint || invoiceError.details || 'Unknown error';
        alert(`Quote approved successfully!\n\nHowever, invoice creation encountered an issue:\n${errorMsg}\n\nThe invoice can be created later from the job card.`);
        return;
      }

      console.log('[PublicRouter] Quote approved and invoice created:', invoiceId);
      alert('Quote approved successfully! An invoice has been created and the business owner will be in touch shortly.');

    } catch (err) {
      console.error('[PublicRouter] Exception during approval:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <PublicQuoteView
      estimate={estimate}
      businessName={businessInfo.name}
      onApprove={handleApproveQuote}
    />
  );
};
