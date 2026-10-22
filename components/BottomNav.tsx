'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Umbrella, User, ShieldAlert } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const pathname = usePathname();

  // Show bottom nav on dashboard or profile views
  const isDashboard = pathname === '/dashboard';
  const isProfile = pathname === '/profile';

  return (
    <nav className="w-full bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-2.5 flex items-center justify-around shrink-0 z-40 select-none shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
      {/* Dashboard Tab */}
      <Link
        href="/dashboard"
        className={`flex flex-col items-center justify-center space-y-1 transition-all py-1 px-4 rounded-2xl ${
          isDashboard
            ? 'text-sky-600 font-bold scale-105'
            : 'text-slate-400 hover:text-slate-600 font-medium'
        }`}
      >
        <div
          className={`p-1.5 rounded-xl transition ${
            isDashboard ? 'bg-sky-100 text-sky-600' : 'bg-transparent'
          }`}
        >
          <Umbrella className="w-5 h-5" />
        </div>
        <span className="text-[11px] tracking-wide">Dashboard</span>
      </Link>

      {/* Profile Tab */}
      <Link
        href="/profile"
        className={`flex flex-col items-center justify-center space-y-1 transition-all py-1 px-4 rounded-2xl ${
          isProfile
            ? 'text-sky-600 font-bold scale-105'
            : 'text-slate-400 hover:text-slate-600 font-medium'
        }`}
      >
        <div
          className={`p-1.5 rounded-xl transition ${
            isProfile ? 'bg-sky-100 text-sky-600' : 'bg-transparent'
          }`}
        >
          <User className="w-5 h-5" />
        </div>
        <span className="text-[11px] tracking-wide">Profile</span>
      </Link>
    </nav>
  );
};
