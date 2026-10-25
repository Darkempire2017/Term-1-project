'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Barcode,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Flashlight,
  Upload,
  ArrowRight,
  UserCheck,
  Keyboard,
} from 'lucide-react';

// The UoM student ID barcode contains only the index number: 6 digits + a letter
const INDEX_PATTERN = /^[0-9]{6}[A-Z]$/;

// A live result is accepted only after the same index is read this many times in a
// row, so a one-character misread of a 1D barcode can't create the wrong account
const CONFIRM_READS = 2;

// Developer shortcuts and the raw-scan readout only exist in local development builds
const IS_DEV_BUILD = process.env.NODE_ENV !== 'production';

// Strip Code 39 start/stop '*' and stray spaces/dashes, then require exactly an index number
const parseIndex = (rawText: string): string | null => {
  if (!rawText) return null;
  const cleaned = rawText.replace(/[\*\s\-\/]+/g, '').toUpperCase();
  return INDEX_PATTERN.test(cleaned) ? cleaned : null;
};

export default function BarcodeScanPage() {
  const router = useRouter();
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guards that must not wait for a re-render (the decode callback runs many times a second)
  const busyRef = useRef(false);                                // an index is being checked
  const startingRef = useRef(false);                            // the camera is starting
  const unmountedRef = useRef(false);
  const pausedForBackgroundRef = useRef(false);
  const lastReadRef = useRef<{ index: string; count: number }>({ index: '', count: 0 });

  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [existingUserError, setExistingUserError] = useState<{
    index_no: string;
    message: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualIndex, setManualIndex] = useState('');
  const [lastRawScan, setLastRawScan] = useState<string | null>(null); // dev builds only

  // Stop the camera if it is running (safe to call at any time)
  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch (e) {
      console.warn('Scanner stop warning:', e);
    }
    setIsScanning(false);
    setIsTorchOn(false);
  }, []);

  // An index number was read (or typed): check it and continue to step 2
  const acceptIndex = async (index_no: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setValidationError(null);
    setExistingUserError(null);

    await stopScanner();

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(150);
    }

    setIsChecking(true);

    try {
      // Check if an account already exists for this index
      const res = await fetch('/api/auth/check-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index_no }),
      });

      const json = await res.json();

      if (json.exists) {
        setExistingUserError({
          index_no,
          message:
            json.message ||
            `An account already exists for Index Number ${index_no}. Please sign in to your account.`,
        });
        setIsChecking(false);
        busyRef.current = false;
        return;
      }

      // Valid and new: save the index for step 2 (the server checks again at signup)
      sessionStorage.setItem('astrix_verified_index', index_no);
      router.push('/signup/details');
    } catch (err: any) {
      console.error('Verification check error:', err);
      // The signup API refuses existing accounts anyway, so continue
      sessionStorage.setItem('astrix_verified_index', index_no);
      router.push('/signup/details');
    } finally {
      setIsChecking(false);
    }
  };

  // Called for every frame the camera decodes a barcode
  const handleLiveDecode = (decodedText: string, decodedResult?: any) => {
    if (busyRef.current) return;

    if (IS_DEV_BUILD) {
      const format = decodedResult?.result?.format?.formatName;
      setLastRawScan(`${decodedText}${format ? ` (${format})` : ''}`);
    }

    const index_no = parseIndex(decodedText);
    if (!index_no) {
      lastReadRef.current = { index: '', count: 0 };
      setValidationError(
        'Invalid barcode. Please point your camera directly at the barcode on your University Student ID.'
      );
      return;
    }

    // Accept only after the same index is read CONFIRM_READS times in a row
    const last = lastReadRef.current;
    lastReadRef.current = last.index === index_no ? { index: index_no, count: last.count + 1 } : { index: index_no, count: 1 };
    if (lastReadRef.current.count >= CONFIRM_READS) {
      lastReadRef.current = { index: '', count: 0 };
      acceptIndex(index_no);
    }
  };

  // Start the live camera scanner
  const startScanner = useCallback(async () => {
    if (startingRef.current || unmountedRef.current) return;
    startingRef.current = true;
    busyRef.current = false;
    lastReadRef.current = { index: '', count: 0 };
    setCameraError(null);
    setValidationError(null);
    setExistingUserError(null);
    setHasTorch(false);
    setIsTorchOn(false);

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      await stopScanner();
      if (unmountedRef.current) return;

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('astrix-barcode-reader', {
          // Only the 1D formats that can hold letters (the index ends with a letter)
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
          ],
          // Use the phone's built-in barcode reader when available (fast and accurate
          // on Android Chrome); other browsers fall back to the library's own decoder
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        });
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          // No qrbox: the whole picture is scanned, so a barcode anywhere in view is read.
          // The frame drawn on screen is only a guide.
          videoConstraints: {
            facingMode: 'environment',
            // A sharp picture matters for the thin bars of a 1D barcode
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          },
        },
        handleLiveDecode,
        undefined
      );

      if (unmountedRef.current) {
        await stopScanner();
        return;
      }
      setIsScanning(true);

      // Check if torch/flashlight is supported
      try {
        const capabilities = scannerRef.current.getRunningTrackCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(true);
        }
      } catch {}
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setCameraError(
        'Unable to access camera. Please allow camera permissions, upload a photo of your ID barcode, or type your index number.'
      );
      setIsScanning(false);
    } finally {
      startingRef.current = false;
    }
    // handleLiveDecode only touches refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopScanner]);

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const next = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setIsTorchOn(next);
    } catch (e) {
      console.warn('Torch error:', e);
    }
  };

  // Scan from an uploaded photo of the barcode (a single clear read is enough here)
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsChecking(true);
      setValidationError(null);
      setExistingUserError(null);

      const { Html5Qrcode } = await import('html5-qrcode');
      const fileScanner = new Html5Qrcode('astrix-file-scanner');
      const decodedText = await fileScanner.scanFile(file, false);
      fileScanner.clear();

      const index_no = parseIndex(decodedText);
      if (!index_no) {
        setValidationError(
          'That photo has a different barcode. Please use the barcode on your University Student ID.'
        );
        return;
      }
      setIsChecking(false);
      await acceptIndex(index_no);
    } catch (err) {
      setValidationError(
        'Could not read a barcode from that photo. Try a sharper, well-lit photo, or type your index number.'
      );
    } finally {
      setIsChecking(false);
      e.target.value = '';
    }
  };

  // Typed index number (for damaged cards or devices without a camera)
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const index_no = parseIndex(manualIndex);
    if (!index_no) {
      setValidationError('An index number is 6 digits followed by a letter, for example 250373T.');
      return;
    }
    await acceptIndex(index_no);
  };

  // Start the camera on page load; stop it when leaving
  useEffect(() => {
    unmountedRef.current = false;
    startScanner();

    return () => {
      unmountedRef.current = true;
      const scanner = scannerRef.current;
      if (scanner?.isScanning) {
        scanner.stop().catch(() => {});
      }
    };
  }, [startScanner]);

  // Pause the camera while the page is in the background (saves battery, frees the camera)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (scannerRef.current?.isScanning) {
          pausedForBackgroundRef.current = true;
          stopScanner();
        }
      } else if (pausedForBackgroundRef.current && !busyRef.current) {
        pausedForBackgroundRef.current = false;
        startScanner();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [startScanner, stopScanner]);

  // Developer testing shortcuts (local development builds only)
  const handleDemoBarcode = (index: string) => {
    acceptIndex(index);
  };

  const handleSimulateInvalid = () => {
    setValidationError(
      'Invalid barcode (8901030456128). Please point your camera at the barcode printed on your University Student ID.'
    );
  };

  const handleSimulateExisting = () => {
    setExistingUserError({
      index_no: 'DEV001',
      message: 'Account already exists for Index Number DEV001. Please sign in to your existing account.',
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-white select-none overflow-y-auto">
      {/* Top Header */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">
            Step 1 of 2
          </span>

          {IS_DEV_BUILD && (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => handleDemoBarcode('250373T')}
                className="text-[10px] text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg border border-emerald-200 transition"
                title="Simulate valid UoM ID barcode"
              >
                Scan 250373T
              </button>
              <button
                type="button"
                onClick={handleSimulateInvalid}
                className="text-[10px] text-amber-700 font-bold bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg border border-amber-200 transition"
                title="Test wrong barcode"
              >
                Wrong Barcode
              </button>
              <button
                type="button"
                onClick={handleSimulateExisting}
                className="text-[10px] text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 transition"
                title="Test duplicate account"
              >
                User Exists
              </button>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>Scan Student ID</span>
            <Barcode className="w-6 h-6 text-sky-600" />
          </h1>
          <p className="text-xs text-slate-500">
            Point your camera at the barcode on your University Student ID card.
          </p>
        </div>
      </div>

      {/* Main Barcode Scanner Body */}
      <div className="my-auto py-4 space-y-4">
        {/* Error: Non-UoM Barcode Error */}
        {validationError && (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 shadow-sm">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-950 text-xs">Different Barcode Detected</p>
                <p className="leading-relaxed text-amber-800">{validationError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Error: User Already Exists in Database */}
        {existingUserError && (
          <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs space-y-3 animate-in fade-in slide-in-from-top-1 shadow-sm">
            <div className="flex items-start space-x-2">
              <UserCheck className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-rose-950 text-xs">Account Already Exists</p>
                <p className="leading-relaxed text-rose-800">{existingUserError.message}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <Link
                href={`/login?index_no=${encodeURIComponent(existingUserError.index_no)}`}
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <span>Sign In to Account</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={startScanner}
                className="py-2 px-3 bg-white border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-xl font-bold text-xs transition"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}

        {/* Camera Permission Error */}
        {cameraError && (
          <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs space-y-3 animate-in fade-in shadow-sm">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-rose-800">{cameraError}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={startScanner}
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Camera</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 px-3 bg-white border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Barcode</span>
              </button>
            </div>
          </div>
        )}

        {/* Live Camera Viewfinder Card */}
        <div className="relative w-full rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-xl aspect-square flex flex-col items-center justify-center">
          {/* iOS Safari WebKit & Android Video Styles Override */}
          <style jsx global>{`
            #astrix-barcode-reader {
              width: 100% !important;
              height: 100% !important;
              border: none !important;
              padding: 0 !important;
              position: absolute !important;
              inset: 0 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              overflow: hidden !important;
            }
            #astrix-barcode-reader video {
              width: 100% !important;
              height: 100% !important;
              object-fit: cover !important;
              border-radius: 1.5rem !important;
            }
            #astrix-barcode-reader__scan_region {
              width: 100% !important;
              height: 100% !important;
            }
            #astrix-barcode-reader__dashboard_section {
              display: none !important;
            }
            #astrix-barcode-reader img {
              display: none !important;
            }
          `}</style>

          {/* html5-qrcode video mount element */}
          <div id="astrix-barcode-reader" className="w-full h-full object-cover" />
          <div id="astrix-file-scanner" className="hidden" />

          {/* Aiming guide (the whole camera picture is scanned) */}
          {isScanning && !existingUserError && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div className="w-[84%] max-w-[320px] aspect-[16/10] rounded-2xl border-2 border-sky-400/80 relative shadow-[0_0_20px_rgba(56,189,248,0.3)]">
                {/* Corner Marks */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-sky-400" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-sky-400" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-sky-400" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-sky-400" />

                {/* Animated Red Laser Scan Line */}
                <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse top-1/2" />
              </div>

              <p className="text-[11px] font-semibold text-white/90 bg-black/60 backdrop-blur-xs px-3 py-1 rounded-full mt-3 border border-white/10">
                Hold the barcode flat, about a hand&apos;s length away
              </p>
            </div>
          )}

          {/* Checking Overlay */}
          {isChecking && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 z-20">
              <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
              <p className="text-white font-bold text-xs tracking-wide">
                Verifying Student ID...
              </p>
            </div>
          )}

          {/* Torch Button */}
          {hasTorch && isScanning && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`absolute top-3 right-3 p-2.5 rounded-full backdrop-blur-md transition shadow-md z-10 ${
                isTorchOn ? 'bg-amber-400 text-slate-950' : 'bg-black/40 text-white hover:bg-black/60'
              }`}
              title="Toggle Flashlight"
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Raw scan readout (local development builds only) */}
        {IS_DEV_BUILD && lastRawScan && (
          <p className="text-[10px] font-mono text-slate-500 px-1">Last raw scan: {lastRawScan}</p>
        )}

        {/* Hidden File Input for fallback photo scan */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileScan}
          accept="image/*"
          className="hidden"
        />

        {/* Instructions & Fallbacks */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium text-[11px]">Scanned on your phone. Nothing is uploaded.</span>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] font-bold text-sky-600 hover:text-sky-700 underline inline-flex items-center space-x-1"
          >
            <Upload className="w-3 h-3" />
            <span>Upload Photo Instead</span>
          </button>
        </div>

        {/* Typed index number (last option) */}
        {showManualEntry ? (
          <form onSubmit={handleManualSubmit} className="flex items-center gap-2 px-1">
            <input
              id="manual-index"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={7}
              placeholder="e.g. 250373T"
              value={manualIndex}
              onChange={(e) => setManualIndex(e.target.value.toUpperCase())}
              aria-label="Index number"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <button
              type="submit"
              disabled={isChecking}
              className="py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-xs transition disabled:opacity-50"
            >
              Continue
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowManualEntry(true)}
            className="text-[11px] font-bold text-slate-500 hover:text-sky-700 underline inline-flex items-center space-x-1 px-1"
          >
            <Keyboard className="w-3 h-3" />
            <span>Can&apos;t scan? Type your index number</span>
          </button>
        )}
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
