// Sprout, the mascot. A little seedling whose face, arms and leaves change
// with the mood. Shared by the dashboard and the overlay; loaded as a plain script.
(function () {
  const ARC_EYES = 'M40 58 q3 -4 6 0 M58 58 q3 -4 6 0';
  const BIG_ARC_EYES = 'M39 59 q4 -6 8 0 M57 59 q4 -6 8 0';
  const DOT_EYES = 'M43 57 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 M61 57 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0';

  // eyes/mouth: face paths. dots: filled (round) eyes that blink.
  // arms: 'down' | 'up' | 'wave' | 'pump' | 'hug'. extra: sparkles | dots | zzz | heart | sweat.
  const FACES = {
    happy: { eyes: ARC_EYES, mouth: 'M44 68 q8 8 16 0', cheeks: true, arms: 'down' },
    thrilled: { eyes: BIG_ARC_EYES, mouth: 'M42 66 q10 12 20 0 z', mouthFill: true, cheeks: true, arms: 'up', extra: 'sparkles' },
    thinking: { eyes: 'M41 57 h5 M58 57 h5', mouth: 'M47 70 q5 -2 10 0', cheeks: false, arms: 'down', extra: 'dots' },
    curious: { eyes: DOT_EYES, dots: true, mouth: 'M49 70 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', cheeks: true, arms: 'down' },
    cheer: { eyes: ARC_EYES, mouth: 'M45 67 q7 6 14 0', cheeks: true, arms: 'pump' },
    wave: { eyes: DOT_EYES, dots: true, mouth: 'M44 67 q8 8 16 0', cheeks: true, arms: 'wave' },
    proud: { eyes: BIG_ARC_EYES, mouth: 'M44 67 q8 7 16 0', cheeks: true, arms: 'down', extra: 'sparkles' },
    hug: { eyes: ARC_EYES, mouth: 'M47 67 q5 4 10 0', cheeks: true, arms: 'hug', extra: 'heart' },
    sleepy: { eyes: 'M40 59 q3 2.5 6 0 M58 59 q3 2.5 6 0', mouth: 'M49 70 q3 1.6 6 0', cheeks: true, arms: 'down', extra: 'zzz' },
    worried: { eyes: DOT_EYES, dots: true, brows: 'M38 51 q4 -3 8 -3 M66 51 q-4 -3 -8 -3', mouth: 'M45 71 q3.5 -3 7 0 q3.5 3 7 0', cheeks: false, arms: 'down', extra: 'sweat' },
  };

  const ARMS = {
    down: ['M27 72 q-5 3 -7 8', 'M77 72 q5 3 7 8'],
    up: ['M26 64 q-7 -4 -9 -12', 'M78 64 q7 -4 9 -12'],
    pump: ['M27 72 q-5 3 -7 8', 'M78 66 q7 -3 8 -11'],
    wave: ['M27 72 q-5 3 -7 8', 'M78 66 q7 -3 8 -11'],
    hug: ['M27 70 q4 10 17 9', 'M77 70 q-4 10 -17 9'],
  };

  const EXTRAS = {
    sparkles: `<g class="twinkle"><path d="M14 30 q1.2 5 5 6 q-3.8 1 -5 6 q-1.2 -5 -5 -6 q3.8 -1 5 -6z" fill="var(--butter, #f6d78b)"/>
      <path d="M91 36 q.9 3.6 3.6 4.4 q-2.7 .8 -3.6 4.4 q-.9 -3.6 -3.6 -4.4 q2.7 -.8 3.6 -4.4z" fill="var(--lavender, #b9a9e6)"/></g>`,
    dots: '<g class="think-dots" fill="var(--lavender, #b9a9e6)"><circle cx="85" cy="40" r="2"/><circle cx="91" cy="32" r="2.8"/><circle cx="97" cy="22" r="3.6"/></g>',
    zzz: '<g class="zzz" fill="none" stroke="var(--ink-faint, #8f9a94)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M78 34 h6 l-6 7 h6"/><path d="M88 22 h4.5 l-4.5 5 h4.5"/></g>',
    heart: '<path class="heart" d="M52 88 c-5 -3.4 -7.2 -6 -6.6 -8.6 .5 -2.3 3.5 -3 6.6 -.3 3.1 -2.7 6.1 -2 6.6 .3 .6 2.6 -1.6 5.2 -6.6 8.6z" fill="#f29b93" stroke="#e07f78" stroke-width="1.2"/>',
    sweat: '<path d="M79 46 q-3.5 5 0 7 q3.5 -2 0 -7z" fill="#a9d6f0" stroke="#86bddd" stroke-width="1"/>',
  };

  function moodForScore(score) {
    if (score >= 80) return 'thrilled';
    if (score >= 60) return 'happy';
    return 'cheer';
  }

  // The cast. Sprout is the buddy; Spike the cactus makes ATS resumes and
  // Root the carrot makes Claude resumes. They share faces and moods, and
  // differ in body, colours and what grows on top.
  const SPROUT_TOP = `<g class="leaves">
    <path d="M52 30 C 40 8, 16 14, 20 30 C 26 40, 44 38, 52 30 Z" fill="var(--leaf, #8fd0a6)"/>
    <path d="M52 30 C 62 6, 90 10, 86 28 C 80 40, 60 38, 52 30 Z" fill="var(--leaf-2, #a9dfb9)"/>
    <path d="M35 24 q7 1 14 5 M69 22 q-7 2 -14 7" stroke="var(--stem, #5ea77a)" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".55"/>
    <path d="M52 30 v10" stroke="var(--stem, #5ea77a)" stroke-width="4" stroke-linecap="round"/>
  </g>`;
  const CAST = {
    sprout: {
      name: 'Sprout',
      what: 'the mascot',
      fill: 'var(--body, #fff6e8)',
      line: 'var(--outline, #e9d6bb)',
      back: SPROUT_TOP,
      body: '<ellipse cx="52" cy="66" rx="30" ry="27" fill="var(--body, #fff6e8)" stroke="var(--outline, #e9d6bb)" stroke-width="2.5"/>',
      front: '',
    },
    carrot: {
      name: 'Root',
      what: 'the carrot',
      fill: '#f9a65a',
      line: '#e0823e',
      back: `<g class="leaves">
    <path d="M52 41 C 44 32, 34 24, 36 12 C 46 16, 52 28, 52 41 Z" fill="#7cc47f"/>
    <path d="M52 41 C 68 30, 72 24, 72 13 C 60 16, 54 28, 52 41 Z" fill="#6bb56f"/>
    <path d="M52 41 C 48 26, 48 14, 54 5 C 61 15, 58 29, 52 41 Z" fill="#93d494"/>
  </g>`,
      body: `<path d="M52 38 C 70 38, 82 44, 81 56 C 80 70, 64 88, 54 99 C 53 100.4, 51 100.4, 50 99 C 40 88, 24 70, 23 56 C 22 44, 34 38, 52 38 Z" fill="#f9a65a" stroke="#e0823e" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M31 77 q5 1.6 9 -.6 M65 84 q-4 1.4 -8 -.4 M47 90 q3 1 6 0" stroke="#e0823e" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".7"/>`,
      front: '',
    },
    cactus: {
      name: 'Spike',
      what: 'the cactus',
      fill: '#93d09a',
      line: '#5fa86a',
      back: '',
      body: `<rect x="28" y="33" width="48" height="64" rx="24" fill="#93d09a" stroke="#5fa86a" stroke-width="2.5"/>
  <path d="M29 46 l-3 -1.5 M75 46 l3 -1.5 M29 76 l-3 1 M75 76 l3 1 M40 38 l-1.5 -2.5 M64 38 l1.5 -2.5" stroke="#5fa86a" stroke-width="1.8" stroke-linecap="round"/>`,
      front: `<g class="leaves"><g fill="#f6a3bf" stroke="#e7849f" stroke-width="1"><circle cx="46.5" cy="30" r="4.2"/><circle cx="57.5" cy="30" r="4.2"/><circle cx="52" cy="25" r="4.2"/><circle cx="52" cy="34" r="3.6"/></g><circle cx="52" cy="30" r="3" fill="#f6d78b"/></g>
  <path d="M26 83 h52 a2 2 0 0 1 2 2 v4 a2 2 0 0 1 -2 2 h-52 a2 2 0 0 1 -2 -2 v-4 a2 2 0 0 1 2 -2 z" fill="#e8a077" stroke="#c97a52" stroke-width="2"/>
  <path d="M29 91 h46 l-3.5 10 h-39 z" fill="#e8a077" stroke="#c97a52" stroke-width="2" stroke-linejoin="round"/>`,
    },
  };
  // Which helper makes which kind of tailored resume.
  const HELPERS = {
    ats: { kind: 'cactus', name: 'Spike', title: 'ATS resume' },
    claude: { kind: 'carrot', name: 'Root', title: 'Claude resume' },
  };

  function armPaths(kind, cast = CAST.sprout) {
    return ARMS[kind]
      .map((d, i) => {
        const cls = kind === 'wave' && i === 1 ? ' class="wave-arm"' : '';
        return `<g${cls}><path d="${d}" stroke="${cast.line}" stroke-width="9" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${cast.fill}" stroke-width="5.4" stroke-linecap="round" fill="none"/></g>`;
      })
      .join('');
  }

  // opts.cls adds classes (e.g. "pettable"); opts.label overrides the accessible name;
  // opts.kind picks the character: 'sprout' (default), 'carrot' or 'cactus'.
  function mascotSvg(mood = 'happy', size = 96, opts = {}) {
    const f = FACES[mood] || FACES.happy;
    const kind = CAST[opts.kind] ? opts.kind : 'sprout';
    const cast = CAST[kind];
    const motion = mood === 'thinking' ? 'sprout-think' : mood === 'thrilled' ? 'sprout-bob sprout-hop' : mood === 'sleepy' ? 'sprout-sleep' : 'sprout-bob';
    const arms = armPaths(f.arms, cast);
    const hugInFront = f.arms === 'hug';
    return `<svg class="sprout ${motion} mood-${mood} cast-${kind}${opts.cls ? ' ' + opts.cls : ''}" width="${size}" height="${size}" viewBox="0 0 104 104" role="img" aria-label="${opts.label || `${cast.name} ${cast.what}, feeling ${mood}`}">
  <g class="whole">
  ${cast.back}
  ${hugInFront ? '' : arms}
  ${cast.body}
  ${cast.front}
  ${f.cheeks ? '<ellipse cx="36" cy="68" rx="5" ry="3.2" fill="#f7b8b0" opacity=".75"/><ellipse cx="68" cy="68" rx="5" ry="3.2" fill="#f7b8b0" opacity=".75"/>' : ''}
  ${f.brows ? `<path d="${f.brows}" stroke="#3b3a36" stroke-width="2" stroke-linecap="round" fill="none"/>` : ''}
  <g class="eyes${f.dots ? ' blink' : ''}"><path d="${f.eyes}" stroke="#3b3a36" stroke-width="3" stroke-linecap="round" fill="${f.dots ? '#3b3a36' : 'none'}"/></g>
  <path d="${f.mouth}" stroke="#3b3a36" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="${f.mouthFill ? '#e88d86' : 'none'}"/>
  ${hugInFront ? arms : ''}
  ${f.extra ? EXTRAS[f.extra] : ''}
  </g>
</svg>`;
  }

  // Sprout with a speech bubble. text is HTML (escape it before passing).
  // opts.cls: classes on the wrapper; opts.svg: options for mascotSvg.
  function sproutSays(mood, html, size = 56, opts = {}) {
    return `<div class="sprout-says${opts.cls ? ' ' + opts.cls : ''}">${mascotSvg(mood, size, opts.svg)}<div class="bubble">${html}</div></div>`;
  }

  const LINES = {
    thrilled: ['This role has your name all over it!', "Oh, you're a fantastic fit for this one!", 'Wow — this is right in your wheelhouse!'],
    happy: ["You've got a lot going for you here!", "Solid match! Let's make it shine.", 'This one looks really promising.'],
    cheer: [
      'A stretch role — and stretching is how we grow!',
      "Not a perfect match, but you bring real strengths. Let's highlight them.",
      'Every application is practice. Want to give it a go?',
    ],
  };

  // Things Sprout says at moments that matter, and when you poke it.
  const SAYINGS = {
    pet: [
      "Hi! I'm rooting for you. (Get it? Rooting?)",
      "Boop! That tickles.",
      "You're doing better than you think.",
      "One posting at a time. We've got this.",
      'Quick stretch and a sip of water? I’ll wait.',
      'I believe in you — really, truly.',
      "Every 'no' gets you closer to a 'yes'.",
      "Proud of you for showing up today.",
      'Job hunting is hard. You’re handling it.',
      "I'm small, but my faith in you is enormous.",
    ],
    applied: ['You did it! Another one out into the world.', 'Applied! That took courage — I’m proud of you.', 'Sent! I’ll remind you to follow up.'],
    interviewing: ['An interview! You’ve earned this.', 'Interview time! Jot some prep notes in Tracking — you’ve got this.'],
    offer: ['AN OFFER!! I’m so, so proud of you.', 'You got an offer! Happy dance time!'],
    rejected: [
      'Their loss. I’m proud of you for putting yourself out there.',
      'Not this one — the right role is still out there. I’m with you.',
      'Rejections sting. Take a breather; we’ll try again together.',
    ],
    exported: ['Saved! Go get ’em.', 'Looking sharp! Saved.', 'All saved — that resume looks great.'],
    error: ['Oops, something went sideways:', 'Hmm, that didn’t work:'],
  };

  // The helper for a resume mode ('ats' | 'claude'), drawn in a mood.
  function helperSvg(mode, mood = 'happy', size = 56, opts = {}) {
    const h = HELPERS[mode] || HELPERS.ats;
    return mascotSvg(mood, size, { ...opts, kind: h.kind });
  }

  // A helper peeking over the top edge of a button; it pops up and waves on hover.
  // Pair with <button class="peek mode-…">; styles live in theme.css.
  function peekPal(mode, size = 56) {
    return `<span class="peek-pal" aria-hidden="true">${helperSvg(mode, 'curious', size, { cls: 'pal-idle' })}${helperSvg(mode, 'wave', size, { cls: 'pal-wave' })}</span>`;
  }

  function pick(list, seed = Date.now()) {
    return list[Math.abs(seed) % list.length];
  }

  function say(key, seed) {
    return pick(SAYINGS[key] || SAYINGS.pet, seed);
  }

  function encouragement(score, seed = Date.now()) {
    return pick(LINES[moodForScore(score)], seed);
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

  // Confetti burst inside `host` (which should be position:relative or fixed).
  function confetti(host, count = 36) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#8fd0a6', '#f6b99a', '#b9a9e6', '#f6d78b', '#e98a8a'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.5 + 's';
      box.appendChild(p);
    }
    host.appendChild(box);
    setTimeout(() => box.remove(), 2400);
  }

  window.SproutMascot = { mascotSvg, helperSvg, peekPal, HELPERS, sproutSays, moodForScore, encouragement, say, pick, scoreRing, animateRings, scoreColor, confetti, moods: Object.keys(FACES) };
})();
