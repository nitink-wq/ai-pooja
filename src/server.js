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

// --- payment-proof token -----------------------------------------------------
// No DB, so payment state is a short-lived signed token rather than a row:
// /api/payment/verify mints it once Razorpay's signature checks out, and
// /api/anam/session refuses to start a call without a valid one. The secret
// is per-process, which is fine — the token only needs to outlive one page
// session, not a server restart.
const PAY_TOKEN_SECRET = crypto.randomBytes(32);
const PAY_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min: plenty to fill the short form

function signPayToken(poojaId, orderId, paymentId) {
  const exp = Date.now() + PAY_TOKEN_TTL_MS;
  const payload = `${poojaId}.${orderId}.${paymentId}.${exp}`;
  const sig = crypto.createHmac('sha256', PAY_TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyPayToken(token, poojaId) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [pId, orderId, paymentId, exp, sig] = decoded.split('.');
    if (pId !== poojaId) return false;
    const payload = `${pId}.${orderId}.${paymentId}.${exp}`;
    const expected = crypto.createHmac('sha256', PAY_TOKEN_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
    return Number(exp) > Date.now();
  } catch {
    return false;
  }
}

// --- API ---------------------------------------------------------------------
// Only the presentational fields go to the client — the mantras and the
// ritual script stay server-side and reach the browser solely as a built
// flow, once a call actually starts.
app.get('/api/poojas', (req, res) => {
  res.json({
    poojas: POOJAS.map(({ id, name, description, image, priceInr, durationMin, includes }) => ({
      id, name, description, image, priceInr, durationMin, includes,
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

app.post('/api/payment/verify', (req, res) => {
  const { poojaId, orderId, paymentId, signature } = req.body || {};
  const pooja = findPooja(poojaId);
  if (!pooja || !orderId || !paymentId) return res.status(400).json({ error: 'BAD_REQUEST' });

  const valid = verifyPaymentSignature({ orderId, paymentId, signature });
  if (!valid) return res.status(400).json({ error: 'SIGNATURE_INVALID' });

  res.json({ ok: true, payToken: signPayToken(poojaId, orderId, paymentId) });
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
