const { DEFAULT_STATE } = require('../shared/constants');
const fs   = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');

// Charge depuis le fichier si il existe, sinon état par défaut
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      console.log('[State] Reprise depuis state.json');
      return saved;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

let state = loadState();
let previousLeader = null;

// Sauvegarde toutes les 30 secondes
setInterval(saveState, 30000);

function getState() {
  return state;
}

function getPlayer(playerId) {
  return state[playerId] || null;
}

/**
 * Update a player's height.
 * Returns { leadChanged, newLeader } so the caller can emit events.
 */
// Historique par joueur : [{t, h}, ...] sur les 2 dernieres secondes
const heightHistory = { playerA: [], playerB: [] };
// Cooldown anti-spam: pas de nouvelle chute pendant 2s apres une detection
const fallCooldown = { playerA: 0, playerB: 0 };
const FALL_WINDOW_MS  = 2000;
const FALL_THRESHOLD  = 150;     // ~5m affiches (avec SCALE=30)

function updatePlayer(playerId, { height, name, maxHeight }) {
  const player = state[playerId];
  if (!player) return { leadChanged: false, newLeader: null, fell: false, drop: 0 };

  let fell = false;
  let drop = 0;

  if (name !== undefined) player.name = name;
  if (height !== undefined) {
    player.height = Math.max(0, height);

    // ── Detection chute sur fenetre glissante de 2s ──
    const now = Date.now();
    const hist = heightHistory[playerId];
    hist.push({ t: now, h: player.height });
    // garde uniquement les samples des 2 dernieres secondes
    while (hist.length > 1 && now - hist[0].t > FALL_WINDOW_MS) hist.shift();

    if (now >= fallCooldown[playerId]) {
      // hauteur max sur la fenetre (le "haut" de la chute)
      let peak = hist[0].h;
      for (const s of hist) if (s.h > peak) peak = s.h;
      const totalDrop = peak - player.height;
      if (totalDrop >= FALL_THRESHOLD) {
        player.falls += 1;
        fell = true;
        drop = totalDrop;
        fallCooldown[playerId] = now + FALL_WINDOW_MS;  // anti-spam
      }
    }
  }
  // maxHeight peut etre envoye directement par le tracker (record depuis le fichier)
  if (maxHeight !== undefined) {
    player.maxHeight = Math.max(player.maxHeight, maxHeight);
  } else if (height !== undefined && player.height > player.maxHeight) {
    player.maxHeight = player.height;
  }

  player.online    = true;
  player.lastUpdate = Date.now();

  const leadChanged = checkLeadChange();
  saveState();
  return { leadChanged, newLeader: getLeader(), fell, drop };
}

function recordFall(playerId) {
  const player = state[playerId];
  if (!player) return;
  player.falls += 1;
  player.lastUpdate = Date.now();
  saveState();
}

function resetPlayer(playerId) {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_STATE[playerId]));
  state[playerId] = defaults;
  checkLeadChange();
}

function resetAll() {
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  previousLeader = null;
}

function getLeader() {
  const a = state.playerA.height;
  const b = state.playerB.height;
  if (a === b) return 'tie';
  return a > b ? 'playerA' : 'playerB';
}

function checkLeadChange() {
  const current = getLeader();
  if (current !== previousLeader) {
    previousLeader = current;
    return true;
  }
  return false;
}

// Set any field directly (admin)
function adminSet(playerId, fields) {
  const player = state[playerId];
  if (!player) return;
  if (fields.name      !== undefined) player.name      = fields.name;
  if (fields.height    !== undefined) player.height    = Math.max(0, fields.height);
  if (fields.maxHeight !== undefined) player.maxHeight = Math.max(0, fields.maxHeight);
  if (fields.falls     !== undefined) player.falls     = Math.max(0, fields.falls);
  player.lastUpdate = Date.now();
  checkLeadChange();
  saveState();
}

module.exports = {
  getState,
  getPlayer,
  updatePlayer,
  recordFall,
  resetPlayer,
  resetAll,
  getLeader,
  adminSet,
};
