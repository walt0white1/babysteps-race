const EVENTS = {
  UPDATE_PLAYER: 'update_player',
  STATE_SYNC:    'state_sync',
  PLAYER_RESET:  'player_reset',
  LEAD_CHANGE:   'lead_change',
  FALL:          'fall',
  CONFIG_SYNC:   'config_sync',
};

// Configuration tunable via admin
const DEFAULT_CONFIG = {
  scale: 30,                 // unites brutes par metre affiche
  fallThreshold: 150,        // ampleur minimum (unites) pour qu'une chute compte
  fallMinSpeed: 90,          // vitesse minimum (unites/s) pour qu'une chute compte
  fallRecovery: 30,          // remontee (unites) qui termine la chute
  fallTimeoutMs: 2500,       // immobilite (ms) qui termine la chute
  milestoneStep: 100,        // tous les X metres affiches = popup milestone
  cycleDuoSec: 6,            // duree affichage duo (s)
  cycleOppSec: 5,
  cycleFallsSec: 5,
};

const PLAYERS = {
  A: 'playerA',
  B: 'playerB',
};

// Max height in the game (meters) — adjust as needed
const MAX_HEIGHT = 1200;

const DEFAULT_STATE = {
  playerA: {
    id:        'playerA',
    name:      'Player A',
    height:    0,
    maxHeight: 0,
    falls:     0,
    online:    false,
    lastUpdate: null,
  },
  playerB: {
    id:        'playerB',
    name:      'Player B',
    height:    0,
    maxHeight: 0,
    falls:     0,
    online:    false,
    lastUpdate: null,
  },
};

if (typeof module !== 'undefined') {
  module.exports = { EVENTS, PLAYERS, MAX_HEIGHT, DEFAULT_STATE, DEFAULT_CONFIG };
}
