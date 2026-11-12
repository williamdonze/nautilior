import data from './dialogues.json';
import { storyState, storyValue } from './state.js';

/**
 * Moteur de dialogues : choisit la conversation adaptée à l'état narratif
 * et applique ses effets (drapeaux, conversations vues).
 */
export const NPCS = data.npcs;

/** Vérifie une condition { drapeau: valeur, variableMin: n, variableMax: n } */
export function matches(when = {}) {
  for (const [key, expected] of Object.entries(when)) {
    if (key.endsWith('Min')) {
      if (Number(storyValue(key.slice(0, -3))) < expected) return false;
    } else if (key.endsWith('Max')) {
      if (Number(storyValue(key.slice(0, -3))) > expected) return false;
    } else if (Boolean(storyValue(key)) !== expected) {
      return false;
    }
  }
  return true;
}

/** Clé « déjà vue » d'une conversation (tient compte de oncePer) */
function seenKey(conv) {
  if (conv.oncePer) return `${conv.id}:${storyValue(conv.oncePer)}`;
  return conv.id;
}

/** Conversation à jouer pour un personnage */
export function pickConversation(npcId) {
  const npc = NPCS[npcId];
  if (!npc) return null;
  const candidates = npc.conversations.filter(
    (c) => matches(c.when) && !((c.once || c.oncePer) && storyState.seen.includes(seenKey(c)))
  );
  if (!candidates.length) return null;
  const best = Math.max(...candidates.map((c) => c.priority ?? 0));
  const top = candidates.filter((c) => (c.priority ?? 0) === best);
  return top[Math.floor(Math.random() * top.length)];
}

export function markSeen(conv) {
  if (!(conv.once || conv.oncePer)) return;
  const key = seenKey(conv);
  if (!storyState.seen.includes(key)) storyState.seen.push(key);
}

/** Pose des drapeaux narratifs */
export function applySet(set) {
  if (set) Object.assign(storyState.flags, set);
}

/** Un texte peut être une liste de variantes */
export function resolveText(text) {
  return Array.isArray(text) ? text[Math.floor(Math.random() * text.length)] : text;
}
