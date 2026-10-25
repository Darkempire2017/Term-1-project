'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import mqtt from 'mqtt';
import {
  Umbrella,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Check,
  ChevronRight,
  Info,
  Wrench,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { supabase } from '@/lib/supabase';
import { Umbrella as UmbrellaSlotType, BorrowRecord } from '@/lib/types';
import { useViewMode } from '@/components/ViewModeContext';

export default function DashboardPage() {
  const router = useRouter();
  const { isStudentMode } = useViewMode();
  const [currentUserIndex, setCurrentUserIndex] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');

  // Identify developer account
  const isDevAccount = currentUserIndex === 'DEV001';

  // Supabase slot states
  const [slots, setSlots] = useState<UmbrellaSlotType[]>([
    { slot: 1, umbrella_id: '04A1B2C3D4', availability: true, borrowed_user: null },
    { slot: 2, umbrella_id: '04B2C3D4E5', availability: true, borrowed_user: null },
    { slot: 3, umbrella_id: '04C3D4E5F6', availability: true, borrowed_user: null },
    { slot: 4, umbrella_id: '04D4E5F6A7', availability: true, borrowed_user: null },
  ]);

  // Active borrow state (Determines State A vs State B)
  const [activeLoan, setActiveLoan] = useState<{
    record_id?: string;
    umbrella_id: string;
    slot: number;
    borrowed_time: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<'borrow' | 'return' | null>(null);
  const [unlockCountdown, setUnlockCountdown] = useState<number | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  // Read student session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('astrix_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.index_no && parsed.index_no.length >= 3) {
          setCurrentUserIndex(parsed.index_no.toUpperCase());
          setCurrentUserName(parsed.username || 'Student');
          return;
        }
      }
      // No active session — redirect to login
      router.replace('/login');
    } catch (e) {
      router.replace('/login');
    }
  }, [router]);

  // Fetch slots, active loan, and verify active user exists in Supabase
  const refreshStationData = async () => {
    if (!currentUserIndex) return;

    try {
      // 0. Verify that the student still exists and is verified in Supabase
      const { data: dbUser, error: userErr } = await supabase
        .from('users')
        .select('index_no, is_verified')
        .eq('index_no', currentUserIndex)
        .maybeSingle();

      if (!dbUser || !dbUser.is_verified) {
        console.warn(`⚠️ Account ${currentUserIndex} no longer exists in database. Auto-logging out...`);
        localStorage.removeItem('astrix_user');
        sessionStorage.clear();
        router.replace('/login?notice=session_expired');
        return;
      }

      // 1. Fetch slots 1-4 from Supabase umbrellas table
      const { data: dbSlots, error: slotsErr } = await supabase
        .from('umbrellas')
        .select('*')
        .order('slot', { ascending: true });

      if (!slotsErr && dbSlots && dbSlots.length > 0) {
        setSlots(dbSlots as UmbrellaSlotType[]);
      }

      // 2. Fetch active loan for this student (DEV001 is a pure hardware test account — no loans tracked)
      if (currentUserIndex !== 'DEV001') {
        const { data: activeBorrow, error: borrowErr } = await supabase
          .from('borrow_records')
          .select('*')
          .eq('index_no', currentUserIndex)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (!borrowErr && activeBorrow) {
          // Find which slot holds or was associated with this umbrella
          const matchedSlot = dbSlots?.find((s) => s.umbrella_id === activeBorrow.umbrella_id)?.slot || 1;
          setActiveLoan({
            record_id: activeBorrow.record_id,
            umbrella_id: activeBorrow.umbrella_id,
            slot: matchedSlot,
            borrowed_time: activeBorrow.borrowed_time,
          });
        } else {
          setActiveLoan(null);
        }
      } else {
        setActiveLoan(null);
      }
    } catch (err: any) {
      console.warn('Supabase fetch note:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUserIndex) {
      refreshStationData();
      const interval = setInterval(refreshStationData, 3500);
      return () => clearInterval(interval);
    }
  }, [currentUserIndex]);

  // Live Browser MQTT WebSocket Connection for real-time cabinet event detection
  useEffect(() => {
    if (!currentUserIndex) return;

    let client: mqtt.MqttClient | null = null;
    try {
      client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
        clientId: `astrix-web-ui-${Math.random().toString(16).substring(2, 8)}`,
        clean: true,
        connectTimeout: 8000,
      });

      client.on('connect', () => {
        client?.subscribe('astrix-umbrella/cabinet/response');
        console.log('📡 [Browser MQTT] Subscribed to cabinet responses.');
      });

      client.on('message', async (_topic, message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('📡 [Cabinet Response Received]:', data);

          const { action, slot, status, reason, message: msg } = data;

          if (action === 'RETURN') {
            if (status === 'SUCCESS') {
              setNotification({
                type: 'success',
                text: `↩️ ${msg || `Umbrella returned to Slot #${slot}! Lock engaged and return confirmed.`}`,
              });
              setActionInProgress(null);
              // Complete return in database & dispatch receipt email
              await fetch('/api/return/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot, index_no: currentUserIndex }),
              });
              refreshStationData();
            } else if (status === 'FAIL') {
              setActionInProgress(null);
              if (reason === 'WRONG_UMBRELLA') {
                setNotification({
                  type: 'error',
                  text: `❌ Wrong umbrella in Slot #${slot}! Slot is left unlocked — please remove it and return the correct umbrella.`,
                });
              } else {
                setNotification({
                  type: 'error',
                  text: `⚠️ ${msg || `No umbrella detected in Slot #${slot} after 5 checks. Lock closed.`}`,
                });
              }
              refreshStationData();
            }
          } else if (action === 'BORROW') {
            if (status === 'SUCCESS') {
              setNotification({
                type: 'success',
                text: `✅ ${msg || `Umbrella taken from Slot #${slot}! Lock closed. Active loan started.`}`,
              });
              setUnlockCountdown(null);
              setActionInProgress(null);
              // Complete borrow in database & dispatch receipt email
              await fetch('/api/borrow/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot, index_no: currentUserIndex }),
              });
              refreshStationData();
            } else if (status === 'FAIL') {
              setNotification({
                type: 'error',
                text: `⚠️ ${msg || `Umbrella was NOT taken from Slot #${slot}. Lock closed.`}`,
              });
              setUnlockCountdown(null);
              setActionInProgress(null);
              refreshStationData();
            }
          }
        } catch (e) {
          console.warn('MQTT parse error:', e);
        }
      });
    } catch (err) {
      console.warn('Browser MQTT connection warning:', err);
    }

    return () => {
      try {
        client?.end(true);
      } catch {}
    };
  }, [currentUserIndex]);

  // Next available slot calculation (lowest slot where availability = true)
  const availableSlotsList = slots.filter((s) => s.availability);
  const nextAvailableSlot = availableSlotsList.length > 0 ? availableSlotsList[0] : null;

  // Format elapsed time for State B ("Since when")
  const getElapsedDuration = (isoString?: string) => {
    if (!isoString) return 'Just now';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m ago`;
  };

  // Borrow Umbrella (Supports direct slot selection for DEV001)
  const handleBorrow = async (requestedSlot?: number) => {
    let targetSlot: number;

    if (isDevAccount && typeof requestedSlot === 'number') {
      targetSlot = requestedSlot;
    } else {
      if (!nextAvailableSlot) {
        setNotification({ type: 'error', text: 'No umbrellas currently available at this station.' });
        return;
      }
      targetSlot = nextAvailableSlot.slot;
    }

    setActionInProgress('borrow');
    setNotification(null);

    try {
      // 1. Send unlock command to server
      const res = await fetch('/api/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_no: currentUserIndex, slot: targetSlot }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setNotification({ type: 'error', text: json.message || 'Failed to unlock umbrella slot.' });
        setActionInProgress(null);
        return;
      }

      // 2. Start active countdown waiting for physical removal
      setNotification({
        type: 'info',
        text: `🔓 Slot #${targetSlot} unlocked! Please pull the umbrella off the rack (waiting for cabinet confirmation)...`,
      });

      let remaining = 15;
      setUnlockCountdown(remaining);

      const countdownTimer = setInterval(async () => {
        remaining -= 1;
        if (remaining > 0) {
          setUnlockCountdown(remaining);
        } else {
          clearInterval(countdownTimer);
          setUnlockCountdown(null);
          setActionInProgress(null);
          refreshStationData();
        }
      }, 1000);
    } catch (err: any) {
      console.warn('Borrow API note:', err);
      setActionInProgress(null);
      setUnlockCountdown(null);
      setNotification({
        type: 'error',
        text: 'Could not connect to station. Please check connection.',
      });
    }
  };

  // Return Umbrella (Only confirms once hardware verifies RFID and lock engages)
  const handleReturn = async () => {
    if (!activeLoan) return;

    setActionInProgress('return');
    setNotification({
      type: 'info',
      text: `🔓 Unlocking Slot #${activeLoan.slot} for return... Please wait.`,
    });

    try {
      const res = await fetch('/api/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_no: currentUserIndex, slot: activeLoan.slot }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setNotification({ type: 'error', text: json.message || 'Failed to unlock slot for return.' });
        setActionInProgress(null);
        return;
      }

      const returnedSlot = json.slot || activeLoan.slot;

      // DO NOT mark return confirmed here! Wait for hardware response.
      setNotification({
        type: 'info',
        text: `🔓 Slot #${returnedSlot} unlocked! Please insert your umbrella into Slot #${returnedSlot}. Waiting for lock verification...`,
      });

      // Safety timeout after 25s if hardware takes long
      setTimeout(() => {
        refreshStationData();
      }, 25000);
    } catch (err: any) {
      console.warn('Return API error:', err);
      setActionInProgress(null);
      setNotification({
        type: 'error',
        text: 'Could not connect to station to initiate return.',
      });
    }
  };

  // DEV001 Direct Slot Return Command (Direct hardware actuation for any slot 1-4)
  const handleDevReturn = async (slot: number) => {
    setActionInProgress('return');
    setNotification({
      type: 'info',
      text: `🔓 Sending RETURN command to Slot #${slot}... Please wait.`,
    });

    try {
      const res = await fetch('/api/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_no: currentUserIndex, slot }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setNotification({
          type: 'error',
          text: json.message || `Failed to unlock Slot #${slot} for return.`,
        });
        setActionInProgress(null);
        return;
      }

      setNotification({
        type: 'info',
        text: `🔓 Slot #${slot} unlocked for return test! Insert umbrella into Slot #${slot}. Waiting for cabinet RFID response...`,
      });

      setTimeout(() => {
        refreshStationData();
      }, 20000);
    } catch (err: any) {
      console.warn('DEV Return API error:', err);
      setActionInProgress(null);
      setNotification({
        type: 'error',
        text: `Could not connect to station for Slot #${slot}.`,
      });
    }
  };

  // Interactive Test State Switcher
  const toggleDemoState = () => {
    if (activeLoan) {
      // Switch to State A
      setActiveLoan(null);
      setNotification({ type: 'info', text: 'Switched to State A (Borrowing View).' });
    } else {
      // Switch to State B
      const slot1 = slots[0];
      setActiveLoan({
        umbrella_id: slot1.umbrella_id,
        slot: 1,
        borrowed_time: new Date(Date.now() - 24 * 60 * 1000).toISOString(), // 24 mins ago
      });
      setNotification({ type: 'info', text: 'Switched to State B (Returning View).' });
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between bg-slate-50 select-none overflow-y-auto">
      {/* Top Header & Station Info */}
      <div className="p-5 space-y-3">
        {/* Top Badges & Dev State Switcher */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">
            Station 01 • Katubedda
          </span>

          {/* Interactive State Toggle (Visible in Dev Mode) */}
          {!isStudentMode && (
            <button
              type="button"
              onClick={toggleDemoState}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-200/80 hover:bg-sky-100 text-slate-700 hover:text-sky-700 transition border border-slate-300/60"
              title="Toggle between State A and State B"
            >
              Switch to {activeLoan ? 'State A' : 'State B'}
            </button>
          )}
        </div>

        {/* User Welcome */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Smart Umbrella Station</h1>
            <p className="text-xs text-slate-500">
              Welcome, <span className="font-bold text-slate-700">{currentUserName}</span> ({currentUserIndex})
            </p>
          </div>
          <button
            onClick={refreshStationData}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-sky-600 shadow-sm transition active:scale-95"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Notifications & Hardware Feedback */}
        {notification && (
          <div
            className={`p-3.5 rounded-2xl text-xs flex items-start space-x-2 animate-in fade-in slide-in-from-top-1 shadow-sm ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-50 text-rose-900 border border-rose-200'
                : 'bg-sky-50 text-sky-900 border border-sky-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-relaxed">{notification.text}</span>
          </div>
        )}

        {/* DEV001 Super-User Mode Banner */}
        {isDevAccount && (
          <div className="bg-purple-900/10 border border-purple-500/30 rounded-2xl p-3 flex items-center justify-between text-xs text-purple-900 shadow-sm">
            <div className="flex items-center space-x-2">
              <span className="text-base">🛠️</span>
              <div>
                <p className="font-bold">DEV001 Developer Account Active</p>
                <p className="text-[10px] text-purple-700 font-medium">Multi-borrow allowed & click any slot below to eject/borrow directly</p>
              </div>
            </div>
            <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-mono uppercase font-bold">
              DEV MODE
            </span>
          </div>
        )}

        {/* ============================================================================== */}
        {/* DYNAMIC DASHBOARD DISPLAY: DEV001 TEST MATRIX vs STUDENT 2-STATE VIEW          */}
        {/* ============================================================================== */}

        {isDevAccount ? (
          /* ============================================================================ */
          /* DEVELOPER ACCOUNT: DEDICATED HARDWARE CONTROL STATION (DEV001)               */
          /* ============================================================================ */
          <div className="space-y-4">
            {/* Developer Control Header */}
            <div className="bg-gradient-to-br from-purple-700 via-indigo-700 to-purple-800 text-white p-5 rounded-3xl shadow-lg shadow-purple-900/20 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm flex items-center gap-1.5">
                  <Wrench className="w-3 h-3" />
                  <span>Hardware Testing Console</span>
                </span>
                <span className="text-xs text-purple-200 font-mono font-bold">
                  DEV001
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-purple-200 font-medium">Cabinet Hardware Control</p>
                <div className="text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>ESP32 Diagnostics</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-400 text-emerald-950 font-bold">
                    Zero Loans
                  </span>
                </div>
              </div>

              <p className="text-xs text-purple-200/90 leading-relaxed">
                Click <strong>Borrow</strong> or <strong>Return</strong> on any physical slot below to test lock release and RFID detection freely with zero rental state lockouts.
              </p>
            </div>

            {/* 4 Physical Slots — Direct Hardware Action Matrix */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cabinet Slots (1 - 4) Hardware Controls
                </span>
                <span className="text-[11px] font-mono text-purple-600 font-bold">
                  QoS 0 • Live
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {slots.map((s) => (
                  <div
                    key={s.slot}
                    className={`p-3.5 rounded-2xl border transition flex flex-col justify-between space-y-2.5 ${
                      s.availability
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700 font-mono">
                        SLOT #{s.slot}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md ${
                          s.availability
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {s.availability ? 'Docked' : 'Empty'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-xs">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          s.availability ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        <Umbrella className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 truncate font-semibold">
                        {s.umbrella_id}
                      </span>
                    </div>

                    {/* DUAL ACTION BUTTONS: BORROW & RETURN */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleBorrow(s.slot)}
                        disabled={actionInProgress !== null || unlockCountdown !== null}
                        className="py-2 px-1 text-xs font-black rounded-xl bg-sky-600 hover:bg-sky-700 text-white transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        title={`Send Borrow command for Slot ${s.slot}`}
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Borrow</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDevReturn(s.slot)}
                        disabled={actionInProgress !== null || unlockCountdown !== null}
                        className="py-2 px-1 text-xs font-black rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        title={`Send Return command for Slot ${s.slot}`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Return</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : !activeLoan ? (
          /* ============================================================================ */
          /* STATE A: "WHEN BORROWING" (Standard Student View)                            */
          /* ============================================================================ */
          <div className="space-y-4">
            {/* State Banner */}
            <div className="bg-gradient-to-br from-sky-600 to-sky-700 text-white p-5 rounded-3xl shadow-lg shadow-sky-600/20 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                  State A: Ready to Borrow
                </span>
                <span className="text-xs text-sky-100 font-mono">
                  {availableSlotsList.length} of 4 Available
                </span>
              </div>

              {/* Ready Slot Display */}
              <div className="space-y-1">
                <p className="text-xs text-sky-100 font-medium">Next Ready Umbrella</p>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-black tracking-tight">Available slot:</span>
                  <span className="text-3xl font-black text-amber-300 font-mono">
                    {nextAvailableSlot ? `Slot ${nextAvailableSlot.slot}` : 'None'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-sky-100/90 leading-relaxed">
                {nextAvailableSlot
                  ? `Umbrella tag (${nextAvailableSlot.umbrella_id}) is docked. Tap "Borrow" below to release the solenoid lock.`
                  : 'All umbrellas are currently in use. Please check back soon.'}
              </p>
            </div>

            {/* 4-Slot Visual Matrix */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Physical Slots (1 - 4)
              </span>

              <div className="grid grid-cols-4 gap-2">
                {slots.map((s) => {
                  const isReady = nextAvailableSlot?.slot === s.slot;
                  return (
                    <div
                      key={s.slot}
                      className={`p-2.5 rounded-2xl text-center border transition flex flex-col items-center justify-between space-y-1 ${
                        isReady
                          ? 'bg-amber-50 border-amber-300 shadow-sm ring-2 ring-amber-400/30'
                          : s.availability
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        #{s.slot}
                      </span>
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          s.availability ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        <Umbrella className="w-4 h-4" />
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-tight ${
                          s.availability ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {s.availability ? 'Ready' : 'Out'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ============================================================================ */
          /* STATE B: "WHEN RETURNING" (User has an active loan)                           */
          /* ============================================================================ */
          <div className="space-y-4">
            {/* State Banner */}
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-5 rounded-3xl shadow-lg shadow-amber-500/20 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                  State B: Active Loan
                </span>
                <span className="text-xs text-amber-100 font-mono flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>24h Due Window</span>
                </span>
              </div>

              {/* Borrowed Umbrella ID */}
              <div className="space-y-1">
                <p className="text-xs text-amber-100 font-medium">Borrowed Umbrella ID</p>
                <div className="text-2xl font-black font-mono tracking-wider">
                  {activeLoan.umbrella_id}
                </div>
              </div>

              {/* Since When Elapsed Timer */}
              <div className="p-3 rounded-2xl bg-black/15 backdrop-blur-sm flex items-center justify-between text-xs">
                <span className="text-amber-100">Since when:</span>
                <span className="font-bold text-white font-mono bg-white/20 px-2.5 py-0.5 rounded-lg">
                  {getElapsedDuration(activeLoan.borrowed_time)}
                </span>
              </div>

              <p className="text-xs text-amber-100/90 leading-relaxed">
                You have an active umbrella loan. Return it to Slot #{activeLoan.slot} (or any empty slot) by tapping &quot;Return&quot; below.
              </p>
            </div>
          </div>
        )}

        {/* ============================================================================== */}
        {/* CORE DUAL BUTTONS (Standard Student Borrow vs Return Matrix)                   */}
        {/* ============================================================================== */}
        {!isDevAccount && (
          <div className="pt-2 space-y-2.5">
            {/* 1. Borrow Button */}
            <button
              type="button"
              onClick={() => handleBorrow()}
              disabled={Boolean(activeLoan) || !nextAvailableSlot || actionInProgress !== null || unlockCountdown !== null}
              className={`w-full py-4 px-4 rounded-2xl font-black text-sm tracking-wide flex items-center justify-center space-x-2 transition shadow-md ${
                unlockCountdown !== null
                  ? 'bg-amber-500 text-white shadow-amber-500/30 animate-pulse cursor-wait'
                  : !activeLoan && nextAvailableSlot
                  ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/30 active:scale-[0.99] cursor-pointer'
                  : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed border border-slate-300/40'
              }`}
            >
              {unlockCountdown !== null ? (
                <>
                  <Unlock className="w-5 h-5 animate-bounce" />
                  <span>Slot #{nextAvailableSlot?.slot} Unlocked! Pull Umbrella ({unlockCountdown}s)</span>
                </>
              ) : actionInProgress === 'borrow' ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : !activeLoan ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Borrow Umbrella ({nextAvailableSlot ? `Slot ${nextAvailableSlot.slot}` : 'Unavailable'})</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Borrow (1 Umbrella Limit Reached)</span>
                </>
              )}
            </button>

            {/* 2. Return Button */}
            <button
              type="button"
              onClick={handleReturn}
              disabled={!activeLoan || actionInProgress !== null}
              className={`w-full py-4 px-4 rounded-2xl font-black text-sm tracking-wide flex items-center justify-center space-x-2 transition shadow-md ${
                activeLoan
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 active:scale-[0.99] cursor-pointer'
                  : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed border border-slate-300/40'
              }`}
            >
              {actionInProgress === 'return' ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : activeLoan ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Return Umbrella ({activeLoan.umbrella_id})</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Return (No Active Loan)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav />
    </div>
  );
}
