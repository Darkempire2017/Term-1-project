'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { StormHeader } from '@/components/Storm';
import { SignupProgress } from '@/components/SignupProgress';
import { seedStationUser } from '@/lib/stationCache';
import '../../theme-pages.css';

export default function SignUpPasswordPage() {
  const router = useRouter();

  const [indexNo, setIndexNo] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedIndex = localStorage.getItem('astrix_pending_index') || sessionStorage.getItem('astrix_verified_index') || '';
    const storedName = localStorage.getItem('astrix_pending_name') || '';
    const storedEmail = localStorage.getItem('astrix_pending_email') || '';
    const storedCode = sessionStorage.getItem('astrix_verified_code') || '';

    if (!storedIndex || !storedCode) {
      // If no verified OTP session exists, redirect back to details
      router.replace('/signup/details');
      return;
    }

    setIndexNo(storedIndex);
    setUsername(storedName);
    setEmail(storedEmail);
    setCode(storedCode);
  }, [router]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPass = password.trim();
    if (!cleanPass || cleanPass.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (cleanPass !== confirmPassword.trim()) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('astrix_verification_token') || undefined;

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index_no: indexNo,
          code: code,
          password: cleanPass,
          verification_token: token,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      // Cleanup signup storage
      localStorage.removeItem('astrix_verification_token');
      localStorage.removeItem('astrix_pending_index');
      localStorage.removeItem('astrix_pending_email');
      localStorage.removeItem('astrix_pending_name');
      sessionStorage.removeItem('astrix_verified_code');
      sessionStorage.removeItem('astrix_verified_index');

      // Cache user info for instant display
      if (json.user) {
        localStorage.setItem('astrix_user', JSON.stringify(json.user));
        seedStationUser(json.user);
      }

      // Direct redirect to Dashboard!
      router.push('/dashboard');
    } catch (err: any) {
      console.warn('Account creation failed:', err.message);
      setError('Could not connect to the server. Please check your connection.');
      setLoading(false);
    }
  };

  return (
    <div className="astrix-theme-page select-none overflow-y-auto">
      <StormHeader rain className="astrix-theme-header password">
        <div className="astrix-header-top">
          <button type="button" onClick={() => router.push('/signup/details')} className="astrix-header-back" aria-label="Back to student details">
            <ArrowLeft size={21} /> <span>Back</span>
          </button>
          <span className="astrix-step-count">Step 3 of 3</span>
        </div>
        <h1 className="astrix-theme-title">Set your password</h1>
      </StormHeader>

      <main className="astrix-theme-sheet">
        <SignupProgress step={3} />

        <div className="astrix-verified-card" aria-label="Verified student account">
          <span className="astrix-verified-check"><Check size={22} strokeWidth={3} aria-hidden="true" /></span>
          <div>
            <strong>{username || 'Student'}</strong>
            <span>{indexNo}</span>
            <span>{email}</span>
          </div>
        </div>

        <form onSubmit={handleCreateAccount} className="astrix-flow-fields">
          {error && (
            <div role="alert" className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="new-password" className="astrix-flow-label">Password</label>
            <div className="astrix-password-wrap">
              <Lock size={18} className="astrix-password-icon" aria-hidden="true" />
              <input id="new-password" type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"
                autoComplete="new-password" minLength={6} required className="astrix-flow-input" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="astrix-password-eye" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-[#7184a2]">At least 6 characters</p>
          </div>

          <div>
            <label htmlFor="confirm-password" className="astrix-flow-label">Confirm password</label>
            <div className="astrix-password-wrap">
              <Lock size={18} className="astrix-password-icon" aria-hidden="true" />
              <input id="confirm-password" type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password"
                autoComplete="new-password" minLength={6} required className="astrix-flow-input" />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="astrix-password-eye" aria-label={showConfirm ? 'Hide confirmation' : 'Show confirmation'}>
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading || password.length < 6 || password !== confirmPassword} className="astrix-flow-button mt-1">
            {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Create account <ArrowRight size={18} /></>}
          </button>
        </form>

        <p className="astrix-flow-hint mt-5 flex items-center justify-center gap-2">
          <Check size={16} className="text-emerald-600" aria-hidden="true" /> Your university ID is verified.
        </p>
        <div className="astrix-flow-footer">
          <Link href="/login" className="astrix-flow-link">Already registered? Sign in</Link>
        </div>
      </main>
    </div>
  );
}
