# AI Pooja

Self-serve flow: pick a pooja → pay via Razorpay → fill a short form → get
live-connected to an Anam.ai AI-avatar purohit who performs the ritual with
you, by name.

Stateless Node/Express server + a vanilla-JS webview client, matching the
other AstroLokal surfaces in this workspace. No database — a devotee's
details live only in the browser tab's memory for the duration of the call
and are never logged or persisted server-side.

## Run locally

```
npm install
npm run dev          # http://localhost:3000
```

Without any env vars set, both payment and the avatar call run in **mock
mode** — the whole flow (select → pay → form → call → complete) is
click-through-able with no external services or keys.

## Env vars

| Var | Required for | Notes |
|---|---|---|
| `PORT` | — | Defaults to `3000` |
| `RAZORPAY_KEY_ID` | real payment | Public key id, also sent to the client for Checkout.js. Use a `rzp_test_...` key first. |
| `RAZORPAY_KEY_SECRET` | real payment | Private — used server-side only to create orders and verify payment signatures. |
| `ANAM_API_KEY` | real avatar call | Private — used server-side only to mint short-lived session tokens. Never sent to the client. |
| `ANAM_PERSONA_ID` | real avatar call | The persona built in Anam Lab — bundles its avatar, voice and base system prompt. |
| `ANAM_VOICE_ID` | documentation only | ElevenLabs voice this persona uses. Already configured on the persona in Anam Lab; not sent in our API calls. |
| `ANAM_VOICE_MODEL_ID` | documentation only | ElevenLabs voice model (e.g. `eleven_multilingual_v2`) this persona uses. Same as above — recorded for reference. |

Set `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` to turn on real Razorpay
checkout. Set `ANAM_API_KEY` + `ANAM_PERSONA_ID` to turn on the real Anam.ai
call. Each pair is independent, so you can confirm Razorpay end-to-end before
touching Anam, or vice versa — `GET /api/mode` reports which mode each is
currently in.

Copy `.env.example` to `.env` — `npm run dev` / `npm start` load it automatically
(via Node's `--env-file-if-exists`) — or set the vars in `docker-compose.yml` /
the Devtron secret (`k8s/secret.example.yaml`).

## Architecture

- [src/server.js](src/server.js) — routes only: pooja catalogue, order
  create/verify, Anam session create. No business logic beyond request
  validation and the payment-proof token (see below).
- [src/config.js](src/config.js) — the pooja catalogue (name, description,
  price, ritual context for the AI prompt). Single source of truth for both
  client cards and server-side pricing/prompting.
- [src/services/razorpay.js](src/services/razorpay.js) — all Razorpay HTTP
  calls and signature verification. Swap keys or provider here only.
- [src/services/anam.js](src/services/anam.js) — the Anam.ai session-token
  call (stateful, via `ANAM_PERSONA_ID`) and the per-call context string
  (pooja + devotee details) the client feeds in via `addContext()` once
  connected. The persona's voice/avatar/base prompt live in Anam Lab, not
  here. Swap the persona id or provider here only.
- [public/](public/) — the client: `index.html` (markup for every screen),
  `styles.css` (AstroLokal brand palette/fonts, mobile-first), `app.js`
  (screen state machine, fetch calls, Razorpay Checkout.js + Anam JS SDK
  wiring).

### Payment → call handoff without a database

There's no DB, so "has this browser tab paid?" can't be a row lookup. Once
`/api/payment/verify` confirms Razorpay's signature, the server mints a
short-lived HMAC-signed token (`payToken`, 30 min TTL) scoped to that
pooja + order + payment id. `/api/anam/session` refuses to start a call
without a valid one. This is server-authoritative (the client can't forge a
token without the server's per-process secret) without needing storage.

### Mock mode

Each integration degrades independently and automatically:
- No Razorpay keys → `/api/payment/order` returns a fake order and
  `/api/payment/verify` always succeeds. The client shows a "Test mode: no
  real payment will be charged" notice.
- No `ANAM_API_KEY` → `/api/anam/session` returns a fake token and the
  client shows a simulated call screen instead of loading the Anam SDK.

This is what lets the flow be scaffolded, clicked through, and demoed before
either provider's real credentials exist — and it's live-swappable per
integration with no code changes, only env vars.

## Deploy

`Dockerfile` / `docker-compose.yml` for local container runs; `k8s/` for
Devtron — same shape as the other apps in this workspace (`deployment.yaml`
+ `secret.example.yaml`, readiness on `/readyz`, liveness on `/healthz`).
