import { gameState } from '../save/gameState.js';
import { storyState } from '../story/state.js';
import { UPGRADES } from '../submarine/stats.js';
import { getFloorHeight, canyonCenter } from '../world/seabed.js';
import fragmentsData from '../story/fragments.json';
import { RADIATION, SUBMARINE, AIR_BELLS, ROOFS } from '../config/settings.js';
import { MARIE } from '../world/landmarks.js';

/**
 * Commandes de test, à taper dans la console du navigateur (F12) : nautiliar.dev.aide()
 * Avec ?dev dans l'adresse (ou F9), un petit panneau propose les mêmes en boutons.
 */
const S = RADIATION.SOURCE;
const cc = canyonCenter;
/** Lieux : [x, hauteur au-dessus du fond (ou y absolu si négatif), z, cap, description] */
const PLACES = {
  depart: [SUBMARINE.SPAWN.x, SUBMARINE.SPAWN.y, SUBMARINE.SPAWN.z, Math.PI, 'Le point de départ, sous le port'],
  arche: [-72, 5, -79, 0.97, "Récif : l'arche de roche et son tunnel"],
  cloche: [AIR_BELLS.SPOTS[0][0] + 9, 7, AIR_BELLS.SPOTS[0][1] + 9, -2.36, 'Une cloche à air'],
  epaves: [-40, 9, -212, Math.PI, 'Les Épaves : un chalutier'],
  massif: [-37, 6, -313, 1.97, 'Épaves : le massif percé'],
  porche: [cc(-580), 14, -580, Math.PI, 'Canyon : le Porche (première voûte)'],
  filets: [cc(-652) + 2, 8, -652, Math.PI, 'Canyon : la forêt de filets'],
  marie: [cc(MARIE.z) + 16, 16, MARIE.z + 6, -1.75, 'Canyon : la Marie-Morgane'],
  sousmarin: [cc(MARIE.z - 10) + 12, 5, MARIE.z - 4, -2.3, 'Canyon : le petit sous-marin pris dans les mailles (et le couteau)'],
  nef: [cc(-738), 12, -738, Math.PI, 'Canyon : la Nef (grande voûte, squelette de baleine)'],
  tunnel: [-43, 7, -947, 0.47, 'Abysses : le massif percé'],
  chambre: [-18, 20, -962, -2.4, 'Abysses : la Chambre engloutie (le lit, la potence, la porte 112)'],
  porte: [2, 14, S.z + 110, Math.PI, 'Abysses : la porte 112, sur le chemin de la faille'],
  faille: [0, 12, S.z + 27, Math.PI, 'La faille'],
};

