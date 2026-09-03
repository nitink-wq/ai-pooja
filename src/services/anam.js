// Anam.ai integration, isolated so the persona/key can change without
// touching server.js or the client.
//
// Env vars:
//   ANAM_API_KEY        - required for a real call. Never sent to the
//                          client — only the short-lived session token it
//                          mints is.
//   ANAM_PERSONA_ID     - the persona built in Anam Lab (bundles its
//                          avatar, voice and base system prompt).
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
const API_KEY = process.env.ANAM_API_KEY || '';
const PERSONA_ID = process.env.ANAM_PERSONA_ID || '';
export const ANAM_MOCK_MODE = !API_KEY;

if (ANAM_MOCK_MODE) {
  console.warn('[anam] ANAM_API_KEY not set — running in MOCK avatar-call mode');
}

// Background only — never spoken. DOB/place/issue stay context for the LLM
// (in case the devotee says something mid-call), fed in via the client's
// addContext() once connected. The devotee's details never leave this
// function as free text logged anywhere, and the caller (server.js) must not
// log the request body.
function buildContext({ poojaName, ritualContext, name, dob, place, issue }) {
  return [
    `Live session context for this call: the devotee is ${name}, booked ${ritualContext}.`,
    `Born ${dob} in ${place}.`,
    `What they want this ${poojaName} to help with: ${issue}`,
    'This context is background only — the ritual script itself is delivered separately via talk() and must not be re-generated or paraphrased.',
  ].join(' ');
}

// The actual ritual wording (src/config.js POOJAS[].script), spoken verbatim
// by the persona via the client's talk() — bypasses the LLM entirely, so
// what's written there is exactly what gets said.
function buildScript(scriptTemplate, name) {
  return scriptTemplate.replace(/\{\{name\}\}/g, name);
}

// Creates a short-lived (1hr) Anam session token for the configured persona,
// and returns the per-devotee context (addContext, background only) and
// script (talk(), spoken verbatim) the client feeds in once the call connects.
export async function createSession(sessionInput) {
  const context = buildContext(sessionInput);
  const script = buildScript(sessionInput.scriptTemplate, sessionInput.name);

  if (ANAM_MOCK_MODE) {
    return { sessionToken: `mock_session_${Date.now()}`, context, script, mock: true };
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
  return { sessionToken: data.sessionToken, context, script, mock: false };
}
