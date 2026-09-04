// One-time (or re-run-on-change) setup script: pushes ANAM_SYSTEM_PROMPT
// onto the Anam Lab persona identified by ANAM_PERSONA_ID. Not called at
// server boot — the persona's system prompt only needs updating when the
// prompt text itself changes, not on every deploy.
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
  // A partial update — only systemPrompt changes; avatarId/voiceId/etc. on
  // the persona are left exactly as configured in Anam Lab.
  body: JSON.stringify({ systemPrompt: ANAM_SYSTEM_PROMPT }),
});

const data = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`Failed to update persona (${res.status}):`, data?.message || data);
  process.exit(1);
}

console.log(`Persona ${PERSONA_ID} systemPrompt updated.`);
