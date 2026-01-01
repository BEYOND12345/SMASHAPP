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
  const [error, setError] = useState<string | null>(null);

  const title = type === 'invoice' ? 'Send Invoice' : 'Send Estimate';
  const noun = type === 'invoice' ? 'invoice' : 'estimate';

  useEffect(() => {
    const fetchData = async () => {
      if (!estimateId) {
        console.error('[SendEstimate] No estimateId provided');
        setError('No estimate ID provided');
        setLoading(false);
        return;
      }

      try {
        console.log(`[SendEstimate] Fetching ${type} data for estimateId:`, estimateId);

        if (type === 'invoice') {
          const { data: invoiceData, error: invoiceError } = await supabase
            .from('invoices')
            .select(`
              *,
              invoice_line_items (*),
              customer:customers!customer_id (*),
              quote:quotes!source_quote_id (
                scope_of_work
              )
            `)
            .eq('source_quote_id', estimateId)
            .maybeSingle();

          if (invoiceError) {
            console.error('[SendEstimate] Failed to fetch invoice:', invoiceError);
            setError('Failed to load invoice data. Please try again.');
            setLoading(false);
            return;
          }

          if (invoiceData) {
            console.log('[SendEstimate] Invoice data loaded:', {
              id: invoiceData.id,
              has_short_code: !!invoiceData.short_code,
              is_public: invoiceData.is_public,
              has_customer: !!invoiceData.customer
            });
            const materials = (invoiceData.invoice_line_items || [])
              .filter((item: any) => item.item_type === 'material' || item.item_type === 'materials')
              .map((item: any) => ({
                id: item.id,
                name: item.description,
                quantity: item.quantity,
                unit: 'unit',
                rate: item.unit_price_cents / 100,
              }));

            const labourItem = (invoiceData.invoice_line_items || []).find((item: any) => item.item_type === 'labour');

            const dueDate = invoiceData.due_date ? new Date(invoiceData.due_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            const timeline = `Due: ${dueDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;

            const estimateObj: Estimate = {
              id: invoiceData.id,
              jobTitle: invoiceData.title || `Invoice ${invoiceData.invoice_number}`,
              clientName: invoiceData.customer?.name || '',
              clientAddress: '',
              clientEmail: invoiceData.customer?.email || '',
              clientPhone: invoiceData.customer?.phone || '',
              timeline: timeline,
              scopeOfWork: invoiceData.quote?.scope_of_work || (invoiceData.description ? [invoiceData.description] : []),
              materials,
              labour: {
                hours: labourItem?.quantity || 0,
                rate: (labourItem?.unit_price_cents || 0) / 100,
              },
              status: invoiceData.status,
              gstRate: invoiceData.default_tax_rate || 0.10,
            };

            setEstimate(estimateObj);

            if (invoiceData.short_code) {
              const url = `${window.location.origin}/i/${invoiceData.short_code}`;
              console.log('[SendEstimate] Invoice share URL generated:', url);
              setShareUrl(url);
            } else {
              console.error('[SendEstimate] Invoice missing short_code');
              setError('Invoice is not ready for sharing. Please try again.');
            }
          } else {
            console.error('[SendEstimate] No invoice data found');
            setError('Invoice not found.');
          }
        } else {
          const { data: quoteData, error: quoteError } = await supabase
            .from('quotes')
            .select(`
              *,
              quote_line_items (*),
              customer:customers!customer_id (*)
            `)
            .eq('id', estimateId)
            .maybeSingle();

          if (quoteError) {
            console.error('[SendEstimate] Failed to fetch quote:', quoteError);
            setError('Failed to load estimate data. Please try again.');
            setLoading(false);
            return;
          }

          if (quoteData) {
            console.log('[SendEstimate] Quote data loaded:', {
              id: quoteData.id,
              has_short_code: !!quoteData.short_code,
              is_public: quoteData.is_public
            });
            const materials = (quoteData.quote_line_items || [])
              .filter((item: any) => item.item_type === 'materials')
              .map((item: any) => ({
                id: item.id,
                name: item.description,
                quantity: item.quantity,
                unit: item.unit || 'unit',
                rate: item.unit_price_cents / 100,
              }));

            const labourItem = (quoteData.quote_line_items || []).find((item: any) => item.item_type === 'labour');

            const estimateObj: Estimate = {
              id: quoteData.id,
              jobTitle: quoteData.title || '',
              clientName: quoteData.customer?.name || '',
              clientAddress: '',
              clientEmail: quoteData.customer?.email || '',
              clientPhone: quoteData.customer?.phone || '',
              timeline: '2-3 days',
              scopeOfWork: quoteData.scope_of_work || [],
              materials,
              labour: {
                hours: labourItem?.quantity || 0,
                rate: (labourItem?.unit_price_cents || 0) / 100,
              },
              status: quoteData.status,
              date: new Date(quoteData.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
              gstRate: quoteData.default_tax_rate || 0.10,
            };

            setEstimate(estimateObj);

            if (quoteData.short_code) {
              const url = `${window.location.origin}/q/${quoteData.short_code}`;
              console.log('[SendEstimate] Quote share URL generated:', url);
              setShareUrl(url);
            } else {
              console.error('[SendEstimate] Quote missing short_code');
              setError('Estimate is not ready for sharing. Please try again.');
            }
          } else {
            console.error('[SendEstimate] No quote data found');
            setError('Estimate not found.');
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profileData } = await supabase
            .from('users')
            .select('*, org:organizations(*)')
            .eq('id', user.id)
            .maybeSingle();

          if (profileData) {
            setUserProfile({
              id: profileData.id,
              email: user.email || '',
              businessName: profileData.business_name,
              tradeType: profileData.trade_type,
              phone: profileData.phone || '',
              logoUrl: profileData.org?.logo_url,
              businessAddress: profileData.org?.business_address || '',
              abn: profileData.org?.abn || '',
              website: profileData.org?.website || '',
              bankName: profileData.org?.bank_name || '',
              accountName: profileData.org?.account_name || '',
              bsbRouting: profileData.org?.bsb_routing || '',
              accountNumber: profileData.org?.account_number || '',
              paymentTerms: profileData.org?.default_payment_terms || '',
              paymentInstructions: profileData.org?.payment_instructions || '',
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
    console.log('[SendEstimate.handleSharePDF] === ENTRY POINT 1: Share PDF Button ===');
    console.log('[SendEstimate.handleSharePDF] Browser:', navigator.userAgent);
    console.log('[SendEstimate.handleSharePDF] Platform:', navigator.platform);
    console.log('[SendEstimate.handleSharePDF] navigator.share exists:', !!navigator.share);
    console.log('[SendEstimate.handleSharePDF] navigator.canShare exists:', !!navigator.canShare);

    if (!estimate) {
      console.error('[SendEstimate.handleSharePDF] BLOCKED: No estimate data available');
      alert('No estimate data available. Please try again.');
      return;
    }

    try {
      setIsSending(true);
      console.log('[SendEstimate.handleSharePDF] Calling generateEstimatePDF with:', {
        hasEstimate: !!estimate,
        hasUserProfile: !!userProfile,
        type,
        estimateId: estimate.id,
        clientName: estimate.clientName,
        materialsCount: estimate.materials?.length,
        labourHours: estimate.labour?.hours,
        estimateKeys: Object.keys(estimate)
      });

      const pdfBlob = await generateEstimatePDF(estimate, userProfile || undefined, type);

      console.log('[SendEstimate.handleSharePDF] PDF returned from generator:', {
        type: typeof pdfBlob,
        constructor: pdfBlob.constructor.name,
        blobType: pdfBlob.type,
        size: pdfBlob.size,
        isBlob: pdfBlob instanceof Blob
      });

      const fileName = `${type === 'invoice' ? 'invoice' : 'estimate'}-${estimate.jobTitle.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      console.log('[SendEstimate.handleSharePDF] Generated filename:', fileName);

      const canShareFiles = navigator.share && navigator.canShare?.({ files: [new File([pdfBlob], fileName)] });
      console.log('[SendEstimate.handleSharePDF] Can share files:', canShareFiles);

      if (canShareFiles) {
        console.log('[SendEstimate.handleSharePDF] Using navigator.share with file');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: `${type === 'invoice' ? 'Invoice' : 'Estimate'} - ${estimate.jobTitle}`,
        });
        console.log('[SendEstimate.handleSharePDF] Share completed successfully');
        await onSent();
      } else {
        console.log('[SendEstimate.handleSharePDF] Using download fallback');
        const url = URL.createObjectURL(pdfBlob);
        console.log('[SendEstimate.handleSharePDF] Created object URL:', url);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        console.log('[SendEstimate.handleSharePDF] Triggering download...');
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[SendEstimate.handleSharePDF] Download complete');
        await onSent();
      }
      setIsSending(false);
    } catch (err) {
      console.error('[SendEstimate.handleSharePDF] === ERROR CAUGHT ===');
      console.error('[SendEstimate.handleSharePDF] Error type:', typeof err);
      console.error('[SendEstimate.handleSharePDF] Error name:', (err as Error).name);
      console.error('[SendEstimate.handleSharePDF] Error message:', (err as Error).message);
      console.error('[SendEstimate.handleSharePDF] Error stack:', (err as Error).stack);
      console.error('[SendEstimate.handleSharePDF] Full error:', err);
      setIsSending(false);
      if ((err as Error).name !== 'AbortError') {
        alert(`Failed to generate or share PDF: ${(err as Error).message}\n\nPlease check the console for details.`);
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
        {error && (
          <Card className="p-4 bg-red-50 border border-red-200">
            <p className="text-sm text-red-800 font-medium">{error}</p>
          </Card>
        )}

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