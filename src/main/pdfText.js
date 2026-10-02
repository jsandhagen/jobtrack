// PDF drawing order need not be reading order. Reconstruct visible lines so
// bullets stay with their employer, and wrapped skill cells stay together.
const BULLET = /^\s*[●•▪◦‣∙·\-]\s*/;
const SKILLS = /^(?:(?:relevant|technical|core|key|professional|top)\s+)*(?:skills|competencies|technologies|tools|expertise)\s*:?$/i;
const HEADING = /^(?:education|certifications?|professional summary|relevant work experience|experience|projects|publications|interests)\s*:?$/i;

function lineText(items) {
  let text = '';
  let end = null;
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    const gap = end == null ? 0 : item.x - end;
    const separator = gap > 12 ? '  ' : gap > 1 && text && !/\s$/.test(text) && !/^\s/.test(item.str) ? ' ' : '';
    text += separator + item.str;
    end = Math.max(end || 0, item.x + item.width);
  }
  return text.trim().replace(/^([●•▪◦‣∙·])(?=\S)/, '$1 ');
}

function readingOrder(rawItems) {
  const items = rawItems.filter((i) => i.str && i.str.trim()).map((i) => ({
    str: i.str, x: i.transform[4], y: i.transform[5], width: i.width || 0,
  })).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of items) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const text = lineText(rows[i].items);
    out.push(text);
    if (!SKILLS.test(text)) continue;
    let end = i + 1;
    while (end < rows.length && !HEADING.test(lineText(rows[end].items))) end++;
    const grid = rows.slice(i + 1, end);
    const edges = [];
    for (const row of grid) for (const item of row.items) {
      if (BULLET.test(item.str) && !edges.some((x) => Math.abs(x - item.x) < 6)) edges.push(item.x);
    }
    edges.sort((a, b) => a - b);
    if (!edges.length) continue;
    const cells = [];
    for (let col = 0; col < edges.length; col++) {
      let cell = null;
      for (let ri = 0; ri < grid.length; ri++) {
        const parts = grid[ri].items.filter((item) => item.x >= edges[col] - 3 && (col === edges.length - 1 || item.x < edges[col + 1] - 3));
        if (!parts.length) continue;
        const value = lineText(parts);
        if (BULLET.test(value)) {
          cell = { row: ri, col, text: value.replace(BULLET, '').trim() };
          cells.push(cell);
        } else if (cell) cell.text += ' ' + value;
      }
    }
    out.push(...cells.sort((a, b) => a.row - b.row || a.col - b.col).filter((cell) => cell.text).map((cell) => `● ${cell.text}`));
    i = end - 1;
  }
  return out.join('\n');
}

async function renderPage(page) {
  const content = await page.getTextContent();
  return readingOrder(content.items);
}

module.exports = { readingOrder, renderPage };
