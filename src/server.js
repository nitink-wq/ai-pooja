// Thin, stateless HTTP layer. No database: a booking is a single client
// session (select -> pay -> form -> call) and nothing about the devotee is
// persisted once the Anam call session is handed off, per the "no user data
// stored beyond what's needed for the Anam session" requirement.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POOJAS, PANDIT, findPooja } from './config.js';
import { createOrder, verifyPaymentSignature, getPublicKeyId, RAZORPAY_MOCK_MODE } from './services/razorpay.js';
import { createSession, ANAM_MOCK_MODE } from './services/anam.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));
// Razorpay's redirect-mode callback (see /api/payment/callback) arrives as a
// form POST, not JSON.
app.use(express.urlencoded({ extended: false, limit: '8kb' }));
// Cached in production, never cached locally: a 5-minute cache during
// development means an edited file keeps serving its old copy across
// reloads (and across tabs — the HTTP cache is per-browser, not per-tab).
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0,
  etag: true,
}));

// --- health probes -----------------------------------------------------------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/readyz', (req, res) => res.json({ ok: true }));

// --- payment-proof tokens ----------------------------------------------------
// No DB, so payment state is carried in short-lived signed tokens rather than
// rows. Two of them:
//
//   orderToken  — minted with the order, binds poojaId <-> orderId. Razorpay's
//                 signature only covers order_id|payment_id, so without this a
//                 client could pay for the cheapest pooja and then present that
//                 valid signature alongside a pricier poojaId. It also carries
//                 the pooja through Razorpay's redirect-mode round trip, where
//                 the browser's in-memory state does not survive.
//   payToken    — minted once a signature checks out; /api/anam/session
//                 refuses to start a call without a valid one.
//
// PAY_TOKEN_SECRET must be shared by every replica: the deployment runs more
// than one pod, and a token minted on one is otherwise garbage on the next —
// the request that spends it (redirect callback, or /api/anam/session) has no
// reason to land on the same pod that minted it. Falls back to a per-process
// random secret only so single-process local runs need no config.
const PAY_TOKEN_SECRET = process.env.PAY_TOKEN_SECRET
  ? Buffer.from(process.env.PAY_TOKEN_SECRET, 'utf8')
  : crypto.randomBytes(32);
if (!process.env.PAY_TOKEN_SECRET) {
  console.warn('[server] PAY_TOKEN_SECRET not set — using a per-process secret; payment tokens will NOT be valid across replicas or restarts');
}
const PAY_TOKEN_TTL_MS = 30 * 60 * 1000;   // 30 min: plenty to fill the short form
const ORDER_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 h: a slow netbanking round trip

