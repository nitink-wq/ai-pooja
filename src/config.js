// Pooja catalogue: the single source of truth for what's offered and its
// price. Both the client (cards) and the server (order amount, Anam session
// prompt) read from here, so a price or copy change never has to touch logic.
// `script` is spoken verbatim by the Anam persona via talk() — bypasses the
// LLM entirely, so this is the actual ritual wording, not a prompt. {{name}}
// is substituted with the devotee's name (see services/anam.js). Every
// PLACEHOLDER script below is a stand-in only — swap in the real invocation/
// mantra/blessing text before this goes live; do not ship placeholder text.
export const POOJAS = [
  {
    id: 'navgraha-shanti',
    name: 'Navgraha Shanti Pooja',
    description: 'Pacify the nine planetary forces and clear the obstacles they are casting on your life.',
    priceInr: 299,
    ritualContext: 'a Navgraha Shanti Pooja, performed to pacify the nine planets (Navgraha) and remove the obstacles caused by unfavourable planetary positions',
    // PLACEHOLDER — replace with the real Navgraha Shanti invocation/mantra/blessing.
    script: 'Om, welcome {{name}}. Let us begin the Navgraha Shanti Pooja together. [PLACEHOLDER SCRIPT — replace with the real invocation, mantra, and closing blessing for this pooja.]',
  },
  {
    id: 'buri-nazar-nivarn',
    name: 'Buri Nazar Nivaran Pooja',
    description: 'Remove the evil eye and negative energy that is blocking your peace, health or progress.',
    priceInr: 399,
    ritualContext: 'a Buri Nazar Nivaran Pooja, performed to remove the evil eye (buri nazar) and negative energy affecting the devotee',
    // PLACEHOLDER — replace with the real Buri Nazar Nivaran invocation/mantra/blessing.
    script: 'Om, welcome {{name}}. Let us begin the Buri Nazar Nivaran Pooja together. [PLACEHOLDER SCRIPT — replace with the real invocation, mantra, and closing blessing for this pooja.]',
  },
  {
    id: 'prem-milan',
    name: 'Prem Milan Pooja',
    description: 'Invoke divine blessings to resolve conflicts and bring harmony into your relationship.',
    priceInr: 249,
    ritualContext: 'a Prem Milan Pooja, performed to invoke divine blessings for harmony, understanding and reunion in a relationship',
    // PLACEHOLDER — replace with the real Prem Milan invocation/mantra/blessing.
    script: 'Om, welcome {{name}}. Let us begin the Prem Milan Pooja together. [PLACEHOLDER SCRIPT — replace with the real invocation, mantra, and closing blessing for this pooja.]',
  },
];

export function findPooja(id) {
  return POOJAS.find((p) => p.id === id) || null;
}
