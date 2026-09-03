// Anam.ai integration, isolated so the persona/key can change without
// touching server.js or the client.
//
// Env vars:
//   ANAM_API_KEY        - required for a real call. Never sent to the
//                          client — only the short-lived session token it
//                          mints is.
//   ANAM_PERSONA_ID     - the persona built in Anam Lab (bundles its
//                          avatar and voice).
//   ANAM_VOICE_ID        - informational only: the ElevenLabs voice this
//   ANAM_VOICE_MODEL_ID    persona uses, already configured on the persona
//                          itself in Anam Lab. Not sent in the API call.
//
// Without ANAM_API_KEY set, the service runs in mock mode: it returns a fake
// session token and the client shows a simulated call screen instead of
// loading the real Anam SDK. That lets the booking/payment/form flow be built
// and clicked through before real Anam credentials exist.
import { buildFlow } from '../config.js';

const API_KEY = process.env.ANAM_API_KEY || '';
const PERSONA_ID = process.env.ANAM_PERSONA_ID || '';
export const ANAM_MOCK_MODE = !API_KEY;

if (ANAM_MOCK_MODE) {
  console.warn('[anam] ANAM_API_KEY not set — running in MOCK avatar-call mode');
}

// Creates a short-lived Anam session token for the configured persona, plus
// the ordered, per-devotee ritual flow (see config.js buildFlow) the client
// drives via talk() once connected. The whole ritual — mantras, action
// prompts, sankalp wording — is deterministic text built here, not
// LLM-generated, so the client always knows exactly when to pause for a
// mantra/action button and when to move on.
export async function createSession({ pooja, name, dob, place, issue }) {
  const flow = buildFlow(pooja, { name, dob, place, issue });

  if (ANAM_MOCK_MODE) {
    return { sessionToken: `mock_session_${Date.now()}`, flow, mock: true };
  }

  const res = await fetch('https://api.anam.ai/v1/auth/session-token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ personaConfig: { personaId: PERSONA_ID } }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`anam session-token create failed: ${data?.message || res.status}`);
  }
  return { sessionToken: data.sessionToken, flow, mock: false };
}
