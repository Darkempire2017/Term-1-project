'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Hash,
  Mail,
  MapPin,
  ShieldCheck,
  Umbrella,
  Clock,
  Award,
  LogOut,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { supabase } from '@/lib/supabase';

interface StudentProfile {
  index_no: string;
  username: string;
  email: string;
  address?: string | null;
  is_verified?: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile>({
    index_no: 'DEV001',
    username: 'Developer Account',
    email: 'dev@astrix.uom.lk',
    address: 'ENTC Dept, University of Moratuwa',
    is_verified: true,
  });

  const [activeBorrow, setActiveBorrow] = useState<{
    umbrella_id: string;
    borrowed_time: string;
    slot?: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      // 1. Try reading from active session in localStorage
      let currentIndex = 'DEV001';
      try {
        const raw = localStorage.getItem('astrix_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.index_no) {
            currentIndex = parsed.index_no;
            setProfile((prev) => ({
              ...prev,
              index_no: parsed.index_no,
              username: parsed.username || prev.username,
              email: parsed.email || prev.email,
            }));
          }
        }
      } catch (e) {
        console.warn('Session parse note:', e);
      }

      // 2. Query Supabase for latest profile details
      try {
        const { data: dbUser } = await supabase
          .from('users')
          .select('*')
          .eq('index_no', currentIndex)
          .maybeSingle();

        if (dbUser) {
          setProfile({
            index_no: dbUser.index_no,
            username: dbUser.username,
            email: dbUser.email,
            address: dbUser.address || 'Katubedda, Moratuwa',
            is_verified: dbUser.is_verified ?? true,
          });
        }

        // 3. Query active borrow record
        const { data: borrow } = await supabase
          .from('borrow_records')
          .select('*')
          .eq('index_no', currentIndex)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (borrow) {
          setActiveBorrow({
            umbrella_id: borrow.umbrella_id,
            borrowed_time: borrow.borrowed_time,
          });
        }
      } catch (err) {
        console.warn('Supabase profile lookup warning:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleSignOut = () => {
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
    <div className="flex-1 flex flex-col justify-between bg-slate-50 select-none overflow-y-auto">
      {/* Top Header & Avatar Card */}
      <div className="p-6 space-y-4">
        {/* Top Status */}
        <div className="flex items-center justify-end">
          <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active Student</span>
          </span>
        </div>

        {/* Profile Card */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center space-x-4">
            {/* Avatar */}
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 text-white flex items-center justify-center font-black text-xl shadow-md shadow-sky-600/30">
                {getInitials(profile.username)}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white" title="Verified">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Name & Index */}
            <div className="space-y-1 flex-1 min-w-0">
              <h1 className="text-lg font-black text-slate-900 truncate tracking-tight">
                {profile.username}
              </h1>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-mono text-xs font-bold border border-slate-200">
                  {profile.index_no}
                </span>
                <span className="text-[11px] text-slate-500 font-medium truncate">
                  UoM Campus
                </span>
              </div>
            </div>
          </div>

          {/* Student Status Banner */}
          <div className="p-3 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-sky-900 font-medium">
              <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Verified ID & Borrowing Authorized</span>
            </div>
            <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">
              1 Loan Limit
            </span>
          </div>
        </div>

        {/* Rental Status Card */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Current Umbrella Status
            </span>
            <Link
              href="/dashboard"
              className="text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center space-x-0.5"
            >
              <span>Station View</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {activeBorrow ? (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Umbrella className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 min-w-0 flex-1 text-xs">
                <p className="font-bold text-amber-950">Active Umbrella Loan</p>
                <p className="font-mono text-[11px] text-amber-800">
                  Tag UID: {activeBorrow.umbrella_id}
                </p>
                <p className="text-[10px] text-amber-700 pt-1 flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>Due within 24 hours of loan</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                <Umbrella className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-slate-900">No Active Loans</p>
                <p className="text-slate-500 text-[11px]">
                  You are ready to borrow an umbrella at any station.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Student Details List */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {/* Index No */}
          <div className="p-3.5 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3 text-slate-500">
              <Hash className="w-4 h-4 text-slate-400" />
              <span>Index Number</span>
            </div>
            <span className="font-mono font-bold text-slate-800">{profile.index_no}</span>
          </div>

          {/* Email */}
          <div className="p-3.5 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3 text-slate-500">
              <Mail className="w-4 h-4 text-slate-400" />
              <span>University Email</span>
            </div>
            <span className="font-medium text-slate-800 truncate max-w-[180px]">
              {profile.email}
            </span>
          </div>

          {/* Address */}
          <div className="p-3.5 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3 text-slate-500">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>Address / Hall</span>
            </div>
            <span className="font-medium text-slate-800 truncate max-w-[180px]">
              {profile.address || 'Katubedda, Moratuwa'}
            </span>
          </div>
        </div>


        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center space-x-2 transition border border-rose-200/60 active:scale-[0.99]"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Astrix</span>
        </button>
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav />
    </div>
  );
}
