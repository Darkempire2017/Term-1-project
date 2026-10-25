'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, User, Hash, Mail, ArrowRight, ArrowLeft, AlertCircle, Barcode } from 'lucide-react';

export default function SignUpDetailsPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [indexNo, setIndexNo] = useState('');
  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load verified index from barcode scan
    const storedIndex = sessionStorage.getItem('astrix_verified_index');

    if (!storedIndex) {
      // If no barcode has been scanned, redirect to scan step
      router.replace('/signup');
      return;
    }

    setIndexNo(storedIndex);

    // Keep email empty by default for user to enter their preferred email
    setEmail('');
  }, [router]);

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = username.trim();
    if (!cleanName || cleanName.length < 3) {
      setError('Please enter your student name (with initials or full name).');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
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
          username: cleanName,
          email: cleanEmail,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'Unable to send verification code. Please try again.');
        setLoading(false);
        return;
      }

      // Store token and pending data for /verify
      if (json.data?.verification_token) {
        localStorage.setItem('astrix_verification_token', json.data.verification_token);
      }
      localStorage.setItem('astrix_pending_index', cleanIndex);
      localStorage.setItem('astrix_pending_email', cleanEmail);
      localStorage.setItem('astrix_pending_name', cleanName);

      // Navigate to /verify
      router.push(`/verify?index_no=${encodeURIComponent(cleanIndex)}&email=${encodeURIComponent(cleanEmail)}`);
    } catch (err: any) {
      console.warn('Signup request failed:', err.message);
      setError('Could not reach the server. Please check your connection and try again.');
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
            <span>Scan different ID</span>
          </Link>

          <span className="text-xs font-semibold text-slate-500">
            Step 2 of 2
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Student Details</h1>
          <p className="text-xs text-slate-500">
            Index number is locked from your ID barcode. Enter your name and email to receive your OTP.
          </p>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleVerifySubmit} className="my-auto py-4 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Index No. (STRICTLY LOCKED / UNCHANGEABLE) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-1">
              <Barcode className="w-3.5 h-3.5 text-sky-600" />
              <span>Index Number</span>
            </label>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
              <Lock className="w-2.5 h-2.5" />
              <span>Verified Barcode</span>
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
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-100/90 border-2 border-slate-200 text-base font-mono font-bold text-slate-900 tracking-wide cursor-not-allowed select-text shadow-xs"
            />
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* 2. User Name (EDITABLE by Student) */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
              <span>Student Name</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal normal-case">
                Enter your name
              </span>
            </label>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. H. S. S. Liyanage"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border-2 border-slate-200 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-xs"
              required
            />
          </div>
        </div>

        {/* 3. Email (EDITABLE by Student) */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
              <span>Email Address</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal normal-case">
                OTP will be sent here
              </span>
            </label>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. name@gmail.com"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border-2 border-slate-200 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-xs"
              required
            />
          </div>
        </div>

        {/* VERIFY Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm uppercase tracking-wider shadow-md shadow-sky-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-60 active:scale-[0.99] mt-6"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>VERIFY & SEND OTP</span>
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
          ← Scan a different Student ID
        </Link>
      </div>
    </div>
  );
}
