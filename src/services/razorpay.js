// Razorpay integration, isolated so swapping test -> live keys, or the
// provider itself, never touches server.js or the client.
//
// Env vars (test-mode keys to start):
//   RAZORPAY_KEY_ID      - public key id, also sent to the client for Checkout.js
//   RAZORPAY_KEY_SECRET  - private, used to sign/verify server-side only
//
// Without both set, the service runs in mock mode: orders get a fake id and
// verification always succeeds. That lets the rest of the flow be built and
// clicked through before real keys exist.
import crypto from 'node:crypto';

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
export const RAZORPAY_MOCK_MODE = !KEY_ID || !KEY_SECRET;

if (RAZORPAY_MOCK_MODE) {
  console.warn('[razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — running in MOCK payment mode');
}

export function getPublicKeyId() {
  return RAZORPAY_MOCK_MODE ? 'mock_key' : KEY_ID;
}

// Creates a Razorpay order for the given pooja. Amount is derived server-side
// from the catalogue (src/config.js), never trusted from the client, so a
// tampered request can't buy a ₹399 pooja for ₹1.
export async function createOrder({ amountInr, receipt, notes }) {
  if (RAZORPAY_MOCK_MODE) {
    return {
      id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
      amount: amountInr * 100,
      currency: 'INR',
      mock: true,
    };
  }

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64'),
    },
    body: JSON.stringify({
      amount: amountInr * 100, // paise
      currency: 'INR',
      receipt,
      notes,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`razorpay order create failed: ${data?.error?.description || res.status}`);
  }
  return data;
}

// Reads an order back from Razorpay. Used only as a fallback in the
// redirect-mode callback: the order's `notes.poojaId` was set by us at
// creation time (see createOrder), so it is a server-authoritative record of
// which pooja an order is for — recoverable even when our own order token
// doesn't survive the round trip.
export async function fetchOrder(orderId) {
  if (RAZORPAY_MOCK_MODE) return { id: orderId, notes: {} };
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      authorization: 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64'),
    },
  });
  if (!res.ok) throw new Error(`razorpay order fetch failed: ${res.status}`);
  return res.json();
}

// Verifies the HMAC-SHA256 signature Razorpay's Checkout.js hands back after
// a successful payment. This is the only trustworthy proof of payment — the
// client-side "success" callback firing is not, since it can be spoofed.
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (RAZORPAY_MOCK_MODE) return true;
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
  } catch {
    return false; // length mismatch etc. -> not a valid signature
  }
}
