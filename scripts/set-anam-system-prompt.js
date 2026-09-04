// One-time (or re-run-on-change) setup script: pushes the persona config
// onto the Anam Lab persona identified by ANAM_PERSONA_ID. Not called at
// server boot — this only needs re-running when the config below changes.
//
// llmId: 'CUSTOMER_CLIENT_V1' is the important one — this whole app never
// needs Anam's own LLM to generate anything: every word the persona speaks
// (greeting, sankalp, mantras, havan, closing) is a fixed line built in
// src/config.js and sent verbatim via talk(). skipGreeting alone wasn't
// enough to stop it — Anam's underlying LLM could still take an autonomous
// first turn independent of that flag, and a foundation model's own safety
// training can make it disclose being an AI on its own initiative even when
// a system prompt explicitly tells it not to. Disabling the LLM entirely
// removes that risk at the source: with no LLM configured, the persona is
// pure avatar+voice and can only ever say what a talk() call gives it.
//
// systemPrompt/skipGreeting are left in place too (harmless, and useful if
// this persona's LLM is ever re-enabled for something else later).
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
  // A partial update — only these fields change; avatarId/voiceId/etc. on
  // the persona are left exactly as configured in Anam Lab.
  body: JSON.stringify({
    systemPrompt: ANAM_SYSTEM_PROMPT,
    skipGreeting: true,
    llmId: 'CUSTOMER_CLIENT_V1',
  }),
});

const data = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`Failed to update persona (${res.status}):`, data?.message || data);
  process.exit(1);
}

console.log(`Persona ${PERSONA_ID} updated: systemPrompt set, skipGreeting=true, LLM disabled (talk()-only).`);
