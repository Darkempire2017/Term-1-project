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

  // Scale down oversized mobile photos to max 1600px for speed and memory efficiency
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
 * Clean student name by stripping photo-edge noise, trailing labels (e.g. 'tose:'),
 * colons, and stray non-alphabetic characters.
 */
export function cleanStudentName(raw: string): string {
  // Strip non-letter prefix/suffix
  const cleaned = raw.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z\.]+$/, '');
  const tokens = cleaned.split(/\s+/);
  const cleanTokens: string[] = [];

  for (const token of tokens) {
    // If token has colons or is a header/metadata word (e.g. 'tose:', 'name:', 'index:')
    if (token.includes(':') || /^(name|index|no|card|student|faculty|department|valid|until|nic)$/i.test(token)) {
      continue;
    }
    // Reject lowercase words (like 'tose', 'course', or edge noise)
    if (/^[a-z]+$/.test(token)) {
      continue;
    }
    const t = token.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z\.]+$/, '');
    if (t.length >= 1 && /[a-zA-Z]/.test(t)) {
      cleanTokens.push(t.toUpperCase());
    }
  }

  return cleanTokens.join(' ').trim();
}

/**
 * Parse OCR raw text specifically for University of Moratuwa ID cards
 */
export function parseMoratuwaIdText(text: string): {
  index_no: string | null;
  username: string | null;
} {
  // 1. Index number pattern: 6 digits + 1 uppercase letter (e.g. 250312H, 250405V, 210042A)
  const indexMatch = text.match(/\b([0-9]{6}[A-Z])\b/i);
  const index_no = indexMatch ? indexMatch[1].toUpperCase() : null;

  if (!index_no) {
    return { index_no: null, username: null };
  }

  // Split lines and clean up noise
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const indexLineIdx = lines.findIndex((l) => l.toUpperCase().includes(index_no));

  // 2. Look for student name
  // Typically printed on the line right before or above the index number
  let rawUsername: string | null = null;
  const ignoreKeywords = [
    'UNIVERSITY',
    'MORATUWA',
    'STUDENT',
    'IDENTITY',
    'CARD',
    'SRI LANKA',
    'FACULTY',
    'DEPARTMENT',
    'VALID',
    'NIC',
  ];

  if (indexLineIdx > 0) {
    for (let i = indexLineIdx - 1; i >= 0; i--) {
      const candidate = lines[i];
      const upper = candidate.toUpperCase();
      const hasIgnore = ignoreKeywords.some((kw) => upper.includes(kw));
      // Must contain letters and not be a header line
      if (!hasIgnore && /[A-Z]/i.test(candidate)) {
        rawUsername = candidate;
        break;
      }
    }
  }

  // Fallback: search for line with initials pattern (e.g., "P.K.D.R." or "U.D.S." or "A. B.")
  if (!rawUsername) {
    for (const line of lines) {
      if (line.includes(index_no)) continue;
      if (/\b[A-Z]\.[A-Z\.]+/i.test(line) || /\b[A-Z]{3,}\s+[A-Z\.]+/i.test(line)) {
        const upper = line.toUpperCase();
        if (!ignoreKeywords.some((kw) => upper.includes(kw))) {
          rawUsername = line;
          break;
        }
      }
    }
  }

  const username = rawUsername ? cleanStudentName(rawUsername) : null;

  return {
    index_no,
    username: username && username.length > 2 ? username : 'University Student',
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
    const { createWorker } = await import('tesseract.js');

    worker = await createWorker('eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          onProgress?.(40 + Math.round(pct * 0.5), `Analyzing ID text: ${pct}%`);
        }
      },
    });

    // Test candidate angles: 0° landscape, 270° portrait, 90°, 180°
    const candidateAngles = [0, 270, 90, 180];
    let bestText = '';
    let extracted: ReturnType<typeof parseMoratuwaIdText> = { index_no: null, username: null };
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
        break; // Found valid UoM index number! Immediate early exit.
      }
    }

    onProgress?.(100, 'Verification complete!');

    if (!extracted.index_no) {
      return {
        success: false,
        error:
          'Could not clearly read your Student Index Number. Please ensure the card is well-lit, fully in frame, and not blurry.',
      };
    }

    return {
      success: true,
      index_no: extracted.index_no,
      username: extracted.username || 'University Student',
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
