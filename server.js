const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// HTTP server - serves goalie.html (for local dev) and health check
const server = http.createServer((req, res) => {
  // CORS headers for cross-origin WebSocket upgrade
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Serve goalie.html for local development
  const htmlPath = path.join(__dirname, 'goalie.html');
  if (fs.existsSync(htmlPath) && (req.url === '/' || req.url === '/index.html' || req.url === '/goalie.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(htmlPath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket server - handles multiplayer
const wss = new WebSocketServer({ server });

let waitingPlayer = null;
const matches = new Map(); // ws -> { opponent, playerNum }

wss.on('connection', (ws) => {
  console.log('Player connected');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'find_match') {
      if (waitingPlayer && waitingPlayer.readyState === 1) {
        // Pair them
        const p1 = waitingPlayer;
        const p2 = ws;
        waitingPlayer = null;

        matches.set(p1, { opponent: p2, playerNum: 1 });
        matches.set(p2, { opponent: p1, playerNum: 2 });

        p1.send(JSON.stringify({ type: 'matched', playerNum: 1 }));
        p2.send(JSON.stringify({ type: 'matched', playerNum: 2 }));
        console.log('Match created');
      } else {
        waitingPlayer = ws;
        ws.send(JSON.stringify({ type: 'waiting' }));
        console.log('Player waiting for match');
      }
    }

    if (msg.type === 'game') {
      const match = matches.get(ws);
      if (match && match.opponent.readyState === 1) {
        match.opponent.send(JSON.stringify({ type: 'game', data: msg.data }));
      }
    }
  });

  ws.on('close', () => {
    console.log('Player disconnected');
    if (waitingPlayer === ws) {
      waitingPlayer = null;
    }
    const match = matches.get(ws);
    if (match) {
      if (match.opponent.readyState === 1) {
        match.opponent.send(JSON.stringify({ type: 'opponent_disconnected' }));
      }
      matches.delete(match.opponent);
      matches.delete(ws);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cat Goalie server running on http://localhost:${PORT}`);
  console.log('Open this URL in two browser tabs to play multiplayer!');
  console.log('Server started');
});
