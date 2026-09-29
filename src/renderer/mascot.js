// Sprout, the mascot. A little seedling whose face (and leaves) change with
// the mood. Shared by the dashboard and the overlay; loaded as a plain script.
(function () {
  const FACES = {
    happy: { eyes: 'M40 58 q3 -4 6 0 M58 58 q3 -4 6 0', mouth: 'M44 68 q8 8 16 0', cheeks: true },
    thrilled: { eyes: 'M39 59 q4 -6 8 0 M57 59 q4 -6 8 0', mouth: 'M42 66 q10 12 20 0 z', cheeks: true },
    thinking: { eyes: 'M41 57 h5 M58 57 h5', mouth: 'M47 70 q5 -2 10 0', cheeks: false },
    curious: { eyes: 'M43 57 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 M61 57 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0', mouth: 'M49 70 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', cheeks: true },
    cheer: { eyes: 'M40 58 q3 -4 6 0 M58 58 q3 -4 6 0', mouth: 'M45 67 q7 6 14 0', cheeks: true },
  };

  function moodForScore(score) {
    if (score >= 80) return 'thrilled';
    if (score >= 60) return 'happy';
    return 'cheer';
  }

  function mascotSvg(mood = 'happy', size = 96) {
    const f = FACES[mood] || FACES.happy;
    const bounce = mood === 'thinking' ? 'sprout-think' : 'sprout-bob';
    return `<svg class="sprout ${bounce}" width="${size}" height="${size}" viewBox="0 0 104 104" role="img" aria-label="Sprout the mascot, feeling ${mood}">
  <g class="leaves">
    <path d="M52 30 C 40 8, 16 14, 20 30 C 26 40, 44 38, 52 30 Z" fill="var(--leaf, #8fd0a6)"/>
    <path d="M52 30 C 62 6, 90 10, 86 28 C 80 40, 60 38, 52 30 Z" fill="var(--leaf-2, #a9dfb9)"/>
    <path d="M52 30 v10" stroke="var(--stem, #5ea77a)" stroke-width="4" stroke-linecap="round"/>
  </g>
  <ellipse cx="52" cy="66" rx="30" ry="27" fill="var(--body, #fff6e8)" stroke="var(--outline, #e9d6bb)" stroke-width="2.5"/>
  ${f.cheeks ? '<ellipse cx="36" cy="68" rx="5" ry="3.2" fill="#f7b8b0" opacity=".75"/><ellipse cx="68" cy="68" rx="5" ry="3.2" fill="#f7b8b0" opacity=".75"/>' : ''}
  <path d="${f.eyes}" stroke="#3b3a36" stroke-width="3" stroke-linecap="round" fill="${mood === 'curious' ? '#3b3a36' : 'none'}"/>
  <path d="${f.mouth}" stroke="#3b3a36" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="${mood === 'thrilled' ? '#e88d86' : 'none'}"/>
</svg>`;
  }

  const LINES = {
    thrilled: ['This role has your name all over it!', "Oh, you're a fantastic fit for this one!", 'Wow — this is right in your wheelhouse!'],
    happy: ["You've got a lot going for you here!", 'Solid match! Let\'s make it shine.', 'This one looks really promising.'],
    cheer: [
      "A stretch role — and stretching is how we grow! 🌱",
      "Not a perfect match, but you bring real strengths. Let's highlight them.",
      'Every application is practice. Want to give it a go?',
    ],
  };

  function encouragement(score, seed = Date.now()) {
    const list = LINES[moodForScore(score)];
    return list[seed % list.length];
  }

  function scoreColor(score) {
    if (score >= 65) return 'var(--sage)';
    if (score >= 45) return 'var(--butter)';
    return 'var(--peach)';
  }

  // Animated donut showing a 0-100 score. Starts empty; call animateRings() after inserting.
  function scoreRing(score, size = 104, caption = 'fit') {
    const stroke = Math.round(size * 0.1);
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return `<div class="ring" style="width:${size}px;height:${size}px">
  <svg width="${size}" height="${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
  <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${scoreColor(score)}" stroke-width="${stroke}"
    stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - Math.max(0, Math.min(100, score)) / 100)}"/></svg>
  <div class="num"><b>${Math.round(score)}</b><small>${caption}</small></div></div>`;
  }

  function animateRings(root = document) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.querySelectorAll('.ring .bar[data-target]').forEach((el) => el.setAttribute('stroke-dashoffset', el.dataset.target)))
    );
  }

  window.SproutMascot = { mascotSvg, moodForScore, encouragement, scoreRing, animateRings, scoreColor };
})();
