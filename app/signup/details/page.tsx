'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, User, Hash, Mail, ArrowRight, ArrowLeft, AlertCircle, Barcode, CheckCircle2, KeyRound } from 'lucide-react';

export default function SignUpDetailsPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [indexNo, setIndexNo] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    // Load verified index from barcode scan
    const storedIndex = sessionStorage.getItem('astrix_verified_index');

    if (!storedIndex) {
      // If no barcode has been scanned, redirect to scan step
      router.replace('/signup');
      return;
    }

    setIndexNo(storedIndex);
    setEmail('');
  }, [router]);

  // Step A: Send OTP to student email
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setInfo(null);

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

    setSendingOtp(true);

    try {
      const cleanIndex = indexNo.trim().toUpperCase();

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
        setSendingOtp(false);
        return;
      }

      if (json.data?.verification_token) {
        localStorage.setItem('astrix_verification_token', json.data.verification_token);
      }
      localStorage.setItem('astrix_pending_index', cleanIndex);
      localStorage.setItem('astrix_pending_email', cleanEmail);
      localStorage.setItem('astrix_pending_name', cleanName);

      setOtpSent(true);
      setInfo(`Verification OTP sent to ${cleanEmail}. Please check your inbox.`);
    } catch (err: any) {
      console.warn('Signup OTP request failed:', err.message);
      setError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setSendingOtp(false);
    }
  };

  // Step B: Verify the 6-digit OTP code and proceed to Password Setup
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    setVerifyingOtp(true);

    try {
      const cleanIndex = indexNo.trim().toUpperCase();
      const token = localStorage.getItem('astrix_verification_token') || '';

      const res = await fetch('/api/auth/check-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index_no: cleanIndex,
          code: cleanCode,
          verification_token: token,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'Invalid verification code. Please try again.');
        setVerifyingOtp(false);
        return;
      }

      // Store verified OTP for the password setup step
      sessionStorage.setItem('astrix_verified_code', cleanCode);

      // Navigate to dedicated password setup screen
      router.push('/signup/password');
    } catch (err: any) {
      console.warn('Verify OTP failed:', err.message);
      setError('Could not connect to the verification server. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none overflow-y-auto">
      {/* Header */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/signup')}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-sky-600 transition py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <span className="text-xs font-semibold text-slate-500">
            Step 2 of 3
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Student Details</h1>
          <p className="text-xs text-slate-500">
            Enter your student details to register.
          </p>
        </div>
      </div>

      {/* Form Content */}
      <div className="my-auto py-4 space-y-4">
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {info && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-relaxed">{info}</span>
          </div>
        )}

        {/* 1. Index No. (Locked from Barcode Scan) */}
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
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Student Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. H. S. S. Liyanage"
              disabled={otpSent}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border-2 border-slate-200 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-xs disabled:bg-slate-50"
              required
            />
          </div>
        </div>

        {/* 3. Email Address (EDITABLE by Student) */}
        <div className="space-y-1 pt-1">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student@gmail.com"
              disabled={otpSent}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border-2 border-slate-200 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-xs disabled:bg-slate-50"
              required
            />
          </div>
        </div>

        {/* 4. Send OTP Button (Below Email Field) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => handleSendOtp()}
            disabled={sendingOtp || !username.trim() || !email.trim()}
            className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm flex items-center justify-center space-x-2 transition disabled:opacity-50 active:scale-[0.99] cursor-pointer"
          >
            {sendingOtp ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{otpSent ? 'Resend OTP' : 'Send OTP'}</span>
                <Mail className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* 5. In-Page OTP Section (Active once OTP is sent) */}
        {otpSent && (
          <form onSubmit={handleVerifyOtp} className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-2 border-t border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
                  <KeyRound className="w-3.5 h-3.5 text-sky-600" />
                  <span>Enter 6-Digit OTP</span>
                </label>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold"
                >
                  Edit Email
                </button>
              </div>

              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full py-3 px-4 rounded-xl bg-white border-2 border-sky-300 text-center font-mono text-xl tracking-[0.3em] font-black text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-4 focus:ring-sky-500/15 focus:border-sky-600 transition shadow-xs"
                required
                autoFocus
              />
            </div>

            {/* Verify OTP Button */}
            <button
              type="submit"
              disabled={verifyingOtp || otpCode.length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-emerald-600/25 flex items-center justify-center space-x-2 transition disabled:opacity-50 active:scale-[0.99] cursor-pointer"
            >
              {verifyingOtp ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Verify OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

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
