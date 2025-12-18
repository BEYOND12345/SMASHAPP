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
    <Layout showNav={false} className="bg-surface flex flex-col">
      <Header title="SMASH" transparent />

      <div className="px-6 mt-12 flex flex-col gap-6 flex-1">
        <div className="mb-4">
          <h1 className="text-[32px] font-bold text-primary mb-2 tracking-tight">Welcome back</h1>
          <p className="text-[15px] text-secondary">Sign in to continue managing your estimates</p>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-[14px] text-red-600">{error}</p>
          </div>
        )}

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
          placeholder="Enter your password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={loading}
        />
      </div>

      <div className="p-6 mt-auto bg-surface">
        <Button
          fullWidth
          variant="primary"
          disabled={!canLogin || loading}
          onClick={handleSubmit}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>

        <button
          onClick={onSignupClick}
          disabled={loading}
          className="w-full mt-4 text-[14px] text-secondary hover:text-primary transition-colors disabled:opacity-50"
        >
          Don't have an account? <span className="font-bold text-primary">Sign up</span>
        </button>
      </div>
    </Layout>
  );
};
