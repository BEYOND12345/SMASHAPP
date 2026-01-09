import React, { useState } from 'react';
import { Layout, Header } from '../components/layout';
import { Input } from '../components/inputs';
import { Button } from '../components/button';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLogin: (userId: string, email: string) => void;
  onSignupClick: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onSignupClick }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canLogin = email.length > 0 && password.length > 0;

  const handleSubmit = async () => {
    if (!canLogin) return;
    setLoading(true);
    setError('');
    try {
      await supabase.auth.signOut({ scope: 'global' });
      await new Promise(resolve => setTimeout(resolve, 100));
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      if (data.user) {
        onLogin(data.user.id, data.user.email || email);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout showNav={false} className="bg-[#FAFAFA] flex flex-col h-[100dvh]">
      <Header title="SMASH" transparent />

      <div className="px-6 mt-10 flex flex-col gap-8">
        <div>
          <h1 className="text-[32px] font-bold text-slate-900 mb-2 tracking-tight leading-tight">Welcome back</h1>
          <p className="text-[15px] text-slate-400 font-bold uppercase tracking-wider">Sign in to manage jobs</p>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-[14px] animate-in slide-in-from-top-2 duration-300">
            <p className="text-[13px] text-red-600 font-bold leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-5">
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
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={loading}
          />
        </div>
      </div>

      <div className="px-6 py-8 mt-auto">
        <Button
          fullWidth
          variant="primary"
          disabled={!canLogin || loading}
          onClick={handleSubmit}
        >
          {loading ? 'Authenticating...' : 'Sign In'}
        </Button>

        <button
          onClick={onSignupClick}
          disabled={loading}
          className="w-full mt-6 text-[13px] text-slate-400 font-bold uppercase tracking-widest hover:text-slate-900 transition-colors disabled:opacity-50"
        >
          New user? <span className="text-slate-900 underline underline-offset-4">Sign up</span>
        </button>
      </div>
    </Layout>
  );
};
