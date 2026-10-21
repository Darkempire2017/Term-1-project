'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Navigation, Database, Eye, ChevronDown, ChevronUp, Sparkles, UserCheck, Wrench, X } from 'lucide-react';
import { useViewMode } from './ViewModeContext';

export const DevToolbar: React.FC = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { isStudentMode, toggleViewMode } = useViewMode();

  const screens = [
    { name: 'Home Splash', path: '/' },
    { name: '1. Sign In', path: '/login' },
    { name: '1A. Upload ID', path: '/signup' },
    { name: '1B. Verified Details', path: '/signup/details' },
    { name: '2. Verify (OTP)', path: '/verify' },
    { name: '3. Profile', path: '/profile' },
    { name: '4. Dashboard', path: '/dashboard' },
  ];

  return (
    <div className="fixed top-3 right-3 z-50 flex flex-col items-end select-none">
      {/* Minimized Pill */}
      {!isOpen && isStudentMode ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-slate-900/75 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700/60 shadow-lg text-[11px] font-medium backdrop-blur-md transition group"
          title="Click to toggle Developer Tools or change screens"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Student View</span>
          <span className="text-[10px] text-slate-400 group-hover:text-sky-300">⚙️</span>
        </button>
      ) : !isOpen && !isStudentMode ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-sky-950/90 text-white hover:bg-sky-900 border border-sky-600/60 shadow-lg text-xs font-semibold backdrop-blur-md transition"
        >
          <Wrench className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Dev Mode Active</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
            {pathname}
          </span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      ) : null}

      {/* Expanded Menu */}
      {isOpen && (
        <div className="w-72 bg-slate-900/98 backdrop-blur-xl border border-slate-700 text-white rounded-3xl shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-xs tracking-tight">View Mode Controller</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* POV Mode Toggle Switch */}
          <div className="bg-slate-800/80 p-1.5 rounded-2xl flex items-center border border-slate-700/80">
            <button
              type="button"
              onClick={() => isStudentMode || toggleViewMode()}
              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                isStudentMode
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Student POV (Clean)</span>
            </button>

            <button
              type="button"
              onClick={() => !isStudentMode || toggleViewMode()}
              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                !isStudentMode
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Dev Mode</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed px-1">
            {isStudentMode
              ? '✨ Student POV is ON: All demo buttons and testing pills are hidden. You see the 100% authentic mobile app.'
              : '🛠️ Dev Mode is ON: Quick auto-fill buttons and state toggles are visible for testing.'}
          </p>

          {/* Quick Jump Links */}
          <div className="border-t border-slate-800 pt-2.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-1 mb-1">
              Jump To Screen:
            </span>
            {screens.map((s) => {
              const active = pathname === s.path;
              return (
                <Link
                  key={s.path}
                  href={s.path}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                    active
                      ? 'bg-sky-600 text-white font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{s.name}</span>
                  <span className="font-mono text-[10px] opacity-50">{s.path}</span>
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 px-1">
            <span>UoM Astrix Preview</span>
            <span className="text-emerald-400 flex items-center space-x-1">
              <Database className="w-2.5 h-2.5" />
              <span>Supabase Live</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
