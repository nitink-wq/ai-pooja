// AI Pooja flow state machine. Vanilla JS, no build step — matches the other
// AstroLokal webview surfaces. Devotee details live only in memory (`session`
// below) and are never written to localStorage/sessionStorage or logged.
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var screens = ['landing', 'payment', 'form', 'call', 'complete'];
  var flow = ['landing']; // navigation stack, for the back button

  var POOJAS = [];
  var PANDIT = null; // the astro shown on the pay screen, from /api/poojas
  var MODE = { razorpayMock: true, anamMock: true };
  var session = {
    pooja: null,
    orderId: null,
    orderToken: null,
    payToken: null,
    anamClient: null,
    ritualFlow: [],
    ritualIdx: -1,
    currentSegment: null,
    flowStarted: false,
    callStartedAt: 0,
    endScheduled: false,
  };

  // The persona (LLM, via a stateful Anam personaId) is instructed in
  // src/config.js to speak fixed cue sentences at each interaction point,
  // but an LLM restates instructions in its own words rather than reciting
  // them character-for-character — so detection here is keyword/fuzzy, not
  // an exact string match. See detectCue() below.

  function showScreen(name) {
    screens.forEach(function (s) {
      var scr = el('screen-' + s);
      scr.classList.toggle('hidden', s !== name);
      // Retrigger the crossfade-in animation each time a screen becomes
      // active (removing+re-adding forces the browser to replay it), so
      // navigating feels like moving through one continuous app instead of
      // screens just snapping into place.
      if (s === name) {
        scr.classList.remove('screenIn');
        void scr.offsetWidth;
        scr.classList.add('screenIn');
      }
    });
    el('navSub').textContent = 'AI Pooja';
    // The call owns the entire screen — no app header, no back button. A
    // ritual you can accidentally navigate away from mid-mantra isn't one.
    document.querySelector('.nav').classList.toggle('hidden', name === 'call');
  }

  function goTo(name) {
    flow.push(name);
    showScreen(name);
  }

  function goBack() {
    if (flow.length > 1) {
      flow.pop();
      showScreen(flow[flow.length - 1]);
      return;
    }
    // Entry point: this page was opened from a banner elsewhere in the app.
    // history.back() returns the user there.
    history.back();
  }

  // ---- 1. landing: load + render pooja catalogue ---------------------------
  function renderPoojas() {
    var list = el('poojaList');
    list.innerHTML = '';
    POOJAS.forEach(function (p, idx) {
      var card = document.createElement('button');
      card.className = 'poojaCard';
      card.style.setProperty('--i', idx);
      card.type = 'button';
      var iconHtml = p.image
        ? '<img class="pIcon pIconPhoto" src="' + escapeHtml(p.image) + '" alt="" width="64" height="64">'
        : '<div class="pIcon">' + FLAME_ICON + '</div>';
      card.innerHTML =
        '<div class="pHead">' +
          iconHtml +
          '<div class="pHeadText">' +
            '<h3>' + escapeHtml(p.name) + '</h3>' +
            '<p>' + escapeHtml(p.description) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="priceRow">' +
          '<span class="price">₹' + p.priceInr + '</span>' +
          '<span class="selectPill">Select →</span>' +
        '</div>';
      card.addEventListener('click', function () { selectPooja(p); });
      list.appendChild(card);
    });
  }

  function selectPooja(p) {
    session.pooja = p;
    renderOrderSummary(p);
    renderPandit();
    el('mockNotice').textContent = MODE.razorpayMock
      ? 'Test mode: no real payment will be charged.'
      : '';
    el('payError').classList.add('hidden');
    el('retryPayBtn').classList.add('hidden');
    el('payBtn').classList.remove('hidden');
    el('payBtn').disabled = false;
    el('payBtn').textContent = PAY_CTA_LABEL;
    goTo('payment');
  }

  // What the devotee is buying: the pooja, how long it runs, and what the
  // astro will actually do on the call — shown before they pay, not after.
  function renderOrderSummary(p) {
    el('orderRow').innerHTML =
      '<div class="oMain">' +
        '<span class="oName">' + escapeHtml(p.name) + '</span>' +
        '<span class="oMeta">Live 1-on-1 · about ' + (p.durationMin || 12) + ' min</span>' +
      '</div>' +
      '<span class="oPrice">₹' + p.priceInr + '</span>';
    el('poojaBlurb').textContent = p.description || '';
    el('includeList').innerHTML = (p.includes || [])
      .map(function (line) { return '<li>' + escapeHtml(line) + '</li>'; })
      .join('');
    el('payDockAmt').textContent = '₹' + p.priceInr;
  }

  function renderPandit() {
    if (!PANDIT) return;
    el('astroPhoto').src = PANDIT.photo || 'pandit.jpg';
    el('astroPhoto').alt = PANDIT.name || '';
    el('astroName').textContent = PANDIT.name || '';
    el('astroSub').textContent = PANDIT.specialisation || '';
    el('astroTags').innerHTML =
      '<span class="astroTag">' + (PANDIT.experienceYears || 15) + ' yrs experience</span>' +
      (PANDIT.temple ? '<span class="astroTag">' + escapeHtml(PANDIT.temple) + '</span>' : '');
  }

  // ---- 2. payment ------------------------------------------------------------
  var razorpayScriptLoaded = false;
  function loadRazorpayScript() {
    return new Promise(function (resolve, reject) {
      if (razorpayScriptLoaded) return resolve();
      var s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = function () { razorpayScriptLoaded = true; resolve(); };
      s.onerror = function () { reject(new Error('Could not load Razorpay')); };
      document.head.appendChild(s);
    });
  }

  function showPayError(msg) {
    el('payError').textContent = msg;
    el('payError').classList.remove('hidden');
    el('payBtn').classList.add('hidden');
    el('retryPayBtn').classList.remove('hidden');
  }

  function startPayment() {
    el('payBtn').disabled = true;
    el('payBtn').textContent = 'Starting payment…';
    fetch('/api/payment/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ poojaId: session.pooja.id }),
    })
      .then(function (r) { if (!r.ok) throw new Error('order'); return r.json(); })
      .then(function (order) {
        session.orderId = order.orderId;
        session.orderToken = order.orderToken;
        if (order.mock) return mockPayment(order);
        return realPayment(order);
      })
      .catch(function () {
        showPayError('Could not start payment. Please try again.');
      });
  }

  // Simulates a successful test payment when Razorpay keys are not yet
  // configured, so the rest of the flow can be built/clicked before they are.
  function mockPayment(order) {
    el('payBtn').textContent = 'Processing (test)…';
    setTimeout(function () {
      verifyPayment(order.orderId, 'pay_mock_' + Date.now(), 'mock');
    }, 900);
  }

  // Checkout.js opens netbanking — and Razorpay's test-mode bank page with
  // its Success / Failure buttons — in a popup window from inside its iframe.
  // Desktop browsers allow that; mobile browsers and WebViews block it or have
  // nowhere to host it, so the bank page never appears and the payment just
  // hangs. Razorpay's answer for mobile is redirect mode: the top-level page
  // navigates to the bank, and on completion Razorpay POSTs the result to our
  // callback_url, which drops the browser back into the app with a payToken
  // (see resumeFromPaymentRedirect). Desktop keeps the in-page modal, which
  // works and stays on the page.
  function shouldUseRedirectCheckout() {
    // ?payRedirect=1 forces the mobile path on a desktop browser, so the full
    // bank round trip can be QA'd without a phone. ?payRedirect=0 forces the
    // modal, to compare.
    var forced = new URLSearchParams(location.search).get('payRedirect');
    if (forced === '1') return true;
    if (forced === '0') return false;
    var ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile|; wv\)/i.test(ua)) return true;
    // Any touch device, or a phone-sized viewport — catches "Request desktop
    // site", where the UA lies but the popup problem is the same.
    if ((navigator.maxTouchPoints || 0) > 0) return true;
    return window.innerWidth < 900;
  }

  function realPayment(order) {
    loadRazorpayScript()
      .then(function () {
        var options = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: 'AstroLokal',
          description: session.pooja.name,
          theme: { color: '#F45722' },
          handler: function (response) {
            verifyPayment(response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
          },
          modal: {
            ondismiss: function () {
              el('payBtn').disabled = false;
              el('payBtn').textContent = PAY_CTA_LABEL;
            },
          },
        };
        if (shouldUseRedirectCheckout()) {
          options.redirect = true;
          // Absolute, as Razorpay requires. The order token carries the pooja
          // across the round trip; the server rejects a callback without it.
          options.callback_url = location.origin + '/api/payment/callback?ot=' +
            encodeURIComponent(session.orderToken);
        }
        var rz = new window.Razorpay(options);
        rz.on('payment.failed', function () {
          showPayError('Payment failed. You have not been charged — please try again.');
        });
        rz.open();
      })
      .catch(function () {
        showPayError('Could not open payment. Please try again.');
      });
  }

  function verifyPayment(orderId, paymentId, signature) {
    fetch('/api/payment/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderToken: session.orderToken, orderId: orderId, paymentId: paymentId, signature: signature }),
    })
      .then(function (r) { if (!r.ok) throw new Error('verify'); return r.json(); })
      .then(function (data) {
        session.payToken = data.payToken;
        resetForm();
        goTo('form');
      })
      .catch(function () {
        showPayError('We could not confirm your payment. Please try again.');
      });
  }

  // ---- 3. devotee details form ------------------------------------------------
  function resetForm() {
    var f = el('detailsForm');
    f.reset();
    el('issueCount').textContent = '0 / 300';
  }

  el('detailsForm').addEventListener('input', function (e) {
    if (e.target.name === 'issue') {
      el('issueCount').textContent = e.target.value.length + ' / 300';
    }
  });

  el('detailsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (!f.reportValidity()) return;
    var fd = new FormData(f);
    var payload = {
      poojaId: session.pooja.id,
      payToken: session.payToken,
      name: String(fd.get('name') || '').trim(),
      dob: String(fd.get('dob') || '').trim(),
      place: String(fd.get('place') || '').trim(),
      issue: String(fd.get('issue') || '').trim(),
    };
    el('startCallBtn').disabled = true;
    el('startCallBtn').textContent = 'Connecting…';

    fetch('/api/anam/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('session');
        return r.json();
      })
      .then(function (data) {
        el('startCallBtn').disabled = false;
        el('startCallBtn').textContent = 'Begin live pooja';
        goTo('call');
        startCall(data);
      })
      .catch(function () {
        el('startCallBtn').disabled = false;
        el('startCallBtn').textContent = 'Begin live pooja';
        alert('Could not connect to your astro. Please try again.');
      });
  });

  // ---- 4. live avatar call ------------------------------------------------------
  function setCallStatus(text) {
    var overlay = el('callOverlay');
    if (!text) { overlay.classList.add('hidden'); return; }
    overlay.classList.remove('hidden');
    el('callStatus').textContent = text;
  }

  function startCall(data) {
    // name the astro on the call itself, not just on the pay screen
    if (PANDIT) {
      el('callAstroPhoto').src = PANDIT.photo || 'pandit.jpg';
      el('callAstroName').textContent = PANDIT.name || '';
    }
    hideActionBar();
    session.flowStarted = false;
    session.callStartedAt = Date.now();
    setCallStatus('Connecting to your astro…');
    if (data.mock) return mockCall(data.flow);
    realCall(data.sessionToken, data.flow);
  }

  // The video never appears the instant a connection exists — the devotee
  // should always see at least a brief, deliberate "connecting" beat, then a
  // short "connected" transition, rather than the astro's face just cutting
  // in. CALL_LOADER_MIN_MS is a floor: on a fast connection we still wait
  // out the rest of it; on a slow one we've already waited longer, so there's
  // nothing extra to add.
  var CALL_LOADER_MIN_MS = 3000;
  function revealCall(onReady) {
    var remaining = CALL_LOADER_MIN_MS - (Date.now() - session.callStartedAt);
    setTimeout(function () {
      el('callSpinner').classList.add('hidden');
      el('connectedTick').classList.remove('hidden');
      el('callStatus').textContent = 'Pooja starting';
      setTimeout(function () {
        el('callOverlay').classList.add('fadingOut');
        setTimeout(function () {
          el('callOverlay').classList.add('hidden');
          el('callOverlay').classList.remove('fadingOut');
          el('callSpinner').classList.remove('hidden');
          el('connectedTick').classList.add('hidden');
          onReady();
        }, 400);
      }, 500);
    }, Math.max(0, remaining));
  }

  // Simulated call screen used while ANAM_API_KEY is not yet configured.
  function mockCall(ritualFlow) {
    el('mockAvatar').classList.remove('hidden');
    // Drive the same segment player against a stub client so the mantra/
    // action cards can still be clicked through without a real Anam call.
    var stubClient = {
      talk: function () {},
      stopStreaming: function () {},
    };
    session.anamClient = stubClient;
    revealCall(function () { playFlow(ritualFlow); });
  }

  function realCall(sessionToken, ritualFlow) {
    import('https://esm.sh/@anam-ai/js-sdk@latest')
      .then(function (mod) {
        // disableInputAudio: the devotee never speaks to the persona over
        // their mic — all input (mantra-jaap check, action confirm) comes
        // from our own buttons instead.
        var client = mod.createClient(sessionToken, { disableInputAudio: true });
        session.anamClient = client;
        // WebRTC connections re-fire CONNECTION_ESTABLISHED on reconnects
        // (an ICE restart after a brief network hiccup, for instance) — and
        // an idle stretch waiting on the devotee's mic is exactly when
        // that's most likely to happen unnoticed. Without this guard, every
        // reconnect called playFlow() again, which resets ritualIdx to -1
        // and restarts the whole pooja from the greeting — this is what was
        // behind the "restarts from the start" bug. The ritual may only
        // ever be started once per call.
        client.addListener(mod.AnamEvent.CONNECTION_ESTABLISHED, function () {
          if (session.flowStarted) return;
          session.flowStarted = true;
          revealCall(function () { playFlow(ritualFlow); });
        });
        client.addListener(mod.AnamEvent.CONNECTION_CLOSED, function () {
          endCall();
        });
        return client.streamToVideoElement('personaVideo');
      })
      .catch(function () {
        setCallStatus('Connection lost. Ending your pooja.');
        setTimeout(endCall, 1500);
      });
  }

  // ---- ritual flow player: fixed segments, deterministic pacing ----------
  // The whole pooja (mantras, action prompts, sankalp wording) is prebuilt
  // server-side (src/config.js buildFlow) and spoken verbatim via talk() —
  // no LLM improvisation — so the app always knows exactly which segment is
  // playing and pauses for a mantra/action button at exactly the right spot.
  function playFlow(ritualFlow) {
    session.ritualFlow = ritualFlow || [];
    session.ritualIdx = -1;
    advanceFlow();
  }

  function advanceFlow() {
    session.ritualIdx += 1;
    var seg = session.ritualFlow[session.ritualIdx];
    if (!seg) {
      hideActionBar();
      if (!session.endScheduled) {
        session.endScheduled = true;
        setTimeout(endCall, 1200);
      }
      return;
    }
    session.currentSegment = seg;
    speakSegmentText(seg.text, function () { onSegmentFullySpoken(seg); });
  }

  // Every segment used to go out as ONE talk() call for its whole text, and
  // we used to advance on Anam's MESSAGE_HISTORY_UPDATED event. That event
  // fires as soon as a sentence is logged to history — which turned out to
  // be well BEFORE its audio actually finished playing — so we were sending
  // the next sentence's talk() while the previous one was still mid-word,
  // clipping its tail. That's what was cutting clauses like "...सम्पन्न
  // करूँगा" off in testing.
  //
  // Fix: split on '।' (the Hindi sentence-ending danda) and pace by an
  // estimated speaking duration for each sentence instead of trusting that
  // event. We only ever call talk() again once our own timer says the
  // previous sentence should be fully spoken.
  var SENTENCE_SPLIT = /(?<=।)\s*/;
  function splitIntoSentences(text) {
    var parts = String(text || '').split(SENTENCE_SPLIT).map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length ? parts : [text];
  }

  // ~11 Hindi characters/second matches a normal spoken pace. The buffer
  // scales WITH length rather than being a fixed add-on: a flat buffer was
  // either too small for long sentences (a single mis-estimated 80+ char
  // sentence can clip several words off the end — this is exactly what
  // dropped "और विधि-विधान से सम्पन्न करूँगा" off the greeting when the
  // rate was pushed to 14 chars/sec with only a 150ms buffer) or, sized
  // large enough to be safe for those, left needless dead air after every
  // short mantra line. Scaling the buffer with length gives short lines a
  // small, snappy buffer and long ones a proportionally larger safety
  // margin, where estimation error is more likely to compound.
  function estimateSpeechMs(text) {
    var len = String(text || '').length;
    var buffer = Math.max(250, len * 20);
    return Math.max(700, Math.round((len / 11) * 1000) + buffer);
  }

  function speakSegmentText(text, onAllDone) {
    var queue = splitIntoSentences(text);
    function speakNext() {
      if (!queue.length) { onAllDone(); return; }
      var line = queue.shift();
      if (session.anamClient && typeof session.anamClient.talk === 'function') {
        session.anamClient.talk(line);
      }
      setTimeout(speakNext, estimateSpeechMs(line));
    }
    speakNext();
  }

  // Called once every sentence in the current segment has been spoken.
  function onSegmentFullySpoken(seg) {
    if (session.currentSegment !== seg) return; // superseded by a later segment
    if (seg.type === 'speech') {
      advanceFlow();
    } else if (seg.type === 'mantra') {
      showMantraCard(seg);
    } else if (seg.type === 'action') {
      showActionCard(seg);
    }
  }

  // ---- call UI: one control row, one caption strip -------------------------
  // The dock only ever holds circular controls on a single row next to End
  // Pooja. What each control is *for* is explained in the caption strip over
  // the video (English label + the mantra itself), so the buttons stay small
  // and the astro's video is never covered by a card.
  function show(id, on) { el(id).classList.toggle('hidden', !on); }

  function setCaption(label, text) {
    if (!label && !text) { show('callCaption', false); return; }
    el('captionLabel').textContent = label || '';
    el('captionText').textContent = text || '';
    show('captionText', !!text);
    show('callCaption', true);
    // replay the entrance each time the prompt changes
    var c = el('callCaption');
    c.classList.remove('captionIn');
    void c.offsetWidth;
    c.classList.add('captionIn');
  }

  function setMainControl(kind, label) {
    show('diyaTapBtn', kind === 'diya');
    show('mantraBtn', kind === 'mic');
    el('mainLabel').textContent = label || '';
    show('mainLabel', !!kind && !!label);
  }

  function setSkipVisible(on) {
    show('skipMantraBtn', on);
    show('skipLabel', on);
  }

  function setDockStatus(msg) { el('dockStatus').textContent = msg || ''; }

  function hideActionBar() {
    setMainControl(null, '');
    setSkipVisible(false);
    setCaption('', '');
    setDockStatus('');
    show('diyaRise', false);
  }

  // Every 'action' segment is completed by tapping on screen — the ritual
  // never asks the devotee for a physical prop or off-screen gesture, so the
  // diya tap target is the only action UI there is. Its label is always
  // English even though the astro speaks Hindi.
  function showActionCard(seg) {
    show('diyaRise', false);
    setSkipVisible(false);
    // no caption here — the button's own label already says it, and a
    // duplicate line over the video is just noise
    setCaption('', '');
    setDockStatus('Tap to light the diya');
    setMainControl('diya', seg.uiLabel || 'Light the diya');
    el('diyaTapBtn').disabled = false;
  }

  function showMantraCard(seg) {
    show('diyaRise', false);
    setCaption('Repeat this mantra', seg.text);
    setMainControl('mic', seg.uiLabel || 'Chant now');
    setSkipVisible(false);
    setDockStatus('Press the mic and chant along with your astro');
    el('mantraBtn').disabled = false;
    el('mantraBtn').classList.remove('listening');
  }

  // A ring of diyas (bigger than the tap button's own icon) rises slowly
  // over the video when tapped, then the flow advances. Built once here
  // (rather than hardcoded in index.html) so the count/size is easy to tune.
  var DIYA_RISE_COUNT = 14;
  var DIYA_RISE_MS = 3600;
  // Each diya gets its own lane, delay, size and drift so the group rises
  // like floating lamps rather than a single diagonal conveyor belt. The
  // values are pseudo-random but seeded per index, so the spread is varied
  // yet identical every run (easy to eyeball and tune).
  function buildDiyaRise() {
    var wrap = el('diyaRise');
    var html = '';
    for (var i = 0; i < DIYA_RISE_COUNT; i++) {
      var r = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
      var r2 = Math.abs(Math.sin((i + 1) * 78.233) * 12345.6789) % 1;
      // lanes spread edge to edge, then nudged by r so they don't line up
      var lane = (i / DIYA_RISE_COUNT) * 92 + r * 6;
      var delay = (r2 * 1000).toFixed(0);
      var scale = (0.62 + r * 0.55).toFixed(2);
      var drift = (r2 * 44 - 22).toFixed(0);
      var dur = (2600 + r2 * 1100).toFixed(0);
      html +=
        '<div class="diyaRiseItem" style="' +
          'left:' + lane.toFixed(1) + '%;' +
          '--s:' + scale + ';--drift:' + drift + 'px;' +
          'animation-delay:' + delay + 'ms;animation-duration:' + dur + 'ms">' +
          '<svg viewBox="0 0 56 72" fill="none">' +
            '<ellipse cx="28" cy="60" rx="26" ry="9" fill="#C57C22"/>' +
            '<ellipse cx="28" cy="57" rx="20" ry="6" fill="#FFBF6E"/>' +
            '<path class="flame" d="M28 12c6 8 9 14 9 20a9 9 0 11-18 0c0-6 3-12 9-20z" fill="url(#flameGradShared)"/>' +
          '</svg>' +
        '</div>';
    }
    wrap.innerHTML = html;
  }

  // Tapping the diya makes the control itself vanish (it has served its
  // purpose) and hands the screen over to the rising-diya animation.
  function playDiyaRise() {
    el('diyaTapBtn').disabled = true;
    setMainControl(null, '');
    setCaption('', '');
    setDockStatus('Diya lit — pooja begins');
    el('diyaRise').classList.remove('hidden');
    setTimeout(function () {
      el('diyaRise').classList.add('hidden');
      hideActionBar();
      advanceFlow();
    }, DIYA_RISE_MS);
  }

  function confirmMantraDone() {
    hideActionBar();
    advanceFlow();
  }

  // The devotee's chant is never actually checked — we trust that tapping
  // the mic means they chanted along. A short "listening" delay before
  // accepting keeps the beat of the astro having heard them, rather than
  // confirming the instant they tap.
  var MANTRA_LISTEN_MS = 1000;
  function startMantraRecognition() {
    el('mantraBtn').disabled = true;
    el('mantraBtn').classList.add('listening');
    setDockStatus('Listening…');
    setTimeout(function () {
      setDockStatus('Mantra received ✓');
      confirmMantraDone();
    }, MANTRA_LISTEN_MS);
  }

  function endCall() {
    if (session.anamClient) {
      try { session.anamClient.stopStreaming(); } catch (e) { /* already closed */ }
      session.anamClient = null;
    }
    el('mockAvatar').classList.add('hidden');
    hideActionBar();
    session.pooja = null;
    session.orderId = null;
    session.payToken = null;
    session.ritualFlow = [];
    session.ritualIdx = -1;
    session.currentSegment = null;
    session.flowStarted = false;
    session.endScheduled = false;
    // Reset the stack rather than pushing: the call can't be resumed, so
    // the back button from the completion screen should land on landing,
    // not on a dead call screen.
    flow = ['landing'];
    goTo('complete');
  }

  el('endCallBtn').addEventListener('click', endCall);
  el('diyaTapBtn').addEventListener('click', playDiyaRise);
  el('mantraBtn').addEventListener('click', startMantraRecognition);
  el('skipMantraBtn').addEventListener('click', confirmMantraDone);

  // ---- 5. completion -------------------------------------------------------------
  el('homeBtn').addEventListener('click', function () {
    flow = ['landing'];
    showScreen('landing');
  });

  // ---- shared -----------------------------------------------------------------
  el('backBtn').addEventListener('click', goBack);
  el('payBtn').addEventListener('click', startPayment);

  // Redirect-mode checkout navigates the whole page away. Coming back — the
  // device back button from the bank page, or a swipe-back gesture — restores
  // this page from the browser's back/forward cache with its JS state frozen
  // exactly as it was, so the pay button stays disabled on "Starting
  // payment…" and the devotee is stuck on a dead screen. Re-enable it.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (!el('payBtn').disabled) return;
    el('payBtn').disabled = false;
    el('payBtn').textContent = PAY_CTA_LABEL;
  });
  el('retryPayBtn').addEventListener('click', function () {
    el('retryPayBtn').classList.add('hidden');
    el('payError').classList.add('hidden');
    el('payBtn').classList.remove('hidden');
    el('payBtn').disabled = false;
    el('payBtn').textContent = PAY_CTA_LABEL;
  });

  var PAY_CTA_LABEL = 'Complete payment';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var FLAME_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-3 4-3 8a3 3 0 006 0c0-1-.5-2-1-2.5.8.2 3 1.8 3 5.5a5 5 0 01-10 0c0-5 3-7 5-11z" fill="#fff"/></svg>';

  // After a redirect-mode payment the browser lands back on / with the result
  // in the query string (set by /api/payment/callback), and nothing of the
  // original page's state. Rebuild just enough to continue: the selected
  // pooja from the catalogue, the payToken, and the payment -> form screen
  // stack so the back button still makes sense. The query is then scrubbed so
  // a reload or a shared link cannot replay it.
  function resumeFromPaymentRedirect() {
    var q = new URLSearchParams(location.search);
    if (!q.has('paid') && !q.has('payFailed')) return false;
    history.replaceState(null, '', location.pathname);

    var pooja = POOJAS.filter(function (p) { return p.id === q.get('pooja'); })[0];
    if (q.has('paid') && pooja) {
      selectPooja(pooja);
      session.payToken = q.get('paid');
      resetForm();
      goTo('form');
      return true;
    }
    if (pooja) {
      selectPooja(pooja);
      showPayError(q.get('payFailed') === 'expired'
        ? 'This payment session expired. Please start again.'
        : 'Payment failed. You have not been charged — please try again.');
      return true;
    }
    return false;
  }

  // ---- boot -----------------------------------------------------------------
  buildDiyaRise();
  Promise.all([
    fetch('/api/poojas').then(function (r) { return r.json(); }),
    fetch('/api/mode').then(function (r) { return r.json(); }).catch(function () { return MODE; }),
  ]).then(function (results) {
    POOJAS = results[0].poojas || [];
    PANDIT = results[0].pandit || null;
    MODE = results[1];
    renderPoojas();
    resumeFromPaymentRedirect();
  }).catch(function () {
    el('poojaList').innerHTML = '<p class="errText">Could not load poojas. Please refresh.</p>';
  });
})();
