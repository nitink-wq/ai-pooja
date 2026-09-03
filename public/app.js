// AI Pooja flow state machine. Vanilla JS, no build step — matches the other
// AstroLokal webview surfaces. Devotee details live only in memory (`session`
// below) and are never written to localStorage/sessionStorage or logged.
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var screens = ['landing', 'payment', 'form', 'call', 'complete'];
  var flow = ['landing']; // navigation stack, for the back button

  var POOJAS = [];
  var MODE = { razorpayMock: true, anamMock: true };
  var session = {
    pooja: null,
    orderId: null,
    payToken: null,
    anamClient: null,
    processedMsgCount: 0,
    ritualFlow: [],
    ritualIdx: -1,
    currentSegment: null,
    awaitingSegmentSpeech: false,
    currentMantraTarget: '',
    mantraAttempts: 0,
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
    el('navSub').textContent = name === 'call' ? '' : 'AI Pooja';
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
      card.innerHTML =
        '<div class="pIcon">' + FLAME_ICON + '</div>' +
        '<h3>' + escapeHtml(p.name) + '</h3>' +
        '<p>' + escapeHtml(p.description) + '</p>' +
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
    el('orderRow').innerHTML =
      '<span class="oName">' + escapeHtml(p.name) + '</span>' +
      '<span class="oPrice">₹' + p.priceInr + '</span>';
    el('mockNotice').textContent = MODE.razorpayMock
      ? 'Test mode: no real payment will be charged.'
      : '';
    el('payError').classList.add('hidden');
    el('retryPayBtn').classList.add('hidden');
    el('payBtn').classList.remove('hidden');
    el('payBtn').disabled = false;
    el('payBtn').textContent = 'Pay now';
    goTo('payment');
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

  function realPayment(order) {
    loadRazorpayScript()
      .then(function () {
        var rz = new window.Razorpay({
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
              el('payBtn').textContent = 'Pay now';
            },
          },
        });
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
      body: JSON.stringify({ poojaId: session.pooja.id, orderId: orderId, paymentId: paymentId, signature: signature }),
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
        alert('Could not connect to your purohit. Please try again.');
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
    setCallStatus('Connecting you to your purohit…');
    if (data.mock) return mockCall(data.flow);
    realCall(data.sessionToken, data.flow);
  }

  // Simulated call screen used while ANAM_API_KEY is not yet configured.
  function mockCall(ritualFlow) {
    el('mockAvatar').classList.remove('hidden');
    setTimeout(function () {
      setCallStatus('');
      // Drive the same segment player against a stub client so the mantra/
      // action cards can still be clicked through without a real Anam call.
      var stubClient = {
        talk: function (text) {
          setTimeout(function () { onSegmentSpoken(); }, Math.min(2500, 600 + text.length * 18));
        },
        stopStreaming: function () {},
      };
      session.anamClient = stubClient;
      playFlow(ritualFlow);
    }, 1200);
  }

  function realCall(sessionToken, ritualFlow) {
    import('https://esm.sh/@anam-ai/js-sdk@latest')
      .then(function (mod) {
        // disableInputAudio: the devotee never speaks to the persona over
        // their mic — all input (mantra-jaap check, action confirm) comes
        // from our own buttons instead.
        var client = mod.createClient(sessionToken, { disableInputAudio: true });
        session.anamClient = client;
        client.addListener(mod.AnamEvent.CONNECTION_ESTABLISHED, function () {
          setCallStatus('');
          playFlow(ritualFlow);
        });
        client.addListener(mod.AnamEvent.CONNECTION_CLOSED, function () {
          endCall();
        });
        // Fires once the persona finishes speaking each utterance — the
        // signal the segment player waits on before advancing/showing a
        // button, since talk() speaks exact text with no LLM in the loop.
        if (mod.AnamEvent.MESSAGE_HISTORY_UPDATED) {
          client.addListener(mod.AnamEvent.MESSAGE_HISTORY_UPDATED, function (messages) {
            if ((messages || []).length > session.processedMsgCount) {
              session.processedMsgCount = messages.length;
              onSegmentSpoken();
            }
          });
        }
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
    session.awaitingSegmentSpeech = true;
    if (session.anamClient && typeof session.anamClient.talk === 'function') {
      session.anamClient.talk(seg.text);
    } else {
      onSegmentSpoken();
    }
  }

  // Called once the persona finishes speaking the current segment.
  function onSegmentSpoken() {
    if (!session.awaitingSegmentSpeech) return;
    session.awaitingSegmentSpeech = false;
    var seg = session.currentSegment;
    if (!seg) return;
    if (seg.type === 'speech') {
      advanceFlow();
    } else if (seg.type === 'mantra') {
      showMantraCard(seg);
    } else if (seg.type === 'action') {
      showActionCard(seg);
    }
  }

  function hideActionBar() {
    el('callActionBar').classList.add('hidden');
    el('actionCard').classList.add('hidden');
    el('diyaTapWrap').classList.add('hidden');
    el('mantraCard').classList.add('hidden');
    el('diyaRise').classList.add('hidden');
    stopMantraRecognition();
  }

  function showActionCard(seg) {
    stopMantraRecognition();
    el('callActionBar').classList.remove('hidden');
    el('mantraCard').classList.add('hidden');
    el('diyaRise').classList.add('hidden');
    if (seg.kind === 'diya') {
      el('actionCard').classList.add('hidden');
      el('diyaTapWrap').classList.remove('hidden');
      el('diyaTapHint').textContent = seg.text || 'Tap to light the diya.';
      el('diyaTapBtn').disabled = false;
      return;
    }
    el('diyaTapWrap').classList.add('hidden');
    el('actionCard').classList.remove('hidden');
    el('actionLabel').textContent = seg.text || 'Complete the action the purohit described.';
    el('actionDoneBtn').textContent = seg.buttonLabel || "I've done this ✓";
    el('actionDoneBtn').disabled = false;
    el('actionDoneBtn').classList.remove('hidden');
  }

  function showMantraCard(seg) {
    session.currentMantraTarget = seg.text;
    session.mantraAttempts = 0;
    el('callActionBar').classList.remove('hidden');
    el('actionCard').classList.add('hidden');
    el('mantraCard').classList.remove('hidden');
    el('mantraText').textContent = seg.text;
    el('mantraHeard').textContent = '';
    el('mantraHeard').classList.add('hidden');
    el('mantraStatus').textContent = '';
    el('mantraBtn').disabled = false;
    el('mantraBtn').textContent = '🎙️ Chant now';
    el('skipMantraBtn').classList.add('hidden');
  }

  function confirmActionDone() {
    hideActionBar();
    advanceFlow();
  }

  // A ring of diyas (bigger than the tap button's own icon) rises slowly
  // over the video when tapped, then the flow advances. Built once here
  // (rather than hardcoded in index.html) so the count/size is easy to tune.
  var DIYA_RISE_COUNT = 13;
  var DIYA_RISE_MS = 3600;
  function buildDiyaRise() {
    var wrap = el('diyaRise');
    var html = '';
    for (var i = 0; i < DIYA_RISE_COUNT; i++) {
      html +=
        '<div class="diyaRiseItem" style="--i:' + i + '">' +
          '<svg viewBox="0 0 56 72" fill="none">' +
            '<ellipse cx="28" cy="60" rx="26" ry="9" fill="#C57C22"/>' +
            '<ellipse cx="28" cy="57" rx="20" ry="6" fill="#FFBF6E"/>' +
            '<path class="flame" d="M28 12c6 8 9 14 9 20a9 9 0 11-18 0c0-6 3-12 9-20z" fill="url(#flameGradShared)"/>' +
          '</svg>' +
        '</div>';
    }
    html += '<p class="diyaRiseText">दीप प्रज्वलित 🙏 Diya lit</p>';
    wrap.innerHTML = html;
  }

  function playDiyaRise() {
    el('diyaTapBtn').disabled = true;
    el('callActionBar').classList.add('hidden');
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

  // Word-overlap (Sørensen–Dice) similarity, good enough for short mantras.
  // Returns both the score and the raw match count — a short mantra like
  // "ओम् गं गणपतये नमः" can hit score >= 0.5 off a single common word
  // ("ओम्"/"नमः") match, so the caller also requires a minimum match count
  // to avoid accepting near-silence or an unrelated utterance.
  function normalizeWords(s) {
    return String(s || '').replace(/[।॥.,!?]/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  function mantraSimilarity(said, target) {
    var a = normalizeWords(said);
    var targetWords = normalizeWords(target);
    var b = targetWords.slice();
    if (!a.length || !b.length) return { score: 0, matches: 0, targetWordCount: targetWords.length };
    var matches = 0;
    a.forEach(function (w) {
      var idx = b.indexOf(w);
      if (idx !== -1) { matches++; b.splice(idx, 1); }
    });
    return {
      score: (2 * matches) / (a.length + targetWords.length),
      matches: matches,
      targetWordCount: targetWords.length,
    };
  }

  var activeRecognition = null;
  function stopMantraRecognition() {
    if (activeRecognition) {
      try { activeRecognition.abort(); } catch (e) { /* already stopped */ }
      activeRecognition = null;
    }
  }

  // Marks one failed/inconclusive chant attempt: resets the button and, from
  // the first failure onward, reveals a skip button so the devotee is never
  // stuck retrying a mantra recognition never confirms.
  function markMantraAttemptFailed(msg) {
    el('mantraStatus').textContent = msg;
    el('mantraBtn').disabled = false;
    el('mantraBtn').textContent = '🎙️ Chant now';
    session.mantraAttempts += 1;
    if (session.mantraAttempts >= 1) {
      el('skipMantraBtn').classList.remove('hidden');
    }
  }

  function startMantraRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      // No on-device speech recognition available in this browser — accept
      // the button press as the confirmation instead of blocking the flow.
      confirmMantraDone();
      return;
    }
    var rec = new SR();
    activeRecognition = rec;
    rec.lang = 'hi-IN';
    rec.continuous = false;
    // interimResults=true so we always have *something* to judge even if
    // the browser/WebView never marks a result isFinal before ending —
    // that gap is what caused "mic listens but nothing gets sent": with
    // interimResults off and no final result, onresult simply never fired.
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    var settled = false;
    var lastTranscript = '';
    var hardTimeout = null;
    var endGrace = null;

    function clearTimers() {
      if (hardTimeout) { clearTimeout(hardTimeout); hardTimeout = null; }
      if (endGrace) { clearTimeout(endGrace); endGrace = null; }
    }

    function judge(said) {
      if (settled) return;
      settled = true;
      clearTimers();
      var result = mantraSimilarity(said, session.currentMantraTarget);
      el('mantraHeard').textContent = said ? 'Heard: "' + said + '"' : '';
      el('mantraHeard').classList.toggle('hidden', !said);
      var minMatches = Math.min(2, result.targetWordCount);
      if (said && result.score >= 0.5 && result.matches >= minMatches) {
        el('mantraStatus').textContent = 'Mantra accepted ✓';
        confirmMantraDone();
      } else {
        markMantraAttemptFailed(said ? 'Not clear — please chant the mantra again.' : 'Could not hear you — please try again.');
      }
    }

    el('mantraBtn').disabled = true;
    el('mantraBtn').textContent = 'Listening…';
    el('mantraStatus').textContent = '';
    el('mantraHeard').textContent = '';
    el('mantraHeard').classList.add('hidden');

    rec.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var alt = e.results[i] && e.results[i][0];
        if (!alt) continue;
        lastTranscript = alt.transcript || lastTranscript;
        if (e.results[i].isFinal) {
          judge(lastTranscript);
          try { rec.stop(); } catch (err) { /* already stopping */ }
          return;
        }
      }
    };
    // 'no-speech'/'aborted'/etc. — judge whatever interim transcript was
    // captured rather than dropping it; some mobile WebViews error out
    // before ever marking a result isFinal.
    rec.onerror = function () { judge(lastTranscript); };
    rec.onend = function () {
      activeRecognition = null;
      clearTimers();
      // If the session ended with no isFinal result and no error either
      // (the exact "listens but never sends" symptom), fall back to
      // whatever interim transcript we captured, or a clear failure.
      if (!settled) judge(lastTranscript);
    };

    // Safety net: some WebViews can leave the recognizer hanging forever
    // with none of onresult/onerror/onend ever firing. Force a stop after
    // 7s, then bail to a manual retry after a short grace period so the
    // button never stays stuck on "Listening…" indefinitely.
    hardTimeout = setTimeout(function () {
      try { rec.stop(); } catch (err) { /* already stopped */ }
      endGrace = setTimeout(function () {
        if (!settled) { settled = true; markMantraAttemptFailed('Could not hear you — please try again.'); }
      }, 1500);
    }, 7000);

    try { rec.start(); } catch (e) { confirmMantraDone(); }
  }

  function endCall() {
    stopMantraRecognition();
    if (session.anamClient) {
      try { session.anamClient.stopStreaming(); } catch (e) { /* already closed */ }
      session.anamClient = null;
    }
    el('mockAvatar').classList.add('hidden');
    hideActionBar();
    session.pooja = null;
    session.orderId = null;
    session.payToken = null;
    session.processedMsgCount = 0;
    session.ritualFlow = [];
    session.ritualIdx = -1;
    session.currentSegment = null;
    session.awaitingSegmentSpeech = false;
    session.currentMantraTarget = '';
    session.mantraAttempts = 0;
    session.endScheduled = false;
    // Reset the stack rather than pushing: the call can't be resumed, so
    // the back button from the completion screen should land on landing,
    // not on a dead call screen.
    flow = ['landing'];
    goTo('complete');
  }

  el('endCallBtn').addEventListener('click', endCall);
  el('actionDoneBtn').addEventListener('click', confirmActionDone);
  el('diyaTapBtn').addEventListener('click', playDiyaRise);
  el('mantraBtn').addEventListener('click', startMantraRecognition);
  el('skipMantraBtn').addEventListener('click', function () {
    stopMantraRecognition();
    confirmMantraDone();
  });

  // ---- 5. completion -------------------------------------------------------------
  el('homeBtn').addEventListener('click', function () {
    flow = ['landing'];
    showScreen('landing');
  });

  // ---- shared -----------------------------------------------------------------
  el('backBtn').addEventListener('click', goBack);
  el('payBtn').addEventListener('click', startPayment);
  el('retryPayBtn').addEventListener('click', function () {
    el('retryPayBtn').classList.add('hidden');
    el('payError').classList.add('hidden');
    el('payBtn').classList.remove('hidden');
    el('payBtn').disabled = false;
    el('payBtn').textContent = 'Pay now';
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var FLAME_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-3 4-3 8a3 3 0 006 0c0-1-.5-2-1-2.5.8.2 3 1.8 3 5.5a5 5 0 01-10 0c0-5 3-7 5-11z" fill="#fff"/></svg>';

  // ---- boot -----------------------------------------------------------------
  buildDiyaRise();
  Promise.all([
    fetch('/api/poojas').then(function (r) { return r.json(); }),
    fetch('/api/mode').then(function (r) { return r.json(); }).catch(function () { return MODE; }),
  ]).then(function (results) {
    POOJAS = results[0].poojas || [];
    MODE = results[1];
    renderPoojas();
  }).catch(function () {
    el('poojaList').innerHTML = '<p class="errText">Could not load poojas. Please refresh.</p>';
  });
})();
