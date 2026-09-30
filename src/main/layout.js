// What an ATS parser would trip over in the resume *file*, which the plain
// text can't show: side-by-side columns, tables and text boxes, contact
// details in a Word header, icon glyphs and text that doesn't extract cleanly.
// Computed once when a document is imported and stored with it.
//
// Why these: parsers (Workday, Taleo, iCIMS, Textkernel/Sovren) read a page
// left to right, top to bottom, so two columns get interleaved line by line;
// many skip Word headers/footers and text boxes; tables and icon fonts are
// the most commonly reported causes of scrambled or missing fields.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;

// ---------- PDF ----------

// Rows of text on a page, each split into runs wherever there's a wide gap.
function rowsOf(items) {
  const rows = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.runs = [];
    for (const it of r.items) {
      const last = r.runs[r.runs.length - 1];
      if (last && it.x - last.x1 < 12) {
        last.x1 = Math.max(last.x1, it.x1);
        last.chars += it.chars;
      } else r.runs.push({ x: it.x, x1: it.x1, chars: it.chars });
    }
  }
  return rows;
}

// A second column shows up as a left edge in the middle of the page that
// many lines start at, carrying a real share of the text, with other text
// beside it (to its left, over the same stretch of page). Rows needn't line
// up: a sidebar's lines rarely align with the main column's. Right-aligned
// dates don't qualify: they're short, and end rather than start at a common x.
function looksMultiColumn(items, width) {
  const runs = rowsOf(items).flatMap((r) => r.runs.map((u) => ({ ...u, y: r.y })));
  const total = runs.reduce((s, u) => s + u.chars, 0);
  if (runs.length < 8 || !total) return false;
  const mid = runs.filter((u) => u.x > width * 0.2 && u.x < width * 0.75);
  for (const edge of mid) {
    const col = mid.filter((u) => Math.abs(u.x - edge.x) <= 4);
    if (col.length < 6 || col.reduce((s, u) => s + u.chars, 0) / total < 0.2) continue;
    const top = Math.max(...col.map((u) => u.y));
    const bottom = Math.min(...col.map((u) => u.y));
    const beside = runs.filter((u) => u.x1 < edge.x - 8 && u.y <= top + 2 && u.y >= bottom - 2);
    if (beside.length >= 4) return true;
  }
  return false;
}

async function analyzePdf(buf) {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const pages = [];
  // A copy with its own memory: small Buffers are views into a shared pool,
  // and this pdf.js reads the whole underlying ArrayBuffer.
  await pdfParse(new Uint8Array(buf), {
    pagerender: async (page) => {
      const [x0, , x1] = page.view;
      const content = await page.getTextContent();
      const items = content.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({ x: it.transform[4], y: it.transform[5], x1: it.transform[4] + (it.width || 0), chars: it.str.trim().length, str: it.str }));
      pages.push({ width: x1 - x0, items });
      return items.map((it) => it.str).join(' ');
    },
  });
  const text = pages.flatMap((p) => p.items.map((it) => it.str)).join(' ');
  const columnPages = pages.map((p, i) => (looksMultiColumn(p.items, p.width) ? i + 1 : null)).filter(Boolean);
  return { type: 'pdf', pages: pages.length, columnPages, ...glyphIssues(text) };
}

// ---------- DOCX ----------

function xmlText(xml) {
  return xml
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function analyzeDocx(buf) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const read = async (name) => (zip.file(name) ? zip.file(name).async('string') : '');
  const doc = await read('word/document.xml');
  const headerNames = Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n));
  const headerText = (await Promise.all(headerNames.map(read))).map(xmlText).join('\n');
  // Text boxes live inside the body XML but outside its normal flow.
  const body = xmlText(doc.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, ''));
  const cols = [...doc.matchAll(/<w:cols\b[^>]*w:num="(\d+)"/g)].map((m) => Number(m[1]));
  return {
    type: 'docx',
    tables: (doc.match(/<w:tbl>/g) || []).length,
    textBoxes: (doc.match(/<w:txbxContent>/g) || []).length,
    columns: cols.length ? Math.max(...cols) : 1,
    // Contact details that exist only in the header/footer.
    headerOnlyContact: ['email', 'phone'].filter((k) => {
      const re = k === 'email' ? EMAIL : PHONE;
      return re.test(headerText) && !re.test(body);
    }),
    ...glyphIssues(xmlText(doc)),
  };
}

// ---------- shared ----------

function glyphIssues(text) {
  return {
    // Private-use characters are icon-font glyphs (phone, envelope, pin).
    iconGlyphs: (text.match(/[-]/g) || []).length,
    // "ﬁ"/"ﬂ" ligatures: "certiﬁed" no longer matches "certified".
    ligatures: (text.match(/[ﬀ-ﬆ]/g) || []).length,
    // Fonts without a Unicode map extract as "(cid:12)" codes or empty boxes.
    garbled: /\(cid:\d+\)/.test(text) || (text.match(/[�□]/g) || []).length > 3,
  };
}

async function analyzeLayout(filePath, buf) {
  const ext = require('path').extname(filePath).toLowerCase();
  try {
    if (ext === '.pdf') return await analyzePdf(buf);
    if (ext === '.docx') return await analyzeDocx(buf);
  } catch {
    // A file we can read as text but not inspect is still usable; just no layout checks.
  }
  return null;
}

// Checks for the ATS parse-readiness score (same shape as atsScore's checks).
function layoutChecks(layout) {
  if (!layout) return [];
  const checks = [];
  if (layout.type === 'pdf') {
    const pages = layout.columnPages || [];
    checks.push({
      id: 'columns',
      ok: !pages.length,
      tip: `Your PDF uses side-by-side columns (page ${pages.join(', ')}). Parsers read straight across the page, mixing the columns line by line; use a single column.`,
    });
    checks.push({ id: 'pages', ok: layout.pages <= 2, tip: `The PDF is ${layout.pages} pages; keep it to one or two.` });
  }
  if (layout.type === 'docx') {
    checks.push({
      id: 'header-contact',
      ok: !(layout.headerOnlyContact || []).length,
      tip: `Your ${layout.headerOnlyContact.join(' and ')} ${layout.headerOnlyContact.length > 1 ? 'are' : 'is'} only in the Word header/footer, which many parsers skip. Put contact details in the body.`,
    });
    checks.push({ id: 'tables', ok: !layout.tables, tip: 'The document uses tables for layout. Some parsers scramble or skip table cells; use plain paragraphs and tab stops.' });
    checks.push({ id: 'text-boxes', ok: !layout.textBoxes, tip: 'The document has text boxes. Many parsers skip them entirely; move that text into the body.' });
    checks.push({ id: 'columns', ok: (layout.columns || 1) <= 1, tip: 'The document is set in multiple columns. Parsers read across the page and mix them; use a single column.' });
  }
  const glyphProblems = [];
  if (layout.garbled) glyphProblems.push("some text extracts as unreadable codes (the font has no text map; re-export the PDF or use a standard font)");
  if (layout.iconGlyphs) glyphProblems.push('icons stand in for labels (a phone or envelope icon reads as a blank or junk character; write "Phone:"/"Email:" or nothing)');
  if (layout.ligatures) glyphProblems.push('letter pairs like "fi"/"fl" extract as single ligature characters, so words such as "certified" may not match');
  checks.push({ id: 'clean-text', ok: !glyphProblems.length, tip: `Text extraction: ${glyphProblems.join('; ')}.` });
  return checks;
}

module.exports = { analyzeLayout, analyzePdf, analyzeDocx, layoutChecks, looksMultiColumn };
