'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Upload, Sparkles, CheckCircle2, AlertTriangle, RefreshCw, Sun, ShieldCheck, ArrowRight } from 'lucide-react';
import { useViewMode } from '@/components/ViewModeContext';

export default function UploadIdPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isStudentMode } = useViewMode();

  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [unclearError, setUnclearError] = useState<string | null>(null);

  const processImageFile = async (file: File, simulateBlurry = false) => {
    setIsProcessing(true);
    setUnclearError(null);

    // Image preview
    const reader = new FileReader();
    reader.onload = () => {
      setIdPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append('image', file);
      if (simulateBlurry) {
        formData.append('simulate_blurry', 'true');
      }

      const res = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!json.success) {
        // If Gemini or OCR couldn't read clearly
        setUnclearError(
          json.message ||
            "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text."
        );
        return;
      }

      // Success: Save verified data to browser storage for the locked details screen
      const { username, index_no, address } = json.data;
      sessionStorage.setItem('astrix_verified_username', username);
      sessionStorage.setItem('astrix_verified_index', index_no);
      sessionStorage.setItem('astrix_verified_address', address);
      if (idPhotoPreview) {
        sessionStorage.setItem('astrix_verified_photo', idPhotoPreview);
      }

      // Smoothly navigate to Screen 1B: Details page
      router.push('/signup/details');
    } catch (err: any) {
      setUnclearError(
        "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Developer Testing Shortcuts
  const handleTestClearCard = () => {
    setIsProcessing(true);
    setUnclearError(null);
    setTimeout(() => {
      sessionStorage.setItem('astrix_verified_username', 'K. A. Nimal Perera');
      sessionStorage.setItem('astrix_verified_index', '210042A');
      sessionStorage.setItem('astrix_verified_address', 'Mora-Villa, Katubedda, Moratuwa');
      router.push('/signup/details');
    }, 600);
  };

  const handleTestBlurryCard = () => {
    setIsProcessing(true);
    setUnclearError(null);
    setTimeout(() => {
      setIsProcessing(false);
      setUnclearError(
        "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text."
      );
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none overflow-y-auto">
      {/* Top Header */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-100">
            <Sparkles className="w-3.5 h-3.5 text-sky-500" />
            <span>Step 1 of 2: ID Verification</span>
          </div>

          {!isStudentMode && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleTestClearCard}
                className="text-[10px] text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg border border-emerald-200 transition"
                title="Test successful scan"
              >
                Demo Clear ID
              </button>
              <button
                type="button"
                onClick={handleTestBlurryCard}
                className="text-[10px] text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 transition"
                title="Test rejection scan"
              >
                Simulate Blurry
              </button>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Upload Student ID</h1>
          <p className="text-xs text-slate-500">
            Please capture or upload a clear, legible photo of your University of Moratuwa student card.
          </p>
        </div>
      </div>

      {/* Main Upload Body */}
      <div className="my-auto py-4 space-y-4">
        {/* Unclear / Blurry Error Banner */}
        {unclearError && (
          <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 shadow-sm">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-rose-900 text-xs">Unclear Photo Detected</p>
                <p className="leading-relaxed text-rose-800">{unclearError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full mt-2 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Upload Clearer Photo</span>
            </button>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Upload Card */}
        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`w-full border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3 group ${
            unclearError
              ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400'
              : 'border-sky-300 bg-sky-50/40 hover:bg-sky-50 hover:border-sky-500'
          }`}
        >
          {isProcessing ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-3">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-sky-600">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
              </div>
              <p className="font-bold text-slate-800 text-sm">AI Checking Image Clarity...</p>
              <p className="text-xs text-slate-400">Verifying Index Number and Student Details</p>
            </div>
          ) : idPhotoPreview ? (
            <div className="space-y-3 w-full">
              <div className="relative w-full h-36 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                <img src={idPhotoPreview} alt="ID Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition">
                  Click to re-take or change photo
                </div>
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider inline-flex items-center space-x-1.5 shadow-md shadow-sky-600/30"
              >
                <Camera className="w-4 h-4" />
                <span>Upload Clearer Photo</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 py-4">
              <div className="w-16 h-16 rounded-3xl bg-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-600/30 group-hover:scale-105 transition mx-auto">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <span className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider inline-flex items-center space-x-2 shadow-md shadow-sky-600/30 transition">
                  <Upload className="w-4 h-4" />
                  <span>UPLOAD ID PHOTO</span>
                </span>
                <p className="text-[11px] text-slate-500 mt-2">
                  Take a photo or choose from photo gallery
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Quality Guidelines Card */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            For Best OCR Accuracy:
          </p>
          <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
            <li className="flex items-center space-x-2">
              <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Use bright, even lighting (avoid flash glare)</span>
            </li>
            <li className="flex items-center space-x-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Ensure your Index No. and Name are clearly legible</span>
            </li>
            <li className="flex items-center space-x-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>Place the card flat on a dark surface</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-sky-600 font-bold hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
