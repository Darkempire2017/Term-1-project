/**
 * ASTRIX Client-Side OCR Engine (100% Private, On-Device)
 * 
 * Runs Tesseract.js in a client Web Worker directly in the student's browser.
 * Zero student credentials or ID photos are ever transmitted over the network.
 */

export interface OcrResult {
  success: boolean;
  username?: string;
  index_no?: string;
  address?: string;
  confidence?: number;
  rotationUsed?: number;
  rawText?: string;
  error?: string;
}

export type OcrProgressCallback = (progress: number, status: string) => void;

/**
 * Load image file into an HTMLImageElement
 */
function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load ID image.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Render image to an offscreen canvas rotated and preprocessed
 */
function getProcessedCanvas(img: HTMLImageElement, angle: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('HTML5 Canvas 2D context unavailable.');

  const rad = (angle * Math.PI) / 180;
  const isPerpendicular = angle === 90 || angle === 270;

  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  // Scale down oversized mobile photos (e.g. 4000x3000) to max 1600px for high speed and lower memory
  const maxDim = 1600;
  let scale = 1;
  if (Math.max(srcWidth, srcHeight) > maxDim) {
    scale = maxDim / Math.max(srcWidth, srcHeight);
  }
  const w = Math.round(srcWidth * scale);
  const h = Math.round(srcHeight * scale);

  canvas.width = isPerpendicular ? h : w;
  canvas.height = isPerpendicular ? w : h;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  // Grayscale and moderate contrast adjustment to make text crisp
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Mild contrast stretch
      const contrasted = (gray - 128) * 1.15 + 128;
      const clamped = Math.max(0, Math.min(255, contrasted));
      data[i] = clamped;
      data[i + 1] = clamped;
      data[i + 2] = clamped;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn('Canvas image data filtering skipped:', e);
  }

  return canvas;
}

/**
 * Parse OCR raw text specifically for University of Moratuwa ID cards
 */
export function parseMoratuwaIdText(text: string): {
  index_no: string | null;
  username: string | null;
  address: string | null;
} {
  // 1. Index number pattern: 6 digits + 1 uppercase letter (e.g. 250312H, 210042A)
  const indexMatch = text.match(/\b([0-9]{6}[A-Z])\b/i);
  const index_no = indexMatch ? indexMatch[1].toUpperCase() : null;

  if (!index_no) {
    return { index_no: null, username: null, address: null };
  }

  // Split lines and clean up noise
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const indexLineIdx = lines.findIndex((l) => l.toUpperCase().includes(index_no));

  // 2. Look for student name
  // Typically printed on the line right before or above the index number (e.g. "JITHWIN P.K.D.R." or "K. A. NIMAL PERERA")
  let username: string | null = null;
  const ignoreKeywords = ['UNIVERSITY', 'MORATUWA', 'STUDENT', 'IDENTITY', 'CARD', 'SRI LANKA', 'FACULTY'];

  if (indexLineIdx > 0) {
    for (let i = indexLineIdx - 1; i >= 0; i--) {
      const candidate = lines[i];
      const upper = candidate.toUpperCase();
      const hasIgnore = ignoreKeywords.some((kw) => upper.includes(kw));
      // Must contain letters and not be a header line
      if (!hasIgnore && /[A-Z]/.test(upper)) {
        username = candidate;
        break;
      }
    }
  }

  // Fallback: look for line with initials pattern (e.g., "P.K.D.R." or "A. B. C.")
  if (!username) {
    for (const line of lines) {
      if (line.includes(index_no)) continue;
      if (/\b[A-Z]\.[A-Z\.]+/i.test(line) || /\b[A-Z]{3,}\s+[A-Z\.]+/i.test(line)) {
        const upper = line.toUpperCase();
        if (!ignoreKeywords.some((kw) => upper.includes(kw))) {
          username = line;
          break;
        }
      }
    }
  }

  // 3. Look for residential address
  // Usually printed on the lines following the index number up to "NIC No:" or signature
  let address: string | null = null;
  if (indexLineIdx !== -1 && indexLineIdx < lines.length - 1) {
    const addressLines: string[] = [];
    for (let i = indexLineIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase();
      if (upper.includes('NIC') || upper.includes('SIGNATURE') || upper.includes('VALID') || upper.includes('EXPIRE')) {
        break;
      }
      // Common Sri Lankan address markers or commas/numbers
      if (line.length > 3) {
        addressLines.push(line);
      }
    }
    if (addressLines.length > 0) {
      address = addressLines.join(', ').replace(/\s+/g, ' ').replace(/,\s*,/g, ',');
    }
  }

  return {
    index_no,
    username: username ? username.trim() : 'University Student',
    address: address ? address.trim() : 'Katubedda, Moratuwa',
  };
}

/**
 * Scan Student ID locally on client device using Tesseract.js WebAssembly
 */
export async function scanStudentIdLocally(
  file: File | Blob,
  onProgress?: OcrProgressCallback
): Promise<OcrResult> {
  let worker: any = null;

  try {
    onProgress?.(10, 'Loading photo into memory...');
    const img = await loadImage(file);

    onProgress?.(25, 'Initializing local OCR engine in browser...');
    // Dynamically import tesseract.js to keep initial bundle size lean
    const { createWorker } = await import('tesseract.js');

    worker = await createWorker('eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          onProgress?.(40 + Math.round(pct * 0.5), `Analyzing ID text: ${pct}%`);
        }
      },
    });

    // Test candidate angles:
    // 0°: Standard landscape
    // 270°: Top candidate for vertical smartphone photos of horizontal cards
    // 90°: Rotated clockwise
    // 180°: Inverted
    const candidateAngles = [0, 270, 90, 180];
    let bestText = '';
    let extracted: ReturnType<typeof parseMoratuwaIdText> = { index_no: null, username: null, address: null };
    let successfulAngle = 0;

    for (let i = 0; i < candidateAngles.length; i++) {
      const angle = candidateAngles[i];
      onProgress?.(
        30 + i * 15,
        i === 0 ? 'Scanning horizontal orientation...' : `Testing orientation ${angle}°...`
      );

      const canvas = getProcessedCanvas(img, angle);
      const { data } = await worker.recognize(canvas);
      const text = data.text || '';

      extracted = parseMoratuwaIdText(text);
      if (extracted.index_no) {
        bestText = text;
        successfulAngle = angle;
        break; // Found valid UoM index number! Immediate early exit for maximum speed.
      }
    }

    onProgress?.(100, 'Verification complete!');

    if (!extracted.index_no) {
      return {
        success: false,
        error: "Could not clearly read your Student Index Number. Please ensure the card is well-lit, fully in frame, and not blurry.",
      };
    }

    return {
      success: true,
      index_no: extracted.index_no,
      username: extracted.username || 'University Student',
      address: extracted.address || 'Katubedda, Moratuwa',
      rotationUsed: successfulAngle,
      rawText: bestText,
    };
  } catch (err: any) {
    console.error('Client OCR error:', err);
    return {
      success: false,
      error: err.message || 'An error occurred during local image processing.',
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (termErr) {
        console.warn('Worker termination notice:', termErr);
      }
    }
  }
}
