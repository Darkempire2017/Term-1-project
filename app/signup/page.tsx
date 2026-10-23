'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Barcode,
  Camera,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Flashlight,
  Upload,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { useViewMode } from '@/components/ViewModeContext';

export default function BarcodeScanPage() {
  const router = useRouter();
  const { isStudentMode } = useViewMode();
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Parse and validate UoM Student Index Number from Barcode text
  const extractUomIndex = (rawText: string): string | null => {
    if (!rawText) return null;
    // Strip common barcode padding (like '*' in Code 39 or prefix)
    const cleaned = rawText.replace(/[\*\s\-\/]+/g, '').toUpperCase();
    const match = cleaned.match(/\b([0-9]{6}[A-Z])\b/);
    return match ? match[1].toUpperCase() : null;
  };

  // Process decoded barcode text
  const handleBarcodeDecoded = async (decodedText: string) => {
    setValidationError(null);
    setExistingUserError(null);

    const index_no = extractUomIndex(decodedText);

    if (!index_no) {
      // Barcode does not contain a valid Moratuwa Index Number
      setValidationError(
        'Invalid barcode. Please point your camera directly at the barcode on your University Student ID.'
      );
      return;
    }

    // Stop scanner while validating
    try {
      if (scannerRef.current && isScanning) {
        await scannerRef.current.stop();
        setIsScanning(false);
      }
    } catch (e) {
      console.warn('Scanner stop warning:', e);
    }

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(150);
    }

    setIsChecking(true);

    try {
      // Check if user already exists in database
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
        return;
      }

      // Valid and non-existent student: Save index into session and forward to Screen 1B
      sessionStorage.setItem('astrix_verified_index', index_no);
      router.push('/signup/details');
    } catch (err: any) {
      console.error('Verification check error:', err);
      // Fallback
      sessionStorage.setItem('astrix_verified_index', index_no);
      router.push('/signup/details');
    } finally {
      setIsChecking(false);
    }
  };

  // Start the live camera scanner
  const startScanner = async () => {
    setCameraError(null);
    setValidationError(null);
    setExistingUserError(null);

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {}
      }

      const html5QrCode = new Html5Qrcode('astrix-barcode-reader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
        ],
        verbose: false,
      });

      scannerRef.current = html5QrCode;

      // Proportional scanning box that adapts to any screen or camera aspect ratio (iOS / Android)
      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const boxWidth = Math.max(200, Math.floor(viewfinderWidth * 0.82));
        const boxHeight = Math.max(110, Math.floor(boxWidth * 0.52));
        return { width: boxWidth, height: boxHeight };
      };

      const config = {
        fps: 15,
        qrbox: qrboxFunction,
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleBarcodeDecoded(decodedText);
        },
        undefined
      );

      setIsScanning(true);

      // Check if torch/flashlight is supported
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(true);
        }
      } catch {}
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setCameraError(
        'Unable to access camera. Please allow camera permissions or upload an image of your ID barcode.'
      );
      setIsScanning(false);
    }
  };

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const next = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next }],
      });
      setIsTorchOn(next);
    } catch (e) {
      console.warn('Torch error:', e);
    }
  };

  // Scan from uploaded barcode image file
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsChecking(true);
      setValidationError(null);
      setExistingUserError(null);

      const { Html5Qrcode } = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode('astrix-file-scanner');
      const decodedText = await html5QrCode.scanFile(file, true);
      html5QrCode.clear();

      await handleBarcodeDecoded(decodedText);
    } catch (err) {
      setValidationError(
        'Could not read a valid barcode from the selected image. Please point your camera directly at the barcode.'
      );
    } finally {
      setIsChecking(false);
      e.target.value = '';
    }
  };

  // Mount scanner on page load
  useEffect(() => {
    startScanner();

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // Developer Testing Shortcuts
  const handleDemoBarcode = (index: string) => {
    handleBarcodeDecoded(index);
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

          {!isStudentMode && (
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
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition text-center shadow-sm"
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
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition"
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
        <div className="relative w-full rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-xl aspect-square flex flex-col items-center justify-center min-h-[290px]">
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

          {/* Targeting Laser & Corner Overlays */}
          {isScanning && !existingUserError && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              {/* Card Bounding Frame (Responsive width & aspect ratio) */}
              <div className="w-[84%] max-w-[320px] aspect-[16/10] rounded-2xl border-2 border-sky-400/80 relative shadow-[0_0_20px_rgba(56,189,248,0.3)]">
                {/* Corner Marks */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-sky-400" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-sky-400" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-sky-400" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-sky-400" />

                {/* Animated Red Laser Scan Line */}
                <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse top-1/2 -translate-y-1/2" />
              </div>

              <p className="text-[11px] font-semibold text-white/90 bg-black/60 backdrop-blur-xs px-3 py-1 rounded-full mt-3 border border-white/10">
                Fit Student ID barcode in box
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

        {/* Hidden File Input for fallback photo scan */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileScan}
          accept="image/*"
          className="hidden"
        />

        {/* Instructions & Fallback */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium text-[11px]">Instant 100% Barcode Checksum</span>
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
