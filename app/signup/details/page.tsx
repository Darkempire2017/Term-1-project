'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowLeft, AlertCircle, Check, CheckCircle2 } from 'lucide-react';
import { StormHeader } from '@/components/Storm';
import { SignupProgress } from '@/components/SignupProgress';
import '../../theme-pages.css';

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
    <div className="astrix-theme-page select-none overflow-y-auto">
      <StormHeader rain className="astrix-theme-header">
        <div className="astrix-header-top">
          <button type="button" onClick={() => router.push('/signup')} className="astrix-header-back" aria-label="Back to scan student ID">
            <ArrowLeft size={21} /> <span>Back</span>
          </button>
          <span className="astrix-step-count">Step 2 of 3</span>
        </div>
        <h1 className="astrix-theme-title">Student details</h1>
      </StormHeader>

      <main className="astrix-theme-sheet">
        <SignupProgress step={2} />

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {info && (
          <div role="status" className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> <span>{info}</span>
          </div>
        )}

        <div className="astrix-verified-card" aria-label={`Verified student ID ${indexNo}`}>
          <span className="astrix-verified-check"><Check size={22} strokeWidth={3} aria-hidden="true" /></span>
          <div><strong>Verified barcode</strong><span>{indexNo}</span></div>
        </div>

        <div className="astrix-flow-fields">
          <div>
            <label htmlFor="student-name" className="astrix-flow-label">Student name</label>
            <input id="student-name" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. H. S. S. Liyanage" disabled={otpSent} required autoComplete="name"
              className="astrix-flow-input" />
          </div>
          <div>
            <label htmlFor="student-email" className="astrix-flow-label">University email</label>
            <input id="student-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com" disabled={otpSent} required autoComplete="email"
              className="astrix-flow-input" />
          </div>
        </div>

        {!otpSent ? (
          <div className="mt-6">
            <button type="button" onClick={() => handleSendOtp()} disabled={sendingOtp || !username.trim() || !email.trim()}
              className="astrix-flow-button">
              {sendingOtp ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Send OTP <ArrowRight size={18} /></>}
            </button>
            <p className="astrix-flow-hint">We’ll email you a 6-digit verification code.</p>
          </div>
        ) : (
          <form onSubmit={handleVerifyOtp} className="astrix-otp-panel">
            <div className="flex items-center justify-between gap-3 mb-2">
              <label htmlFor="signup-otp" className="astrix-flow-label mb-0">Enter 6-digit code</label>
              <button type="button" onClick={() => setOtpSent(false)} className="astrix-flow-link">Edit email</button>
            </div>
            <input id="signup-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456" required autoFocus className="astrix-flow-input astrix-otp-input" />
            <button type="submit" disabled={verifyingOtp || otpCode.length !== 6} className="astrix-flow-button mt-4">
              {verifyingOtp ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Verify and continue <ArrowRight size={18} /></>}
            </button>
            <button type="button" onClick={() => handleSendOtp()} disabled={sendingOtp} className="astrix-flow-link block mx-auto mt-4">Resend code</button>
          </form>
        )}

        <div className="astrix-flow-footer">
          <Link href="/signup" className="astrix-flow-link">Scan a different student ID</Link>
        </div>
      </main>
    </div>
  );
}
