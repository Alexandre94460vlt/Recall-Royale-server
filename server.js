<script src="joy.js"></script>
<script>
// ── State ──────────────────────────────────────────────────
let ws          = null;
let joyX        = 0, joyY = 0;
let playerName = '';
let playerColor = '#7c3aed';
let sabTiles   = [];
let sabChosen  = null;
let GRID_COLS  = 8;
let GRID_ROWS  = 5;
let tutorialMode = '';

// ── Récupération des paramètres de l'URL ──────────
const urlParams = new URLSearchParams(window.location.search);
const serverParam = urlParams.get('server');
const roomParam = urlParams.get('room') ? urlParams.get('room').toUpperCase() : '';

// CORRECTION SÉCURISÉE : On vérifie si l'élément existe avant de changer son texte
const roomTitleEl = document.getElementById('lobby-room-title') || document.querySelector('.lobby-title');
if (roomTitleEl && roomParam) {
  roomTitleEl.textContent = `CTRL//PAD [${roomParam}]`;
}

// ── Screen helper ──────────────────────────────────────────
function showScreen(id) {
  const targetScreen = document.getElementById(id);
  if (targetScreen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    targetScreen.classList.add('active');
  }
}

const tutorialHint = document.getElementById('tutorial-hint');
function showTutorialHint(text) {
  if (tutorialHint) {
    tutorialHint.textContent = text || '';
    tutorialHint.style.display = text ? 'block' : 'none';
  }
}

// ── Lobby ──────────────────────────────────────────────────
const nameInput = document.getElementById('name-input');
const joinBtn   = document.getElementById('join-btn');
const colorInput = document.getElementById('color-input');

function darkenHex(hex, amount = 0.45) {
  const clean = (hex || '#7c3aed').replace('#', '');
  const int = parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, Math.floor(((int >> 16) & 255) * (1 - amount))));
  const g = Math.max(0, Math.min(255, Math.floor(((int >> 8) & 255) * (1 - amount))));
  const b = Math.max(0, Math.min(255, Math.floor((int & 255) * (1 - amount))));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function applyThemeColor(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--cyan', hex);
}

// Sécurisation des écouteurs d'événements pour éviter les plantages si le HTML change
if (colorInput) {
  colorInput.addEventListener('input', () => {
    playerColor = colorInput.value;
    applyThemeColor(playerColor);
  });
}

if (nameInput && joinBtn) {
  nameInput.addEventListener('input', () => {
    joinBtn.disabled = nameInput.value.trim().length === 0;
  });
  
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !joinBtn.disabled) joinGame();
  });
}

if (joinBtn) {
  joinBtn.addEventListener('click', joinGame);
}

function joinGame() {
  if (!nameInput) return;
  playerName = nameInput.value.trim();
  if (!playerName) return;
  
  playerColor = (colorInput ? colorInput.value : '#7c3aed');
  applyThemeColor(playerColor);
  
  const pLabel = document.getElementById('player-label');
  const wLabel = document.getElementById('waiting-label');
  if (pLabel) pLabel.textContent = playerName.toUpperCase();
  if (wLabel) wLabel.textContent = playerName.toUpperCase();
  
  showScreen('game');
  initJoystick();
  connect();
}

// ── Joystick ───────────────────────────────────────────────
let joyInited = false;
function initJoystick() {
  if (joyInited) return;
  
  // On s'assure que la div du joystick existe bel et bien
  if (!document.getElementById('joyDiv')) return;
  
  joyInited = true;
  const stroke = darkenHex(playerColor, 0.45);
  
  new JoyStick('joyDiv', {
    internalFillColor: playerColor, internalStrokeColor: stroke,
    externalStrokeColor: '#2d2d4e', autoReturnToCenter: true
  }, function(s) {
    joyX = parseInt(s.x); joyY = parseInt(s.y);
    const dispX = document.getElementById('disp-x');
    const dispY = document.getElementById('disp-y');
    if (dispX) dispX.textContent = joyX;
    if (dispY) dispY.textContent = joyY;
  });
}

// ── WebSocket ──────────────────────────────────────────────
function getWsUrl() {
  return serverParam || 'wss://recall-royale-server-xqz6.onrender.com';
}

const dotEl    = document.getElementById('dot');
const statusEl = document.getElementById('status-text');

function setStatus(s) {
  if (dotEl) dotEl.classList.toggle('on', s === 'connected');
  if (statusEl) statusEl.textContent = s === 'connected' ? 'ONLINE' : s === 'connecting' ? 'CONNECTING…' : 'OFFLINE';
}

function connect() {
  setStatus('connecting');
  ws = new WebSocket(getWsUrl());
  
  ws.onopen = () => {
    setStatus('connected');
    console.log(`📡 Connecté au serveur relais. Room: ${roomParam}`);
    
    ws.send(JSON.stringify({ 
      type: 'register', 
      role: 'controller', 
      name: playerName, 
      color: playerColor,
      room: roomParam 
    }));
  };
  
  ws.onmessage = e => { 
    try { 
      handleServerMessage(JSON.parse(e.data)); 
    } catch(err) {
      console.error("Erreur lecture message serveur:", err);
    } 
  };
  
  ws.onclose = () => { setStatus('offline'); ws = null; };
  ws.onerror = () => { setStatus('offline'); ws = null; };
}

