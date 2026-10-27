'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useViewMode } from '@/components/ViewModeContext';
import { StormHeader, CloudMark } from '@/components/Storm';
import { ContactFooter } from '@/components/ContactFooter';
import { seedStationUser } from '@/lib/stationCache';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isStudentMode } = useViewMode();

  const [indexNo, setIndexNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIndex, setForgotIndex] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    const isVerified = searchParams.get('verified') === 'true';
    const isReset = searchParams.get('reset') === 'success';
    const paramIndex = searchParams.get('index_no');

    if (paramIndex) {
      setIndexNo(paramIndex.toUpperCase());
    }

    if (isVerified) {
      setSuccess('✅ Email verified & password created! Enter your credentials to sign in.');
    } else if (isReset) {
      setSuccess('✅ Password reset successfully! Please sign in with your new password.');
    }

    const notice = searchParams.get('notice');
    if (notice === 'session_expired') {
      setError('Your session has ended. Please sign in again.');
    }
  }, [searchParams]);

  const handleOpenForgotModal = () => {
    setForgotIndex(indexNo.trim().toUpperCase());
    setForgotError(null);
    setShowForgotModal(true);
  };

  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    const cleanIdx = forgotIndex.trim().toUpperCase();
    if (!cleanIdx) {
      setForgotError('Please enter your University Index Number.');
      return;
    }

    setForgotLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_no: cleanIdx }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setForgotError(json.message || 'Could not send reset code. Please check your Index Number.');
        setForgotLoading(false);
        return;
      }

      // Successfully dispatched OTP email! Redirect to /verify in reset mode
      setShowForgotModal(false);
      router.push(
        `/verify?mode=reset&index_no=${encodeURIComponent(cleanIdx)}&email=${encodeURIComponent(json.masked_email || '')}`
      );
    } catch (err: any) {
      setForgotError(err.message || 'Failed to connect. Please try again.');
      setForgotLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanIndex = indexNo.trim().toUpperCase();
    if (!cleanIndex || !password) {
      setError('Please enter both your Index Number and Password.');
      return;
    }

    setLoading(true);

    try {
      // Authenticate via backend API
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_no: cleanIndex, password }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.message || 'Invalid password. Please check and try again.');
        setLoading(false);
        return;
      }

      const activeUser = json.user;

      // The server set a signed session cookie; this copy is only for showing the name
      localStorage.setItem('astrix_user', JSON.stringify(activeUser));
      seedStationUser(activeUser);

      setSuccess(`Welcome back, ${activeUser.username}!`);
      setTimeout(() => {
        router.push('/dashboard');
      }, 600);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fills only the developer index number — the password is never stored in code
  const fillDemoStudent = () => {
    setIndexNo('DEV001');
    setError(null);
  };

  const inputClass =
    'w-full py-3.5 rounded-2xl bg-brand-50 border border-brand-100 text-sm text-brand-900 placeholder-brand-300 placeholder:normal-case placeholder:font-body focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition';
  const labelClass = 'text-[11px] font-bold text-brand-900/70 uppercase tracking-[.14em]';
  const primaryButton =
    'rounded-2xl bg-gradient-to-b from-brand-500 to-brand-700 text-white font-bold shadow-lg shadow-brand-500/30 flex items-center justify-center gap-2 hover:brightness-110 active:scale-[.99] transition disabled:opacity-60';
  const secondaryButton =
    'rounded-2xl border-2 border-brand-100 text-brand-700 font-bold flex items-center justify-center gap-2 hover:bg-brand-50 hover:border-brand-200 transition';

  return (
    <div className="flex-1 flex flex-col font-body bg-white select-none">
      {/* Rainy header, continues the welcome screen */}
      <StormHeader rain className="px-6 pt-10 pb-16">
        <div className="flex justify-end min-h-[26px]">
          {!isStudentMode && (
            <button
              type="button"
              onClick={fillDemoStudent}
              className="text-[11px] font-semibold text-white/80 bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1 rounded-full transition"
            >
              Fill dev index (DEV001)
            </button>
          )}
        </div>
        <div className="mt-6 animate-rise">
          <CloudMark className="w-16 h-16 -ml-1 drop-shadow-lg" />
          <h1 className="font-display font-bold text-[40px] leading-[1.05] tracking-tight mt-2">Welcome back</h1>
          <p className="text-sm text-white/75 mt-2 max-w-[18rem]">
            Sign in with your University Index Number to borrow an umbrella.
          </p>
        </div>
      </StormHeader>

      {/* Form sheet */}
      <section className="relative -mt-8 flex-1 bg-white rounded-t-[32px] px-6 pt-8 pb-8 shadow-[0_-12px_30px_-12px_rgba(15,30,61,.35)]">
        <form onSubmit={handleSignIn} className="space-y-5 animate-rise [animation-delay:.08s]">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Index Number */}
          <div className="space-y-1.5">
            <label className={labelClass}>Index No.</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-300">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={indexNo}
                onChange={(e) => setIndexNo(e.target.value)}
                placeholder="e.g. 210042A"
                className={`${inputClass} pl-11 pr-4 uppercase font-mono tracking-wide`}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Password</label>
              <button
                type="button"
                onClick={handleOpenForgotModal}
                className="text-xs font-semibold text-brand-500 hover:text-brand-700"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-300">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputClass} pl-11 pr-11`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-brand-300 hover:text-brand-500"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Sign In Button */}
          <button type="submit" disabled={loading} className={`w-full mt-1 py-4 text-sm ${primaryButton}`}>
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Register */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-brand-100" />
            <span className="text-[11px] font-medium text-brand-300">New student?</span>
            <div className="flex-1 h-px bg-brand-100" />
          </div>

          <Link href="/signup" className={`w-full py-3.5 text-sm ${secondaryButton}`}>
            Register with Student ID
          </Link>
        </form>

        <p className="mt-8 text-center text-[9px] font-bold tracking-[3px] text-brand-200">ASTRIX</p>
        <ContactFooter className="mt-3" />
      </section>

      {/* Forgot Password Modal: bottom sheet on phones */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-brand-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-[28px] p-6 shadow-2xl animate-rise">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display font-bold text-2xl text-brand-900">Reset password</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your Index Number and we&apos;ll email you a 6-digit reset code.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-8 h-8 shrink-0 rounded-full bg-brand-50 text-brand-500 hover:bg-brand-100 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotError && (
              <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            <form onSubmit={handleSendResetCode} className="mt-5 space-y-5">
              <div className="space-y-1.5">
                <label className={labelClass}>Index Number</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-300">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={forgotIndex}
                    onChange={(e) => setForgotIndex(e.target.value.toUpperCase())}
                    placeholder="e.g. 250373T"
                    className={`${inputClass} pl-11 pr-4 uppercase font-mono font-semibold placeholder:font-normal`}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className={`flex-1 py-3 text-xs ${secondaryButton}`}
                >
                  Cancel
                </button>
                <button type="submit" disabled={forgotLoading} className={`flex-1 py-3 text-xs ${primaryButton}`}>
                  {forgotLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Send code</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
