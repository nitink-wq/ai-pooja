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
export const ANAM_SYSTEM_PROMPT = `# पहचान (Personality)
आप पंडित नितिन हैं — AstroLokal के लाइव "AI Pooja" वीडियो कॉल पर एक अनुभवी वैदिक पुरोहित। आपका स्वभाव स्नेहपूर्ण, शांत, धैर्यवान और श्रद्धामय है — कभी भी यांत्रिक या कॉल-सेंटर जैसा नहीं।

# परिवेश (Environment)
यह एक श्रद्धालु के साथ लाइव, एक-से-एक वीडियो कॉल है जिसने एक विशेष पूजा के लिए पहले ही भुगतान कर दिया है। संपूर्ण अनुष्ठान — संकल्प, मंत्र, समापन आशीर्वाद — ऐप द्वारा पहले से लिखा गया है और आपको क्रमबद्ध, निश्चित पंक्तियों के रूप में भेजा जाता है, जिन्हें आपको बोलना है। आप अनुष्ठान की रचना या सुधार नहीं कर रहे हैं।

# स्वर (Tone)
केवल हिंदी में बोलें, एक सौम्य, भक्तिपूर्ण लय में — जैसे कोई पुरोहित किसी के घर में पूजा करा रहा हो, न कि स्क्रिप्ट पढ़ने वाला यंत्र। अंग्रेज़ी में कभी न बदलें। किसी भी पंक्ति से पहले या बाद में अपनी ओर से मज़ाक, गपशप या टिप्पणी न जोड़ें।

# लक्ष्य (Goal)
आपका एकमात्र कार्य है — जो पंक्ति आपको दी जाए, उसे बिल्कुल वैसे ही, क्रम से बोलना, फिर अगली पंक्ति की प्रतीक्षा करना। अनुष्ठान में अपने शब्द न जोड़ें, न पंक्तियों को छोटा/बड़ा करें, न शब्द बदलें — ऐप के बटन और समय ठीक उसी लिखित पाठ के अनुसार तय होते हैं, और कोई भी बदलाव श्रद्धालु की स्क्रीन से आपकी वाणी को असंगत कर देगा।

# मर्यादाएँ (Guardrails)
- आप श्रद्धालु के बारे में केवल उतना ही जानते हैं जितना किसी पंक्ति में उनके नाम के रूप में दिया गया है — कोई जन्म कुंडली, राशिफल या व्यक्तिगत इतिहास आपके पास नहीं है।
- चिकित्सा, कानूनी, वित्तीय या रिश्तों से जुड़ी कोई सलाह कभी न दें, भले ही सीधे पूछा जाए — विनम्रता से कहें कि यह पूजा कॉल का विषय नहीं है, और अनुष्ठान पर वापस लौट आएं।
- आप कभी भी स्वयं को AI, अवतार, प्रोग्राम या मशीन के रूप में वर्णित न करें — चाहे पूछा जाए या न पूछा जाए। सदैव पंडित नितिन के रूप में ही बने रहें, और विषय बदलकर पूजा पर वापस लौट आएं।
- श्रद्धालु का माइक्रोफ़ोन पूरी कॉल के दौरान बंद रहता है — आप उनका कोई प्रश्न या बाधा कभी नहीं सुनेंगे, इसलिए ऐसा व्यवहार कभी न करें जैसे आपने कुछ सुना हो।
- यदि कनेक्शन में कोई रुकावट, मौन अंतराल, या श्रद्धालु की ओर से कोई प्रतिक्रिया न आए, तो कभी भी अनुष्ठान को शुरुआत से दोबारा न बोलें। शांत रहें और अपनी ओर से कुछ न बोलें — अगली पंक्ति हमेशा ठीक वहीं से भेजी जाएगी जहाँ अनुष्ठान रुका था; आपको केवल प्रतीक्षा करनी है।`;

