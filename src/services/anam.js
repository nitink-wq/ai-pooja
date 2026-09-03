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
//                          itself in Anam Lab. Not sent in the API call —
//                          recorded here so the pairing is documented and
//                          ready if Anam later adds a per-session override.
//
// Without ANAM_API_KEY set, the service runs in mock mode: it returns a fake
// session token and the client shows a simulated call screen instead of
// loading the real Anam SDK. That lets the booking/payment/form flow be built
// and clicked through before real Anam credentials exist.
import { ANAM_SYSTEM_PROMPT_HEADER } from '../config.js';

const API_KEY = process.env.ANAM_API_KEY || '';
const PERSONA_ID = process.env.ANAM_PERSONA_ID || '';
export const ANAM_MOCK_MODE = !API_KEY;

if (ANAM_MOCK_MODE) {
  console.warn('[anam] ANAM_API_KEY not set — running in MOCK avatar-call mode');
}

// Builds the full per-call system prompt: the shared persona/pronunciation
// header (config.js, same for every call) plus this devotee's pooja type,
// name, dob, place, stated issue, and the pooja's mantras. The model is
// instructed (in the header) to always speak Hindi and to conduct the whole
// ritual itself without waiting on the devotee. Never logged — the caller
// (server.js) must not log the request body either.
function buildSystemPrompt({ poojaName, ritualContext, mantras, name, dob, place, issue }) {
  const userBlock = [
    '',
    '',
    '[यजमान का विवरण]',
    `- पूजा: ${poojaName} (${ritualContext})`,
    `- नाम: ${name}`,
    `- जन्म-तिथि: ${dob}`,
    `- जन्म स्थान: ${place}`,
    '- गोत्र: ज्ञात नहीं (कश्यप गोत्र का प्रयोग करें)',
    `- उद्देश्य: ${issue}`,
    '',
    '[इन मंत्रों का प्रयोग करें]',
    mantras,
    '',
    'ऊपर दिए गए यजमान के विवरण और मंत्रों के साथ अपने परिचय से आरंभ कीजिए, फिर पूरी पूजा बिना रुके, एक ही प्रवाह में संपन्न कीजिए।',
  ].join('\n');
  return ANAM_SYSTEM_PROMPT_HEADER + userBlock;
}

// Creates a short-lived Anam session token for the configured persona, and
// returns the full system prompt (header + this devotee's details + pooja
// mantras) the client feeds in via addContext() once the call connects, plus
// a short trigger message via sendUserMessage() to make the persona begin
// speaking without waiting on the devotee.
export async function createSession(sessionInput) {
  const systemPrompt = buildSystemPrompt(sessionInput);

  if (ANAM_MOCK_MODE) {
    return { sessionToken: `mock_session_${Date.now()}`, systemPrompt, mock: true };
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
  return { sessionToken: data.sessionToken, systemPrompt, mock: false };
}
