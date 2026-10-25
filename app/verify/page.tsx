'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Mail,
  User,
} from 'lucide-react';

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isResetMode, setIsResetMode] = useState(false);
  const [indexNo, setIndexNo] = useState('');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // If user visits /verify directly with no index
  const [manualIndexInput, setManualIndexInput] = useState('');
  const [requestingCode, setRequestingCode] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const paramIndex = searchParams.get('index_no');
    const paramEmail = searchParams.get('email');
    const mode = searchParams.get('mode');

    const reset = mode === 'reset';
    setIsResetMode(reset);

    const storedIndex =
      paramIndex ||
      (reset ? sessionStorage.getItem('astrix_reset_index') : localStorage.getItem('astrix_pending_index')) ||
      '';

    const storedEmail =
      paramEmail ||
      (reset ? sessionStorage.getItem('astrix_reset_email') : localStorage.getItem('astrix_pending_email')) ||
      '';


    setIndexNo(storedIndex);
    setEmail(storedEmail);

    // Auto-focus first OTP input if index exists
    if (storedIndex) {
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    }
  }, [searchParams]);

  const handleOtpChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      const copy = [...otpDigits];
      copy[index] = '';
      setOtpDigits(copy);
      return;
    }

    if (clean.length > 1) {
      const pasted = clean.slice(0, 6).split('');
      const copy = [...otpDigits];
      pasted.forEach((char, i) => {
        if (i < 6) copy[i] = char;
      });
      setOtpDigits(copy);
      const nextIndex = Math.min(pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const copy = [...otpDigits];
    copy[index] = clean[0];
    setOtpDigits(copy);

    if (index < 5 && clean[0]) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Resend OTP code
  const handleResendCode = async () => {
    if (!indexNo) return;
    setResending(true);
    setError(null);
    setSuccess(null);

    try {
      if (isResetMode) {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index_no: indexNo }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setSuccess(`A new reset code was sent to ${json.masked_email || email}`);
          setEmail(json.masked_email || email);
        } else {
          setError(json.message || 'Could not resend code. Please try again.');
        }
      } else {
        // Resend signup OTP
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            index_no: indexNo,
            username: localStorage.getItem('astrix_pending_name') || 'Student',
            email: localStorage.getItem('astrix_pending_email') || email,
          }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          if (json.data?.verification_token) {
            localStorage.setItem('astrix_verification_token', json.data.verification_token);
          }
          setSuccess(`A new verification code was sent to ${email}`);
        } else {
          setError(json.message || 'Could not resend code.');
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  // Request code when visiting directly without index
  const handleRequestCodeFromIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIdx = manualIndexInput.trim().toUpperCase();
    if (!cleanIdx) {
      setError('Please enter your University Index Number.');
      return;
    }

    setRequestingCode(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_no: cleanIdx }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'Account not found. Please register first.');
        setRequestingCode(false);
        return;
      }

      setIndexNo(cleanIdx);
      setEmail(json.masked_email || '');
      setIsResetMode(true);
      setSuccess(`Reset code sent to ${json.masked_email}`);
      setTimeout(() => inputRefs.current[0]?.focus(), 200);
    } catch (err: any) {
      setError(err.message || 'Failed to connect.');
    } finally {
      setRequestingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== verifyPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);

    try {
      const cleanIndex = indexNo.trim().toUpperCase();
      const verificationToken = !isResetMode
        ? localStorage.getItem('astrix_verification_token') || undefined
        : undefined;

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index_no: cleanIndex,
          code: fullOtp,
          password: newPassword,
          verification_token: verificationToken,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'Verification failed. Please check the code and try again.');
        setLoading(false);
        return;
      }

      // Cleanup pending data
      localStorage.removeItem('astrix_verification_token');
      sessionStorage.removeItem('astrix_reset_index');

      if (isResetMode) {
        setSuccess('✅ Password reset successfully! Redirecting to Sign In...');
        setTimeout(() => {
          router.push(`/login?reset=success&index_no=${encodeURIComponent(cleanIndex)}`);
        }, 700);
      } else {
        const verifiedUser = json.user || {
          index_no: cleanIndex,
          username: localStorage.getItem('astrix_pending_name') || 'Student',
          email: email.trim().toLowerCase(),
        };
        localStorage.setItem('astrix_user', JSON.stringify(verifiedUser));

        setSuccess('✅ Account verified & password set! Redirecting to Sign In...');
        setTimeout(() => {
          router.push(`/login?verified=true&index_no=${encodeURIComponent(cleanIndex)}`);
        }, 700);
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
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
            href="/login"
            className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-sky-600 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>

        </div>

        <div>
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-600/30 mb-2">
            {isResetMode ? <Lock className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {isResetMode ? 'Reset Password' : 'Verify Code'}
          </h1>
          <p className="text-xs text-slate-500">
            {indexNo ? (
              <>
                Enter the 6-digit {isResetMode ? 'reset' : 'verification'} code sent to{' '}
                <span className="font-semibold text-slate-700 font-mono">{email || 'your email'}</span>
              </>
            ) : (
              'Enter your University Index Number to receive a reset code.'
            )}
          </p>
        </div>
      </div>

      {/* Case A: No Index No. Provided (Prompt User) */}
      {!indexNo ? (
        <form onSubmit={handleRequestCodeFromIndex} className="py-6 space-y-4 my-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              University Index Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={manualIndexInput}
                onChange={(e) => setManualIndexInput(e.target.value.toUpperCase())}
                placeholder="e.g. 250373T"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 uppercase font-mono font-semibold transition"
                autoFocus
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={requestingCode}
            className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-md shadow-sky-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-60"
          >
            {requestingCode ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Send Reset Code</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      ) : (
        /* Case B: Main OTP & Password Reset Form */
        <form onSubmit={handleSubmit} className="py-4 space-y-4 my-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start space-x-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* 6-Digit OTP Input Boxes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Verification Code
              </label>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resending}
                className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline inline-flex items-center space-x-1 disabled:opacity-50"
              >
                {resending ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <span>Resend Code</span>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-11 h-12 sm:w-12 sm:h-13 text-center text-lg font-bold font-mono rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                />
              ))}
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {isResetMode ? 'New Password' : 'Create Password'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                required
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

          {/* Verify Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showVerifyPassword ? 'text' : 'password'}
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
                required
              />
              <button
                type="button"
                onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showVerifyPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-md shadow-sky-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-60 active:scale-[0.99] mt-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{isResetMode ? 'Reset Password & Sign In' : 'Set Password & Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 text-center">
        <Link
          href="/login"
          className="text-xs font-semibold text-slate-600 hover:text-sky-600 transition"
        >
          ← Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
