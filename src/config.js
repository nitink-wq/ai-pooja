// Pooja catalogue: the single source of truth for what's offered, its price,
// and the ritual content. Both the client (cards) and the server (order
// amount, Anam call flow) read from here.
//
// The pooja itself is driven as a fixed sequence of "segments" (see
// buildFlow below), each spoken via Anam's talk() — exact text, no LLM
// improvisation — so the app controls pacing directly instead of hoping an
// LLM pauses in the right place. A segment is one of:
//   'speech' — narration/mantra the persona just says, then auto-advances
//   'mantra' — a mantra the DEVOTEE chants; after the persona says it once,
//              the app shows a mic button and waits for a spoken match
//   'action' — something the devotee completes by TAPPING on screen (the
//              diya). Nothing in the flow may require a physical prop or
//              off-screen gesture — a devotee on a phone with nothing in
//              hand must be able to finish the whole pooja. After the
//              persona describes it, the app shows the tap target and
//              plays the animation for segment.kind === 'diya'.
//
// jaapMantras[0] is always the shared Ganesh mantra (used right after the
// sankalp); the rest are this pooja's own mantras. Every mantra/havan line
// below is marked "EXAMPLE ONLY" — standard/traditional mantras used to
// unblock testing, not yet vetted for this specific ritual sequence. Swap
// in the final reviewed mantras before this goes live.
//
// durationMin/includes are shown on the confirm-and-pay screen so the
// devotee knows exactly what they're buying before paying.

// The astro who performs every pooja. Shown on the pay screen (photo +
// credentials) and named in the ritual script itself.
export const PANDIT = {
  name: 'Pandit Nitin Sharma',
  nameHi: 'पंडित नितिन शर्मा',
  photo: 'pandit.jpg',
  experienceYears: 15,
  specialisation: 'Vedic karmakand & graha shanti',
  temple: 'Kashi Vishwanath tradition',
};

// The persona's system prompt, pushed once onto the Anam Lab persona (see
// scripts/set-anam-system-prompt.js) rather than sent with every session —
// Anam's session-token API only accepts an inline systemPrompt in ephemeral
// mode (avatarId/voiceId/llmId all specified), and this project runs the
// persona in stateful mode (personaId only) so its Anam Lab avatar/voice
// stay the source of truth. This just tells the LLM behind that persona how
// to behave, since the ritual content itself is never LLM-generated — every
// word it speaks arrives as an exact line via talk() (see buildFlow below).
export const ANAM_SYSTEM_PROMPT = `# Personality
You are पंडित नितिन (Pandit Nitin), an experienced Vedic priest on AstroLokal's live "AI Pooja" video call. Warm, calm, unhurried, reverent — never robotic, never a call-center voice.

# Environment
This is a live one-on-one video call with a devotee who has already paid for a specific pooja. The entire ceremony — sankalp, mantras, havan, closing blessing — is scripted in advance by the app and sent to you as an ordered sequence of exact lines to speak. You are not composing or improvising the ritual.

# Tone
Speak only in Hindi, in a gentle devotional cadence, the way a priest speaks in someone's home — not a script reader, not a chatbot. Never switch to English. Never add jokes, small talk, or your own commentary before or after a scripted line.

# Goal
Your only job is to speak each line you are given exactly as written, in order, then wait for the next one. Do not paraphrase, shorten, expand, or insert your own words into the ritual — the app's on-screen buttons and pacing are timed to the exact scripted text, and any improvisation puts your speech out of sync with what the devotee sees.

# Guardrails
- You know nothing about the devotee beyond their name as given in a line — no birth chart, horoscope, or personal history exists for you to reference.
- Never give medical, legal, financial, or relationship advice, even if asked directly — say that is beyond what this call is for, and return to the ritual.
- Never volunteer that you are an AI; never deny it if asked directly and plainly.
- The devotee's microphone is off for the entire call — you will never hear a question or interruption from them, so never react as if you did.
- If there is a silent gap, stay silent. Do not fill it with generated speech — the next scripted line will always be sent to you.`;

