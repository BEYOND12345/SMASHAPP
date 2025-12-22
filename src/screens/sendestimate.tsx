import React, { useState, useEffect } from 'react';
import { Layout, Header } from '../components/layout';
import { Card } from '../components/card';
import { Button } from '../components/button';
import { ChevronLeft, Share2, Link as LinkIcon, FileDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Estimate, UserProfile } from '../types';
import { generateEstimatePDF } from '../lib/utils/pdfGenerator';

interface SendEstimateProps {
  onBack: () => void;
  onSent: () => void;
  type?: 'estimate' | 'invoice';
  onTabChange?: (tab: 'estimates' | 'invoices') => void;
  estimateId?: string;
}

export const SendEstimate: React.FC<SendEstimateProps> = ({ onBack, onSent, type = 'estimate', onTabChange, estimateId }) => {
  const [copied, setCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const title = type === 'invoice' ? 'Send Invoice' : 'Send Estimate';
  const noun = type === 'invoice' ? 'invoice' : 'estimate';

  useEffect(() => {
    const fetchData = async () => {
      if (!estimateId) {
        console.error('[SendEstimate] No estimateId provided');
        setLoading(false);
        return;
      }

      try {
        if (type === 'invoice') {
          const { data: quoteData, error: quoteError } = await supabase
            .from('quotes')
            .select('id, source_invoice_id:invoiced')
            .eq('id', estimateId)
            .maybeSingle();

          if (quoteError || !quoteData) {
            console.error('[SendEstimate] Failed to fetch quote for invoice:', quoteError);
            setLoading(false);
            return;
          }

          const { data: invoiceData, error: invoiceError } = await supabase
            .from('invoices')
            .select(`
              *,
              invoice_line_items (*)
            `)
            .eq('source_quote_id', estimateId)
            .maybeSingle();

          if (invoiceError) {
            console.error('[SendEstimate] Failed to fetch invoice:', invoiceError);
            setLoading(false);
            return;
          }

          if (invoiceData) {
            const materials = invoiceData.invoice_line_items
              .filter((item: any) => item.item_type === 'material' || item.item_type === 'materials')
              .map((item: any) => ({
                id: item.id,
                name: item.description,
                quantity: item.quantity,
                unit: 'unit',
                rate: item.unit_price_cents / 100,
              }));

            const labourItem = invoiceData.invoice_line_items.find((item: any) => item.item_type === 'labour');

            const estimateObj: Estimate = {
              id: invoiceData.id,
              jobTitle: invoiceData.title || '',
              clientName: '',
              clientAddress: '',
              timeline: '',
              scopeOfWork: invoiceData.description ? [invoiceData.description] : [],
              materials,
              labour: {
                hours: labourItem?.quantity || 0,
                rate: (labourItem?.unit_price_cents || 0) / 100,
              },
              status: invoiceData.status,
              createdAt: invoiceData.created_at,
            };

            setEstimate(estimateObj);

            if (invoiceData.approval_token) {
              const url = `${window.location.origin}/invoice/${invoiceData.approval_token}`;
              setShareUrl(url);
            }
          }
        } else {
          const { data: quoteData, error: quoteError } = await supabase
            .from('quotes')
            .select(`
              *,
              quote_line_items (*)
            `)
            .eq('id', estimateId)
            .maybeSingle();

          if (quoteError) {
            console.error('[SendEstimate] Failed to fetch quote:', quoteError);
            setLoading(false);
            return;
          }

          if (quoteData) {
            const materials = quoteData.quote_line_items
              .filter((item: any) => item.item_type === 'materials')
              .map((item: any) => ({
                id: item.id,
                name: item.description,
                quantity: item.quantity,
                unit: item.unit || 'unit',
                rate: item.unit_price_cents / 100,
              }));

            const labourItem = quoteData.quote_line_items.find((item: any) => item.item_type === 'labour');

            const estimateObj: Estimate = {
              id: quoteData.id,
              jobTitle: quoteData.title || '',
              clientName: '',
              clientAddress: '',
              timeline: '',
              scopeOfWork: quoteData.scope_of_work || [],
              materials,
              labour: {
                hours: labourItem?.quantity || 0,
                rate: (labourItem?.unit_price_cents || 0) / 100,
              },
              status: quoteData.status,
              createdAt: quoteData.created_at,
            };

            setEstimate(estimateObj);

            if (quoteData.approval_token) {
              const url = `${window.location.origin}/quote/${quoteData.approval_token}`;
              setShareUrl(url);
            }
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profileData } = await supabase
            .from('users')
            .select('business_name, trade_type, logo_url')
            .eq('id', user.id)
            .maybeSingle();

          if (profileData) {
            setUserProfile({
              businessName: profileData.business_name,
              tradeType: profileData.trade_type,
              logoUrl: profileData.logo_url,
            });
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('[SendEstimate] Error fetching data:', err);
        setLoading(false);
      }
    };

    fetchData();
  }, [estimateId, type]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        setIsSending(true);
        await navigator.share({
          title: `${type === 'invoice' ? 'Invoice' : 'Estimate'} from Smash`,
          text: `View your ${noun}:`,
          url: shareUrl,
        });
        await onSent();
        setIsSending(false);
      } catch (err) {
        setIsSending(false);
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setIsSending(true);

      // Show "Copied!" then transition to "Marking as sent..."
      setTimeout(async () => {
        setCopied(false);
        // Now mark as sent and navigate back
        await onSent();
        setIsSending(false);
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
      setIsSending(false);
    }
  };

  const handleSharePDF = async () => {
    if (!estimate) {
      console.error('[SendEstimate] No estimate data available');
      return;
    }

    try {
      setIsSending(true);
      const pdfBlob = await generateEstimatePDF(estimate, userProfile || undefined, type);
      const fileName = `${type === 'invoice' ? 'invoice' : 'estimate'}-${estimate.jobTitle.replace(/\s+/g, '-').toLowerCase()}.pdf`;

      if (navigator.share && navigator.canShare?.({ files: [new File([pdfBlob], fileName)] })) {
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: `${type === 'invoice' ? 'Invoice' : 'Estimate'} - ${estimate.jobTitle}`,
        });
        await onSent();
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await onSent();
      }
      setIsSending(false);
    } catch (err) {
      console.error('[SendEstimate] Error sharing PDF:', err);
      setIsSending(false);
      if ((err as Error).name !== 'AbortError') {
        alert('Failed to generate or share PDF. Please try again.');
      }
    }
  };

  return (
    <Layout activeTab="estimates" onTabChange={onTabChange} className="bg-[#FAFAFA]">
       <Header
        left={
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-primary hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        }
        title={title}
      />

      <div className="px-6 mt-6 flex flex-col gap-6">
        <Card className="flex flex-col gap-6 p-6">

          <div className="text-center mb-2">
            <h2 className="text-lg font-bold text-primary">Share {noun}</h2>
            <p className="text-sm text-secondary">Send this {noun} to your client.</p>
          </div>

          <Button
            variant="primary"
            className="w-full h-14 text-base flex items-center justify-center gap-3"
            onClick={handleShare}
            disabled={isSending || loading || !shareUrl}
          >
            <Share2 size={20} />
            {loading ? 'Loading...' : isSending ? 'Sending...' : `Share ${type === 'invoice' ? 'Invoice' : 'Estimate'}`}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-[1px] flex-1 bg-gray-100" />
            <span className="text-xs text-secondary font-medium">OR</span>
            <div className="h-[1px] flex-1 bg-gray-100" />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-primary font-bold text-[14px]">
              <LinkIcon size={18} />
              <span>Copy Link</span>
            </div>
            <div className="flex gap-2">
              <div className="bg-surface border-none ring-1 ring-gray-100 rounded-2xl px-4 py-4 text-sm text-secondary truncate flex-1 font-medium">
                {loading ? 'Loading share link...' : shareUrl || 'No link available'}
              </div>
              <Button
                variant="secondary"
                className="px-6 h-[52px]"
                onClick={handleCopyLink}
                disabled={isSending || loading || !shareUrl}
              >
                {loading ? 'Loading...' : isSending ? 'Sending...' : copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-[1px] flex-1 bg-gray-100" />
            <span className="text-xs text-secondary font-medium">OR</span>
            <div className="h-[1px] flex-1 bg-gray-100" />
          </div>

          <Button
            variant="secondary"
            className="w-full h-14 text-base flex items-center justify-center gap-3"
            onClick={handleSharePDF}
            disabled={isSending || loading || !estimate}
          >
            <FileDown size={20} />
            {loading ? 'Loading...' : isSending ? 'Generating...' : 'Share as PDF'}
          </Button>

        </Card>
      </div>
    </Layout>
  );
};