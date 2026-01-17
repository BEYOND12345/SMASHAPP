import React, { useEffect, useRef, useState } from 'react';
import { Layout, Header } from '../components/layout';
import { Input } from '../components/inputs';
import { Button } from '../components/button';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SignupProps {
  onSignup: (userId: string, email: string) => void;
  onBack: () => void;
  onAlreadySignedIn: (target: 'Onboarding' | 'EstimatesList') => void;
}

export const Signup: React.FC<SignupProps> = ({ onSignup, onBack, onAlreadySignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const didRedirectRef = useRef(false);

  const passwordsMatch = password === confirmPassword && password.length > 0;
  const canSignup = email.length > 0 && password.length >= 6 && passwordsMatch;

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: any } }>((_, reject) =>
            window.setTimeout(() => reject(new Error('timeout')), 2000)
          )
        ]);
        if (cancelled) return;
        const sessionUser = result?.data?.session?.user;
        if (!didRedirectRef.current && sessionUser) {
          const signupPending =
            typeof window !== 'undefined' &&
            window.localStorage.getItem('smash.signupPending') === '1';
          didRedirectRef.current = true;
          onAlreadySignedIn(signupPending ? 'Onboarding' : 'EstimatesList');
        }
      } catch {
        // Ignore session check failures/timeouts in dev.
      }
    };
    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!canSignup) return;
    setLoading(true);
    setError('');
    let timeoutId: number | undefined;
    try {
      // Avoid creating accounts while an active session exists.
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: any } }>((_, reject) =>
            window.setTimeout(() => reject(new Error('timeout')), 1500)
          )
        ]);
        if (result?.data?.session?.user) {
          setError('You are already signed in. Please sign out to create a new account.');
          setLoading(false);
          return;
        }
      } catch {
        // If session check fails, proceed; signUp will error appropriately.
      }

      timeoutId = window.setTimeout(() => {
        setError('Signup is taking longer than expected. Please try again.');
        setLoading(false);
      }, 8000);
      const signUpPromise = supabase.auth.signUp({
        email,
        password,
      });
      window.setTimeout(() => {
      }, 3000);
      const { data, error: signUpError } = await signUpPromise;
      if (signUpError) throw signUpError;
      // If email confirmations are enabled, Supabase returns a user but no session.
      // In that case, don't proceed into the app (it will "bounce" due to no JWT/session).
      if (!data.session) {
        setError('Check your email to confirm your account, then come back and sign in.');
        return;
      }
      if (data.user) {
        window.localStorage.setItem('smash.signupPending', '1');
        onSignup(data.user.id, data.user.email || email);
      }
    } catch (err) {
      console.error('Signup error:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Signup failed';
      setError(message.toLowerCase().includes('already registered')
        ? 'Account already exists. Please sign in instead.'
        : message);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      setLoading(false);
    }
  };

  return (
    <Layout showNav={false} className="bg-[#FAFAFA] flex flex-col h-[100dvh]">
      <Header
        left={
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center -ml-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
        }
        title="Create Account"
      />

      <div className="px-8 mt-10 flex flex-col gap-10">
        <div>
          <h1 className="text-[40px] font-black text-slate-900 mb-3 tracking-tighter leading-none">Get Started</h1>
          <p className="text-[16px] text-slate-400 font-bold uppercase tracking-wider">Join SMASH to automate your quotes</p>
        </div>

        {error && (
          <div className="px-5 py-4 bg-red-50 border border-red-100 rounded-[20px] animate-in slide-in-from-top-2 duration-300">
            <p className="text-[14px] text-red-600 font-bold leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-6">
          <Input
            label="Email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus
            disabled={loading}
          />

          <Input
            label="Password"
            type="password"
            placeholder="6+ characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={loading}
          />

          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-[13px] text-red-500 font-bold uppercase tracking-wider ml-1 -mt-4 animate-pulse">Passwords do not match</p>
          )}
        </div>
      </div>

      <div className="px-8 py-10 mt-auto">
        <Button
          fullWidth
          variant="primary"
          disabled={!canSignup || loading}
          onClick={handleSubmit}
          className="shadow-2xl shadow-slate-900/20"
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
        </Button>
      </div>
    </Layout>
  );
};
