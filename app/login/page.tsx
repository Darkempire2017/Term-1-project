'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Umbrella, Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
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

  useEffect(() => {
    const isVerified = searchParams.get('verified') === 'true';
    const paramIndex = searchParams.get('index_no');

    if (paramIndex) {
      setIndexNo(paramIndex.toUpperCase());
    }

    if (isVerified) {
      setSuccess('✅ Email verified & password created! Enter your credentials to sign in.');
    }
  }, [searchParams]);

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
      // Query user in live Supabase
      const { data: user, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('index_no', cleanIndex)
        .maybeSingle();

      if (dbError) {
        console.warn('Database lookup error:', dbError.message);
      }

      if (user) {
        // Password check
        if (user.password && user.password !== password) {
          setError('Invalid password. Please check and try again.');
          setLoading(false);
          return;
        }

        // Store user in local storage session
        localStorage.setItem(
          'astrix_user',
          JSON.stringify({
            index_no: user.index_no,
            username: user.username,
            email: user.email,
          })
        );

        setSuccess(`Welcome back, ${user.username}!`);
        setTimeout(() => {
          router.push('/dashboard');
        }, 600);
        return;
      }

      // If user doesn't exist yet in Supabase (first-time demo testing mode)
      localStorage.setItem(
        'astrix_user',
        JSON.stringify({
          index_no: cleanIndex,
          username: cleanIndex === '210042A' ? 'K. A. Nimal Perera' : `Student ${cleanIndex}`,
          email: `${cleanIndex.toLowerCase()}@uom.lk`,
        })
      );

      setSuccess('Signed in successfully (Demo Session).');
      setTimeout(() => {
        router.push('/dashboard');
      }, 600);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoStudent = () => {
    setIndexNo('210042A');
    setPassword('password123');
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none">
      {/* Top Header */}
      <div className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-100">
            <Sparkles className="w-3.5 h-3.5 text-sky-500" />
            <span>University of Moratuwa</span>
          </div>

          {!isStudentMode && (
            <button
              type="button"
              onClick={fillDemoStudent}
              className="text-[11px] text-sky-600 hover:text-sky-700 font-bold bg-sky-50 hover:bg-sky-100/80 px-2.5 py-1 rounded-lg transition"
            >
              Auto-fill Demo
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
            <Link
              href="/verify"
              className="text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline"
            >
              Forgot Password?
            </Link>
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
      </form>

      {/* Footer / Switch to Sign Up */}
      <div className="pt-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-sky-600 font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
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
