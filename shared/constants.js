const EVENTS = {
  UPDATE_PLAYER: 'update_player',
  STATE_SYNC:    'state_sync',
  PLAYER_RESET:  'player_reset',
  LEAD_CHANGE:   'lead_change',
  FALL:          'fall',
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
  module.exports = { EVENTS, PLAYERS, MAX_HEIGHT, DEFAULT_STATE };
}