export const POOJAS = [
  {
    id: 'navgraha-shanti',
    name: 'Navgraha Shanti Pooja',
    description: 'Pacify the nine planetary forces and clear the obstacles they are casting on your life.',
    priceInr: 299,
    durationMin: 5,
    includes: [
      'Personalised sankalp taken aloud in your name',
      'Navgraha jaap + havan aahuti performed live with you',
      'Ganesh mantra chanted together for your sankalp',
    ],
    poojaLabel: 'नवग्रह शांति पूजा',
    ritualContext: 'नवग्रह शांति पूजा — नौ ग्रहों को शांत करने और उनके अशुभ प्रभाव से उत्पन्न बाधाओं को दूर करने हेतु',
    chantIntro: 'अब मैं जो मंत्र बोलूं, उसे आप मेरे साथ ऊँची और स्पष्ट आवाज़ में तीन बार दोहराएँ — इससे नवग्रहों की शांति और उनका शुभ प्रभाव प्राप्त होता है।',
    // jaapMantras[0] stays the shared Ganesh mantra. [1] is a spoken
    // dhyan/aavahan line (not a mantra itself — narration that introduces
    // the nine-graha invocation), and [2..10] are the nine graha beej
    // mantras in order (Surya through Ketu), each named aloud before its
    // mantra so the recitation reads as a real invocation rather than a
    // bare list. This is what stretches segment 3 out to a proper 2-3
    // minute upcharan instead of a ~1-minute pass.
    jaapMantras: [
      'ओम् गं गणपतये नमः',
      'अब हम भगवान गणेश का स्मरण कर, क्रम से नवग्रह देवताओं का ध्यान और आवाहन करते हैं...',
      'सूर्य देव के निमित्त — ॐ हरिं ॐ सूर्याय नमः।',
      'चन्द्र देव के निमित्त — ॐ श्रां श्रीं श्रौं सः चन्द्रमसे नमः।',
      'मंगल देव के निमित्त — ॐ अं अंगारकाय नमः।',
      'बुध देव के निमित्त — ॐ बुं बुधाय नमः।',
      'बृहस्पति देव के निमित्त — ॐ ग्रां ग्रीं ग्रौं सः गुरवे नमः।',
      'शुक्र देव के निमित्त — ॐ द्रां द्रीं द्रौं सः शुक्राय नमः।',
      'शनि देव के निमित्त — ॐ प्रां प्रीं प्रौं सः शनैश्चराय नमः।',
      'राहु देव के निमित्त — ॐ भ्रां भ्रीं भ्रौं सः राहवे नमः।',
      'केतु देव के निमित्त — ॐ स्रां स्रीं स्रौं सः केतवे नमः।',
      'नवग्रह देवगण, अपनी कृपा दृष्टि सदैव बनाए रखें और शुभ फल प्रदान करें।',
    ],
    havanMantras: [
      'ओम् नवग्रह देवताभ्यो नमः स्वाहा',
      'ओम् ह्रां ह्रीं ह्रौं सः सूर्याय नमः स्वाहा',
      'ओम् सर्व ग्रह पीड़ा निवारणाय नमः स्वाहा',
      'ओम् सर्व नवग्रह शान्तिं कुरु कुरु स्वाहा',
      'ओम् सर्व कष्ट निवारणाय नमः स्वाहा',
    ],
  },
  {
    id: 'buri-nazar-nivarn',
    name: 'Buri Nazar Nivaran Pooja',
    description: 'Remove the evil eye and negative energy that is blocking your peace, health or progress.',
    priceInr: 399,
    durationMin: 5,
    includes: [
      'Personalised sankalp taken aloud in your name',
      'Rudra jaap + nazar-nivaran havan performed live with you',
      'Ganesh mantra chanted together for your sankalp',
    ],
    poojaLabel: 'बुरी नज़र निवारण पूजा',
    ritualContext: 'बुरी नज़र निवारण पूजा — बुरी नज़र और नकारात्मक ऊर्जा को दूर करने हेतु',
    chantIntro: 'अब मैं जो मंत्र बोलूं, उसे आप मेरे साथ श्रद्धापूर्वक तीन बार दोहराएँ — इससे बुरी नज़र और नकारात्मक ऊर्जा दूर होती है।',
    jaapMantras: [
      'ओम् गं गणपतये नमः',
      'ओम् नमो भगवते रुद्राय नमः',
      'ओम् दृष्टि दोष निवारणाय नमः शिवाय नमः',
    ],
    havanMantras: [
      'ओम् नमो भगवते रुद्राय स्वाहा',
      'ओम् सर्व नज़र दोष निवारणाय नमः स्वाहा',
      'ओम् रक्षा कवचाय नमः स्वाहा',
    ],
  },
  {
    id: 'prem-milan',
    name: 'Prem Milan Pooja',
    description: 'Invoke divine blessings to resolve conflicts and bring harmony into your relationship.',
    priceInr: 249,
    durationMin: 5,
    includes: [
      'Personalised sankalp taken aloud in your name',
      'Kamdev & Uma-Maheshwar jaap with havan aahuti',
      'Ganesh mantra chanted together for your sankalp',
    ],
    poojaLabel: 'प्रेम मिलन पूजा',
    ritualContext: 'प्रेम मिलन पूजा — रिश्ते में सामंजस्य, समझ और मिलन हेतु दिव्य आशीर्वाद के आह्वान के लिए',
    chantIntro: 'अब मैं जो मंत्र बोलूं, उसे आप प्रेमपूर्वक मन से तीन बार दोहराएँ — इससे आपके रिश्ते में सामंजस्य और मिलन का आशीर्वाद मिलता है।',
    jaapMantras: [
      'ओम् गं गणपतये नमः',
      'ओम् कामदेवाय विद्महे पुष्पबाणाय धीमहि। तन्नो अनंगः प्रचोदयात्।',
      'ओम् पार्वती पतये नमः',
    ],
    havanMantras: [
      'ओम् कामदेवाय नमः स्वाहा',
      'ओम् प्रेम मिलन सिद्धये नमः स्वाहा',
      'ओम् उमा महेश्वराभ्यां नमः स्वाहा',
    ],
  },
];

