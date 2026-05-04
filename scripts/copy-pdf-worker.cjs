const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const publicDir = path.join(__dirname, '..', 'public');
const target = path.join(publicDir, 'pdf.worker.min.mjs');

if (!fs.existsSync(source)) {
  console.error('[copy-pdf-worker] source not found:', source);
  process.exit(1);
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.copyFileSync(source, target);
console.log('[copy-pdf-worker] copied to', target);
