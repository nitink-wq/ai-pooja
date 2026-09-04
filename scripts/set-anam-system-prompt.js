// One-time (or re-run-on-change) setup script: pushes ANAM_SYSTEM_PROMPT and
// skipGreeting onto the Anam Lab persona identified by ANAM_PERSONA_ID. Not
// called at server boot — this only needs re-running when the prompt text
// changes, not on every deploy.
//
// skipGreeting matters as much as the prompt itself: Anam defaults to
// speaking its own auto-generated opening line the instant a session
// connects, BEFORE this app ever calls talk() with the scripted greeting
// (buildFlow's first segment, in src/config.js). With no initialMessage set,
// that auto-greeting is improvised by the LLM — which is what was producing
// generic "I'm an AI avatar" disclosure lines ahead of the correct, scripted
// pooja. Turning it off leaves our own scripted greeting as the only thing
// spoken at call start.
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
  // A partial update — only systemPrompt/skipGreeting change; avatarId/
  // voiceId/etc. on the persona are left exactly as configured in Anam Lab.
  body: JSON.stringify({ systemPrompt: ANAM_SYSTEM_PROMPT, skipGreeting: true }),
});

const data = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`Failed to update persona (${res.status}):`, data?.message || data);
  process.exit(1);
}

console.log(`Persona ${PERSONA_ID} updated: systemPrompt set, skipGreeting=true.`);
