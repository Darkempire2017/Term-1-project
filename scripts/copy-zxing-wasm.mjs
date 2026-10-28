// Copies the ZXing-C++ barcode reader (WebAssembly) from node_modules into public/,
// so the signup page loads it from this site instead of a CDN. Runs before every
// dev and build (predev / prebuild), so the file always matches the installed package.
import fs from 'fs';
import path from 'path';

const from = path.join('node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm');
const to = path.join('public', 'zxing', 'zxing_reader.wasm');

fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log(`Copied ${from} -> ${to}`);
