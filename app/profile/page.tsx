'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Hash,
  Mail,
  LogOut,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { StormHeader } from '@/components/Storm';
import type { MeResponse } from '@/lib/types';
import { formatStationDueTime } from '@/lib/time';
import { beginStationRequest, clearStationCache, isCurrentStationRequest, restoreStationUser, setStationResponse, useStationCache } from '@/lib/stationCache';
import '../theme-pages.css';

export default function ProfilePage() {
  const router = useRouter();
  const station = useStationCache();
  const profile = station.me?.user ?? station.user ?? { index_no: '', username: '', email: '' };
  const activeBorrow = station.me?.active_loan ?? null;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreStationUser();
    const fetchUserData = async () => {
      const request = beginStationRequest();
      // Profile and loan come from the server, based on the session cookie
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        if (!isCurrentStationRequest(request)) return;

        if (res.status === 401) {
          // No session, or the account no longer exists: back to sign in
          clearStationCache();
          localStorage.removeItem('astrix_user');
          sessionStorage.clear();
          router.replace('/login?notice=session_expired');
          return;
        }

        const json: MeResponse = await res.json();
        if (!res.ok || !json.success) return;
        setStationResponse(json, request);
      } catch (err) {
        console.warn('Profile lookup warning:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
    const interval = setInterval(fetchUserData, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    clearStationCache();
    localStorage.removeItem('astrix_user');
    sessionStorage.clear();
    router.push('/login');
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || 'UOM';
  };

  return (
    <div className="astrix-theme-page select-none overflow-y-auto">
      <StormHeader rain className="astrix-theme-header profile">
        <h1 className="astrix-theme-title">Your profile</h1>
      </StormHeader>

      <main className="astrix-theme-sheet space-y-4" aria-busy={loading}>
        <section className="astrix-profile-card" aria-label="Student profile">
          <div className="astrix-avatar" aria-hidden="true">{getInitials(profile.username)}</div>
          <div className="min-w-0">
            <h2 className="astrix-profile-name">{profile.username || 'Student'}</h2>
            <span className="astrix-verified-pill"><i aria-hidden="true" /> Verified student</span>
          </div>
        </section>

        <section className="astrix-profile-loan" aria-label="Current umbrella status">
          {activeBorrow ? (
            <>
              <h2>Return to Slot {activeBorrow.slot ?? '?'}</h2>
              <p>{activeBorrow.is_overdue ? 'Overdue' : 'Due'} {formatStationDueTime(activeBorrow.due_time)}</p>
            </>
          ) : (
            <>
              <h2>Ready to borrow</h2>
              <p>No umbrella on loan. Visit the station when you need one.</p>
              <Link href="/dashboard" className="relative z-10 inline-block mt-4 text-xs font-bold text-white underline underline-offset-4">View station</Link>
            </>
          )}
          <svg className="astrix-profile-loan-umbrella" viewBox="0 0 300 220" fill="none" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M75 130c5-42 42-70 86-79 51-11 98 3 117 35" />
              <path d="M75 130c15-14 31-18 51-11 17-14 34-17 51-10 15-15 31-19 50-12 14-16 32-19 51-11" />
              <path d="M161 51c-17 17-27 40-35 68M161 51c26 10 49 26 66 46" />
              <path d="m155 27 6 24 31 130c4 19 31 26 34 7" />
            </g>
          </svg>
        </section>

        <section className="space-y-3" aria-label="Account details">
          <div className="astrix-profile-detail">
            <span className="astrix-profile-detail-icon"><Hash size={18} aria-hidden="true" /></span>
            <div className="astrix-profile-detail-text"><span>Index number</span><strong>{profile.index_no}</strong></div>
          </div>
          <div className="astrix-profile-detail">
            <span className="astrix-profile-detail-icon"><Mail size={18} aria-hidden="true" /></span>
            <div className="astrix-profile-detail-text"><span>University email</span><strong>{profile.email}</strong></div>
          </div>
        </section>

        <button type="button" onClick={handleSignOut} className="astrix-sign-out">
          <LogOut size={18} aria-hidden="true" /> Sign out
        </button>
      </main>

      <BottomNav />
    </div>
  );
}
