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
    currentMantraTarget: '',
    endScheduled: false,
  };

  // The persona (LLM, via a stateful Anam personaId) is instructed in
  // src/config.js to speak fixed cue sentences at each interaction point,
  // but an LLM restates instructions in its own words rather than reciting
  // them character-for-character — so detection here is keyword/fuzzy, not
  // an exact string match. See detectCue() below.

  function showScreen(name) {
    screens.forEach(function (s) {
      el('screen-' + s).classList.toggle('hidden', s !== name);
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
    POOJAS.forEach(function (p) {
      var card = document.createElement('button');
      card.className = 'poojaCard';
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
    if (data.mock) return mockCall();
    realCall(data.sessionToken, data.systemPrompt);
  }

  // Simulated call screen used while ANAM_API_KEY is not yet configured.
  function mockCall() {
    el('mockAvatar').classList.remove('hidden');
    setTimeout(function () { setCallStatus(''); }, 1200);
  }

  function realCall(sessionToken, systemPrompt) {
    import('https://esm.sh/@anam-ai/js-sdk@latest')
      .then(function (mod) {
        // disableInputAudio: the devotee never speaks to the persona over
        // their mic — all input comes from our own buttons (mantra-jaap
        // check, action confirm), sent via sendUserMessage below.
        var client = mod.createClient(sessionToken, { disableInputAudio: true });
        session.anamClient = client;
        client.addListener(mod.AnamEvent.CONNECTION_ESTABLISHED, function () {
          setCallStatus('');
          // Full persona/pronunciation instructions + this devotee's name,
          // dob, place, issue and pooja mantras, fed in as context so the
          // LLM generates the whole ritual itself (always in Hindi, per the
          // prompt) rather than speaking a fixed script.
          if (systemPrompt && typeof client.addContext === 'function') {
            client.addContext(systemPrompt);
          }
          // Nudge the persona to begin without waiting on the devotee —
          // the prompt itself instructs it to start with the introduction.
          if (typeof client.sendUserMessage === 'function') {
            client.sendUserMessage('पूजा आरंभ कीजिए।');
          }
        });
        client.addListener(mod.AnamEvent.CONNECTION_CLOSED, function () {
          endCall();
        });
        // Fires once the persona finishes speaking each turn, with the full
        // transcript so far — used to detect the mantra/action/end cues.
        if (mod.AnamEvent.MESSAGE_HISTORY_UPDATED) {
          client.addListener(mod.AnamEvent.MESSAGE_HISTORY_UPDATED, function (messages) {
            handleTranscript(messages || []);
          });
        }
        return client.streamToVideoElement('personaVideo');
      })
      .catch(function () {
        setCallStatus('Connection lost. Ending your pooja.');
        setTimeout(endCall, 1500);
      });
  }

  // ---- interactive protocol: mantra jaap + action confirm + auto end-call ----
  // The persona is an LLM — it restates the cue instructions from
  // src/config.js in its own words rather than reciting them verbatim, so
  // detection here is keyword-based (does this sentence mention a button,
  // and is it about a mantra vs. a physical action vs. ending the pooja)
  // rather than an exact string match.
  function splitSentences(content) {
    return String(content || '').split(/[।.!?]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // Drops the trailing "press the button" instruction sentence(s) so what's
  // left is just the mantra/action content the persona actually described.
  function stripButtonSentence(content) {
    var sentences = splitSentences(content);
    while (sentences.length > 1 && /बटन/.test(sentences[sentences.length - 1])) {
      sentences.pop();
    }
    return sentences.join('। ').trim();
  }

  function detectCue(content) {
    var hasButtonMention = /बटन/.test(content) && /(दबा|दबाए|press)/i.test(content);
    var mentionsEnd = /(समाप्त|संकल्प पूर्ण|पूजा .*(पूर्ण|संपन्न))/.test(content) && /शांति/.test(content);
    if (mentionsEnd) return 'end';
    if (!hasButtonMention) return null;
    if (/(मंत्र|जाप|जपें|जपिए)/.test(content)) return 'mantra';
    return 'action';
  }

  function handleTranscript(messages) {
    var fresh = messages.slice(session.processedMsgCount);
    session.processedMsgCount = messages.length;
    fresh.forEach(function (m) {
      if (!m || m.role !== 'persona' || !m.content) return;
      var cue = detectCue(m.content);
      if (cue === 'end') {
        hideActionBar();
        if (!session.endScheduled) {
          session.endScheduled = true;
          setTimeout(endCall, 1500);
        }
      } else if (cue === 'action') {
        showActionCard(stripButtonSentence(m.content));
      } else if (cue === 'mantra') {
        showMantraCard(stripButtonSentence(m.content));
      }
    });
  }

  function hideActionBar() {
    el('callActionBar').classList.add('hidden');
    el('actionCard').classList.add('hidden');
    el('mantraCard').classList.add('hidden');
    stopMantraRecognition();
  }

  function showActionCard(label) {
    stopMantraRecognition();
    el('callActionBar').classList.remove('hidden');
    el('mantraCard').classList.add('hidden');
    el('actionCard').classList.remove('hidden');
    el('actionLabel').textContent = label || 'Complete the action the purohit described.';
    el('actionDoneBtn').disabled = false;
  }

  function showMantraCard(mantraText) {
    session.currentMantraTarget = mantraText;
    el('callActionBar').classList.remove('hidden');
    el('actionCard').classList.add('hidden');
    el('mantraCard').classList.remove('hidden');
    el('mantraText').textContent = mantraText;
    el('mantraStatus').textContent = '';
    el('mantraBtn').disabled = false;
    el('mantraBtn').textContent = '🎙️ Chant now';
  }

  function confirmActionDone() {
    hideActionBar();
    if (session.anamClient && typeof session.anamClient.sendUserMessage === 'function') {
      session.anamClient.sendUserMessage('यजमान ने बताई गई क्रिया पूर्ण कर ली है। कृपया आगे बढ़ें।');
    }
  }

  function confirmMantraDone() {
    hideActionBar();
    if (session.anamClient && typeof session.anamClient.sendUserMessage === 'function') {
      session.anamClient.sendUserMessage('यजमान ने मंत्र जाप पूर्ण किया। कृपया आगे बढ़ें।');
    }
  }

  // Word-overlap (Sørensen–Dice) similarity, good enough for short mantras.
  function normalizeWords(s) {
    return String(s || '').replace(/[।॥.,!?]/g, ' ').trim().split(/\s+/).filter(Boolean);
  }
  function mantraSimilarity(said, target) {
    var a = normalizeWords(said);
    var b = normalizeWords(target).slice();
    if (!a.length || !b.length) return 0;
    var matches = 0;
    a.forEach(function (w) {
      var idx = b.indexOf(w);
      if (idx !== -1) { matches++; b.splice(idx, 1); }
    });
    return (2 * matches) / (a.length + normalizeWords(target).length);
  }

  var activeRecognition = null;
  function stopMantraRecognition() {
    if (activeRecognition) {
      try { activeRecognition.abort(); } catch (e) { /* already stopped */ }
      activeRecognition = null;
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
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    el('mantraBtn').disabled = true;
    el('mantraBtn').textContent = 'Listening…';
    el('mantraStatus').textContent = '';
    rec.onresult = function (e) {
      var said = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
      var score = mantraSimilarity(said, session.currentMantraTarget);
      if (score >= 0.5) {
        el('mantraStatus').textContent = 'Mantra accepted ✓';
        confirmMantraDone();
      } else {
        el('mantraStatus').textContent = 'Not clear — please chant the mantra again.';
        el('mantraBtn').disabled = false;
        el('mantraBtn').textContent = '🎙️ Chant now';
      }
    };
    rec.onerror = function () {
      el('mantraStatus').textContent = 'Could not hear you — press the button again.';
      el('mantraBtn').disabled = false;
      el('mantraBtn').textContent = '🎙️ Chant now';
    };
    rec.onend = function () { activeRecognition = null; };
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
    session.currentMantraTarget = '';
    session.endScheduled = false;
    // Reset the stack rather than pushing: the call can't be resumed, so
    // the back button from the completion screen should land on landing,
    // not on a dead call screen.
    flow = ['landing'];
    goTo('complete');
  }

  el('endCallBtn').addEventListener('click', endCall);
  el('actionDoneBtn').addEventListener('click', confirmActionDone);
  el('mantraBtn').addEventListener('click', startMantraRecognition);

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
