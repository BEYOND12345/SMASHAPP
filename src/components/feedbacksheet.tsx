import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './button';
import { X, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';

interface FeedbackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  metadata?: any;
}

export const FeedbackSheet: React.FC<FeedbackSheetProps> = ({ isOpen, onClose, metadata }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get org_id
      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      const { error: insertError } = await supabase
        .from('user_feedback')
        .insert({
          user_id: user.id,
          org_id: userData?.org_id || null,
          content: content.trim(),
          metadata: {
            ...metadata,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        });

      if (insertError) throw insertError;

      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setContent('');
      }, 2000);
    } catch (err: any) {
      console.error('[FeedbackSheet] Error submitting feedback:', err);
      setError(err.message || 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-[400px] bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
        <div className="p-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
                <MessageSquare size={20} className="text-accentDark" />
              </div>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight">Beta Feedback</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
              <X size={18} />
            </button>
          </div>

          {submitted ? (
            <div className="py-8 flex flex-col items-center text-center gap-4 animate-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
              <div>
                <h4 className="text-[17px] font-bold text-slate-900 mb-1">Feedback Received!</h4>
                <p className="text-[14px] text-slate-500">Thanks for helping us build SMASH.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <p className="text-[14px] text-slate-500 font-medium leading-relaxed">
                Found a bug? Have an idea? Let us know below. Your feedback goes straight to the team.
              </p>

              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  placeholder="Tell us what's on your mind..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-32 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-[15px] font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:bg-white transition-all resize-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <Button 
                variant="primary" 
                fullWidth 
                onClick={handleSubmit} 
                disabled={loading || !content.trim()}
                className="h-[58px] shadow-lg shadow-slate-900/10"
              >
                {loading ? 'Sending...' : 'Send Feedback'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
