import React, { useState, useEffect } from 'react';
import { Layout, Header } from '../components/layout';
import { FAB } from '../components/fab';
import { User, Loader2, Mic } from 'lucide-react';
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
}

const StatusBadge: React.FC<{ status: VoiceQuote['status'] }> = ({ status }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'recorded': return 'bg-blue-50 text-blue-700';
      case 'transcribing': return 'bg-yellow-50 text-yellow-700';
      case 'transcribed': return 'bg-indigo-50 text-indigo-700';
      case 'extracting': return 'bg-purple-50 text-purple-700';
      case 'extracted': return 'bg-green-50 text-green-700';
      case 'complete': return 'bg-emerald-50 text-emerald-700';
      case 'failed': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-50 text-gray-700';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'recorded': return 'Recorded';
      case 'transcribing': return 'Transcribing...';
      case 'transcribed': return 'Transcribed';
      case 'extracting': return 'Extracting...';
      case 'extracted': return 'Ready';
      case 'complete': return 'Complete';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
      {(status === 'transcribing' || status === 'extracting') && (
        <Loader2 size={12} className="animate-spin" />
      )}
      {getStatusText()}
    </span>
  );
};

export const VoiceQuotesList: React.FC<VoiceQuotesListProps> = ({
  onProfileClick,
  activeTab,
  onTabChange
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
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  const getMaterialsCount = (quote: VoiceQuote) => {
    return quote.quote_data?.materials?.length || 0;
  };

  const getLaborHours = (quote: VoiceQuote) => {
    return quote.quote_data?.laborHours || 0;
  };

  return (
    <>
    <Layout
      activeTab={activeTab}
      onTabChange={onTabChange}
      className="bg-[#FAFAFA] relative pb-32"
      fab={<FAB onClick={() => setShowRecorder(true)} />}
    >
      <Header
        title="Voice Quotes"
        right={
          onProfileClick && (
            <button
              onClick={onProfileClick}
              className="w-10 h-10 flex items-center justify-center text-primary hover:bg-slate-100 rounded-full transition-colors"
            >
              <User size={22} />
            </button>
          )
        }
      />

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : voiceQuotes.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Mic size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No voice quotes yet</h3>
            <p className="text-sm text-gray-500 mb-6">
              Tap the button below to record your first voice quote
            </p>
          </div>
        ) : (
          voiceQuotes.map((quote) => (
            <div
              key={quote.id}
              className="bg-white rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-[15px] text-gray-900 mb-1">
                    {quote.quote_data?.jobTitle || 'Voice Recording'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {quote.quote_data?.customerName || 'No customer'}
                  </p>
                </div>
                <StatusBadge status={quote.status} />
              </div>

              {quote.status === 'extracted' && (
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="text-gray-600">
                        {getMaterialsCount(quote)} material{getMaterialsCount(quote) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-gray-600">
                        {getLaborHours(quote)}h labor
                      </span>
                    </div>
                  </div>

                  {quote.quote_data?.materials && quote.quote_data.materials.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                      {quote.quote_data.materials.slice(0, 3).map((material, idx) => (
                        <div key={idx} className="text-sm text-gray-700">
                          <span className="font-medium">{material.quantity}</span>
                          {material.unit} {material.name}
                        </div>
                      ))}
                      {quote.quote_data.materials.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{quote.quote_data.materials.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {quote.status === 'failed' && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3">
                  <p className="text-sm text-red-700">
                    Processing failed. Please try recording again.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  {formatDate(quote.created_at)}
                </span>
                {quote.status === 'extracted' && (
                  <button className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                    Create Quote
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>

    {showRecorder && (
      <div className="fixed inset-0 z-50 bg-white">
        <VoiceRecorder onBack={() => {
          setShowRecorder(false);
          loadVoiceQuotes();
        }} />
      </div>
    )}
    </>
  );
};
