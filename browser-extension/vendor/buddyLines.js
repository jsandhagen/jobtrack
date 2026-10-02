// Everything Sprout (and Spike and Root) says, in one place.
//
// How they talk:
// - Warm and specific, not sugary. Cute comes from small, concrete touches
//   (a sip of water, a plant detail), not puns or superlatives.
// - At most one light plant touch per line, and never explain a joke.
// - Exclamation marks are for real moments (an interview, an offer). Most
//   lines end in a full stop.
// - Honest: job hunting is hard, and we never promise outcomes.
// - No platitudes ("every no is closer to a yes") and no ALL CAPS.
// Loaded before mascot.js as a plain script.
(function () {
  // Fit-score reactions, by mood (see moodForScore). They sit next to the
  // match label ("Strong match"), so none of them names a label of its own.
  const LINES = {
    thrilled: [
      'This one fits you really well.',
      'Oh, this is right up your alley.',
      'This reads a lot like your resume. Good sign.',
      'I have a good feeling about this one.',
      'You tick most of their boxes. Worth a look.',
    ],
    happy: [
      'A little tailoring and this one will shine.',
      "There's a lot of overlap with what you do.",
      'This one looks promising.',
      'Solid fit. Want me to tailor a resume?',
      'You’d bring plenty to this one.',
    ],
    cheer: [
      "A bit of a stretch, but you've got real strengths here.",
      "Not every box is ticked. That's normal — plenty of people apply anyway.",
      'Some gaps, some strengths. Leading with the strengths could work.',
      'A stretch role. Your call — I’m happy to help either way.',
    ],
  };

  const SAYINGS = {
    // Poking Sprout.
    pet: [
      "Hi. I'm rooting for you.",
      'Oh! Hello.',
      'Boop.',
      "You're doing better than you think.",
      'One posting at a time.',
      'Quick stretch and a sip of water? I’ll wait.',
      'Showing up is the hard part, and you did.',
      'Job hunting is tiring. Be gentle with yourself.',
      'You bring things no one else does.',
      "Rest counts as progress too.",
      'Have you had a snack today?',
      'Small steps still add up.',
      "You're more than a resume.",
      'Shoulders down, deep breath.',
      "Tough day? Checking one posting is plenty.",
      "I'm glad I get to help with this.",
      'I’ll be here whenever you’re ready.',
      'Just soaking up some sun. And cheering you on.',
    ],
    // Poked a lot in a row.
    petLots: ['Okay, okay, I’m getting dizzy.', 'My leaves are all ruffled now.', 'Hehe. Alright, back to work?'],
    // Spike (ATS mode) and Root (Claude mode) when poked.
    spike: [
      'I read postings the way the scanners do.',
      "No fluff. Just your best matches, up front.",
      'Careful, I’m a little pointy.',
      'Only your own bullets. Better arranged.',
      'Free and fast. That’s my whole deal.',
      'Keywords matched, format kept simple.',
    ],
    root: [
      'I’ll write it in your voice, not mine.',
      'Every line I write gets checked against your records.',
      'I dig through your experience for the good bits.',
      "Give me a minute and I'll tailor it properly.",
      'Nothing made up. Just your work, told well.',
    ],

    // Home page, when nothing in particular is going on.
    idleMorning: ['Good morning. Want to look at a posting or two?', 'Morning. Fresh postings are out.', 'Morning. Coffee first, then postings.'],
    idleAfternoon: ['Good afternoon. Ready when you are.', 'Afternoon. Copy a posting anywhere and I’ll take a look.', 'Hi again. Let’s find something good.'],
    idleEvening: ['Evening. One more look, or call it a day?', "It's fine to log off. The postings will keep.", 'Evening. I’ll keep watch if you want to rest.'],
    idleLate: ["It's late. Sleep does wonders for interviews.", 'Night owl, huh. Don’t forget to rest.', "I'll keep watch. Get some sleep soon."],

    // Sidebar Sprout, now and then, while watching for postings.
    buddy: [
      "I'm keeping an eye out for job postings.",
      'Copy a job description anywhere and I’ll score it.',
      'Tip: your bullet bank is where tailoring starts.',
      'Tip: Spike’s ATS resumes are free to try.',
      'Still here. Still rooting for you.',
      'Take a break if you need one. I’ll keep watch.',
      'Tip: add old cover letters to My library so Root can match your voice.',
      'Tip: a short follow-up a week after applying often helps.',
      "You've been working hard. I noticed.",
      'Tip: numbers in bullets, like “18% faster”, stand out.',
    ],

    // Moments.
    applied: [
      'Sent! Nicely done.',
      'Applied. That took some nerve — well done.',
      'Off it goes. Now you get to not think about it for a bit.',
      'Another one out there. Good work.',
      'Applied. One more door knocked on.',
    ],
    firstApplied: ['Your first application with me. That’s a big step.', 'First one sent. Starting is the hardest part.'],
    milestone: ['{n} applications. That’s real persistence.', '{n} sent. Each of those took effort.', '{n} applications so far. You should be proud of that.'],
    interviewing: [
      'An interview! You earned that.',
      'Interview time! Jot some prep notes in Tracking.',
      'They want to talk to you! Of course they do.',
      "An interview! They already like what they've seen.",
    ],
    offer: ['You got an offer! I’m so proud of you.', 'An offer! All that work paid off.', 'An offer! This is huge. Take a moment to enjoy it.'],
    rejected: [
      'Not this one. I’m sorry — that stings.',
      "That's a tough one. It says nothing about your worth.",
      'Be kind to yourself today. We’ll keep going when you’re ready.',
      'Not the result you wanted. Putting yourself out there still counts.',
    ],
    skipped: ['Not every role is for you. Good call.', 'Skipped. Saving your energy for the right ones.', 'Knowing what you don’t want helps too.'],
    exported: ['Saved. Go get ’em.', 'Saved and ready to send.', 'All saved. It looks good.', 'Done. That’s a resume to be proud of.'],
    followUp: ['A short, friendly follow-up can help.', 'Time for a quick follow-up note?', "It's been a little while. A short follow-up shows you're keen."],
    saved: ['Saved.', 'Got it.', 'All tucked away.'],
    error: ['Oops, something went sideways:', 'Hmm, that didn’t work:'],

    // When a helper finishes.
    atsDone: ['Spike moved your best matches up front.', 'Spike optimized your resume for this posting.', 'Done — Spike picked your strongest bullets for this one.'],
    claudeDone: ['Root wrote an updated version. Have a look — Undo is up top.', 'Root’s draft is ready, checked against your records.', 'Here’s Root’s version. Change anything that doesn’t sound like you.'],
    letterDone: ['Root finished your cover letter.', 'Your cover letter is ready for a read.'],
  };

  window.SproutLines = { LINES, SAYINGS };
})();
