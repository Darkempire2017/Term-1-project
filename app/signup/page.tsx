'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Flashlight,
  Upload,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { StormHeader } from '@/components/Storm';
import { SignupProgress } from '@/components/SignupProgress';
import '../theme-pages.css';
import './scanner.css';

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

const NO_BARCODE_MESSAGE =
  'No barcode found in that photo. Take it closer, with the card flat and no glare on the barcode.';

// Phone photos are 12-48 MP, but Safari can't draw anything over ~16.7 MP on a canvas
// (the picture comes out blank), so each piece of the photo is shrunk to this size first
const PHOTO_MAX_SIDE = 2000;

// A photo is read in pieces until one has a barcode.
type PhotoRegion = [number, number, number, number]; // left, top, width, height (0-1)

// With a BarcodeDetector (built in, or ZXing-C++ below), which searches the whole picture
// at any angle: the whole photo, then half-size close-ups for a barcode that is small in it
const HALF_STARTS = [0, 0.25, 0.5];
const DETECTOR_ATTEMPTS: PhotoRegion[] = [
  [0, 0, 1, 1],
  ...HALF_STARTS.flatMap((l) => HALF_STARTS.map((t): PhotoRegion => [l, t, 0.5, 0.5])),
];

// Fallback when no BarcodeDetector could load: html5-qrcode's own reader only checks ~15
// lines across the middle of a picture, so the photo is read whole, in overlapping
// horizontal strips, the same turned 90° (photo taken sideways), then half-width close-ups
const STRIP_STARTS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.7];
const PHOTO_ATTEMPTS: [PhotoRegion, boolean][] = [
  [[0, 0, 1, 1], false],
  ...STRIP_STARTS.map((t): [PhotoRegion, boolean] => [[0, t, 1, 0.3], false]),
  [[0, 0, 1, 1], true],
  ...STRIP_STARTS.map((t): [PhotoRegion, boolean] => [[t, 0, 0.3, 1], true]),
  ...[0, 0.25, 0.5].flatMap((l) => STRIP_STARTS.map((t): [PhotoRegion, boolean] => [[l, t, 0.5, 0.3], false])),
];

// Browsers without a built-in BarcodeDetector that reads Code 39 (iPhone Safari, desktop
// Firefox) get one backed by ZXing-C++ in WebAssembly. html5-qrcode uses a BarcodeDetector
// whenever there is one, for the camera and for photos, so both read far better than
// with its own older reader. The .wasm comes from this site (scripts/copy-zxing-wasm.mjs).
// If it can't load, html5-qrcode keeps its own reader.
let barcodeReaderReady: Promise<void> | null = null;
const loadBarcodeReader = () =>
  (barcodeReaderReady ??= (async () => {
    try {
      if ('BarcodeDetector' in window) {
        const formats: string[] = await (window as any).BarcodeDetector.getSupportedFormats();
        if (formats.includes('code_39')) return;
      }
      const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
      await prepareZXingModule({
        overrides: {
          locateFile: (file: string, prefix: string) =>
            file.endsWith('.wasm') ? '/zxing/zxing_reader.wasm' : prefix + file,
        },
        fireImmediately: true,
      });
      (window as any).BarcodeDetector = BarcodeDetector;
    } catch (err) {
      console.warn('ZXing reader could not load; using the fallback reader:', err);
    }
  })());

const loadPhoto = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('PHOTO_UNREADABLE'));
    };
    img.src = url;
  });

