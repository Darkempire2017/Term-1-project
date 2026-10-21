import Link from 'next/link';
import { Umbrella, ArrowRight, ShieldCheck, Sparkles, Sun, Cpu, CheckCircle2 } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-gradient-to-b from-sky-50 via-white to-slate-50 select-none">
      {/* Top Header */}
      <div className="pt-6 text-center space-y-3">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-sky-600" />
          <span>University of Moratuwa</span>
        </div>

        <div className="space-y-1">
          <div className="w-16 h-16 rounded-3xl bg-sky-600 text-white flex items-center justify-center shadow-xl shadow-sky-600/30 mx-auto my-3">
            <Umbrella className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Project ASTRIX</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            IoT Smart Umbrella Sharing System for university students and faculty across Katubedda campus.
          </p>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="my-auto py-6 space-y-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-xs">
            <p className="font-bold text-slate-800">Instant Student ID OCR</p>
            <p className="text-slate-500 text-[11px]">Scan your university card for 1-tap verification</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="text-xs">
            <p className="font-bold text-slate-800">Smart Solenoid Lockers</p>
            <p className="text-slate-500 text-[11px]">Automated 5-second mechanical lock release</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Sun className="w-5 h-5" />
          </div>
          <div className="text-xs">
            <p className="font-bold text-slate-800">24-Hour Rental Window</p>
            <p className="text-slate-500 text-[11px]">Free rain protection with SMS & email receipts</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2.5 pb-2">
        <Link
          href="/login"
          className="w-full py-4 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm tracking-wide shadow-lg shadow-sky-600/30 flex items-center justify-center space-x-2 transition active:scale-[0.99]"
        >
          <span>Sign In to Kiosk</span>
          <ArrowRight className="w-4 h-4" />
        </Link>

        <Link
          href="/signup"
          className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-200 shadow-sm flex items-center justify-center space-x-2 transition"
        >
          <span>New Student? Register with ID Card</span>
        </Link>

        <p className="text-[10px] text-center text-slate-400 pt-1">
          Faculty of Engineering • Department of Electronic & Telecommunication
        </p>
      </div>
    </div>
  );
}
