'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

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
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none overflow-y-auto">
      {/* Header */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/signup/details')}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-sky-600 transition py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <span className="text-xs font-semibold text-slate-500">
            Step 3 of 3
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Set Password</h1>
          <p className="text-xs text-slate-500">
            Create a secure password to access your Astrix account.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <form onSubmit={handleCreateAccount} className="my-auto py-4 space-y-4">
        {/* Verified Student Badge */}
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between shadow-xs">
          <div className="space-y-0.5">
            <p className="font-bold text-emerald-950">{username || 'Student'}</p>
            <p className="text-[11px] font-mono text-emerald-800 font-semibold">{indexNo} • {email}</p>
          </div>
          <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Verified OTP</span>
          </span>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* 1. New Password */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-white border-2 border-slate-200 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-xs"
              required
              minLength={6}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 2. Confirm Password */}
        <div className="space-y-1 pt-1">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Confirm Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-white border-2 border-slate-200 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-xs"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading || password.length < 6 || password !== confirmPassword}
            className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-sky-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-50 active:scale-[0.99] cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Complete Registration & Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 text-center">
        <Link
          href="/login"
          className="text-xs font-semibold text-slate-500 hover:text-sky-600 transition"
        >
          Already registered? Sign In
        </Link>
      </div>
    </div>
  );
}