// Draws a shrunk copy of one piece of the photo, turned 90° if asked
const drawPhotoPiece = (img: HTMLImageElement, [left, top, width, height]: PhotoRegion, turn: boolean): HTMLCanvasElement => {
  const sx = img.naturalWidth * left;
  const sy = img.naturalHeight * top;
  const sw = img.naturalWidth * width;
  const sh = img.naturalHeight * height;
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = turn ? h : w;
  canvas.height = turn ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PHOTO_UNREADABLE');
  if (turn) {
    ctx.translate(h, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
};

// html5-qrcode reads photos only as files
const canvasToFile = async (canvas: HTMLCanvasElement): Promise<File> => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('PHOTO_UNREADABLE');
  return new File([blob], 'id.jpg', { type: 'image/jpeg' });
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
  const fullFrameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const [lastRawScan, setLastRawScan] = useState<string | null>(null); // dev builds only

  // Stop the camera if it is running (safe to call at any time)
  const stopScanner = useCallback(async () => {
    if (fullFrameTimerRef.current) clearInterval(fullFrameTimerRef.current);
    fullFrameTimerRef.current = null;
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

  // An index number was read from the ID: check it and continue to step 2
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
        'Incorrect barcode. Please scan the front side of your University ID card.'
      );
      return;
    }

    // Accept only after the same index is read CONFIRM_READS times in a row
    if (lastReadRef.current.index === index_no) {
      lastReadRef.current.count += 1;
    } else {
      lastReadRef.current = { index: index_no, count: 1 };
    }

    if (lastReadRef.current.count >= CONFIRM_READS) {
      acceptIndex(index_no);
    }
  };

  // Start the live camera scanner
  const startScanner = useCallback(async () => {
    if (startingRef.current || busyRef.current || unmountedRef.current) return;
    startingRef.current = true;
    setCameraError(null);
    setValidationError(null);
    setExistingUserError(null);
    lastReadRef.current = { index: '', count: 0 };

    try {
      await loadBarcodeReader();
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      if (unmountedRef.current) return;

      const element = document.getElementById('astrix-barcode-reader');
      if (!element) {
        startingRef.current = false;
        return;
      }

      // Stop any previous instance before creating a new one
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) await scannerRef.current.stop();
          scannerRef.current.clear();
        } catch {}
      }

      // Read Code 39 (UoM ID standard) and 128; fall back to all formats on error
      let formatsToSupport: any[] = [
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_128,
      ];

      let scanner: any;
      try {
        scanner = new Html5Qrcode('astrix-barcode-reader', {
          formatsToSupport,
          verbose: false,
        });
      } catch {
        scanner = new Html5Qrcode('astrix-barcode-reader', { verbose: false });
      }

      scannerRef.current = scanner;

      // Scan the full camera picture (scanning the whole frame is faster and more forgiving)
      const config = {
        fps: 20,
        videoConstraints: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      await scanner.start({ facingMode: 'environment' }, config, handleLiveDecode, () => {});

      if (unmountedRef.current) {
        try {
          await scanner.stop();
        } catch {}
        return;
      }

      setIsScanning(true);

      // html5-qrcode shrinks each camera frame to the size of the box on screen (~340 px
      // wide) before reading it, which blurs the thin bars of an ID barcode together. With a
      // BarcodeDetector, also read the full-size camera picture a few times a second.
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['code_39', 'code_128'] });
        let reading = false;
        if (fullFrameTimerRef.current) clearInterval(fullFrameTimerRef.current);
        fullFrameTimerRef.current = setInterval(async () => {
          const video = document.querySelector<HTMLVideoElement>('#astrix-barcode-reader video');
          if (reading || busyRef.current || !video || video.readyState < 2) return;
          reading = true;
          try {
            const found = await detector.detect(video);
            if (found.length > 0) handleLiveDecode(found[0].rawValue);
          } catch {
            // Frame not ready or unreadable; try the next one
          } finally {
            reading = false;
          }
        }, 150);
      }

      // Check if torch/flashlight is supported
      try {
        const capabilities = scanner.getRunningTrackCapabilities();
        setHasTorch(Boolean(capabilities?.torch));
      } catch {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.warn('Camera start error:', err);
      const msg = String(err?.message || err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setCameraError(
          'Camera permission denied. Please allow camera access in your browser settings to scan your ID.'
        );
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setCameraError('No camera detected on this device. You can upload a photo of your ID barcode below.');
      } else {
        setCameraError('Could not start camera. Please refresh or upload a photo of your ID barcode below.');
      }
    } finally {
      startingRef.current = false;
    }
  }, [stopScanner]);

  // Flashlight toggle
  const toggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner || !hasTorch) return;
    try {
      const nextState = !isTorchOn;
      await scanner.applyVideoConstraints({ advanced: [{ torch: nextState }] });
      setIsTorchOn(nextState);
    } catch (e) {
      console.warn('Torch toggle warning:', e);
    }
  };

  // Photo upload fallback
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsChecking(true);
    setValidationError(null);
    setExistingUserError(null);

    let decodedText: string | null = null;
    try {
      const img = await loadPhoto(file);
      await loadBarcodeReader();
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector();
        for (const region of DETECTOR_ATTEMPTS) {
          const found = await detector.detect(drawPhotoPiece(img, region, false)).catch(() => []);
          if (found.length > 0) {
            decodedText = found[0].rawValue;
            break;
          }
        }
      } else {
        const { Html5Qrcode } = await import('html5-qrcode');
        const fileScanner = new Html5Qrcode('astrix-file-scanner');
        try {
          for (const [region, turn] of PHOTO_ATTEMPTS) {
            try {
              decodedText = await fileScanner.scanFile(await canvasToFile(drawPhotoPiece(img, region, turn)), false);
              break;
            } catch {
              // No barcode in this piece of the photo; try the next one
            }
          }
        } finally {
          try {
            fileScanner.clear();
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Photo scan error:', err);
      setIsChecking(false);
      setValidationError("Couldn't open that photo. Please take a new photo or choose a JPEG or PNG.");
      return;
    }

    setIsChecking(false);
    if (IS_DEV_BUILD && decodedText) setLastRawScan(`${decodedText} (photo)`);
    if (!decodedText) {
      setValidationError(NO_BARCODE_MESSAGE);
      return;
    }
    const index_no = parseIndex(decodedText);
    if (!index_no) {
      setValidationError(
        'Incorrect barcode. Please scan the front side of your University ID card.'
      );
      return;
    }
    await acceptIndex(index_no);
  };

  // Mount/unmount: start the camera once, release it cleanly when leaving
  useEffect(() => {
    unmountedRef.current = false;
    startScanner();

    // Release camera when tab is switched or phone goes to sleep; restart when returning
    const handleVisibility = () => {
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
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unmountedRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (fullFrameTimerRef.current) clearInterval(fullFrameTimerRef.current);
      const scanner = scannerRef.current;
      if (scanner) {
        try {
          if (scanner.isScanning) scanner.stop().catch(() => {});
          scanner.clear();
        } catch {}
      }
    };
  }, [startScanner, stopScanner]);

  // Developer Testing Shortcuts (local builds only)
  const handleSimulateInvalid = () => {
    setValidationError(
      'Incorrect barcode. Please scan the front side of your University ID card.'
    );
  };

  const handleSimulateExisting = () => {
    setExistingUserError({
      index_no: 'DEV001',
      message: 'Account already exists for Index Number DEV001. Please sign in to your existing account.',
    });
  };

  return (
    <div className="astrix-theme-page select-none overflow-y-auto">
      <StormHeader rain className="astrix-theme-header astrix-scanner-header">
        <div className="astrix-header-top">
          <Link href="/login" className="astrix-header-back" aria-label="Back to sign in">
            <ArrowLeft size={21} />
          </Link>
          <span className="astrix-step-count">Step 1 of 3</span>
        </div>
        <h1 className="astrix-theme-title">Scan your student ID</h1>
        <p className="astrix-scanner-subtitle">Scan the barcode on your university ID to get started.</p>
      </StormHeader>

      <main className="astrix-theme-sheet astrix-scanner-sheet">
        <SignupProgress step={1} />

        {IS_DEV_BUILD && (
            <div className="flex items-center justify-center gap-1 mb-4">
              <button
                type="button"
                onClick={() => acceptIndex('250373T')}
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
                Wrong
              </button>
              <button
                type="button"
                onClick={handleSimulateExisting}
                className="text-[10px] text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg border border-rose-200 transition"
                title="Test duplicate account"
              >
                Exists
              </button>
            </div>
        )}
        <div className="space-y-4">
        {/* Error: Non-UoM Barcode Error */}
        {validationError && (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 shadow-sm">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-950 text-xs">
                  {validationError === NO_BARCODE_MESSAGE ? 'No Barcode Found' : 'Incorrect Barcode'}
                </p>
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
            <button
              type="button"
              onClick={startScanner}
              className="w-full py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Camera Permission</span>
            </button>
          </div>
        )}

        {/* Camera Viewport Container */}
        <div className="astrix-scanner-viewport relative w-full aspect-[4/3] rounded-3xl overflow-hidden flex items-center justify-center">
          <style jsx global>{`
            #astrix-barcode-reader {
              width: 100% !important;
              height: 100% !important;
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

          {/* Aiming guide */}
          {isScanning && !existingUserError && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div className="w-[84%] max-w-[320px] aspect-[16/10] rounded-2xl border-2 border-sky-400/80 relative shadow-[0_0_20px_rgba(56,189,248,0.3)]">
                {/* Corner Marks */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-sky-400" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-sky-400" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-sky-400" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-sky-400" />

                <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-sky-200 to-transparent shadow-[0_0_8px_#dbeafe] animate-pulse top-1/2" />
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

        <button type="button" onClick={() => fileInputRef.current?.click()} className="astrix-scanner-upload">
          <Upload size={20} aria-hidden="true" /> Upload barcode photo
        </button>
        <p className="astrix-scanner-privacy"><ShieldCheck size={15} aria-hidden="true" /> Scanned on your phone. Nothing is uploaded.</p>
        </div>

        <p className="astrix-scanner-footer">Already registered? <Link href="/login">Sign in</Link></p>
      </main>
    </div>
  );
}