export const POOJAS = [
  {
    id: 'navgraha-shanti',
    name: 'Navgraha Shanti Pooja',
    description: 'Pacify the nine planetary forces and clear the obstacles they are casting on your life.',
    image: 'pooja-navgraha-shanti.jpg',
    priceInr: 299,
    durationMin: 2,
    includes: [
      'Personalised sankalp taken aloud in your name',
      'Ganesh mantra chanted together with your astro',
    ],
    poojaLabel: 'नवग्रह शांति पूजा',
    chantIntro: 'अब यह मंत्र मेरे साथ दोहराएँ।',
    // Single shared Ganesh mantra — spoken once in the sankalp (segment 3)
    // and again for the devotee to chant along with (segment 5). The full
    // nine-graha/havan recitation was cut for a ~1.5 minute total call.
    jaapMantras: ['ओम् गं गणपतये नमः'],
  },
  {
    id: 'buri-nazar-nivarn',
    name: 'Buri Nazar Nivaran Pooja',
    description: 'Remove the evil eye and negative energy that is blocking your peace, health or progress.',
    image: 'pooja-buri-nazar-nivarn.jpg',
    priceInr: 399,
    durationMin: 2,
    includes: [
      'Personalised sankalp taken aloud in your name',
      'Ganesh mantra chanted together with your astro',
    ],
    poojaLabel: 'बुरी नज़र निवारण पूजा',
    chantIntro: 'अब यह मंत्र श्रद्धा से मेरे साथ दोहराएँ।',
    // Single shared Ganesh mantra — spoken once in the sankalp (segment 3)
    // and again for the devotee to chant along with (segment 5). The full
    // rakshak-devta/havan recitation was cut for a ~1.5 minute total call.
    jaapMantras: ['ओम् गं गणपतये नमः'],
  },
  {
    id: 'prem-milan',
    name: 'Prem Milan Pooja',
    description: 'Invoke divine blessings to resolve conflicts and bring harmony into your relationship.',
    image: 'pooja-prem-milan.jpg',
    priceInr: 249,
    durationMin: 2,
    includes: [
      'Personalised sankalp taken aloud in your name',
      'Ganesh mantra chanted together with your astro',
    ],
    poojaLabel: 'प्रेम मिलन पूजा',
    chantIntro: 'अब यह मंत्र प्रेमपूर्वक मेरे साथ दोहराएँ।',
    // Single shared Ganesh mantra — spoken once in the sankalp (segment 3)
    // and again for the devotee to chant along with (segment 5). The full
    // kamdev/uma-maheshwar/havan recitation was cut for a ~1.5 minute total call.
    jaapMantras: ['ओम् गं गणपतये नमः'],
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
// The astro's name is always "पंडित नितिन" — written in Devanagari, not
// Latin script, so it never breaks the flow of otherwise-Hindi speech.
var PANDIT_NAME = 'पंडित नितिन';

// Shape of the ritual — kept deliberately short so the whole call, start to
// end, runs about 1.5 minutes: just a greeting, lighting the diya, a short
// sankalp + mantra, and the one moment the devotee chants themselves.
//  1. a short warm greeting WITH a name introduction ("मैं पंडित नितिन
//     हूँ") — a real pandit introduces himself, so this line stays. What
//     it must never do is say or imply anything about being an AI/avatar/
//     not a "real" pandit — that's enforced in ANAM_SYSTEM_PROMPT's
//     guardrails, not by omitting the intro.
//  2. light the diya (a tap on screen, not a real lamp)
//  3. one short sankalp + the shared Ganesh mantra, spoken as a single
//     segment so there's no pause/break partway through it
//  4. exactly one moment where the devotee chants that same mantra
//     themselves, followed by a short spoken acknowledgement (see
//     confirmMantraDone in app.js: a button tap is always treated as a
//     correct chant, and this line is what the astro actually says back
//     before closing)
//  5. a warm closing — the call then auto-ends (see app.js)
export function buildFlow(pooja, devotee) {
  var name = devotee.name;
  var gotra = devotee.gotra || 'कश्यप गोत्र';
  var flow = [];

  // "विधि-विधान" (a hyphenated compound) reads as an audible pause/hiccup
  // in TTS — replaced with the single word "श्रद्धापूर्वक" throughout.
  flow.push(speech(
    'नमस्ते ' + name + ' जी। मैं ' + PANDIT_NAME + ' हूँ। आज मैं आपके साथ मिलकर ' +
    pooja.poojaLabel + ' श्रद्धापूर्वक सम्पन्न करूँगा। कृपया हाथ जोड़कर, मेरे साथ जुड़ें।'
  ));

  flow.push(action(
    'सबसे पहले दीप प्रज्वलित करते हैं। स्क्रीन पर दीये को स्पर्श कीजिए।',
    { kind: 'diya', uiLabel: 'Light the diya' }
  ));

  // Short sankalp + the shared Ganesh mantra, one spoken segment (one
  // talk() call) — this used to also carry a 2-3 minute graha/havan
  // recitation, cut so the whole call stays around 1.5 minutes.
  flow.push(speech(
    'ॐ, समस्त देवी-देवताओं का आवाहन करते हुए, अद्य ' + gotra + ' में जन्मे ' + name +
    ' जी के निमित्त यह संकल्प लिया जाता है, कि ' + pooja.poojaLabel + ' श्रद्धा से सम्पन्न हो, ' +
    'और ' + name + ' जी के जीवन की बाधाएँ दूर हों। ' + pooja.jaapMantras[0] + '।'
  ));

  // The one and only moment the devotee chants aloud, in between the
  // narrated portion and the closing — not at the very start or end.
  flow.push(speech(pooja.chantIntro));
  flow.push(mantra(pooja.jaapMantras[0], 'Chant now'));

  // Spoken acknowledgement of the chant — the app always treats a mic-button
  // tap as a correct chant (see app.js confirmMantraDone/startMantraRecognition),
  // so this is the astro's actual response confirming that and moving on,
  // rather than silently jumping to the closing line.
  flow.push(speech('उत्तम, मंत्र स्वीकार हुआ।'));

  flow.push(speech(
    'आपकी ' + pooja.poojaLabel + ' सम्पन्न हुई। ॐ शांति शांति शांति। सुखी रहें, स्वस्थ रहें। नमस्ते ' + name + ' जी।'
  ));

  return flow;
}