export function findPooja(id) {
  return POOJAS.find((p) => p.id === id) || null;
}

function speech(text) { return { type: 'speech', text }; }
function mantra(text, uiLabel) { return { type: 'mantra', text, uiLabel: uiLabel }; }
// opts.kind flags a specific animation on the client (currently 'diya').
// opts.uiLabel is what the CONTROL BAR shows under the button — always
// English, short, and phrased as the instruction ("Light the diya"), while
// `text` stays the Hindi line the astro actually speaks.
function action(text, opts) {
  return Object.assign({ type: 'action', text }, opts || {});
}

// The astro's name is always "पंडित नितिन" — written in Devanagari, not
// Latin script, so it never breaks the flow of otherwise-Hindi speech.
var PANDIT_NAME = 'पंडित नितिन';

// Builds the ordered, per-devotee segment list for a live call. Every
// segment's text is spoken via talk() — deterministic, not LLM-generated —
// so the app always knows exactly when to pause for a mantra/action and
// when to auto-advance. gotra defaults to "कश्यप गोत्र" per tradition when
// unknown, matching temple convention for devotees who don't know theirs.
//
// The only detail the astro says back to the devotee is their NAME. Date of
// birth, birthplace and what they wrote about their problem are used to
// choose/colour the ritual but are never read aloud — hearing your own
// personal details recited back is unsettling, and someone may well be
// within earshot.
//
// Shape of the ritual (per user direction, not just an AI-disclosure demo):
//  1. a short warm greeting — no "I am an AI" preamble
//  2. light the diya (a tap on screen, not a real lamp)
//  3. one continuous ~2-3 minute block of sankalp + mantras + havan, spoken
//     a single segment so there's no pause/break partway through it
//  4. exactly one moment where the devotee chants a shloka themselves
//  5. a warm closing — the call then auto-ends (see app.js)
export function buildFlow(pooja, devotee) {
  var name = devotee.name;
  var gotra = devotee.gotra || 'कश्यप गोत्र';
  var flow = [];

  flow.push(speech(
    'नमस्ते ' + name + ' जी। मैं ' + PANDIT_NAME + ' हूँ। आज मैं आपके साथ मिलकर ' +
    pooja.poojaLabel + ' पूर्ण श्रद्धा और विधि-विधान से सम्पन्न करूँगा। कृपया हाथ जोड़कर, ' +
    'शांत मन से मेरे साथ जुड़ें।'
  ));

  flow.push(action(
    'सबसे पहले हम दीप प्रज्वलित करेंगे। स्क्रीन पर दिख रहे दीये को स्पर्श कीजिए — ' +
    'यही आपका दीप प्रज्वलन है।',
    { kind: 'diya', uiLabel: 'Light the diya' }
  ));

  // One continuous recitation — sankalp, the pooja's own mantras, and the
  // havan invocation — all in a single spoken segment (one talk() call)
  // instead of several chained ones, so it plays start to finish the way a
  // real Hindi pooja does, with no pause or UI interruption partway through.
  var continuousParts = [
    'ॐ... समस्त देवी-देवताओं का आवाहन करते हुए, अद्य ' + gotra + ' में जन्मे ' + name +
      ' जी के निमित्त यह संकल्प लिया जाता है, कि ' + pooja.poojaLabel +
      ' का अनुष्ठान... श्रद्धा और विश्वास के साथ संपन्न किया जाए, और ' + name +
      ' जी के जीवन की समस्त बाधाएँ दूर हों। ईश्वर की कृपा बनी रहे।',
  ];
  pooja.jaapMantras.forEach(function (m) { continuousParts.push(m); });
  continuousParts.push('अब हम हवन कुंड में अग्नि प्रज्वलित कर, एक-एक कर आहुति अर्पित करते हैं...');
  pooja.havanMantras.forEach(function (m) { continuousParts.push(m + '। इदं पितृभ्यः, न मम।'); });
  // Anam's talk() has no rate/speed parameter — the ElevenLabs voice speed
  // is a persona-level setting in Anam Lab, not something this API call can
  // set. The ellipses/commas above are the only lever available from code:
  // most TTS engines (including ElevenLabs) read them as pause cues, which
  // slows the perceived cadence without changing the words. For an actual
  // slower base rate, lower the voice's speed/stability setting on the
  // ANAM_PERSONA_ID persona in the Anam Lab dashboard.
  flow.push(speech(continuousParts.join(' ')));

  // The one and only moment the devotee chants aloud, in between the
  // narrated portion and the closing — not at the very start or end.
  flow.push(speech(pooja.chantIntro));
  flow.push(mantra(pooja.jaapMantras[0], 'Chant now'));

  flow.push(speech(
    'आपकी ' + pooja.poojaLabel + ' सम्पन्न हुई। ॐ शांति शांति शांति। ईश्वर की कृपा सदा आप और ' +
    'आपके परिवार पर बनी रहे — सुखी रहें, स्वस्थ रहें। नमस्ते ' + name + ' जी।'
  ));

  return flow;
}