export function installDevCommands(n) {
  const game = () => n.game, dive = () => n.dive;
  const say = (t) => { console.log(`%c[Nautiliar] ${t}`, 'color:#7fd0c0'); const el = document.getElementById('dev-msg'); if (el) el.textContent = t; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let god = false;

  const dev = {
    aide() {
      console.log(`%cCommandes de test Nautiliar
  nautiliar.dev.souvenirs()      les 8 souvenirs, coque abyssale, tout l'équipement, 99 999 F → prêt pour la fin
  nautiliar.dev.souvenirs(5)     seulement les 5 premiers (pour tester « Le Réveil »)
  nautiliar.dev.equipement()     tout l'équipement et la coque abyssale, sans toucher aux souvenirs
  nautiliar.dev.fin()            va droit devant la faille (ensuite : E pour lui faire face)
  nautiliar.dev.lieux()          liste des lieux
  nautiliar.dev.aller('marie')   se téléporter à un lieu (lance la plongée si besoin, rend invincible)
  nautiliar.dev.aller(x, z, h)   … ou à des coordonnées (h = hauteur au-dessus du fond, 8 par défaut)
  nautiliar.dev.souvenir('couteau')  rejoue un souvenir (le couteau lance la séquence jouable, en plongée)
  nautiliar.dev.baleine()        rejoint la baleine
  nautiliar.dev.invincible(false) redevient vulnérable
  nautiliar.dev.position()       où suis-je ? (x, z, profondeur)
  nautiliar.dev.effacer()        efface la partie et les fins vues
Carte 3D du monde : ouvrir carte.html`, 'color:#e2c98c');
    },

    /** Tous les souvenirs (ou les n premiers), l'équipement au maximum : il ne reste qu'à descendre */
    souvenirs(count = 8) {
      storyState.fragments = fragmentsData.fragments.slice(0, count).map((f) => f.id);
      dev.equipement(false);
      say(`${count} souvenir(s), coque abyssale, équipement au maximum. Rechargement…`);
      game().persist();
      setTimeout(() => location.reload(), 400);
    },

    equipement(reload = true) {
      for (const c of UPGRADES) gameState.upgrades[c.id] = c.levels.length - 1;
      gameState.money = Math.max(gameState.money, 99999);
      storyState.abyssalHull = true;
      storyState.flags.introDone = true;
      storyState.flags.subGiven = true;
      if (reload) { say('Équipement au maximum. Rechargement…'); game().persist(); setTimeout(() => location.reload(), 400); }
    },

    lieux() {
      console.table(Object.fromEntries(Object.entries(PLACES).map(([k, v]) => [k, v[4]])));
      return Object.keys(PLACES);
    },

    invincible(on = true) {
      const s = dive().survival;
      if (on && !god) { s._update = s.update; s._damage = s.damage; s.update = function (dt, sub) { this._update(dt, sub); this.oxygen = this.stats.oxygenMax; this.hull = this.stats.hullMax ?? this.hull; this.dead = false; }; s.damage = () => {}; }
      if (!on && god) { s.update = s._update; s.damage = s._damage; }
      god = on;
      say(on ? 'Invincible (air et coque ne baissent plus).' : 'Vulnérable.');
    },

    async aller(a, z, h = 8) {
      let p;
      if (typeof a === 'string') { p = PLACES[a]; if (!p) return say(`Lieu inconnu. Lieux : ${Object.keys(PLACES).join(', ')}`); }
      else p = [a, h, z, dive().sub.yaw, `x ${a}, z ${z}`];
      const g = game();
      if (g.inMenu) return say("Lance d'abord la partie (Continuer / Nouvelle partie).");
      if (g.mode !== 'dive') { g.goDive(); await wait(2600); }
      dev.invincible(true);
      const d = dive(), y = p[1] < 0 ? p[1] : getFloorHeight(p[0], p[2]) + p[1];
      d.sub.teleport(p[0], Math.min(-3, y), p[2], p[3]);
      d.follow.snap(d.sub);
      d.cockpitCam.reset();
      say(`${p[4]} — invincible.`);
    },

    async fin() {
      await dev.aller('faille');
      say('Devant la faille : avance un peu, puis E (« Faire face à la lumière »). Il faut la coque abyssale : nautiliar.dev.souvenirs() d\'abord.');
    },

    async baleine() {
      await dev.aller('porche');
      const d = dive(), w = d.whale.pos;
      d.sub.teleport(w.x + 22, w.y - 4, w.z + 14, Math.atan2(-22, -14));
      d.follow.snap(d.sub);
      say('À côté de la baleine.');
    },

    /** Rejoue un souvenir par son identifiant (photo, alliance, montre, carnet, plaque, couteau, enfance, soins) */
    souvenir(id) {
      if (!fragmentsData.fragments.some((f) => f.id === id)) return say(`Souvenirs : ${fragmentsData.fragments.map((f) => f.id).join(', ')}`);
      if (id === 'couteau' && game().mode === 'dive') game().foundFragment(id);
      else game().showMemory(id, game().mode === 'dive');
    },

    position() {
      const d = dive().sub.position;
      const out = { x: Math.round(d.x), z: Math.round(d.z), profondeur: Math.round(-d.y), 'au-dessus du fond': Math.round(d.y - getFloorHeight(d.x, d.z)) };
      say(JSON.stringify(out));
      return out;
    },

    effacer() {
      localStorage.clear();
      location.reload();
    },

    /** Panneau de boutons (aussi : ?dev dans l'adresse, ou F9) */
    panneau() {
      let el = document.getElementById('dev-panel');
      if (el) { el.remove(); return; }
      el = document.createElement('div');
      el.id = 'dev-panel';
      el.style.cssText = 'position:fixed;top:60px;right:12px;z-index:99;width:210px;max-height:80vh;overflow:auto;padding:10px;background:rgba(6,16,20,.88);border:1px solid rgba(190,220,210,.25);border-radius:4px;font:14px "Barlow Condensed",sans-serif;color:#d3e2dc;letter-spacing:.04em;cursor:default';
      const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'display:block;width:100%;margin:3px 0;padding:4px 8px;text-align:left;background:rgba(190,220,210,.08);border:1px solid rgba(190,220,210,.2);color:inherit;font:inherit;cursor:pointer'; b.onclick = (e) => { e.stopPropagation(); b.blur(); fn(); }; el.appendChild(b); };
      const title = (t) => { const h = document.createElement('div'); h.textContent = t; h.style.cssText = 'margin:8px 0 2px;font-size:11px;letter-spacing:.25em;color:#7fa39c'; el.appendChild(h); };
      title('TEST');
      btn('8 souvenirs + tout l\'équipement', () => dev.souvenirs(8));
      btn('5 souvenirs + tout l\'équipement', () => dev.souvenirs(5));
      btn('Devant la faille', () => dev.fin());
      btn('Rejoindre la baleine', () => dev.baleine());
      btn('Invincible : oui / non', () => dev.invincible(!god));
      btn('Ouvrir la carte 3D', () => window.open('carte.html', '_blank'));
      title('LIEUX');
      for (const [k, v] of Object.entries(PLACES)) btn(v[4], () => dev.aller(k));
      title('SOUVENIRS');
      for (const f of fragmentsData.fragments) btn(`${f.title}`, () => dev.souvenir(f.id));
      const msg = document.createElement('div');
      msg.id = 'dev-msg';
      msg.style.cssText = 'margin-top:8px;color:#e2c98c;font-size:13px;min-height:2.4em';
      el.appendChild(msg);
      for (const ev of ['pointerdown', 'mousedown', 'click', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
      document.body.appendChild(el);
    },
  };
  n.dev = dev;
  window.addEventListener('keydown', (e) => { if (e.code === 'F9') { e.preventDefault(); dev.panneau(); } });
  if (new URLSearchParams(location.search).has('dev')) dev.panneau();
  void ROOFS;
}
