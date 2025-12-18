import React, { useState } from 'react';
import { Layout, Header } from '../components/layout';
import { Input } from '../components/inputs';
import { Button } from '../components/button';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SignupProps {
  onSignup: (userId: string, email: string) => void;
  onBack: () => void;
}

export const Signup: React.FC<SignupProps> = ({ onSignup, onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordsMatch = password === confirmPassword && password.length > 0;
  const canSignup = email.length > 0 && password.length >= 6 && passwordsMatch;

  const handleSubmit = async () => {
    if (!canSignup) return;

    setLoading(true);
    setError('');

    try {
      // Force complete logout and clear all sessions
      await supabase.auth.signOut({ scope: 'global' });

      // Wait a moment to ensure session is cleared
      await new Promise(resolve => setTimeout(resolve, 100));

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;

      if (data.user) {
        onSignup(data.user.id, data.user.email || email);
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout showNav={false} className="bg-surface flex flex-col">
      <Header
        left={
          <button onClick={onBack} className="p-2 -ml-2 text-primary">
            <ChevronLeft size={24} />
          </button>
        }
        title="Sign Up"
      />

      <div className="px-6 mt-6 flex flex-col gap-6 flex-1">
        <div className="mb-4">
          <h1 className="text-[28px] font-bold text-primary mb-2 tracking-tight">Create account</h1>
          <p className="text-[15px] text-secondary">Get started with SMASH</p>
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
          placeholder="Minimum 6 characters"
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
          <p className="text-[13px] text-red-500 -mt-4 ml-1">Passwords do not match</p>
        )}
      </div>

      <div className="p-6 mt-auto bg-surface">
        <Button
          fullWidth
          variant="primary"
          disabled={!canSignup || loading}
          onClick={handleSubmit}
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </div>
    </Layout>
  );
};
