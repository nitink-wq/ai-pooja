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
//   'action' — a physical action (light a diya, apply tilak); after the
//              persona describes it, the app shows a button labelled with
//              the action itself (e.g. "Light the Diya", from
//              segment.buttonLabel) and waits for a tap, playing a small
//              animation for segment.kind === 'diya'
//
// jaapMantras[0] is always the shared Ganesh mantra (used right after the
// sankalp); the rest are this pooja's own mantras. Every mantra/havan line
// below is marked "EXAMPLE ONLY" — standard/traditional mantras used to
// unblock testing, not yet vetted for this specific ritual sequence. Swap
// in the final reviewed mantras before this goes live.
export const POOJAS = [
  {
    id: 'navgraha-shanti',
    name: 'Navgraha Shanti Pooja',
    description: 'Pacify the nine planetary forces and clear the obstacles they are casting on your life.',
    priceInr: 299,
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
function mantra(text) { return { type: 'mantra', text }; }
// opts.kind flags a specific animation on the client (currently 'diya');
// opts.buttonLabel is the action button's own label — it should read as an
// instruction to perform the action ("Light the Diya"), not a confirmation
// of having already done it ("I've done this").
function action(text, opts) {
  return Object.assign({ type: 'action', text }, opts || {});
}

// Builds the ordered, per-devotee segment list for a live call. Every
// segment's text is spoken via talk() — deterministic, not LLM-generated —
// so the app always knows exactly when to pause for a mantra/action and
// when to auto-advance. gotra defaults to "कश्यप गोत्र" per tradition when
// unknown, matching temple convention for devotees who don't know theirs.
export function buildFlow(pooja, devotee) {
  var name = devotee.name;
  var flow = [];

  flow.push(speech(
    'नमस्कार ' + name + ' जी। मैं पंडित Nitin हूँ — आस्ट्रोलोकल पर एक डिजिटल पंडित, ' +
    'ज्योतिषी Nitin के मार्गदर्शन में बनाया गया हूँ। मैं एक वास्तविक पंडित नहीं हूँ, ' +
    'किंतु आपकी यह ' + pooja.poojaLabel + ' शास्त्र-सम्मत विधि से, पूर्ण श्रद्धा के साथ ' +
    'संपन्न कराऊँगा। कृपया हाथ जोड़कर, नेत्र बंद कर श्रद्धा से जुड़ें।'
  ));

  flow.push(action(
    'अब मैं दीप प्रज्वलित कर रहा हूँ। कृपया अपना दीया जलाएँ।',
    { kind: 'diya', buttonLabel: '🪔 Light the Diya' }
  ));

  // Tell the devotee what to do with the mantra *before* saying it — without
  // this the persona used to jump straight from the diya to reciting the
  // mantra with no instruction, which read as one confusing monologue.
  flow.push(speech(pooja.chantIntro));
  flow.push(mantra(pooja.jaapMantras[0]));

  flow.push(speech(
    'ॐ, अद्य ' + name + ' गोत्रे, ' + (devotee.gotra || 'कश्यप गोत्र') + ', ' +
    name + ' जी, जन्म-तिथि ' + devotee.dob + ', जन्म स्थान ' + devotee.place + ' — ' +
    'यह संकल्प लेते हैं कि ' + devotee.issue + ' हेतु, ' + pooja.poojaLabel + ' का अनुष्ठान ' +
    'श्रद्धा और विश्वास के साथ संपन्न किया जाए। ईश्वर की कृपा बनी रहे।'
  ));

  if (pooja.jaapMantras.length > 1) {
    flow.push(speech('अब आगे के मंत्र भी उसी प्रकार, एक-एक करके मेरे साथ दोहराएँ।'));
    for (var i = 1; i < pooja.jaapMantras.length; i++) {
      flow.push(mantra(pooja.jaapMantras[i]));
    }
  }

  flow.push(speech('अब मैं हवन कुंड में अग्नि प्रज्वलित कर, आहुति अर्पित करता हूँ।'));
  pooja.havanMantras.forEach(function (m) {
    flow.push(speech(m + '। इदं पितृभ्यः, न मम।'));
  });

  flow.push(speech('संकल्प पूर्ण हुआ। ईश्वर से प्रार्थना है कि वे आपकी हर त्रुटि क्षमा करें और शांति प्रदान करें।'));

  flow.push(action(
    'समापन में मैं भस्म से आपके मस्तक पर तिलक करने का भाव अर्पित करता हूँ — यह ईश्वर का ' +
    'आशीर्वाद है। कृपया अपने माथे पर एक हल्का तिलक लगाएँ।',
    { kind: 'tilak', buttonLabel: '🙏 Apply Tilak' }
  ));

  flow.push(speech('पूजा समाप्त होती है। ॐ शांति शांति शांति।'));

  return flow;
}
