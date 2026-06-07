const { DEFAULT_STATE, DEFAULT_CONFIG } = require('../shared/constants');
const fs   = require('fs');
const path = require('path');

const STATE_FILE  = path.join(__dirname, 'state.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// ─── STATE ────────────────────────────────────────────────────────────────
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
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8'); } catch (e) {}
}

let state = loadState();
let previousLeader = null;
setInterval(saveState, 30000);

// ─── CONFIG (live tunable) ────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log('[Config] Reprise depuis config.json');
      return { ...DEFAULT_CONFIG, ...saved };  // merge avec defaults au cas ou
    }
  } catch (e) {}
  return { ...DEFAULT_CONFIG };
}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8'); } catch (e) {}
}
let config = loadConfig();

function getConfig() { return config; }
function updateConfig(patch) {
  config = { ...config, ...patch };
  saveConfig();
  return config;
}

// ─── GETTERS ──────────────────────────────────────────────────────────────
function getState()                 { return state; }
function getPlayer(playerId)        { return state[playerId] || null; }

// ─── FALL DETECTION (machine à états, lit la config en live) ──────────────
const fallState = {
  playerA: { isFalling: false, peak: 0, bottom: 0, lastDropT: 0, startT: 0 },
  playerB: { isFalling: false, peak: 0, bottom: 0, lastDropT: 0, startT: 0 },
};

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
      if (prev - curr > 0) {
        fs.isFalling = true;
        fs.peak      = prev;
        fs.bottom    = curr;
        fs.lastDropT = now;
        fs.startT    = now;
      }
    } else {
      if (curr < fs.bottom) {
        fs.bottom    = curr;
        fs.lastDropT = now;
      }
      const recovered = curr - fs.bottom >= config.fallRecovery;
      const stalled   = now - fs.lastDropT >= config.fallTimeoutMs;
      if (recovered || stalled) {
        const totalDrop = fs.peak - fs.bottom;
        const durationS = Math.max(0.001, (fs.lastDropT - fs.startT) / 1000);
        const speed     = totalDrop / durationS;
        if (totalDrop >= config.fallThreshold && speed >= config.fallMinSpeed) {
          player.falls += 1;
          fell = true;
          drop = totalDrop;
        }
        fs.isFalling = false;
      }
    }
  }
  if (maxHeight !== undefined) {
    player.maxHeight = Math.max(player.maxHeight, maxHeight);
  } else if (height !== undefined && player.height > player.maxHeight) {
    player.maxHeight = player.height;
  }

  player.online     = true;
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
  state[playerId] = JSON.parse(JSON.stringify(DEFAULT_STATE[playerId]));
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
  getConfig,
  updateConfig,
};
