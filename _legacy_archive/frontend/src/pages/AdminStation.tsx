import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UmbrellaSlot, StationStatus } from '../types';
import { Shield, Radio, Cpu, Unlock, RefreshCw, Terminal, CheckCircle2, AlertCircle } from 'lucide-react';

export const AdminStation: React.FC = () => {
  const [slots, setSlots] = useState<UmbrellaSlot[]>([]);
  const [stationInfo, setStationInfo] = useState<StationStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [pulseDuration, setPulseDuration] = useState(5000);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 40)]);
  };

  const fetchStatus = async () => {
    try {
      const res = await api.getSlots();
      if (res.success) {
        setSlots(res.slots);
        setStationInfo(res.station);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    addLog('Admin monitor initialized. Connecting to HiveMQ MQTT telemetry.');
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleManualUnlock = async (slotNumber: number) => {
    setTriggering(slotNumber);
    try {
      const res = await api.adminUnlock(slotNumber, pulseDuration);
      addLog(`⚡ DISPATCHED UNLOCK: Slot #${slotNumber} for ${pulseDuration / 1000}s via HiveMQ MQTT`);
      await fetchStatus();
    } catch (err: any) {
      addLog(`❌ FAILED UNLOCK: ${err.message}`);
    } finally {
      setTriggering(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            <Shield className="w-4 h-4 text-sky-600" />
            <span>Station Diagnostics & Solenoid Override</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">ESP32 & Hardware Control Center</h1>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs text-slate-500 font-medium">Pulse Duration:</label>
          <select
            value={pulseDuration}
            onChange={(e) => setPulseDuration(Number(e.target.value))}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none font-medium"
          >
            <option value={3000}>3 Seconds</option>
            <option value={5000}>5 Seconds (Default)</option>
            <option value={8000}>8 Seconds</option>
            <option value={10000}>10 Seconds</option>
          </select>

          <button
            onClick={fetchStatus}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 transition"
            title="Refresh Station State"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hardware Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* HiveMQ Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">MQTT Broker</span>
            <h4 className="text-sm font-bold text-slate-800 mt-0.5">HiveMQ Cluster</h4>
            <p className="text-[11px] font-mono text-slate-500 mt-1 break-all">
              {stationInfo?.broker || 'broker.hivemq.com:1883'}
            </p>
            <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 mt-2 bg-emerald-50 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="w-3 h-3" />
              <span>Connected</span>
            </span>
          </div>
        </div>

        {/* ESP32 Controller Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Hardware Station</span>
            <h4 className="text-sm font-bold text-slate-800 mt-0.5">
              {stationInfo?.station?.stationId || 'esp32-station-01'}
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Lock Pins: 25, 26, 27, 33 (Relay Active LOW)
            </p>
            <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-sky-700 mt-2 bg-sky-50 px-2 py-0.5 rounded-md">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>Ready for commands</span>
            </span>
          </div>
        </div>

        {/* Database Status Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Database Backend</span>
            <h4 className="text-sm font-bold text-slate-800 mt-0.5">Supabase PostgreSQL</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Table `umbrella_slots` (4 slots registered)
            </p>
            <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 mt-2 bg-emerald-50 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="w-3 h-3" />
              <span>Syncing Live</span>
            </span>
          </div>
        </div>
      </div>

      {/* Solenoid Lock Override Controls */}
      <div>
        <h3 className="text-base font-bold text-slate-800 mb-3">Direct Solenoid Relay Overrides</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {slots.map((slot) => (
            <div key={slot.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-800">Slot #{slot.slot_number}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                  {slot.umbrella_code || 'UMB'}
                </span>
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <div>NFC UID: <span className="font-mono font-medium text-slate-700">{slot.tag_uid}</span></div>
                <div>Status: <span className="font-semibold text-slate-700">{slot.status}</span></div>
              </div>

              <button
                onClick={() => handleManualUnlock(slot.slot_number)}
                disabled={triggering === slot.slot_number}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {triggering === slot.slot_number ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Fire Solenoid Pulse</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Live Event Stream Terminal */}
      <div className="bg-slate-950 rounded-2xl p-5 text-slate-300 font-mono text-xs shadow-lg border border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-200">Live Station Telemetry Stream</span>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-slate-500 hover:text-slate-300 transition"
          >
            Clear Log
          </button>
        </div>

        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-slate-600 italic">No events logged yet. Trigger a slot or scan an NFC tag.</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="leading-relaxed text-slate-300">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
