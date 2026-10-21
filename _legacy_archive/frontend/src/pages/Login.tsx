import React, { useState } from 'react';
import { api } from '../services/api';
import { LogIn, AlertCircle, ArrowRight, UserCheck, KeyRound } from 'lucide-react';
import { User } from '../types';

interface LoginProps {
  onSuccess: (user: User, token: string) => void;
  onGoToRegister: () => void;
  onRequiresVerification: (email: string) => void;
}

export const Login: React.FC<LoginProps> = ({
  onSuccess,
  onGoToRegister,
  onRequiresVerification,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login({ identifier, password });
      if (res.success) {
        api.setToken(res.token);
        onSuccess(res.user, res.token);
      }
    } catch (err: any) {
      if (err.requiresVerification) {
        onRequiresVerification(err.email || identifier);
      } else {
        setError(err.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-6 sm:p-8 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
          <LogIn className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Student Sign In</h2>
        <p className="text-sm text-slate-500 mt-1">
          Access your smart umbrella account and station controls.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2.5 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            Index Number or Email *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <input
              type="text"
              required
              placeholder="e.g. 21/CS/089 or student@uni.edu"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            Password *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20 flex items-center justify-center space-x-2 transition disabled:opacity-50"
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

      <div className="mt-6 text-center text-xs text-slate-500">
        Don't have an account yet?{' '}
        <button
          onClick={onGoToRegister}
          className="font-semibold text-sky-600 hover:text-sky-700 underline"
        >
          Register here
        </button>
      </div>
    </div>
  );
};
