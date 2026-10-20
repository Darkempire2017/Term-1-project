import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UmbrellaSlot, BorrowRecord, User } from '../types';
import { Umbrella, Lock, Unlock, CheckCircle, Clock, AlertTriangle, ArrowUpRight, Sparkles, RefreshCw } from 'lucide-react';

interface DashboardProps {
  user: User | null;
  onRequireLogin: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onRequireLogin }) => {
  const [slots, setSlots] = useState<UmbrellaSlot[]>([]);
  const [meta, setMeta] = useState({ total: 4, available: 4, borrowed: 0 });
  const [activeBorrow, setActiveBorrow] = useState<BorrowRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStationData = async () => {
    try {
      const data = await api.getSlots();
      if (data.success) {
        setSlots(data.slots);
        setMeta(data.meta);
      }

      if (user) {
        const borrowRes = await api.getMyActiveBorrow();
        if (borrowRes.success && borrowRes.hasActiveBorrow) {
          setActiveBorrow(borrowRes.borrow);
        } else {
          setActiveBorrow(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch station data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStationData();
    const interval = setInterval(fetchStationData, 4000); // Poll status every 4s
    return () => clearInterval(interval);
  }, [user]);

  const handleBorrow = async (slotNumber: number) => {
    if (!user) {
      onRequireLogin();
      return;
    }

    setFeedbackMessage(null);
    setActionLoading(slotNumber);

    try {
      const res = await api.borrowUmbrella(slotNumber);
      setFeedbackMessage({
        type: 'success',
        text: res.message || `Slot #${slotNumber} unlocked! Pull your umbrella now.`,
      });
      await fetchStationData();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to borrow umbrella.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReturn = async (slotNumber: number) => {
    if (!user) {
      onRequireLogin();
      return;
    }

    setFeedbackMessage(null);
    setActionLoading(slotNumber);

    try {
      const res = await api.returnUmbrella(slotNumber);
      setFeedbackMessage({
        type: 'success',
        text: res.message || `Umbrella returned to Slot #${slotNumber}!`,
      });
      await fetchStationData();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to return umbrella.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Welcome / Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 rounded-3xl p-6 sm:p-10 text-white shadow-xl shadow-sky-900/10">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold tracking-wide uppercase mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Campus IoT Umbrella Sharing</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            {user ? `Welcome back, ${user.name.split(' ')[0]}!` : 'Smart Umbrella Station'}
          </h1>
          <p className="mt-2 text-sky-100 text-sm sm:text-base leading-relaxed">
            Scan the NFC tag hanging above any locked slot or select an available slot below to trigger the ESP32 solenoid lock release.
          </p>
        </div>

        {/* Quick Stats Pill */}
        <div className="mt-6 sm:mt-0 sm:absolute sm:top-10 sm:right-10 flex space-x-3">
          <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-3 border border-white/20 text-center">
            <span className="block text-2xl font-bold">{meta.available}</span>
            <span className="text-xs text-sky-100 font-medium">Available</span>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-3 border border-white/20 text-center">
            <span className="block text-2xl font-bold">{meta.borrowed}</span>
            <span className="text-xs text-sky-100 font-medium">In Use</span>
          </div>
        </div>
      </div>

      {/* Feedback banner */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center space-x-3 text-sm transition-all ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          <span className="font-medium">{feedbackMessage.text}</span>
        </div>
      )}

      {/* Active Borrow Status Card */}
      {user && activeBorrow && (
        <div className="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                <Umbrella className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  Currently In Your Possession
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  Umbrella {activeBorrow.umbrella_slots?.umbrella_code || 'Active'}
                </h3>
                <p className="text-xs text-slate-600 flex items-center space-x-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Borrowed on: {new Date(activeBorrow.borrowed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => handleReturn(activeBorrow.umbrella_slots?.slot_number || 1)}
              disabled={actionLoading !== null}
              className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-amber-600/20 transition flex items-center justify-center space-x-2"
            >
              <span>Return to Station</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Umbrella Slots Station Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Station Umbrella Slots</h2>
            <p className="text-xs text-slate-500">Live slot occupancy and electronic lock status</p>
          </div>
          <button
            onClick={fetchStationData}
            title="Refresh Slots"
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {slots.map((slot) => {
            const isAvailable = slot.status === 'AVAILABLE';
            const isSlotLocked = slot.is_locked;

            return (
              <div
                key={slot.id}
                className={`relative rounded-2xl p-5 border transition-all duration-200 ${
                  isAvailable
                    ? 'bg-white border-slate-200 hover:border-sky-300 hover:shadow-md'
                    : 'bg-slate-50/80 border-slate-200 opacity-90'
                }`}
              >
                {/* Header: Slot No & Status Badge */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                    Slot #{slot.slot_number}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      isAvailable
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {isAvailable ? 'AVAILABLE' : 'BORROWED'}
                  </span>
                </div>

                {/* Umbrella Icon Visual */}
                <div className="my-5 flex flex-col items-center justify-center">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform ${
                      isAvailable
                        ? 'bg-sky-50 text-sky-600 shadow-inner'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Umbrella className="w-8 h-8" />
                  </div>
                  <h4 className="mt-3 font-bold text-slate-800 text-base">
                    {slot.umbrella_code || `Umbrella #${slot.slot_number}`}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    NFC Tag: {slot.tag_uid}
                  </p>
                </div>

                {/* Lock Status Pill */}
                <div className="flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-xl bg-slate-100 text-xs font-medium text-slate-600 mb-4">
                  {isSlotLocked ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Lock Engaged</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                      <span className="text-emerald-700 font-semibold">Lock Released (Open)</span>
                    </>
                  )}
                </div>

                {/* Action Button */}
                {isAvailable ? (
                  <button
                    onClick={() => handleBorrow(slot.slot_number)}
                    disabled={actionLoading === slot.slot_number}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-600/20 transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    {actionLoading === slot.slot_number ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Unlock & Borrow</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="w-full py-2 text-center text-xs font-medium text-slate-400 bg-slate-100 rounded-xl">
                    In use by student
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* How it Works Guide */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center space-x-2">
          <span>How to Borrow & Return</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start space-x-3.5">
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
              1
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Register with University Index</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Sign up with your university index number and verify your student email via 6-digit OTP code.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3.5">
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
              2
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Scan NFC Tag at Station</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Hold the hanging NFC tag near the ESP32 reader (or click "Unlock & Borrow" on your phone).
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3.5">
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
              3
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Lock Releases via HiveMQ</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                The ESP32 energizes the solenoid lock for 5 seconds. Take the umbrella and return it to any empty slot when done!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
