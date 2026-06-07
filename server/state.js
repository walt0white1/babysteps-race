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
// État de chute par joueur (machine à états)
const fallState = {
  playerA: { isFalling: false, peak: 0, bottom: 0, lastDropT: 0, startT: 0 },
  playerB: { isFalling: false, peak: 0, bottom: 0, lastDropT: 0, startT: 0 },
};
const FALL_THRESHOLD  = 150;   // ~5m affiches : seuil minimum d'amplitude
const FALL_RECOVERY   = 30;    // 1m remonte = chute consideree finie
const FALL_TIMEOUT_MS = 2500;  // immobile 2.5s = chute finie
const FALL_MIN_SPEED  = 90;    // unites/seconde (~3 m/s avec SCALE=30) : filtre descentes volontaires

function updatePlayer(playerId, { height, name, maxHeight }) {
  const player = state[playerId];
  if (!player) return { leadChanged: false, newLeader: null, fell: false, drop: 0 };

  let fell = false;
  let drop = 0;

  if (name !== undefined) player.name = name;
  if (height !== undefined) {
    const prev = player.height;
    player.height = Math.max(0, height);
    const curr = player.height;
    const now  = Date.now();
    const fs   = fallState[playerId];

    if (!fs.isFalling) {
      // Pas en chute. Si on commence à perdre de la hauteur, on démarre l'état chute
      if (prev - curr > 0) {
        fs.isFalling = true;
        fs.peak      = prev;
        fs.bottom    = curr;
        fs.lastDropT = now;
        fs.startT    = now;
      }
    } else {
      // En chute. On suit le point le plus bas atteint
      if (curr < fs.bottom) {
        fs.bottom    = curr;
        fs.lastDropT = now;
      }
      // Conditions de FIN de chute :
      // - le joueur remonte au-dessus du bottom (>= recovery)
      // - OU il est immobile près du bas depuis FALL_TIMEOUT_MS
      const recovered = curr - fs.bottom >= FALL_RECOVERY;
      const stalled   = now - fs.lastDropT >= FALL_TIMEOUT_MS;
      if (recovered || stalled) {
        const totalDrop = fs.peak - fs.bottom;
        const durationS = Math.max(0.001, (fs.lastDropT - fs.startT) / 1000);
        const speed     = totalDrop / durationS;   // unites/seconde
        // Vraie chute = amplitude ≥ 5m ET vitesse ≥ 3 m/s
        if (totalDrop >= FALL_THRESHOLD && speed >= FALL_MIN_SPEED) {
          player.falls += 1;
          fell = true;
          drop = totalDrop;
        }
        fs.isFalling = false;
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
