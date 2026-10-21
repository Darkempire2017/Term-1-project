'use client';

import React, { useState, useEffect } from 'react';
import { Wifi, BatteryMedium, Signal } from 'lucide-react';

export const PhoneHeader: React.FC = () => {
  const [time, setTime] = useState<string>('09:41');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full bg-slate-900 text-white px-7 pt-3 pb-2 flex items-center justify-between text-xs select-none z-50 shrink-0">
      {/* Time */}
      <span className="font-semibold tracking-tight text-[11px] text-slate-100">{time}</span>

      {/* Dynamic Island / Notch */}
      <div className="w-20 h-4 bg-black rounded-full flex items-center justify-center space-x-1.5 shadow-inner">
        <div className="w-2 h-2 rounded-full bg-slate-900 border border-slate-800" />
        <div className="w-1.5 h-1.5 rounded-full bg-sky-500/80 animate-pulse" />
      </div>

      {/* Status Icons */}
      <div className="flex items-center space-x-1.5 text-slate-200">
        <Signal className="w-3 h-3" />
        <Wifi className="w-3 h-3" />
        <BatteryMedium className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};
