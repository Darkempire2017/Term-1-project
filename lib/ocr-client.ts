/**
 * ASTRIX Client-Side OCR Engine (100% Private, On-Device)
 * 
 * Runs Tesseract.js in a client Web Worker directly in the student's browser.
 * Features:
 * - Smart Index Auto-Correction (Fuzzy Matcher: S->5, O->0, l->1, etc.)
 * - Adaptive Glare & Contrast Normalization (Histogram Percentile Stretching)
 * - Strict Student Name Sanitizer (Rejects lowercase noise & colons)
 * - Multi-Angle Auto-Detection (0°, 270°, 90°, 180°)
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
 * Apply adaptive contrast and glare-reduction filter to canvas image data
 */
function applyAdaptiveGlareFilter(data: Uint8ClampedArray, width: number, height: number): void {
  // 1. Calculate luminance histogram (256 bins)
  const hist = new Int32Array(256);
  const totalPixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[gray]++;
  }

  // 2. Identify 5th and 95th percentiles to eliminate flash glare outliers & edge shadows
  let count = 0;
  let minLum = 0;
  let maxLum = 255;
  const lowerThreshold = totalPixels * 0.05;
  const upperThreshold = totalPixels * 0.95;

  for (let i = 0; i < 256; i++) {
    count += hist[i];
    if (count >= lowerThreshold && minLum === 0) minLum = i;
    if (count >= upperThreshold) {
      maxLum = i;
      break;
    }
  }

  const range = Math.max(35, maxLum - minLum);

  // 3. Stretch dynamic range & apply gentle S-curve to punch dark ink out of glare
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let stretched = ((gray - minLum) / range) * 255;
    stretched = Math.max(0, Math.min(255, stretched));

    let val: number;
    if (stretched < 128) {
      val = Math.pow(stretched / 128, 1.35) * 128;
    } else {
      val = 255 - Math.pow((255 - stretched) / 127, 1.35) * 127;
    }

    const clamped = Math.round(Math.max(0, Math.min(255, val)));
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }
}

/**
 * Render image to an offscreen canvas rotated and preprocessed with adaptive glare filter
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

  // Apply adaptive glare & contrast enhancement
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyAdaptiveGlareFilter(imgData.data, canvas.width, canvas.height);
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn('Canvas glare filter notice:', e);
  }

  return canvas;
}

/**
 * Smart index normalizer with character-confusion correction:
 * Replaces letter O->0, S->5, l->1 in digits; digit 0->O, 1->I, 5->S in check letter
 */
export function normalizeCandidateIndex(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-\.]+/g, '').toUpperCase();
  if (cleaned.length !== 7) return null;

  const digitMap: Record<string, string> = {
    'O': '0', 'Q': '0', 'D': '0',
    'I': '1', 'L': '1',
    'Z': '2',
    'E': '3',
    'A': '4',
    'S': '5',
    'G': '6',
    'T': '7',
    'B': '8',
    'q': '9',
  };
  const letterMap: Record<string, string> = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '5': 'S',
    '8': 'B',
  };

  let digits = '';
  for (let i = 0; i < 6; i++) {
    const ch = cleaned[i];
    if (/[0-9]/.test(ch)) {
      digits += ch;
    } else if (digitMap[ch]) {
      digits += digitMap[ch];
    } else {
      return null;
    }
  }

  let lastChar = cleaned[6];
  if (/[A-Z]/.test(lastChar)) {
    // Valid letter
  } else if (letterMap[lastChar]) {
    lastChar = letterMap[lastChar];
  } else {
    return null;
  }

  // Must match standard UoM format: 6 digits + 1 uppercase letter
  const finalIndex = digits + lastChar;
  if (/^[0-9]{6}[A-Z]$/.test(finalIndex)) {
    return finalIndex;
  }
  return null;
}

/**
 * Extract Moratuwa Index Number from raw text with smart auto-correction
 */
export function extractIndexNumber(text: string): string | null {
  // 1. Exact match attempt first
  const exactMatch = text.match(/\b([0-9]{6}[A-Z])\b/i);
  if (exactMatch) {
    return exactMatch[1].toUpperCase();
  }

  // 2. Fuzzy search: find 7-11 character alphanumeric candidates (allowing spaces or hyphens)
  // e.g. '2S0312H', '250 312 H', '250-312H', '2SO4O5V'
  const candidateMatches = text.match(/(?:^|\s|[^\w])([0-9a-zA-Z\s\-\.]{7,11})(?:$|\s|[^\w])/g);
  if (candidateMatches) {
    for (const match of candidateMatches) {
      const candidate = match.replace(/^[^\w]+|[^\w]+$/g, '');
      const normalized = normalizeCandidateIndex(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  // 3. Line-by-line fallback
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const words = line.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      // Single word
      const w = words[i].replace(/^[^\w]+|[^\w]+$/g, '');
      const normW = normalizeCandidateIndex(w);
      if (normW) return normW;

      // Two words joined (e.g. '250312' and 'H')
      if (i < words.length - 1) {
        const joined = (words[i] + words[i + 1]).replace(/^[^\w]+|[^\w]+$/g, '');
        const normJ = normalizeCandidateIndex(joined);
        if (normJ) return normJ;
      }
    }
  }

  return null;
}

/**
 * Clean student name by stripping photo-edge noise, trailing labels (e.g. 'tose:'),
 * colons, and stray non-alphabetic characters.
 */
export function cleanStudentName(raw: string): string {
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
  // 1. Extract Index Number with smart auto-correction
  const index_no = extractIndexNumber(text);

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
          'Could not clearly read your Student Index Number. Please ensure the card is well-lit, fully in frame, and free of direct glare.',
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
