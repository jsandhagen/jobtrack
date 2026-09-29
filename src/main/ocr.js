// Free, on-device text recognition (Tesseract OCR compiled to WebAssembly).
// No API calls and no internet: the English model ships with the app.
const path = require('path');
const { createWorker } = require('tesseract.js');

let workerPromise = null;
let idleTimer = null;

function langPath() {
  // "best_int" is the accurate-but-compact model (~3 MB).
  return path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
}

function getWorker(cachePath) {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { langPath: langPath(), cachePath, gzip: true, logger: () => {} }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// Free the ~100 MB worker when the user hasn't scanned for a while.
function scheduleIdleShutdown() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => terminate(), 5 * 60 * 1000);
  if (idleTimer.unref) idleTimer.unref();
}

async function terminate() {
  clearTimeout(idleTimer);
  const p = workerPromise;
  workerPromise = null;
  if (p) await (await p).terminate().catch(() => {});
}

/**
 * Recognise text in a PNG. Returns flat lines with their position and size,
 * which pageText.js uses to find the posting on screen.
 * @param {Buffer} png
 * @param {{cachePath?: string}} [opts]
 */
async function recognizeLines(png, opts = {}) {
  const worker = await getWorker(opts.cachePath);
  const { data } = await worker.recognize(png, {}, { blocks: true, text: true });
  scheduleIdleShutdown();
  const lines = [];
  (data.blocks || []).forEach((block, bi) => {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) lines.push(...splitColumns(line, bi));
    }
  });
  return { lines, confidence: data.confidence };
}

// Tesseract happily reads straight across a two-column layout ("Product
// Designer   About the job"). Split a line wherever the gap between two words
// is much wider than a normal space, so each column stays separate.
function splitColumns(line, block) {
  const words = (line.words || []).filter((w) => w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (!words.length) return [];
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)] || 12;
  const maxGap = Math.max(28, typical * 2.2);
  const segments = [[words[0]]];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].bbox.x0 - words[i - 1].bbox.x1;
    if (gap > maxGap) segments.push([words[i]]);
    else segments[segments.length - 1].push(words[i]);
  }
  return segments.map((ws) => {
    const hs = ws.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
    return {
      text: ws.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim(),
      confidence: ws.reduce((sum, w) => sum + w.confidence, 0) / ws.length,
      x0: Math.min(...ws.map((w) => w.bbox.x0)),
      x1: Math.max(...ws.map((w) => w.bbox.x1)),
      y0: Math.min(...ws.map((w) => w.bbox.y0)),
      y1: Math.max(...ws.map((w) => w.bbox.y1)),
      // Median word height: a robust "font size" for picking out the title.
      height: hs[Math.floor(hs.length / 2)],
      block,
    };
  });
}

module.exports = { recognizeLines, terminate, splitColumns };
