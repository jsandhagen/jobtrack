// Sprout, the mascot. A little seedling whose face, arms and leaves change
// with the mood. Shared by the dashboard and the overlay; loaded as a plain script.
(function () {
  const ARC_EYES = 'M40 58 q3 -4 6 0 M58 58 q3 -4 6 0';
  const BIG_ARC_EYES = 'M39 59 q4 -6 8 0 M57 59 q4 -6 8 0';
  // Big glossy chibi eyes: a dark oval with a large and a small highlight.
  const shiny = (x) => `<ellipse cx="${x}" cy="57" rx="4.6" ry="5.4" fill="#3b3a36"/><circle cx="${x + 1.5}" cy="54.8" r="1.9" fill="#fff"/><circle cx="${x - 1.7}" cy="59.4" r="0.95" fill="#fff"/>`;
  const SHINY_EYES = `${shiny(42.5)}${shiny(61.5)}`;
  // A wink: left eye a happy arc, right eye a dot.
  const WINK_EYES = '<path d="M39.5 58 q3.5 -4.5 7 0" stroke="#3b3a36" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="61" cy="57" r="2.8" fill="#3b3a36"/>';
  // Eyes glancing up while thinking.
  const LOOK_UP_EYES = '<circle cx="42" cy="55" r="2.6" fill="#3b3a36"/><circle cx="60" cy="55" r="2.6" fill="#3b3a36"/>';
  // Little happy tears.
  const TEARS = '<path d="M37.4 62 q-1.8 2.8 0 4.1 q1.8 -1.3 0 -4.1z M66.6 62 q-1.8 2.8 0 4.1 q1.8 -1.3 0 -4.1z" fill="#a9d6f0" stroke="#86bddd" stroke-width=".8"/>';
  // Happy squeezed "> <" eyes (and a slightly smaller pair for cheering).
  const SQUEEZE_EYES_2 = '<path d="M39.5 53.5 l6 3.5 l-6 3.5 M64.5 53.5 l-6 3.5 l6 3.5" stroke="#3b3a36" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  const SQUEEZE_EYES = '<path d="M38.5 53 l7 4 l-7 4 M65.5 53 l-7 4 l7 4" stroke="#3b3a36" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  const DOT_EYES = 'M43 57 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 M61 57 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0';

  // eyes/mouth: face paths. dots: filled (round) eyes that blink.
  // arms: 'down' | 'up' | 'wave' | 'pump' | 'hug'. extra: sparkles | dots | zzz | heart | sweat.
  const FACES = {
    happy: { eyes: ARC_EYES, mouth: 'M44 68 q8 8 16 0', cheeks: true, arms: 'down' },
    // Chibi-style excitement: big glossy eyes, a small open mouth, blushing.
    thrilled: { eyesSvg: SHINY_EYES, mouth: 'M46.5 65 h11 q0 6 -5.5 6 q-5.5 0 -5.5 -6z', mouthFill: true, tongue: 'M48.4 69.3 q3.6 -2.7 7.2 0 q-3.6 2 -7.2 0z', cheeks: 'blush', arms: 'up', extra: 'hearts' },
    thinking: { eyes: 'M41 57 h5 M58 57 h5', mouth: 'M47 70 q5 -2 10 0', cheeks: false, arms: 'down', extra: 'dots' },
    curious: { eyes: DOT_EYES, dots: true, mouth: 'M49 70 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', cheeks: true, arms: 'down' },
    cheer: { eyes: ARC_EYES, mouth: 'M45 67 q7 6 14 0', cheeks: true, arms: 'pump' },
    wave: { eyes: DOT_EYES, dots: true, mouth: 'M44 67 q8 8 16 0', cheeks: true, arms: 'wave' },
    proud: { eyes: BIG_ARC_EYES, mouth: 'M44 67 q8 7 16 0', cheeks: true, arms: 'down', extra: 'sparkles' },
    hug: { eyes: ARC_EYES, mouth: 'M47 67 q5 4 10 0', cheeks: true, arms: 'hug', extra: 'heart' },
    sleepy: { eyes: 'M40 59 q3 2.5 6 0 M58 59 q3 2.5 6 0', mouth: 'M49 70 q3 1.6 6 0', cheeks: true, arms: 'down', extra: 'zzz' },
    worried: { eyes: DOT_EYES, dots: true, brows: 'M38 51 q4 -3 8 -3 M66 51 q-4 -3 -8 -3', mouth: 'M45 71 q3.5 -3 7 0 q3.5 3 7 0', cheeks: false, arms: 'down', extra: 'sweat' },
  };

  // Rosy chibi blush with little "///" marks.
  const BLUSH = `<ellipse cx="35" cy="67.5" rx="5.8" ry="3.6" fill="#f7a8a0" opacity=".8"/><ellipse cx="69" cy="67.5" rx="5.8" ry="3.6" fill="#f7a8a0" opacity=".8"/>
  <path d="M32.2 69 l1.6 -3 M35.2 69 l1.6 -3 M66.2 69 l1.6 -3 M69.2 69 l1.6 -3" stroke="#e57f78" stroke-width="1.1" stroke-linecap="round"/>`;

  // Moods with more than one drawing take turns, so the same moment doesn't
  // always look identical. Excited alternates shiny eyes and squeezed "> <" eyes.
  const O_MOUTH = 'M49 70 a3 3.4 0 1 0 6 0 a3 3.4 0 1 0 -6 0';
  const D_MOUTH = 'M47 65.5 h10 q0 5.5 -5 5.5 q-5 0 -5 -5.5z';
  const D_TONGUE = 'M48.8 69.4 q3.2 -2.4 6.4 0 q-3.2 1.8 -6.4 0z';
  const VARIANTS = {
    happy: [
      null,
      { eyesSvg: SHINY_EYES, mouth: 'M46 67 q6 5 12 0', cheeks: 'blush', arms: 'down' },
      { eyes: ARC_EYES, mouth: D_MOUTH, mouthFill: true, tongue: D_TONGUE, cheeks: 'blush', arms: 'down', extra: 'note' },
    ],
    proud: [
      null,
      { eyesSvg: WINK_EYES, mouth: 'M45 67 q7 6 14 0', cheeks: 'blush', arms: 'down', extra: 'sparkles' },
      { eyesSvg: SHINY_EYES, mouth: 'M46 67 q6 5 12 0', cheeks: 'blush', arms: 'up', extra: 'sparkles' },
    ],
    cheer: [
      null,
      { eyesSvg: SQUEEZE_EYES_2, mouth: D_MOUTH, mouthFill: true, tongue: D_TONGUE, cheeks: 'blush', arms: 'pump' },
      { eyesSvg: SHINY_EYES, mouth: D_MOUTH, mouthFill: true, tongue: D_TONGUE, cheeks: true, arms: 'pump', extra: 'sparkles' },
    ],
    wave: [
      null,
      { eyesSvg: WINK_EYES, mouth: D_MOUTH, mouthFill: true, tongue: D_TONGUE, cheeks: 'blush', arms: 'wave' },
      { eyesSvg: SHINY_EYES, mouth: 'M45 67 q7 7 14 0', cheeks: 'blush', arms: 'wave' },
    ],
    curious: [
      null,
      { eyesSvg: SHINY_EYES, mouth: O_MOUTH, cheeks: 'blush', arms: 'down', extra: 'question' },
      { eyes: DOT_EYES, dots: true, mouth: 'M48 69 q4 2 8 -1', cheeks: true, arms: 'down', extra: 'question' },
    ],
    hug: [
      null,
      { eyesSvg: `${SHINY_EYES}${TEARS}`, mouth: 'M47 68 q5 4 10 0', cheeks: 'blush', arms: 'hug', extra: 'heart' },
    ],
    worried: [
      null,
      { eyesSvg: `${SHINY_EYES}${TEARS}`, brows: 'M38 50 q4 -3 8 -2 M66 50 q-4 -3 -8 -2', mouth: 'M46 71 q3 -2.5 6 0 q3 2.5 6 0', cheeks: 'blush', arms: 'down' },
    ],
    sleepy: [
      null,
      { eyes: 'M40 59 q3 2.5 6 0 M58 59 q3 2.5 6 0', mouth: 'M50 69.5 a2.2 2.6 0 1 0 4.4 0 a2.2 2.6 0 1 0 -4.4 0', cheeks: 'blush', arms: 'down', extra: 'zzz' },
    ],
    thinking: [
      null,
      { eyesSvg: LOOK_UP_EYES, mouth: 'M47 70 q5 -2 10 0', cheeks: false, arms: 'down', extra: 'dots' },
    ],
    thrilled: [
      null, // FACES.thrilled
      { eyesSvg: SQUEEZE_EYES, mouth: 'M45 64.5 h14 q0 7 -7 7 q-7 0 -7 -7z', mouthFill: true, tongue: 'M47.3 69.7 q4.7 -3.1 9.4 0 q-4.7 2.2 -9.4 0z', cheeks: 'blush', arms: 'up', extra: 'hearts' },
    ],
  };
  // Which drawing to use: a number pins one; 'random' picks a fresh one (for
  // new moments like pets and toasts, never the same twice in a row);
  // otherwise it holds steady for a little while, so a page that redraws
  // doesn't twitch, and changes over time.
  const lastPick = {};
  function faceFor(mood, variant) {
    const list = VARIANTS[mood];
    if (!list) return FACES[mood] || FACES.happy;
    let i;
    if (Number.isInteger(variant)) i = variant % list.length;
    else if (variant === 'random') {
      i = Math.floor(Math.random() * list.length);
      if (i === lastPick[mood]) i = (i + 1) % list.length;
    } else i = (Math.floor(Date.now() / 45000) + mood.length) % list.length;
    lastPick[mood] = i;
    return list[i] || FACES[mood];
  }

  const ARMS = {
    down: ['M27 72 q-5 3 -7 8', 'M77 72 q5 3 7 8'],
    up: ['M26 64 q-7 -4 -9 -12', 'M78 64 q7 -4 9 -12'],
    pump: ['M27 72 q-5 3 -7 8', 'M78 66 q7 -3 8 -11'],
    wave: ['M27 72 q-5 3 -7 8', 'M78 66 q7 -3 8 -11'],
    hug: ['M27 70 q4 10 17 9', 'M77 70 q-4 10 -17 9'],
  };

  const EXTRAS = {
    question: `<g class="twinkle"><path d="M84 29 q0 -5 5 -5 q5 0 5 4.4 q0 3 -4.2 4.6 v2.6" stroke="var(--lavender, #b9a9e6)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="89.8" cy="41" r="1.6" fill="var(--lavender, #b9a9e6)"/></g>`,
    note: `<g class="float-hearts" fill="var(--lavender, #b9a9e6)" stroke="var(--lavender, #b9a9e6)"><path d="M86.5 38 v-11 l7.5 -2.2 v11" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="84.8" cy="38.4" rx="2.6" ry="2" stroke="none"/><ellipse cx="92.3" cy="36.2" rx="2.6" ry="2" stroke="none"/></g>`,
    // Little floating hearts and a sparkle, for big happy moments.
    hearts: `<g class="float-hearts"><path d="M16 36 c-3 -2 -4.4 -3.7 -4 -5.3 .3 -1.4 2.1 -1.8 4 -.2 1.9 -1.6 3.7 -1.2 4 .2 .4 1.6 -1 3.3 -4 5.3z" fill="#f59aa8"/>
      <path d="M90 30 c-2.2 -1.5 -3.2 -2.7 -2.9 -3.9 .2 -1 1.5 -1.3 2.9 -.2 1.4 -1.1 2.7 -.8 2.9 .2 .3 1.2 -.7 2.4 -2.9 3.9z" fill="#f59aa8"/></g>
      <g class="twinkle"><path d="M88 44 q.8 3 3 3.6 q-2.2 .6 -3 3.6 q-.8 -3 -3 -3.6 q2.2 -.6 3 -3.6z" fill="var(--butter, #f6d78b)"/><path d="M18 46 q.6 2.4 2.4 2.9 q-1.8 .5 -2.4 2.9 q-.6 -2.4 -2.4 -2.9 q1.8 -.5 2.4 -2.9z" fill="var(--lavender, #b9a9e6)"/></g>`,
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
  // opts.variant (0, 1…) pins one drawing of a mood that has several.
  function mascotSvg(mood = 'happy', size = 96, opts = {}) {
    const f = faceFor(mood, opts.variant);
    const kind = CAST[opts.kind] ? opts.kind : 'sprout';
    const cast = CAST[kind];
    const motion = mood === 'thinking' ? 'sprout-think' : mood === 'thrilled' ? 'sprout-bob sprout-hop' : mood === 'sleepy' ? 'sprout-sleep' : 'sprout-bob';
    const arms = opts.noArms ? '' : armPaths(f.arms, cast);
    const hugInFront = f.arms === 'hug';
    return `<svg class="sprout ${motion} mood-${mood} cast-${kind}${opts.cls ? ' ' + opts.cls : ''}" width="${size}" height="${size}" viewBox="0 0 104 104" role="img" aria-label="${opts.label || `${cast.name} ${cast.what}, feeling ${mood}`}">
  <g class="whole">
  ${cast.back}
  ${hugInFront ? '' : arms}
  ${cast.body}
  ${cast.front}
  ${f.cheeks === 'blush' ? BLUSH : f.cheeks ? '<ellipse cx="36" cy="68" rx="5" ry="3.2" fill="#f7b8b0" opacity=".75"/><ellipse cx="68" cy="68" rx="5" ry="3.2" fill="#f7b8b0" opacity=".75"/>' : ''}
  ${f.brows ? `<path d="${f.brows}" stroke="#3b3a36" stroke-width="2" stroke-linecap="round" fill="none"/>` : ''}
  <g class="eyes${f.dots ? ' blink' : ''}">${f.eyesSvg || `<path d="${f.eyes}" stroke="#3b3a36" stroke-width="3" stroke-linecap="round" fill="${f.dots ? '#3b3a36' : 'none'}"/>`}</g>
  <path d="${f.mouth}" stroke="#3b3a36" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="${f.mouthFill ? (f.tongue ? '#8a3b36' : '#e88d86') : 'none'}"/>
  ${f.tongue ? `<path d="${f.tongue}" fill="#f29b93"/>` : ''}
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

  // What they say lives in buddyLines.js.
  const { LINES, SAYINGS } = window.SproutLines || { LINES: { thrilled: [''], happy: [''], cheer: [''] }, SAYINGS: {} };

  // The helper for a resume mode ('ats' | 'claude'), drawn in a mood.
  function helperSvg(mode, mood = 'happy', size = 56, opts = {}) {
    const h = HELPERS[mode] || HELPERS.ats;
    return mascotSvg(mood, size, { ...opts, kind: h.kind });
  }

  // A helper hiding behind a button: just the top of its head and its eyes
  // show over the edge, with two little hands gripping it. On hover it pulls
  // itself up and smiles. Pair with <button class="peek mode-…">; styles in theme.css.
  function peekPal(mode, size = 54) {
    const h = HELPERS[mode] || HELPERS.ats;
    const cast = CAST[h.kind];
    const head = (mood, cls) => mascotSvg(mood, size, { kind: h.kind, noArms: true, cls });
    const hand = (cx) => `<g><ellipse cx="${cx}" cy="8" rx="6.2" ry="4.6" fill="${cast.fill}" stroke="${cast.line}" stroke-width="1.8"/><path d="M${cx - 2.2} 5.6 v3.2 M${cx + 2.2} 5.6 v3.2" stroke="${cast.line}" stroke-width="1.3" stroke-linecap="round"/></g>`;
    return `<span class="peek-pal" aria-hidden="true">${head('curious', 'pal-idle')}${head('happy', 'pal-up')}</span>
      <svg class="peek-hands" aria-hidden="true" width="${size}" height="16" viewBox="0 0 54 16">${hand(13)}${hand(41)}</svg>`;
  }

  function pick(list, seed = Date.now()) {
    return list[Math.abs(seed) % list.length];
  }

  // A "shuffle bag" per key: every line comes up once before any repeats,
  // and never the same line twice in a row.
  const bags = {};
  function draw(key, list) {
    let bag = bags[key];
    if (!bag || !bag.left.length) {
      const left = list.map((_, i) => i).sort(() => Math.random() - 0.5);
      if (bag && left.length > 1 && left[left.length - 1] === bag.last) left.unshift(left.pop());
      bag = bags[key] = { left, last: bag ? bag.last : -1 };
    }
    bag.last = bag.left.pop();
    return list[bag.last];
  }

  // A line for a moment. With a seed the choice is stable (e.g. per job);
  // without one it varies. vars fill {placeholders}, e.g. {n}.
  function say(key, seed, vars) {
    const list = SAYINGS[key] || SAYINGS.pet || [''];
    const line = seed === undefined || seed === null ? draw(key, list) : pick(list, seed);
    return vars ? line.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : line;
  }

  function encouragement(score, seed = Date.now()) {
    return pick(LINES[moodForScore(score)], seed);
  }

  function scoreColor(score) {
    if (score >= 65) return 'var(--band-hi)';
    if (score >= 45) return 'var(--band-mid)';
    return 'var(--band-lo)';
  }

  // A 0-100 score as a vine growing clockwise around a ring of seeds, with a
  // leaf at its tip; the number counts up as it grows. Starts empty: call
  // animateRings() after inserting. `shown` is the number in the middle when
  // it isn't the score itself (e.g. 3 of a weekly goal of 7); `color` is for
  // rings that show progress rather than a fit band.
  function scoreRing(score, size = 104, caption = 'fit', { shown, color: fixed } = {}) {
    const pct = Math.max(0, Math.min(100, score));
    const stroke = Math.round(size * 0.1);
    const r = (size - stroke) / 2 - stroke * 0.35; // room for the leaf
    const c = 2 * Math.PI * r;
    const mid = size / 2;
    const seeds = Math.max(24, Math.round(c / (stroke * 1.5)));
    const color = fixed || scoreColor(pct);
    // Leaf drawn pointing along +x from its stem, placed at the ring's start and
    // turned to lean outward from the vine; the group rotates with the score.
    const L = stroke * 2.1;
    const leaf = pct > 2
      ? `<g class="tip" style="--turn:${(pct * 3.6).toFixed(1)}deg"><g transform="translate(${mid + r} ${mid}) rotate(58)">
    <path d="M0 0C${L * 0.3} ${-L * 0.42} ${L * 0.78} ${-L * 0.42} ${L} 0C${L * 0.78} ${L * 0.42} ${L * 0.3} ${L * 0.42} 0 0Z" fill="${color}" stroke="var(--surface)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M${L * 0.14} 0H${L * 0.74}" stroke="var(--surface)" stroke-width="1" stroke-linecap="round" opacity=".55"/></g></g>`
      : '';
    const shownNum = Math.round(shown ?? score);
    return `<div class="ring" style="width:${size}px;height:${size}px">
  <svg width="${size}" height="${size}" aria-hidden="true"><circle class="track" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${(stroke * 0.42).toFixed(1)}" stroke-dasharray="0 ${(c / seeds).toFixed(3)}"/>
  <circle class="bar" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
    stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - pct / 100)}"/>${leaf}</svg>
  <div class="num"><b data-to="${shownNum}">${shownNum}</b><small>${caption}</small></div></div>`;
  }

  function animateRings(root = document) {
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        root.querySelectorAll('.ring .bar[data-target]').forEach((el) => el.setAttribute('stroke-dashoffset', el.dataset.target));
        root.querySelectorAll('.ring').forEach((el) => el.classList.add('grown'));
        if (still) return;
        // Count the number up alongside the vine (same 0.9s, easing out).
        root.querySelectorAll('.ring .num b[data-to]').forEach((b) => {
          const to = +b.dataset.to;
          delete b.dataset.to;
          if (!(to > 0)) return;
          const t0 = performance.now();
          const step = (t) => {
            const k = Math.min(1, (t - t0) / 900);
            b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
            if (k < 1) requestAnimationFrame(step);
          };
          b.textContent = '0';
          requestAnimationFrame(step);
        });
      })
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
