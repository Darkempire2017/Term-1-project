'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, User, Hash, MapPin, Mail, ArrowRight, ArrowLeft, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function SignUpDetailsPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [indexNo, setIndexNo] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load extracted data from session
    const storedUsername = sessionStorage.getItem('astrix_verified_username');
    const storedIndex = sessionStorage.getItem('astrix_verified_index');
    const storedAddress = sessionStorage.getItem('astrix_verified_address');

    if (!storedIndex || !storedUsername) {
      // If no card has been scanned, redirect to upload step
      router.replace('/signup');
      return;
    }

    setUsername(storedUsername);
    setIndexNo(storedIndex);
    setAddress(storedAddress || 'Katubedda, Moratuwa');

    // Default email based on index number
    const cleanIdx = storedIndex.toLowerCase().replace(/[^a-z0-9]/g, '');
    setEmail(`${cleanIdx}@uom.lk`);
  }, [router]);

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid university or personal email address.');
      return;
    }

    setLoading(true);

    try {
      const cleanIndex = indexNo.trim().toUpperCase();

      // Call backend signup API
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index_no: cleanIndex,
          username: username.trim(),
          address: address.trim(),
          email: cleanEmail,
        }),
      });

      const json = await res.json();
      const otpCode = json.data?.demo_otp || '123456';

      // Store state for screen continuity
      localStorage.setItem('astrix_pending_index', cleanIndex);
      localStorage.setItem('astrix_pending_email', cleanEmail);
      localStorage.setItem('astrix_pending_name', username.trim());
      localStorage.setItem('astrix_demo_otp', otpCode);

      // Navigate to /verify
      router.push(`/verify?index_no=${encodeURIComponent(cleanIndex)}&email=${encodeURIComponent(cleanEmail)}`);
    } catch (err: any) {
      console.warn('Database note:', err.message);
      // Fallback navigation
      localStorage.setItem('astrix_pending_index', indexNo);
      localStorage.setItem('astrix_pending_email', cleanEmail);
      localStorage.setItem('astrix_pending_name', username);
      localStorage.setItem('astrix_demo_otp', '123456');
      router.push(`/verify?index_no=${encodeURIComponent(indexNo)}&email=${encodeURIComponent(cleanEmail)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none overflow-y-auto">
      {/* Header */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href="/signup"
            className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-sky-600 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Upload different ID</span>
          </Link>

          <span className="text-xs font-semibold text-slate-500">
            Step 2 of 2
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Verified Details</h1>
          <p className="text-xs text-slate-500">
            Student details extracted from your ID card are locked for security. Enter your email to proceed.
          </p>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleVerifySubmit} className="my-auto py-4 space-y-3.5">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. User Name (LOCKED / UNCHANGEABLE) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              User Name
            </label>
            <span className="text-[10px] text-slate-400 font-semibold inline-flex items-center space-x-1">
              <Lock className="w-2.5 h-2.5" />
              <span>Locked (from ID)</span>
            </span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={username}
              disabled
              readOnly
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-sm font-semibold text-slate-700 cursor-not-allowed select-text"
            />
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* 2. Index No. (LOCKED / UNCHANGEABLE) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Index No.
            </label>
            <span className="text-[10px] text-slate-400 font-semibold inline-flex items-center space-x-1">
              <Lock className="w-2.5 h-2.5" />
              <span>Locked (from ID)</span>
            </span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Hash className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={indexNo}
              disabled
              readOnly
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-sm font-mono font-bold text-slate-800 tracking-wide cursor-not-allowed select-text"
            />
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* 3. Address (LOCKED / UNCHANGEABLE) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Address
            </label>
            <span className="text-[10px] text-slate-400 font-semibold inline-flex items-center space-x-1">
              <Lock className="w-2.5 h-2.5" />
              <span>Locked (from ID)</span>
            </span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <MapPin className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={address}
              disabled
              readOnly
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-sm font-medium text-slate-700 cursor-not-allowed select-text"
            />
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* 4. Email (THE ONLY CHANGEABLE FIELD) */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-sky-700 uppercase tracking-wider flex items-center space-x-1">
              <span>Email</span>
              <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.2 rounded font-normal normal-case">
                Editable
              </span>
            </label>
            <span className="text-[10px] text-slate-400">OTP will be sent here</span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sky-600">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. 210042a@uom.lk"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border-2 border-sky-400 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-sm"
              required
            />
          </div>
        </div>

        {/* VERIFY Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm uppercase tracking-wider shadow-md shadow-sky-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-60 active:scale-[0.99] mt-4"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>VERIFY</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 text-center">
        <Link
          href="/signup"
          className="text-xs font-semibold text-slate-500 hover:text-sky-600 transition"
        >
          ← Upload a different Student ID
        </Link>
      </div>
    </div>
  );
}