function signToken(kind, fields, ttlMs) {
  const exp = Date.now() + ttlMs;
  const payload = [kind, ...fields, exp].join('.');
  const sig = crypto.createHmac('sha256', PAY_TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

// Returns the token's fields (between the kind and the expiry) or null.
function readToken(kind, token, fieldCount) {
  try {
    const parts = Buffer.from(String(token || ''), 'base64url').toString('utf8').split('.');
    if (parts.length !== fieldCount + 3 || parts[0] !== kind) return null;
    const sig = parts.pop();
    const expected = crypto.createHmac('sha256', PAY_TOKEN_SECRET).update(parts.join('.')).digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    if (Number(parts[parts.length - 1]) <= Date.now()) return null;
    return parts.slice(1, -1);
  } catch {
    return null;
  }
}

const signOrderToken = (poojaId, orderId) => signToken('o', [poojaId, orderId], ORDER_TOKEN_TTL_MS);
function readOrderToken(token) {
  const f = readToken('o', token, 2);
  return f ? { poojaId: f[0], orderId: f[1] } : null;
}

const signPayToken = (poojaId, orderId, paymentId) => signToken('p', [poojaId, orderId, paymentId], PAY_TOKEN_TTL_MS);
function verifyPayToken(token, poojaId) {
  const f = readToken('p', token, 3);
  return !!f && f[0] === poojaId;
}

// Shared by the JSON verify route and the redirect-mode callback: checks the
// order token, that Razorpay's order id is the one we minted it for, and the
// payment signature. Returns a payToken, or null.
function settlePayment({ orderToken, orderId, paymentId, signature }) {
  const order = readOrderToken(orderToken);
  if (!order || !orderId || !paymentId) return null;
  if (order.orderId !== orderId) return null;
  if (!verifyPaymentSignature({ orderId, paymentId, signature })) return null;
  return { poojaId: order.poojaId, payToken: signPayToken(order.poojaId, orderId, paymentId) };
}

// --- API ---------------------------------------------------------------------
// Only the presentational fields go to the client — the mantras and the
// ritual script stay server-side and reach the browser solely as a built
// flow, once a call actually starts.
app.get('/api/poojas', (req, res) => {
  res.json({
    poojas: POOJAS.map(({ id, name, description, priceInr, durationMin, includes }) => ({
      id, name, description, priceInr, durationMin, includes,
    })),
    pandit: PANDIT,
  });
});

app.post('/api/payment/order', async (req, res) => {
  try {
    const pooja = findPooja(req.body?.poojaId);
    if (!pooja) return res.status(400).json({ error: 'UNKNOWN_POOJA' });

    const order = await createOrder({
      amountInr: pooja.priceInr,
      receipt: `ai-pooja-${pooja.id}-${Date.now()}`,
      notes: { poojaId: pooja.id },
    });
    res.json({
      orderId: order.id,
      orderToken: signOrderToken(pooja.id, order.id),
      amount: order.amount,
      currency: order.currency,
      keyId: getPublicKeyId(),
      mock: RAZORPAY_MOCK_MODE,
    });
  } catch (err) {
    console.error('[payment/order] failed:', err.message);
    res.status(502).json({ error: 'ORDER_FAILED' });
  }
});

// Desktop path: Checkout.js hands the result to the page's handler, which
// posts it here as JSON. The pooja comes from the order token, never from
// the client.
app.post('/api/payment/verify', (req, res) => {
  const { orderToken, orderId, paymentId, signature } = req.body || {};
  if (!orderToken || !orderId || !paymentId) return res.status(400).json({ error: 'BAD_REQUEST' });
  const settled = settlePayment({ orderToken, orderId, paymentId, signature });
  if (!settled) return res.status(400).json({ error: 'SIGNATURE_INVALID' });
  res.json({ ok: true, poojaId: settled.poojaId, payToken: settled.payToken });
});

// Mobile path. Checkout.js opens netbanking (and Razorpay's test-mode bank
// page) in a popup window, which mobile browsers and WebViews block or cannot
// host — so the bank page simply never appears. The client therefore uses
// Razorpay's redirect mode on mobile: the top-level page navigates to the
// bank and, when done, Razorpay POSTs the result here as a form. The order
// token rides along in the query string, since the page that started the
// payment — and all of its in-memory state — is gone by now. We finish by
// sending the browser back into the app with the payToken, where app.js
// resumes at the details form (see resumeFromPaymentRedirect).
app.post('/api/payment/callback', (req, res) => {
  const orderToken = req.query.ot;
  const order = readOrderToken(orderToken);
  const back = (params) => res.redirect(303, '/?' + new URLSearchParams(params).toString());
  const b = req.body || {};
  // Operational only — booleans and Razorpay ids, never devotee details. This
  // is how to tell "Razorpay never called back" apart from "callback failed".
  console.log('[payment/callback]', JSON.stringify({
    hasOrderToken: !!orderToken, orderTokenValid: !!order,
    razorpayOrderId: b.razorpay_order_id || null, hasPaymentId: !!b.razorpay_payment_id,
    hasSignature: !!b.razorpay_signature, errorCode: (b.error && b.error.code) || b['error[code]'] || null,
    ua: (req.get('user-agent') || '').slice(0, 80),
  }));
  if (!order) return back({ payFailed: 'expired' });

  const settled = settlePayment({
    orderToken,
    orderId: b.razorpay_order_id,
    paymentId: b.razorpay_payment_id,
    signature: b.razorpay_signature,
  });
  // On failure Razorpay posts error[...] fields and no payment id; either way,
  // no valid signature means no token.
  console.log('[payment/callback] outcome:', settled ? 'paid' : 'failed', 'pooja=' + order.poojaId);
  if (!settled) return back({ payFailed: '1', pooja: order.poojaId });
  return back({ paid: settled.payToken, pooja: settled.poojaId });
});

app.post('/api/anam/session', async (req, res) => {
  const { poojaId, payToken, name, dob, place, issue } = req.body || {};
  const pooja = findPooja(poojaId);
  if (!pooja) return res.status(400).json({ error: 'UNKNOWN_POOJA' });
  if (!verifyPayToken(payToken, poojaId)) return res.status(402).json({ error: 'PAYMENT_REQUIRED' });

  if (![name, dob, place, issue].every((v) => typeof v === 'string' && v.trim())) {
    return res.status(400).json({ error: 'MISSING_FIELDS' });
  }
  if (issue.length > 300) return res.status(400).json({ error: 'ISSUE_TOO_LONG' });

  try {
    const session = await createSession({
      pooja,
      name: name.trim(),
      dob: dob.trim(),
      place: place.trim(),
      issue: issue.trim(),
    });
    res.json(session);
  } catch (err) {
    // Error message only — the devotee's name/dob/place/issue must never hit
    // the log, even on failure.
    console.error('[anam/session] failed:', err.message);
    res.status(502).json({ error: 'ANAM_SESSION_FAILED' });
  }
});

app.get('/api/mode', (req, res) => {
  res.json({ razorpayMock: RAZORPAY_MOCK_MODE, anamMock: ANAM_MOCK_MODE });
});

// --- boot / graceful shutdown ------------------------------------------------
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`[ai-pooja] listening on :${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[ai-pooja] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
