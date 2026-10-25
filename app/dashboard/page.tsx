'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Umbrella,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  RefreshCw,
  Check,
  Wrench,
  AlertCircle,
  Info,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import type { MeResponse, PublicSlot } from '@/lib/types';
import { useViewMode } from '@/components/ViewModeContext';

// The lock takes ~4 s to open (message delivery + 2.7 s servo turn); the countdown
// starts after that. Then the cabinet gives the student 5 checks × ~2.5 s.
const OPENING_MS = 4000;
const TAKE_WINDOW_SECONDS = 12;

interface AssignedSlot {
  slot: number;
  umbrella_number: number;
  umbrella_id: string;
}

/**
 * Reads a cabinet API response. Student borrows stream NDJSON: an "assigned" line
 * (which slot this student got) as soon as the slot is reserved, then a "result"
 * line when the cabinet answers. Everything else is a single JSON body.
 */
async function readCabinetResponse(
  res: Response,
  onAssigned: (assigned: AssignedSlot) => void
): Promise<{ success?: boolean; message?: string; reason?: string; slot?: number }> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/x-ndjson') || !res.body) {
    return res.json();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === 'assigned') onAssigned(event);
      else if (event.type === 'result') result = event;
    }
  }

  return (
    result ?? {
      success: false,
      message: 'The connection to the station was lost before the cabinet answered. Check the dashboard in a moment.',
    }
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isStudentMode } = useViewMode();
  const [currentUserIndex, setCurrentUserIndex] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');

  // Developer (hardware testing) access is decided by the server
  const [isDevAccount, setIsDevAccount] = useState(false);

  // Slot states from the server (no placeholder tag IDs)
  const [slots, setSlots] = useState<PublicSlot[]>([]);

  // Active borrow state (Determines State A vs State B)
  const [activeLoan, setActiveLoan] = useState<{
    record_id?: string;
    umbrella_id: string;
    slot: number | null;
    borrowed_time: string;
    is_overdue?: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<'borrow' | 'return' | null>(null);
  const [unlockCountdown, setUnlockCountdown] = useState<number | null>(null);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const openingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  // Dynamic Full-Screen Ambient Glow: 'green' (borrowing), 'blue' (returning), 'red' (error)
  const [screenGlow, setScreenGlow] = useState<'green' | 'blue' | 'red' | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerErrorGlow = useCallback(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setScreenGlow('red');
    errorTimerRef.current = setTimeout(() => {
      setScreenGlow((prev) => (prev === 'red' ? null : prev));
    }, 6000);
  }, []);

  const dismissNotification = useCallback(() => {
    setNotification(null);
    if (screenGlow === 'red') setScreenGlow(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, [screenGlow]);

  // Show the cached name instantly while the server confirms the session
  useEffect(() => {
    try {
      const raw = localStorage.getItem('astrix_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        setCurrentUserIndex((parsed.index_no || '').toUpperCase());
        setCurrentUserName(parsed.username || 'Student');
      }
    } catch {}
  }, []);

  // Fetch profile, slots and active loan from the server (session cookie)
  const refreshStationData = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });

      if (res.status === 401) {
        localStorage.removeItem('astrix_user');
        sessionStorage.clear();
        router.replace('/login?notice=session_expired');
        return;
      }

      const json: MeResponse = await res.json();
      if (!res.ok || !json.success) return;

      setCurrentUserIndex(json.user.index_no);
      setCurrentUserName(json.user.username || 'Student');
      setIsDevAccount(json.is_dev);
      setSlots(json.slots);
      setActiveLoan(json.active_loan);
    } catch (err: any) {
      console.warn('Station refresh note:', err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    refreshStationData();
    const interval = setInterval(refreshStationData, 5000);
    return () => clearInterval(interval);
  }, [refreshStationData]);

  const stopCountdown = () => {
    if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
    openingTimerRef.current = null;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setUnlockCountdown(null);
  };

  useEffect(() => {
    return () => {
      stopCountdown();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

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

  // Start the "take it now" countdown once the lock has had time to open
  const startTakeCountdown = () => {
    openingTimerRef.current = setTimeout(() => {
      let remaining = TAKE_WINDOW_SECONDS;
      setUnlockCountdown(remaining);
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) setUnlockCountdown(remaining);
        else stopCountdown();
      }, 1000);
    }, OPENING_MS);
  };

  // Shared request runner: the server sends the command, waits for the cabinet,
  // records the result, and answers with the cabinet's message.
  // For a borrow, the server first tells us which slot we got (it may not be the
  // one shown as "next free" if someone else borrowed at the same moment).
  const runCabinetAction = async (
    kind: 'borrow' | 'return',
    slotHint: number | null,
    body: Record<string, unknown>
  ) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setActionInProgress(kind);
    setScreenGlow(kind === 'borrow' ? 'green' : 'blue');
    setPendingSlot(kind === 'borrow' ? null : slotHint);
    setNotification({
      type: 'info',
      text:
        kind === 'borrow'
          ? '🔎 Finding a free slot for you…'
          : `🔓 Opening ${slotHint ? `Slot #${slotHint}` : 'your slot'}… Dock the umbrella and wait for lock confirmation.`,
    });

    try {
      const res = await fetch(`/api/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await readCabinetResponse(res, (assigned) => {
        setPendingSlot(assigned.slot);
        setNotification({
          type: 'info',
          text: `🔓 Take Umbrella ${assigned.umbrella_number} from Slot ${assigned.slot}. The lock is opening now.`,
        });
        startTakeCountdown();
      });

      if (json.success) {
        setScreenGlow(null);
        setNotification({ type: 'success', text: `✅ ${json.message}` });
      } else if (json.reason === 'WRONG_UMBRELLA') {
        triggerErrorGlow();
        setNotification({
          type: 'error',
          text: `❌ Wrong umbrella in Slot #${json.slot}. The slot is left unlocked — take it out and return your own umbrella.`,
        });
      } else {
        triggerErrorGlow();
        setNotification({ type: 'error', text: `⚠️ ${json.message || 'The request failed. Please try again.'}` });
      }
    } catch {
      triggerErrorGlow();
      setNotification({ type: 'error', text: 'Could not connect to the station. Please check your connection.' });
    } finally {
      stopCountdown();
      setPendingSlot(null);
      setActionInProgress(null);
      refreshStationData();
    }
  };

  // Per-slot busy state for independent, non-blocking developer actions
  const [devSlotBusy, setDevSlotBusy] = useState<Record<number, 'borrow' | 'return' | 'open' | 'close' | null>>({});

  // Developer direct non-blocking borrow on any slot
  const handleDevBorrow = async (slot: number) => {
    setDevSlotBusy((prev) => ({ ...prev, [slot]: 'borrow' }));
    setNotification({
      type: 'info',
      text: `🔓 [Slot #${slot}] Sending Borrow command to cabinet…`,
    });

    try {
      const res = await fetch('/api/borrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotification({ type: 'success', text: `✅ [Slot #${slot}] ${json.message}` });
      } else {
        triggerErrorGlow();
        setNotification({ type: 'error', text: `⚠️ [Slot #${slot}] ${json.message || 'Borrow failed.'}` });
      }
    } catch {
      triggerErrorGlow();
      setNotification({ type: 'error', text: `Could not connect to station for Slot #${slot}.` });
    } finally {
      setDevSlotBusy((prev) => ({ ...prev, [slot]: null }));
      refreshStationData();
    }
  };

  // Developer direct non-blocking return on any slot
  const handleDevReturn = async (slot: number) => {
    setDevSlotBusy((prev) => ({ ...prev, [slot]: 'return' }));
    setNotification({
      type: 'info',
      text: `🔒 [Slot #${slot}] Sending Return command to cabinet…`,
    });

    try {
      const res = await fetch('/api/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotification({ type: 'success', text: `✅ [Slot #${slot}] ${json.message}` });
      } else {
        triggerErrorGlow();
        setNotification({ type: 'error', text: `⚠️ [Slot #${slot}] ${json.message || 'Return failed.'}` });
      }
    } catch {
      triggerErrorGlow();
      setNotification({ type: 'error', text: `Could not connect to station for Slot #${slot}.` });
    } finally {
      setDevSlotBusy((prev) => ({ ...prev, [slot]: null }));
      refreshStationData();
    }
  };

  // Developer direct lock Open / Close
  const handleDevLock = async (slot: number, action: 'OPEN' | 'CLOSE') => {
    const key = action === 'OPEN' ? 'open' : 'close';
    setDevSlotBusy((prev) => ({ ...prev, [slot]: key }));
    setNotification({
      type: 'info',
      text: `⚡ [Slot #${slot}] Sending ${action} lock command…`,
    });

    try {
      const res = await fetch('/api/dev/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, action }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotification({ type: 'success', text: `✅ [Slot #${slot}] ${json.message}` });
      } else {
        triggerErrorGlow();
        setNotification({ type: 'error', text: `⚠️ [Slot #${slot}] ${json.message || 'Lock command failed.'}` });
      }
    } catch {
      triggerErrorGlow();
      setNotification({ type: 'error', text: `Could not connect to station for Slot #${slot}.` });
    } finally {
      setDevSlotBusy((prev) => ({ ...prev, [slot]: null }));
      refreshStationData();
    }
  };

  // Borrow Umbrella (Standard Student View)
  const handleBorrow = async () => {
    if (!nextAvailableSlot) {
      triggerErrorGlow();
      setNotification({ type: 'error', text: 'No umbrellas currently available at this station.' });
      return;
    }
    await runCabinetAction('borrow', nextAvailableSlot.slot, {});
  };

  // Return Umbrella (the server picks the slot from the loan)
  const handleReturn = async () => {
    if (!activeLoan) return;
    await runCabinetAction('return', activeLoan.slot, {});
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
      if (!slot1) return;
      setActiveLoan({
        umbrella_id: slot1.umbrella_id,
        slot: slot1.slot,
        borrowed_time: new Date(Date.now() - 24 * 60 * 1000).toISOString(), // 24 mins ago
      });
      setNotification({ type: 'info', text: 'Switched to State B (Returning View).' });
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between bg-slate-50 select-none overflow-y-auto relative">
      {/* ============================================================================== */}
      {/* DYNAMIC SCREEN GLOW AURA (Green on Borrow, Blue on Return, Red on Error)       */}
      {/* ============================================================================== */}
      {screenGlow && (
        <div
          className={`pointer-events-none fixed inset-0 max-w-md mx-auto z-40 transition-all duration-500 ease-in-out ${
            screenGlow === 'green'
              ? 'ring-8 ring-emerald-500/80 shadow-[inset_0_0_60px_15px_rgba(16,185,129,0.45)]'
              : screenGlow === 'blue'
              ? 'ring-8 ring-sky-500/80 shadow-[inset_0_0_60px_15px_rgba(14,165,233,0.45)]'
              : 'ring-8 ring-rose-500/90 shadow-[inset_0_0_60px_15px_rgba(244,63,94,0.55)]'
          }`}
        >
          {/* Top radiant light gradient */}
          <div
            className={`w-full h-36 bg-gradient-to-b opacity-50 animate-pulse ${
              screenGlow === 'green'
                ? 'from-emerald-500 via-emerald-400/20 to-transparent'
                : screenGlow === 'blue'
                ? 'from-sky-500 via-sky-400/20 to-transparent'
                : 'from-rose-500 via-rose-400/30 to-transparent'
            }`}
          />

          {/* Floating Glow Status Pill */}
          <div className="absolute top-3 inset-x-0 flex justify-center px-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div
              className={`px-4 py-2 rounded-full text-xs font-black shadow-lg backdrop-blur-md flex items-center space-x-2 border ${
                screenGlow === 'green'
                  ? 'bg-emerald-950/85 text-emerald-200 border-emerald-400/40 shadow-emerald-500/25'
                  : screenGlow === 'blue'
                  ? 'bg-sky-950/85 text-sky-200 border-sky-400/40 shadow-sky-500/25'
                  : 'bg-rose-950/90 text-rose-200 border-rose-400/40 shadow-rose-500/25'
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full animate-ping ${
                  screenGlow === 'green'
                    ? 'bg-emerald-400'
                    : screenGlow === 'blue'
                    ? 'bg-sky-400'
                    : 'bg-rose-400'
                }`}
              />
              <span className="tracking-wide">
                {screenGlow === 'green' && '🟢 Borrow in Progress… Lock Opening'}
                {screenGlow === 'blue' && '🔵 Return in Progress… Verifying Umbrella Lock'}
                {screenGlow === 'red' && '🔴 Operation Alert / Error'}
              </span>
            </div>
          </div>
        </div>
      )}

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
            className={`p-3.5 rounded-2xl text-xs flex items-start space-x-2.5 animate-in fade-in slide-in-from-top-1 shadow-sm ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-50 text-rose-900 border border-rose-200'
                : 'bg-sky-50 text-sky-900 border border-sky-200'
            }`}
          >
            {notification.type === 'success' && (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            )}
            {notification.type === 'error' && (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            )}
            {notification.type === 'info' && (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
            )}
            <span className="leading-relaxed flex-1">{notification.text}</span>
            <button
              type="button"
              onClick={dismissNotification}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1 transition"
              title="Dismiss notification"
            >
              ✕
            </button>
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

                    {/* 4 HARDWARE ACTION BUTTONS: BORROW, RETURN, OPEN, CLOSE (Non-blocking) */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {/* 1. Borrow */}
                      <button
                        type="button"
                        onClick={() => handleDevBorrow(s.slot)}
                        disabled={devSlotBusy[s.slot] === 'borrow'}
                        className="py-2 px-1 text-[11px] font-black rounded-xl bg-sky-600 hover:bg-sky-700 text-white transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        title={`Send Borrow command for Slot ${s.slot}`}
                      >
                        {devSlotBusy[s.slot] === 'borrow' ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Unlock className="w-3 h-3" />
                        )}
                        <span>Borrow</span>
                      </button>

                      {/* 2. Return */}
                      <button
                        type="button"
                        onClick={() => handleDevReturn(s.slot)}
                        disabled={devSlotBusy[s.slot] === 'return'}
                        className="py-2 px-1 text-[11px] font-black rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        title={`Send Return command for Slot ${s.slot}`}
                      >
                        {devSlotBusy[s.slot] === 'return' ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        <span>Return</span>
                      </button>

                      {/* 3. Open Lock */}
                      <button
                        type="button"
                        onClick={() => handleDevLock(s.slot, 'OPEN')}
                        disabled={devSlotBusy[s.slot] === 'open'}
                        className="py-2 px-1 text-[11px] font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        title={`Directly open lock on Slot ${s.slot}`}
                      >
                        {devSlotBusy[s.slot] === 'open' ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Unlock className="w-3 h-3" />
                        )}
                        <span>Open</span>
                      </button>

                      {/* 4. Close Lock */}
                      <button
                        type="button"
                        onClick={() => handleDevLock(s.slot, 'CLOSE')}
                        disabled={devSlotBusy[s.slot] === 'close'}
                        className="py-2 px-1 text-[11px] font-black rounded-xl bg-slate-700 hover:bg-slate-800 text-white transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        title={`Directly close lock on Slot ${s.slot}`}
                      >
                        {devSlotBusy[s.slot] === 'close' ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        <span>Close</span>
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
            {/* Assigned Slot Card: which umbrella THIS student must take */}
            {actionInProgress === 'borrow' && (
              <div
                className="bg-white border-2 border-emerald-400 rounded-3xl p-5 shadow-lg shadow-emerald-500/20 text-center space-y-1"
                aria-live="polite"
              >
                {pendingSlot ? (
                  <>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Your umbrella</p>
                    <p className="text-4xl font-black text-slate-900 font-mono">Slot {pendingSlot}</p>
                    <p className="text-sm font-bold text-slate-700">
                      Take Umbrella {pendingSlot}, only from this slot
                    </p>
                    <p className="text-xs text-slate-500">
                      {unlockCountdown !== null ? `${unlockCountdown}s left to take it` : 'The lock is opening…'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-slate-600 py-3">Finding a free slot for you…</p>
                )}
              </div>
            )}

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
                  ? `Umbrella tag (${nextAvailableSlot.umbrella_id}) is docked. Tap "Borrow" below to open the lock.`
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
                  // While borrowing, highlight the slot the server gave this student
                  const isMine = actionInProgress === 'borrow' && pendingSlot === s.slot;
                  const isReady = actionInProgress === 'borrow' ? isMine : nextAvailableSlot?.slot === s.slot;
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
                        {isMine ? 'Yours' : s.availability ? 'Ready' : 'Out'}
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
                  <span>{activeLoan.is_overdue ? 'Overdue — please return' : '24h Due Window'}</span>
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
                You have an active umbrella loan. Return it to Slot #{activeLoan.slot ?? '?'} by tapping &quot;Return&quot; below. Each umbrella goes back to its own slot.
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
                  <span>Take Umbrella {pendingSlot} from Slot {pendingSlot} ({unlockCountdown}s)</span>
                </>
              ) : actionInProgress === 'borrow' ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : !activeLoan ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>{nextAvailableSlot ? 'Borrow Umbrella' : 'Borrow Umbrella (Unavailable)'}</span>
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
