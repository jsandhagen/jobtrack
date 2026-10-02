// How a fit score is shown. The scorers (localFit.js, and Claude's checklist
// in claude.js) work on a calibrated 0–100 scale whose bands sit at 45 / 65 /
// 80, and the fit benchmarks check those numbers. But people read a number
// out of 100 as a school grade, where a 69 "Strong match" looks like a D and
// puts them off applying. So the number shown goes on a grade-like scale with
// the same bands at 65 / 80 / 90: a strong match reads in the 80s.
//
// Display only, and it never changes the order of two jobs. Scores saved
// before this scale carry no `scale` and are moved onto it once (main.js).
//
// Used by the main process (require) and the renderer (window.FitScale).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FitScale = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Calibrated band edges → shown band edges, straight lines between.
  const KNOTS = [
    [0, 0],
    [45, 65],
    [65, 80],
    [80, 90],
    [100, 100],
  ];
  // Shown-scale bands: Excellent match, Strong match, Good potential; below is a stretch.
  const BANDS = { excellent: 90, strong: 80, good: 65 };
  // Stored beside a shown score, so it's never moved onto the scale twice.
  const SCALE = 2;

  function toShown(score) {
    if (typeof score !== 'number' || !isFinite(score)) return score;
    const s = Math.max(0, Math.min(100, score));
    for (let i = 1; i < KNOTS.length; i++) {
      const [x0, y0] = KNOTS[i - 1];
      const [x1, y1] = KNOTS[i];
      if (s <= x1) {
        const shown = Math.round(y0 + ((s - x0) * (y1 - y0)) / (x1 - x0));
        // Rounding must not promote a fractional score across a label edge.
        return s < x1 && x1 < 100 ? Math.min(y1 - 1, shown) : shown;
      }
    }
    return 100;
  }

  function shownLabel(score) {
    if (score >= BANDS.excellent) return 'Excellent match';
    if (score >= BANDS.strong) return 'Strong match';
    if (score >= BANDS.good) return 'Good potential';
    return 'Stretch role';
  }

  return { toShown, shownLabel, BANDS, SCALE };
});
