import React, { useState } from 'react';
import { api } from '../services/api';
import { MailCheck, AlertCircle, RefreshCw, CheckCircle2, ArrowLeft } from 'lucide-react';
import { User } from '../types';

interface VerifyEmailProps {
  email: string;
  onVerified: (user: User, token: string) => void;
  onBack: () => void;
}

export const VerifyEmail: React.FC<VerifyEmailProps> = ({ email, onVerified, onBack }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (code.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.verifyEmail({ email, code: code.trim() });
      if (res.success) {
        api.setToken(res.token);
        onVerified(res.user, res.token);
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setMessage(null);
    setResending(true);
    try {
      const res = await api.resendOtp(email);
      setMessage(res.message || 'A new 6-digit verification code was dispatched!');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-6 sm:p-8 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center text-xs text-slate-500 hover:text-slate-800 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
        Back to registration
      </button>

      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
          <MailCheck className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Verify Your Email</h2>
        <p className="text-sm text-slate-500 mt-1">
          We sent a 6-digit code to <strong className="text-slate-800">{email}</strong>
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-5">
        <div>
          <label className="block text-center text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Enter 6-Digit OTP Code
          </label>
          <input
            type="text"
            maxLength={6}
            required
            autoFocus
            placeholder="• • • • • •"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full py-3 text-center text-3xl font-mono tracking-[0.5em] font-bold bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 focus:bg-white transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20 flex items-center justify-center space-x-2 transition disabled:opacity-50"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span>Verify & Enter Station</span>
          )}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Didn't receive the email?</span>
        <button
          onClick={handleResend}
          disabled={resending}
          className="font-semibold text-sky-600 hover:text-sky-700 flex items-center space-x-1 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
          <span>Resend Code</span>
        </button>
      </div>
    </div>
  );
};
