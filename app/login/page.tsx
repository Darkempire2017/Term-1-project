'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Umbrella, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useViewMode } from '@/components/ViewModeContext';

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

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none">
      {/* Top Header */}
      <div className="pt-6 space-y-4">
        <div className="flex items-center justify-end">
          {!isStudentMode && (
            <button
              type="button"
              onClick={fillDemoStudent}
              className="text-[11px] text-sky-600 hover:text-sky-700 font-bold bg-sky-50 hover:bg-sky-100/80 px-2.5 py-1 rounded-lg transition"
            >
              Fill dev index (DEV001)
            </button>
          )}
        </div>

        <div className="space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-600/30 mb-3">
            <Umbrella className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sign In</h1>
          <p className="text-xs text-slate-500">
            Enter your University Index Number to access the umbrella station.
          </p>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSignIn} className="my-auto py-6 space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start space-x-2 animate-in fade-in leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* Index Number */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Index No.
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={indexNo}
              onChange={(e) => setIndexNo(e.target.value)}
              placeholder="e.g. 210042A"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 uppercase font-mono tracking-wide transition"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Password
            </label>
            <button
              type="button"
              onClick={handleOpenForgotModal}
              className="text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline"
            >
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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

        {/* Sign In Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-md shadow-sky-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-60 active:scale-[0.99]"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Prominent Register / Sign Up Section */}
        <div className="pt-1 text-center space-y-2">
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[11px] text-slate-400 font-medium">New student?</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <Link
            href="/signup"
            className="w-full py-3.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200 shadow-sm flex items-center justify-center space-x-2 transition active:scale-[0.99]"
          >
            <span>Register with Student ID</span>
          </Link>
        </div>
      </form>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Reset Password</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your University Index Number to receive a 6-digit reset code at your registered email.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {forgotError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            <form onSubmit={handleSendResetCode} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Index Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={forgotIndex}
                    onChange={(e) => setForgotIndex(e.target.value.toUpperCase())}
                    placeholder="e.g. 250373T"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 uppercase font-mono font-semibold transition"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md shadow-sky-600/30 flex items-center justify-center space-x-1.5 transition disabled:opacity-60"
                >
                  {forgotLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Send Code</span>
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
          <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
