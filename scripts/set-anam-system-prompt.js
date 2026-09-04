// One-time (or re-run-on-change) setup script: pushes the persona config
// onto the Anam Lab persona identified by ANAM_PERSONA_ID. Not called at
// server boot — this only needs re-running when the config below changes.
//
// The LLM stays enabled on purpose (a deliberate call: keep some real
// intelligence on the persona for later, rather than making it a pure
// avatar+voice pass-through via llmId: 'CUSTOMER_CLIENT_V1'). skipGreeting
// + systemPrompt are the guardrails instead — verified via GET
// /v1/personas/{id} to have actually saved after a previous run, so if the
// auto-generated "I'm an AI" intro still shows up on a call, re-test with a
// freshly created session first (an old session token can outlive a config
// change); if it reproduces on a genuinely new session, that's the signal
// this app does need llmId: 'CUSTOMER_CLIENT_V1' after all, since that's
// the only documented way to guarantee zero autonomous LLM speech.
//
// Usage: node --env-file-if-exists=.env scripts/set-anam-system-prompt.js
import { ANAM_SYSTEM_PROMPT } from '../src/config.js';

const API_KEY = process.env.ANAM_API_KEY || '';
const PERSONA_ID = process.env.ANAM_PERSONA_ID || '';

if (!API_KEY || !PERSONA_ID) {
  console.error('ANAM_API_KEY and ANAM_PERSONA_ID must both be set (see .env).');
  process.exit(1);
}

const res = await fetch(`https://api.anam.ai/v1/personas/${PERSONA_ID}`, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${API_KEY}`,
  },
  // A partial update — only these fields change; avatarId/voiceId/llmId/etc.
  // on the persona are left exactly as configured in Anam Lab.
  body: JSON.stringify({
    systemPrompt: ANAM_SYSTEM_PROMPT,
    skipGreeting: true,
  }),
});

const data = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`Failed to update persona (${res.status}):`, data?.message || data);
  process.exit(1);
}

console.log(`Persona ${PERSONA_ID} updated: systemPrompt set, skipGreeting=true.`);
