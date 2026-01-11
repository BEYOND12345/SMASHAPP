import React, { useState, useEffect } from 'react';
import { Layout, Header } from '../components/layout';
import { FAB } from '../components/fab';
import { User, Loader2, Mic, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { VoiceRecorder } from './voicerecorder';

interface VoiceQuote {
  id: string;
  audio_url: string;
  transcript: string | null;
  quote_data: {
    customerName?: string;
    jobTitle?: string;
    materials?: Array<{
      name: string;
      quantity: number;
      unit: string;
    }>;
    laborHours?: number;
  } | null;
  status: 'recorded' | 'transcribing' | 'transcribed' | 'extracting' | 'extracted' | 'complete' | 'failed';
  created_at: string;
}

interface VoiceQuotesListProps {
  onProfileClick?: () => void;
  activeTab: 'estimates' | 'invoices' | 'customers';
  onTabChange: (tab: 'estimates' | 'invoices' | 'customers') => void;
  onQuoteCreated?: (quoteId: string) => void;
}

const StatusBadge: React.FC<{ status: VoiceQuote['status'] }> = ({ status }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'recorded': return 'bg-blue-50 text-blue-600';
      case 'transcribing': return 'bg-amber-50 text-amber-600';
      case 'transcribed': return 'bg-indigo-50 text-indigo-600';
      case 'extracting': return 'bg-purple-50 text-purple-600';
      case 'extracted': return 'bg-green-50 text-green-600';
      case 'complete': return 'bg-slate-50 text-slate-700 border border-slate-100';
      case 'failed': return 'bg-red-50 text-red-600';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'recorded': return 'Recorded';
      case 'transcribing': return 'Transcribing';
      case 'transcribed': return 'Transcribed';
      case 'extracting': return 'Extracting';
      case 'extracted': return 'Ready';
      case 'complete': return 'Done';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-sm ${getStatusColor()}`}>
      {(status === 'transcribing' || status === 'extracting') && (
        <Loader2 size={10} className="animate-spin" strokeWidth={3} />
      )}
      {getStatusText()}
    </span>
  );
};

export const VoiceQuotesList: React.FC<VoiceQuotesListProps> = ({
  onProfileClick,
  activeTab,
  onTabChange,
  onQuoteCreated
}) => {
  const [voiceQuotes, setVoiceQuotes] = useState<VoiceQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);

  useEffect(() => {
    loadVoiceQuotes();

    const channel = supabase
      .channel('voice_quotes_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'voice_quotes'
        },
        () => {
          loadVoiceQuotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadVoiceQuotes = async () => {
    try {
      const { data, error } = await supabase
        .from('voice_quotes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVoiceQuotes(data || []);
    } catch (error) {
      console.error('[VoiceQuotesList] Error loading voice quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  return (
    <>
    <Layout
      activeTab={activeTab}
      onTabChange={onTabChange}
      className="bg-[#FAFAFA] pb-32"
      fab={<FAB onClick={() => setShowRecorder(true)} />}
    >
        <Header
          title="VOICE QUOTES"
          right={
            onProfileClick && (
              <button onClick={onProfileClick} className="w-10 h-10 flex items-center justify-center text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
                <User size={22} />
              </button>
            )
          }
        />

        <div className="px-6 space-y-4 pt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-12 h-12 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
              <p className="text-[13px] font-black text-slate-400 uppercase tracking-[0.2em]">Syncing</p>
            </div>
          ) : voiceQuotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-24 h-24 rounded-[32px] bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
                <Mic size={40} className="text-slate-200" />
              </div>
              <h3 className="text-[20px] font-black text-slate-900 mb-2 tracking-tight">No voice recordings</h3>
              <p className="text-[15px] text-slate-400 max-w-[220px] font-medium leading-relaxed">
                Your dictated quotes will appear here for review.
              </p>
            </div>
          ) : (
            voiceQuotes.map((quote) => (
              <div
                key={quote.id}
                className="bg-white rounded-[28px] p-6 shadow-sm border border-slate-100/50 active:scale-[0.98] transition-all flex flex-col gap-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="font-black text-[17px] text-slate-900 mb-1 tracking-tight leading-tight truncate">
                      {quote.quote_data?.jobTitle || 'Voice Recording'}
                    </h3>
                    <p className="text-[14px] text-slate-500 font-bold">
                      {quote.quote_data?.customerName || 'Processing customer...'}
                    </p>
                  </div>
                  <StatusBadge status={quote.status} />
                </div>

                {quote.status === 'extracted' && (
                  <div className="bg-slate-50 rounded-[20px] p-4 flex flex-col gap-2 border border-slate-100/50">
                    <div className="flex items-center gap-4 text-[13px] font-black text-slate-400 uppercase tracking-wider">
                      <span>{quote.quote_data?.materials?.length || 0} Materials</span>
                      <span className="w-1 h-1 rounded-full bg-slate-200" />
                      <span>{quote.quote_data?.laborHours || 0}h Labor</span>
                    </div>
                  </div>
                )}

                {quote.status === 'failed' && (
                  <div className="bg-red-50 border border-red-100 rounded-[20px] p-4">
                    <p className="text-[13px] text-red-600 font-bold leading-relaxed text-center">
                      Processing failed. Please try recording again.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[12px] font-bold text-slate-300 uppercase tracking-widest">
                    {formatDate(quote.created_at)}
                  </span>
                  {quote.status === 'extracted' && (
                    <button className="flex items-center gap-2 text-[13px] font-black text-slate-900 uppercase tracking-widest group">
                      Review Draft
                      <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
    </Layout>

    {showRecorder && (
      <div className="fixed inset-0 z-[100] bg-slate-900/10 backdrop-blur-sm flex justify-center animate-in fade-in duration-300">
        <div className="w-full max-w-[390px] h-[100dvh] bg-white shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
          <VoiceRecorder 
            onBack={() => {
              setShowRecorder(false);
              loadVoiceQuotes();
            }}
            onQuoteCreated={(quoteId) => {
              console.log('[VoiceQuotesList] Quote created, closing recorder and navigating:', quoteId);
              setShowRecorder(false);
              if (onQuoteCreated) {
                onQuoteCreated(quoteId);
              }
            }}
          />
        </div>
      </div>
    )}
    </>
  );
};
