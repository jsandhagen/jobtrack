// Turns files the user drops into the library into plain text.
const fs = require('fs');
const path = require('path');

const SUPPORTED = ['.pdf', '.docx', '.txt', '.md', '.markdown', '.json'];

// Rough guess at what a document is, so the library can show a friendly label
// and Claude gets a hint about how to use it.
function guessKind(name, text) {
  const n = name.toLowerCase();
  const t = text.slice(0, 4000).toLowerCase();
  if (/writing[\s_-]?sample|\bessay\b|\bblog\b|\barticle\b/.test(n)) return 'writing-sample';
  if (/cover[\s_-]?letter/.test(n) || /^dear\b/m.test(t)) return 'cover-letter';
  if (/resume|résumé|\bcv\b/.test(n)) return 'resume';
  if (/transcript/.test(n)) return 'transcript';
  if (/cert/.test(n)) return 'certification';
  if (/project|portfolio|case[\s_-]?study/.test(n)) return 'project';
  if (/review|feedback|recommend|reference/.test(n)) return 'recommendation';
  if (/experience|education/.test(t) && /skills/.test(t)) return 'resume';
  return 'other';
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  let text;
  if (ext === '.pdf') {
    // pdf-parse's index.js runs a self-test when required directly; the lib path skips it.
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    text = (await pdfParse(buf)).text;
  } else if (ext === '.docx') {
    const mammoth = require('mammoth');
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  } else if (SUPPORTED.includes(ext)) {
    text = buf.toString('utf8');
  } else {
    throw new Error(`Unsupported file type "${ext}". Try PDF, DOCX, TXT or MD.`);
  }
  text = normalizeWhitespace(text);
  if (!text) throw new Error(`Couldn't find any text in ${path.basename(filePath)} (is it a scanned image?).`);
  return text;
}

async function importFile(filePath) {
  const text = await extractText(filePath);
  const name = path.basename(filePath);
  return { name, kind: guessKind(name, text), text, sourcePath: filePath };
}

module.exports = { importFile, extractText, guessKind, SUPPORTED };
