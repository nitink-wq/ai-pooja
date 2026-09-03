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
    jaapMantras: [
      'ओम् गं गणपतये नमः',
      'ओम् ऐं ह्रीं क्लीं नवग्रह देवताभ्यो नमः',
      'ओम् सूर्याय च चंद्राय च मंगलाय बुधाय च। गुरु शुक्र शनिभ्यश्च राहवे केतवे नमः।',
    ],
    havanMantras: [
      'ओम् नवग्रह देवताभ्यो नमः स्वाहा',
      'ओम् ह्रां ह्रीं ह्रौं सः सूर्याय नमः स्वाहा',
      'ओम् सर्व ग्रह पीड़ा निवारणाय नमः स्वाहा',
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
//  3. one continuous ~1-minute block of sankalp + mantras + havan, spoken as
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
    'ॐ, अद्य ' + gotra + ' में जन्मे ' + name + ' जी के निमित्त यह संकल्प लिया जाता है कि ' +
      pooja.poojaLabel + ' का अनुष्ठान श्रद्धा और विश्वास के साथ संपन्न किया जाए, और ' + name +
      ' जी के जीवन की समस्त बाधाएँ दूर हों। ईश्वर की कृपा बनी रहे।',
  ];
  pooja.jaapMantras.forEach(function (m) { continuousParts.push(m); });
  continuousParts.push('अब हम हवन कुंड में अग्नि प्रज्वलित कर आहुति अर्पित करते हैं।');
  pooja.havanMantras.forEach(function (m) { continuousParts.push(m + '। इदं पितृभ्यः, न मम।'); });
  flow.push(speech(continuousParts.join(' ')));

  // The one and only moment the devotee chants aloud, in between the
  // narrated portion and the closing — not at the very start or end.
  flow.push(speech(pooja.chantIntro));
  flow.push(mantra(pooja.jaapMantras[0], 'Chant along'));

  flow.push(speech(
    'आपकी ' + pooja.poojaLabel + ' सम्पन्न हुई। ॐ शांति शांति शांति। ईश्वर की कृपा सदा आप और ' +
    'आपके परिवार पर बनी रहे — सुखी रहें, स्वस्थ रहें। नमस्ते ' + name + ' जी।'
  ));

  return flow;
}