// ── Handle messages from Godot ─────────────────────────────
function handleServerMessage(msg) {
  console.log('📨 Received:', msg.type, msg);
  
  const sabConfirm = document.getElementById('sab-confirm');
  const sabTitle = document.getElementById('sab-title');
  const sabSub = document.getElementById('sab-sub');
  const lobbyScreen = document.getElementById('lobby');

  switch (msg.type) {
    case 'assign_id':
      console.log('✅ Assigned player ID:', msg.id);
      break;

    case 'player_color':
      if (msg.color) {
        playerColor = msg.color;
        applyThemeColor(playerColor);
      }
      break;

    case 'tutorial_move_start':
      tutorialMode = 'move';
      showScreen('game');
      showTutorialHint(msg.text || 'Tutoriel: bouge ton joystick pour continuer');
      break;

    case 'tutorial_sabotage_start':
      tutorialMode = 'sabotage';
      sabChosen = null;
      if (sabConfirm) sabConfirm.textContent = '';
      if (sabTitle) sabTitle.textContent = 'EXERCICE SABOTAGE';
      if (sabSub) sabSub.innerHTML = 'Choisis n\'importe quelle case.<br/>Cet exercice n\'active aucun piège.';
      buildSaboteurGrid(msg.tiles || [], msg.cols || GRID_COLS, msg.rows || GRID_ROWS);
      showScreen('saboteur-grid-screen');
      showTutorialHint('Tutoriel: tape une case pour valider');
      break;

    case 'tutorial_sabotage_ack':
      if (sabConfirm) sabConfirm.textContent = 'Exercice validé (piège non actif)';
      break;

    case 'tutorial_clear':
      tutorialMode = '';
      if (sabTitle) sabTitle.textContent = 'FAIS TOMBER UNE CASE !';
      if (sabSub) sabSub.innerHTML = 'Cases <span style="color:#f59e0b">⭐ jaunes</span> = bonnes réponses.<br/>Choisis-en une pour la sabotager !';
      showTutorialHint('');
      if (lobbyScreen && !lobbyScreen.classList.contains('active')) {
        showScreen('game');
      }
      break;

    case 'eliminated':
      showScreen('waiting');
      break;

    case 'you_are_saboteur':
      sabChosen = null;
      if (sabConfirm) sabConfirm.textContent = '';
      showScreen('saboteur-announced');
      break;

    case 'saboteur_map':
      buildSaboteurGrid(msg.tiles, GRID_COLS, GRID_ROWS);
      showScreen('saboteur-grid-screen');
      break;

    case 'saboteur_reset':
      sabChosen = null;
      if (sabConfirm) sabConfirm.textContent = '';
      showScreen('waiting');
      break;
    
    case 'new_game':
      tutorialMode = '';
      sabChosen = null;
      joyX = 0;
      joyY = 0;
      showTutorialHint('');
      showScreen('game');
      break;
  }
}

// ── Saboteur grid ──────────────────────────────────────────
function buildSaboteurGrid(correctTiles, cols, rows) {
  GRID_COLS = cols;
  GRID_ROWS = rows;

  const grid = document.getElementById('sab-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  const available = Math.min(window.innerWidth - 24, window.innerHeight - 220);
  const tileSize  = Math.floor(Math.min(available / cols, available / rows)) - 6;
  grid.style.gridTemplateRows = `repeat(${rows}, ${tileSize}px)`;

  const correctSet = new Set(correctTiles.map(t => `${t.x},${t.y}`));
  const allowAll = tutorialMode === 'sabotage';

  sabTiles = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const isCorrect = correctSet.has(`${x},${y}`);
      const canPick = allowAll || isCorrect;
      const tile      = document.createElement('div');
      tile.className  = 'sab-tile' + (isCorrect ? ' correct' : '');
      tile.style.width  = tileSize + 'px';
      tile.style.height = tileSize + 'px';
      tile.dataset.gx = x;
      tile.dataset.gy = y;
      tile.textContent = allowAll ? '' : (isCorrect ? '⭐' : '');

      if (canPick) {
        tile.addEventListener('touchstart', onTilePick, { passive: false });
        tile.addEventListener('mousedown',  onTilePick);
      }

      grid.appendChild(tile);
      sabTiles.push({ gx: x, gy: y, correct: isCorrect, el: tile });
    }
  }
}

function onTilePick(e) {
  e.preventDefault();
  if (sabChosen) return;

  const gx = parseInt(e.currentTarget.dataset.gx);
  const gy = parseInt(e.currentTarget.dataset.gy);
  sabChosen = { gx, gy };

  sabTiles.forEach(t => {
    if (t.gx === gx && t.gy === gy) {
      t.el.classList.remove('correct');
      t.el.classList.add('chosen');
      t.el.textContent = tutorialMode === 'sabotage' ? '✅' : '💥';
    }
  });

  const sabConfirm = document.getElementById('sab-confirm');
  if (tutorialMode === 'sabotage') {
    if (sabConfirm) sabConfirm.textContent = 'Exercice validé (piège non actif)';
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tutorial_sabotage_tap', gx, gy }));
    }
    return;
  }

  if (sabConfirm) sabConfirm.textContent = `CASE (${gx},${gy}) SABOTÉE !`;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'saboteur_choice', gx, gy }));
  }
}

// ── Send joystick ~30fps ───────────────────────────────────
function sendInput() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'input', x: joyX, y: joyY }));
}
setInterval(sendInput, 33);
</script>
