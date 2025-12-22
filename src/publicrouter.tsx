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
    const quoteMatch = path.match(/^\/quote\/([a-f0-9-]+)$/i);
    const invoiceMatch = path.match(/^\/invoice\/([a-f0-9-]+)$/i);

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

  const loadPublicQuote = async (token: string) => {
    try {
      const { data, error } = await supabase.rpc('get_public_quote', {
        p_token: token
      });

      if (error) {
        console.error('[PublicRouter] Error loading quote:', error);
        setError('Quote not found');
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setError('Quote not found');
        setLoading(false);
        return;
      }

      const quoteData = data[0];

      const { data: lineItems, error: lineItemsError } = await supabase.rpc(
        'get_public_quote_line_items',
        { p_token: token }
      );

      if (lineItemsError) {
        console.error('[PublicRouter] Error loading line items:', lineItemsError);
      }

      const materials = lineItems
        ?.filter((item: any) => item.item_type === 'materials' || item.item_type === 'material')
        .map((item: any) => ({
          id: item.id,
          name: item.description,
          quantity: item.quantity,
          unit: item.unit || 'unit',
          rate: item.unit_price_cents / 100,
        })) || [];

      const labourItem = lineItems?.find((item: any) => item.item_type === 'labour');

      const estimateObj: Estimate = {
        id: quoteData.id,
        jobTitle: quoteData.title || 'Quote',
        clientName: quoteData.customer_name || '',
        clientAddress: quoteData.address_line_1 || '',
        timeline: '2-3 days',
        scopeOfWork: [],
        materials,
        labour: {
          hours: labourItem?.quantity || 0,
          rate: (labourItem?.unit_price_cents || 0) / 100,
        },
        status: JobStatus.SENT,
        date: new Date(quoteData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        gstRate: 0.10,
      };

      setEstimate(estimateObj);
      setBusinessInfo({
        name: quoteData.business_name,
        phone: quoteData.business_phone,
      });
      setLoading(false);
    } catch (err) {
      console.error('[PublicRouter] Exception loading quote:', err);
      setError('Failed to load quote');
      setLoading(false);
    }
  };

  const loadPublicInvoice = async (token: string) => {
    try {
      const { data, error } = await supabase.rpc('get_public_invoice', {
        p_token: token
      });

      if (error) {
        console.error('[PublicRouter] Error loading invoice:', error);
        setError('Invoice not found');
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setError('Invoice not found');
        setLoading(false);
        return;
      }

      const invoiceData = data[0];

      const { data: lineItems, error: lineItemsError } = await supabase.rpc(
        'get_public_invoice_line_items',
        { p_invoice_id: invoiceData.id }
      );

      if (lineItemsError) {
        console.error('[PublicRouter] Error loading line items:', lineItemsError);
      }

      const materials = lineItems
        ?.filter((item: any) => item.item_type === 'material' || item.item_type === 'materials')
        .map((item: any) => ({
          id: item.id,
          name: item.description,
          quantity: item.quantity,
          unit: 'unit',
          rate: item.unit_price_cents / 100,
        })) || [];

      const labourItem = lineItems?.find((item: any) => item.item_type === 'labour');

      const estimateObj: Estimate = {
        id: invoiceData.id,
        jobTitle: invoiceData.title || 'Invoice',
        clientName: invoiceData.customer_name || '',
        clientAddress: invoiceData.address_line_1 || '',
        timeline: '',
        scopeOfWork: invoiceData.description ? [invoiceData.description] : [],
        materials,
        labour: {
          hours: labourItem?.quantity || 0,
          rate: (labourItem?.unit_price_cents || 0) / 100,
        },
        status: invoiceData.status === 'paid' ? JobStatus.PAID : JobStatus.APPROVED,
        date: new Date(invoiceData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
        gstRate: 0.10,
      };

      setEstimate(estimateObj);
      setBusinessInfo({
        name: invoiceData.business_name,
        phone: invoiceData.business_phone,
        businessAddress: invoiceData.business_address,
        email: invoiceData.business_email,
        abn: invoiceData.business_abn,
        website: invoiceData.business_website,
        logoUrl: invoiceData.business_logo_url,
        bankName: invoiceData.bank_name,
        accountName: invoiceData.account_name,
        bsbRouting: invoiceData.bsb_routing,
        accountNumber: invoiceData.account_number,
        paymentTerms: invoiceData.payment_terms,
        paymentInstructions: invoiceData.payment_instructions,
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
          <h1 className="text-[24px] font-bold text-primary">SMASH</h1>
          <p className="text-[14px] text-secondary mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !estimate || !businessInfo) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="text-center p-6">
          <h1 className="text-[24px] font-bold text-primary mb-4">SMASH</h1>
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
      const quoteMatch = path.match(/^\/quote\/([a-f0-9-]+)$/i);
      if (!quoteMatch) {
        alert('Invalid quote URL');
        return;
      }

      const approvalToken = quoteMatch[1];

      // Get the quote ID from the approval token
      const { data: quoteData, error: quoteError } = await supabase
        .rpc('get_public_quote', { p_token: approvalToken });

      if (quoteError || !quoteData || quoteData.length === 0) {
        console.error('[PublicRouter] Failed to get quote for approval:', quoteError);
        alert('Failed to load quote details. Please try again.');
        return;
      }

      const quoteId = quoteData[0].id;

      // Get line items to build the snapshot
      const { data: lineItems, error: lineItemsError } = await supabase
        .rpc('get_public_quote_line_items', { p_token: approvalToken });

      if (lineItemsError) {
        console.error('[PublicRouter] Failed to get line items:', lineItemsError);
        alert('Failed to load quote details. Please try again.');
        return;
      }

      // Build the acceptance snapshot
      const acceptedSnapshot = {
        quote_id: quoteId,
        title: quoteData[0].title,
        customer_name: quoteData[0].customer_name,
        line_items: lineItems || [],
        totals: {
          labour_subtotal_cents: quoteData[0].labour_subtotal_cents,
          materials_subtotal_cents: quoteData[0].materials_subtotal_cents,
          subtotal_cents: quoteData[0].subtotal_cents,
          tax_total_cents: quoteData[0].tax_total_cents,
          grand_total_cents: quoteData[0].grand_total_cents,
        },
        accepted_at: new Date().toISOString()
      };

      // Update quote to accepted status
      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          accepted_by_name: quoteData[0].customer_name || 'Customer',
          accepted_by_email: quoteData[0].customer_email,
          accepted_quote_snapshot: acceptedSnapshot
        })
        .eq('id', quoteId);

      if (updateError) {
        console.error('[PublicRouter] Failed to approve quote:', updateError);
        alert('Failed to approve quote. Please try again.');
        return;
      }

      // Create invoice from accepted quote
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
