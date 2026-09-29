// Everything Sprout (and Spike and Root) says. Kept in one place so the
// buddy's voice stays consistent: warm, encouraging, a little playful, and
// honest — never promising outcomes. Loaded before mascot.js as a plain script.
(function () {
  // Fit-score reactions, by mood (see moodForScore).
  const LINES = {
    thrilled: [
      'This role has your name all over it!',
      "Oh, you're a fantastic fit for this one!",
      'Wow — this is right in your wheelhouse!',
      'I got goosebumps. Well, leaf-bumps. This one fits you!',
      "They'd be lucky to have you. Seriously.",
      'This one reads like it was written about you.',
    ],
    happy: [
      "You've got a lot going for you here!",
      "Solid match! Let's make it shine.",
      'This one looks really promising.',
      "Good fit! A little tailoring and you're golden.",
      'Lots of overlap with what you do. Nice find!',
      "I like this one for you. Let's give it a go.",
    ],
    cheer: [
      'A stretch role — and stretching is how we grow!',
      "Not a perfect match, but you bring real strengths. Let's highlight them.",
      'Every application is practice. Want to give it a go?',
      "Plenty of people get hired without ticking every box. Your call!",
      "A few gaps, sure. Your story can still land — let's lead with your strengths.",
    ],
  };

  const SAYINGS = {
    // Poking Sprout.
    pet: [
      "Hi! I'm rooting for you. (Get it? Rooting?)",
      'Boop! That tickles.',
      "You're doing better than you think.",
      "One posting at a time. We've got this.",
      'Quick stretch and a sip of water? I’ll wait.',
      'I believe in you — really, truly.',
      "Every 'no' gets you closer to a 'yes'.",
      'Proud of you for showing up today.',
      'Job hunting is hard. You’re handling it.',
      "I'm small, but my faith in you is enormous.",
      'Hehe. Hi again!',
      'You bring something no one else does.',
      "Rest is part of the process too. Don't forget to take some.",
      'Did you eat something today? Snacks are important.',
      'Small steps still move you forward.',
      "Whatever happens, you're more than a resume.",
      "I'm growing a little every day. So are you.",
      'Shoulders down, deep breath. There we go.',
      'Your future team is out there. We’ll find them.',
      'Photosynthesizing some good vibes your way.',
      "Tough day? It's okay to just check one posting.",
      "I'm glad I get to help with this.",
    ],
    // Poked a lot in a row.
    petLots: [
      'Hehe, okay okay — I’m getting dizzy!',
      "You really like poking me, huh? I don't mind.",
      'Wheee! Alright, back to work… maybe.',
      'My leaves are all ruffled now!',
    ],
    // Spike (ATS mode) and Root (Claude mode) when poked.
    spike: [
      'Keywords: sharp. Resume: sharper.',
      'I read postings the way the scanners do. Prickly, but thorough.',
      "No fluff, just your best matches. That's my thing.",
      'Hands off the spines! …Kidding. Mostly.',
      'I only use your own bullets. Your words, better arranged.',
      'Free, fast, and a little pointy.',
    ],
    root: [
      'I dig deep so your resume can stand tall.',
      'Every line I write gets checked against your records. Promise.',
      "I'll write it in your voice, not mine.",
      'Crunchy on the outside, thoughtful on the inside.',
      "Give me a minute and I'll tailor it just right.",
      "Rooting through your experience for the good stuff!",
    ],

    // Home page, when nothing in particular is going on.
    idleMorning: ['Good morning! Fresh postings, fresh start.', "Morning! Let's find something great today.", 'Coffee, water, or tea? Then postings.'],
    idleAfternoon: ["Afternoon check-in: you're doing great.", 'Ready when you are. Let’s go find your next role.', "Let's find you something wonderful today."],
    idleEvening: ['Evening! One more look, or call it a day?', "It's okay to log off. The postings will be here tomorrow.", 'New day, new postings. I’ll keep watch with you.'],
    idleLate: ["It's late! Sleep helps interviews go better, you know.", "Night owl mode. Don't forget to rest.", "I'll keep watch. You get some sleep soon."],

    // Sidebar Sprout, now and then, while watching for postings.
    buddy: [
      "I'm keeping an eye out for job postings.",
      'Copy a job description anywhere and I’ll score it.',
      'Tip: your bullet bank is where the magic happens.',
      'Tip: Spike’s ATS resumes are free. Try one!',
      'Still here, still rooting for you.',
      'Take a breather if you need one. I’ll keep watch.',
      'Tip: add old cover letters to My library so Root can match your voice.',
      'Tip: a quick follow-up note a week after applying goes a long way.',
      "You've been working hard. I noticed.",
      'Tip: numbers in bullets (like “18% faster”) catch a recruiter’s eye.',
    ],

    // Moments.
    applied: [
      'You did it! Another one out into the world.',
      'Applied! That took courage — I’m proud of you.',
      'Sent! Fingers crossed. Well, leaves crossed.',
      'Off it goes! That’s one more door you’ve knocked on.',
      'Applied! Now for the best part: not thinking about it for a bit.',
      'Another application out. Look at you go!',
    ],
    firstApplied: ['Your very first application with me! This is a big moment.', 'First one sent! The hardest step is the first one, and you took it.'],
    milestone: ['{n} applications! That’s real persistence.', '{n} sent! Every one of those took effort. I see you.', 'Wow, {n} applications. You should be proud.'],
    interviewing: [
      'An interview! You’ve earned this.',
      'Interview time! Jot some prep notes in Tracking — you’ve got this.',
      'They want to talk to you! Of course they do.',
      "An interview! Take a breath — they already like what they've seen.",
    ],
    offer: ['AN OFFER!! I’m so, so proud of you.', 'You got an offer! Happy dance time!', 'An offer! All that work paid off. I knew it would.', 'OFFER!! I’m doing cartwheels. Sort of. I don’t have legs.'],
    rejected: [
      'Their loss. I’m proud of you for putting yourself out there.',
      'Not this one — the right role is still out there. I’m with you.',
      'Rejections sting. Take a breather; we’ll try again together.',
      "That's a tough one. It says nothing about your worth.",
      'Oof. Be kind to yourself today. We’ll keep going when you’re ready.',
    ],
    skipped: ['Not every role is for you. Good call.', 'Skipped! Saving your energy for the right ones.', 'Knowing what you don’t want is progress too.'],
    exported: ['Saved! Go get ’em.', 'Looking sharp! Saved.', 'All saved — that resume looks great.', 'Saved and ready to send!', 'Done! That’s a resume to be proud of.'],
    followUp: ['A friendly follow-up can make all the difference.', 'Time for a quick, kind follow-up note?', "It's been a little while — a short follow-up shows you're keen."],
    saved: ['Saved!', 'Got it, saved.', 'All tucked away.'],
    error: ['Oops, something went sideways:', 'Hmm, that didn’t work:', 'Uh oh, a little hiccup:'],

    // While a helper works.
    atsDone: ['Spike optimized your resume for this posting.', 'Spike picked your best-matching bullets.', "Spike's done! Your strongest matches are up front now."],
    claudeDone: ['Root wrote an updated version. Have a look! Undo is up top.', 'Root finished your draft — every line was checked against your records.', 'Fresh from Root! Tweak anything that doesn’t sound like you.'],
    letterDone: ['Root finished your cover letter!', 'Your cover letter is ready. Give it a read!'],
  };

  window.SproutLines = { LINES, SAYINGS };
})();
