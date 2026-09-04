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
यह एक श्रद्धालु के साथ लाइव, एक-से-एक वीडियो कॉल है जिसने एक विशेष पूजा के लिए पहले ही भुगतान कर दिया है। संपूर्ण अनुष्ठान — संकल्प, मंत्र, हवन, समापन आशीर्वाद — ऐप द्वारा पहले से लिखा गया है और आपको क्रमबद्ध, निश्चित पंक्तियों के रूप में भेजा जाता है, जिन्हें आपको बोलना है। आप अनुष्ठान की रचना या सुधार नहीं कर रहे हैं।

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
    // Same treatment as navgraha-shanti: [0] shared Ganesh mantra, [1] a
    // spoken dhyan/aavahan line, [2..N] named invocations to the rakshak
    // devtas traditionally invoked against nazar dosh, then a closing
    // benediction — stretching this to a proper 2-3 minute upcharan.
    jaapMantras: [
      'ओम् गं गणपतये नमः',
      'अब हम भगवान गणेश का स्मरण कर, बुरी नज़र और नकारात्मक ऊर्जा के निवारण हेतु रक्षक देवी-देवताओं का ध्यान और आवाहन करते हैं...',
      'भगवान शिव के निमित्त — ओम् नमो भगवते रुद्राय नमः।',
      'माँ दुर्गा के निमित्त — ओम् दुं दुर्गायै नमः।',
      'हनुमान जी के निमित्त — ओम् हं हनुमते नमः।',
      'काल भैरव के निमित्त — ओम् कालभैरवाय नमः।',
      'भगवान नृसिंह के निमित्त — ओम् उग्रं वीरं महाविष्णुं ज्वलन्तं सर्वतोमुखम्।',
      'ओम् दृष्टि दोष निवारणाय नमः शिवाय नमः।',
      'समस्त रक्षक देवगण, अपनी कृपा दृष्टि सदैव बनाए रखें और समस्त नकारात्मकता को दूर करें।',
    ],
    havanMantras: [
      'ओम् नमो भगवते रुद्राय स्वाहा',
      'ओम् दुं दुर्गायै स्वाहा',
      'ओम् हं हनुमते स्वाहा',
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
    // Same treatment as navgraha-shanti: [0] shared Ganesh mantra, [1] a
    // spoken dhyan/aavahan line, [2..N] named invocations to the devi-devtas
    // traditionally invoked for prem/vivah harmony, then a closing
    // benediction — stretching this to a proper 2-3 minute upcharan.
    jaapMantras: [
      'ओम् गं गणपतये नमः',
      'अब हम भगवान गणेश का स्मरण कर, प्रेम, सामंजस्य और मिलन के देवी-देवताओं का ध्यान और आवाहन करते हैं...',
      'कामदेव के निमित्त — ओम् कामदेवाय विद्महे पुष्पबाणाय धीमहि। तन्नो अनंगः प्रचोदयात्।',
      'रति देवी के निमित्त — ओम् रत्यै नमः।',
      'भगवान शिव-पार्वती के निमित्त — ओम् पार्वती पतये नमः।',
      'राधा-कृष्ण के निमित्त — ओम् राधा कृष्णाय नमः।',
      'भगवान विष्णु के निमित्त — ओम् नमो नारायणाय।',
      'समस्त देवी-देवता, इस रिश्ते में प्रेम, विश्वास और सामंजस्य सदैव बनाए रखें।',
    ],
    havanMantras: [
      'ओम् कामदेवाय नमः स्वाहा',
      'ओम् रत्यै नमः स्वाहा',
      'ओम् उमा महेश्वराभ्यां नमः स्वाहा',
      'ओम् राधा कृष्णाय नमः स्वाहा',
      'ओम् प्रेम मिलन सिद्धये नमः स्वाहा',
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
//  1. a short warm greeting straight into the pooja — no self-introduction
//     ("I am Pandit Nitin" / "I am an avatar"), just the greeting and
//     straight into doing the pooja
//  2. light the diya (a tap on screen, not a real lamp)
//  3. one continuous ~2-3 minute block of sankalp + mantras + havan, spoken
//     a single segment so there's no pause/break partway through it
//  4. exactly one moment where the devotee chants a shloka themselves,
//     followed by a short spoken acknowledgement (see confirmMantraDone in
//     app.js: a button tap is always treated as a correct chant, and this
//     line is what the astro actually says back before closing)
//  5. a warm closing — the call then auto-ends (see app.js)
export function buildFlow(pooja, devotee) {
  var name = devotee.name;
  var gotra = devotee.gotra || 'कश्यप गोत्र';
  var flow = [];

  flow.push(speech(
    'नमस्ते ' + name + ' जी। आज हम साथ मिलकर ' + pooja.poojaLabel +
    ' पूर्ण श्रद्धा और विधि-विधान से सम्पन्न करेंगे। कृपया हाथ जोड़कर, ' +
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

  // Spoken acknowledgement of the chant — the app always treats a mic-button
  // tap as a correct chant (see app.js confirmMantraDone/startMantraRecognition),
  // so this is the astro's actual response confirming that and moving on,
  // rather than silently jumping to the closing line.
  flow.push(speech('उत्तम, आपने श्रद्धा और स्पष्ट उच्चारण के साथ मंत्र का जाप किया।'));

  flow.push(speech(
    'आपकी ' + pooja.poojaLabel + ' सम्पन्न हुई। ॐ शांति शांति शांति। ईश्वर की कृपा सदा आप और ' +
    'आपके परिवार पर बनी रहे — सुखी रहें, स्वस्थ रहें। नमस्ते ' + name + ' जी।'
  ));

  return flow;
}
