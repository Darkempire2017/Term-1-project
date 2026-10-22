'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Upload, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck, ArrowRight } from 'lucide-react';
import { useViewMode } from '@/components/ViewModeContext';

export default function UploadIdPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isStudentMode } = useViewMode();

  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string } | null>(null);

  const processImageFile = async (file: File, simulateBlurry = false) => {
    setIsProcessing(true);
    setErrorInfo(null);

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

      let json: any;
      try {
        json = await res.json();
      } catch (parseErr) {
        setErrorInfo({
          title: 'Server Response Error',
          message: `Unable to parse verification response (HTTP ${res.status}). Please try again.`,
        });
        return;
      }

      if (!json.success) {
        const title = json.error_type === 'UNCLEAR_IMAGE' ? 'Unclear Photo Detected' : 'Verification Notice';
        setErrorInfo({
          title,
          message: json.message || "We couldn't clearly read your Student ID. Please upload a clearer photo.",
        });
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
      setErrorInfo({
        title: 'Connection Issue',
        message: err.message || 'Unable to connect to verification server. Please check your network and try again.',
      });
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
    setErrorInfo(null);
    setTimeout(() => {
      sessionStorage.setItem('astrix_verified_username', 'K. A. Nimal Perera');
      sessionStorage.setItem('astrix_verified_index', '210042A');
      sessionStorage.setItem('astrix_verified_address', 'Mora-Villa, Katubedda, Moratuwa');
      router.push('/signup/details');
    }, 600);
  };

  const handleTestBlurryCard = () => {
    setIsProcessing(true);
    setErrorInfo(null);
    setTimeout(() => {
      setIsProcessing(false);
      setErrorInfo({
        title: 'Unclear Photo Detected',
        message: "We couldn't clearly read your Student ID. Please upload a clearer photo with good lighting and visible text.",
      });
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none overflow-y-auto">
      {/* Top Header */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">
            Step 1 of 2
          </span>

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
            Please upload a clear photo of your student ID card.
          </p>
        </div>
      </div>

      {/* Main Upload Body */}
      <div className="my-auto py-4 space-y-4">
        {/* Error Banner */}
        {errorInfo && (
          <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 shadow-sm">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-rose-900 text-xs">{errorInfo.title}</p>
                <p className="leading-relaxed text-rose-800">{errorInfo.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full mt-2 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Retry ID Upload</span>
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
            errorInfo
              ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400'
              : 'border-sky-300 bg-sky-50/40 hover:bg-sky-50 hover:border-sky-500'
          }`}
        >
          {isProcessing ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
              <p className="font-bold text-slate-800 text-sm">Checking photo clarity...</p>
              <p className="text-xs text-slate-400">Reading Index Number and Details</p>
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

        {/* Simple Guidelines */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2.5 text-xs text-slate-600">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Tips for Quick Approval:
          </p>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Use good lighting without flash glare</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Make sure your Index Number and Name are visible</span>
          </div>
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
