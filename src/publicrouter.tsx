import React, { useState, useEffect } from 'react';
import { PublicQuoteView } from './screens/publicquoteview';
import { PublicInvoiceView } from './screens/publicinvoiceview';
import { supabase } from './lib/supabase';
import { Estimate, JobStatus } from './types';

export const PublicRouter: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [businessInfo, setBusinessInfo] = useState<{ name: string; phone?: string } | null>(null);
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
        onPaymentClick={() => alert('Payment gateway would open here')}
      />
    );
  }

  return (
    <PublicQuoteView
      estimate={estimate}
      businessName={businessInfo.name}
      onApprove={() => alert('Quote approval would happen here')}
    />
  );
};
