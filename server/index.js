const express   = require('express');
const http      = require('http');
const { Server } = require('socket.io');
const cors      = require('cors');
const path      = require('path');

const state  = require('./state');
const { EVENTS } = require('../shared/constants');

const PORT = process.env.PORT || 3001;

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Serve overlay and tracker-client as static files
app.use('/overlay',        express.static(path.join(__dirname, '../overlay')));
app.use('/tracker-client', express.static(path.join(__dirname, '../tracker-client')));
app.use('/shared',         express.static(path.join(__dirname, '../shared')));
app.use('/admin',          express.static(path.join(__dirname, '../admin')));

// ─── REST endpoints ──────────────────────────────────────────────────────────

app.get('/api/state', (_req, res) => {
  res.json(state.getState());
});

app.post('/api/update', (req, res) => {
  const { playerId, height, name, maxHeight } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const { leadChanged, newLeader } = state.updatePlayer(playerId, { height, name, maxHeight });

  const full = state.getState();
  io.emit(EVENTS.STATE_SYNC, full);

  if (leadChanged) {
    io.emit(EVENTS.LEAD_CHANGE, { leader: newLeader, state: full });
  }

  res.json({ ok: true, state: full });
});

app.post('/api/fall', (req, res) => {
  const { playerId } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  state.recordFall(playerId);

  const full = state.getState();
  io.emit(EVENTS.STATE_SYNC, full);
  io.emit(EVENTS.FALL, { playerId, state: full });

  res.json({ ok: true, state: full });
});

app.post('/api/admin/set', (req, res) => {
  const { playerId, ...fields } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  state.adminSet(playerId, fields);
  const full = state.getState();
  io.emit(EVENTS.STATE_SYNC, full);
  res.json({ ok: true, state: full });
});

app.post('/api/reset', (req, res) => {
  const { playerId } = req.body;

  if (playerId) {
    state.resetPlayer(playerId);
  } else {
    state.resetAll();
  }

  const full = state.getState();
  io.emit(EVENTS.STATE_SYNC, full);

  res.json({ ok: true, state: full });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[WS] client connected: ${socket.id}`);

  // Send current state immediately on connect
  socket.emit(EVENTS.STATE_SYNC, state.getState());

  socket.on(EVENTS.UPDATE_PLAYER, (data) => {
    const { playerId, height, name } = data;
    if (!playerId) return;

    const { leadChanged, newLeader } = state.updatePlayer(playerId, { height, name });
    const full = state.getState();

    io.emit(EVENTS.STATE_SYNC, full);
    if (leadChanged) {
      io.emit(EVENTS.LEAD_CHANGE, { leader: newLeader, state: full });
    }
  });

  socket.on(EVENTS.FALL, (data) => {
    const { playerId } = data;
    if (!playerId) return;
    state.recordFall(playerId);
    io.emit(EVENTS.STATE_SYNC, state.getState());
    io.emit(EVENTS.FALL, { playerId, state: state.getState() });
  });

  socket.on(EVENTS.PLAYER_RESET, (data) => {
    const { playerId } = data;
    if (playerId) state.resetPlayer(playerId);
    else          state.resetAll();
    io.emit(EVENTS.STATE_SYNC, state.getState());
  });

  socket.on('disconnect', () => {
    console.log(`[WS] client disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🚀  Baby Steps server running on http://localhost:${PORT}`);
  console.log(`   Overlay   → http://localhost:${PORT}/overlay`);
  console.log(`   Tracker A → http://localhost:${PORT}/tracker-client?player=playerA`);
  console.log(`   Tracker B → http://localhost:${PORT}/tracker-client?player=playerB\n`);
});
