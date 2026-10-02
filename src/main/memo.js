// Remember a pure function's recent results. The scorers read the same
// posting against every resume in the library (and again on each redraw),
// so the posting-side work is done once instead of once per resume.
// Results are shared between callers: treat them as read-only.
function memoize(fn, { size = 300, key = (...args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? '')).join('\u0000') } = {}) {
  const cache = new Map();
  const memo = (...args) => {
    const k = key(...args);
    if (cache.has(k)) return cache.get(k);
    const value = fn(...args);
    if (cache.size >= size) cache.delete(cache.keys().next().value);
    cache.set(k, value);
    return value;
  };
  memo.clear = () => cache.clear();
  return memo;
}

module.exports = { memoize };
