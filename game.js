/* ── Kiwi Match – game.js ──────────────────────────────────────────
   Modes: infinite | moves (30) | time (90 s)
   Leaderboard: Global via REST API
   Controls: click-to-swap + drag-and-drop
────────────────────────────────────────────────────────────────── */

const COLS        = 7;
const ROWS        = 7;
const SIZE        = COLS * ROWS;
const START_MOVES = 30;
const START_TIME  = 90;   // seconds
const MAX_ENTRIES = 5;

const TILES = [
  { type: 'kiwi',   emoji: '🐦', label: 'Kiwi bird'  },
  { type: 'fern',   emoji: '🌿', label: 'Silver fern' },
  { type: 'paua',   emoji: '🐚', label: 'Pāua shell'  },
  { type: 'pohut',  emoji: '🌺', label: 'Pōhutukawa'  },
  { type: 'kakapo', emoji: '🦜', label: 'Kākāpō'      },
  { type: 'koru',   emoji: '✨', label: 'Koru'         },
];

/* ── Utilities ──────────────────────────────────────────────────── */
const rnd      = n  => Math.floor(Math.random() * n);
const sleep    = ms => new Promise(r => setTimeout(r, ms));
const gridIdx  = (r, c) => r * COLS + c;
const tileRow  = i  => Math.floor(i / COLS);
const tileCol  = i  => i % COLS;
const adjacent = (a, b) => {
  const dr = Math.abs(tileRow(a) - tileRow(b));
  const dc = Math.abs(tileCol(a) - tileCol(b));
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
};

/* ── Leaderboard (API Integration) ─────────────────────────────────── */
const lb = (() => {
 const API_URL = 'https://kiwi-match.onrender.com/api';
  async function fetchScores(mode) {
    try {
      const res = await fetch(`${API_URL}/scores/${mode}`);
      if (!res.ok) throw new Error('Network response was not ok');
      return await res.json();
    } catch (e) {
      console.error("Failed to fetch scores", e);
      return [];
    }
  }

  async function addScore(mode, score) {
    if (score <= 0) return false;

    const currentTop = await fetchScores(mode);
    const isNewBest = currentTop.length === 0 || score > currentTop[0].score;
    const qualifiesForBoard = currentTop.length < 5 || score > currentTop[currentTop.length - 1].score;

    if (!qualifiesForBoard) return false;

    const playerName = prompt("🎉 Top Score! Enter your name (max 15 chars):") || "Anonymous";

    try {
      await fetch(`${API_URL}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName, score, mode })
      });
    } catch (e) {
      console.error("Failed to save score", e);
    }

    return isNewBest;
  }

  async function show(mode) {
    const list = document.getElementById('lb-list');
    const tabs = document.querySelectorAll('.lb-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.lbmode === mode));

    list.innerHTML = '<li class="lb-empty">Loading scores...</li>';

    const entries = await fetchScores(mode);

    if (entries.length === 0) {
      list.innerHTML = '<li class="lb-empty">No scores yet — play a game!</li>';
      return;
    }
    
    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = entries.map((e, i) => `
      <li class="rank-${i+1}">
        <span class="lb-rank">${medals[i] || (i+1)}</span>
        <span class="lb-name" style="flex: 1; text-align: left; padding-left: 8px;">${e.name}</span>
        <span class="lb-score">${e.score.toLocaleString()}</span>
      </li>`).join('');
  }

  return { addScore, show };
})();

/* ── Game ───────────────────────────────────────────────────────── */
const game = (() => {
  /* state */
  let board    = [];
  let cells    = [];
  let score    = 0;
  let selected = -1;
  let busy     = false;
  let dragSrc  = -1;

  /* mode state */
  let currentMode = 'infinite';
  let movesLeft   = START_MOVES;
  let timeLeft    = START_TIME;
  let timerHandle = null;

  /* DOM */
  const boardEl     = document.getElementById('board');
  const scoreEl     = document.getElementById('score-display');
  const secLabelEl  = document.getElementById('secondary-label');
  const secValEl    = document.getElementById('secondary-display');
  const overlayEl   = document.getElementById('overlay');
  const oTitleEl    = document.getElementById('overlay-title');
  const oBodyEl     = document.getElementById('overlay-body');
  const oBestEl     = document.getElementById('overlay-best');
  const toastEl     = document.getElementById('combo-toast');

  /* ── Board generation ───────────────────────────────────────── */
  function safeRandomType(i) {
    const forbidden = new Set();
    if (tileCol(i) >= 2 && board[i-1] === board[i-2])
      forbidden.add(board[i-1]);
    if (tileRow(i) >= 2 && board[i-COLS] === board[i-COLS*2])
      forbidden.add(board[i-COLS]);
    const choices = TILES.map((_,t) => t).filter(t => !forbidden.has(t));
    return choices[rnd(choices.length)];
  }

  function generateBoard() {
    board = [];
    for (let i = 0; i < SIZE; i++) board.push(safeRandomType(i));
    if (!hasAtLeastOneMove()) generateBoard();
  }

  /* ── Match finding ──────────────────────────────────────────── */
  function findMatches() {
    const matched = new Set();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 2; c++) {
        const i = gridIdx(r, c);
        if (board[i] === null) continue;
        if (board[i] === board[i+1] && board[i] === board[i+2]) {
          let run = 3;
          while (c + run < COLS && board[i] === board[i+run]) run++;
          for (let k = 0; k < run; k++) matched.add(i + k);
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS - 2; r++) {
        const i = gridIdx(r, c);
        if (board[i] === null) continue;
        if (board[i] === board[i+COLS] && board[i] === board[i+COLS*2]) {
          let run = 3;
          while (r + run < ROWS && board[i] === board[i+COLS*run]) run++;
          for (let k = 0; k < run; k++) matched.add(i + k * COLS);
        }
      }
    }
    return [...matched];
  }

  /* ── Gravity ────────────────────────────────────────────────── */
  function applyGravity() {
    for (let c = 0; c < COLS; c++) {
      let wr = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[gridIdx(r, c)] !== null) {
          board[gridIdx(wr, c)] = board[gridIdx(r, c)];
          if (wr !== r) board[gridIdx(r, c)] = null;
          wr--;
        }
      }
      while (wr >= 0) { board[gridIdx(wr--, c)] = rnd(TILES.length); }
    }
  }

  /* ── Possible moves ─────────────────────────────────────────── */
  function hasAtLeastOneMove() {
    for (let i = 0; i < SIZE; i++) {
      const neighbors = [i+1, i-1, i+COLS, i-COLS];
      for (const j of neighbors) {
        if (j < 0 || j >= SIZE) continue;
        if (tileCol(i) === 0 && tileCol(j) === COLS-1) continue;
        if (tileCol(i) === COLS-1 && tileCol(j) === 0) continue;
        [board[i], board[j]] = [board[j], board[i]];
        const m = findMatches().length > 0;
        [board[i], board[j]] = [board[j], board[i]];
        if (m) return true;
      }
    }
    return false;
  }

  /* ── Rendering ──────────────────────────────────────────────── */
  function buildDOM() {
    boardEl.innerHTML = '';
    cells = [];
    for (let i = 0; i < SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'tile';
      applyTile(el, board[i]);
      el.addEventListener('click',     () => onTileClick(i));
      el.addEventListener('dragstart', e  => onDragStart(e, i));
      el.addEventListener('dragover',  e  => e.preventDefault());
      el.addEventListener('drop',      e  => onDrop(e, i));
      el.draggable = true;
      boardEl.appendChild(el);
      cells.push(el);
    }
  }

  function syncDOM() {
    for (let i = 0; i < SIZE; i++) applyTile(cells[i], board[i]);
  }

  function applyTile(el, typeIdx) {
    const t = TILES[typeIdx] ?? TILES[0];
    el.dataset.type = t.type;
    el.textContent  = t.emoji;
  }

  /* ── HUD update ─────────────────────────────────────────────── */
  function updateHUD() {
    scoreEl.textContent = score.toLocaleString();

    if (currentMode === 'infinite') {
      secLabelEl.textContent = 'Mode';
      secValEl.textContent   = '∞';
      secValEl.classList.remove('urgent');
    } else if (currentMode === 'moves') {
      secLabelEl.textContent = 'Moves';
      secValEl.textContent   = movesLeft;
      secValEl.style.color   = movesLeft <= 5 ? 'var(--danger)' : 'var(--gold)';
      secValEl.classList.remove('urgent');
    } else {
      secLabelEl.textContent = 'Time';
      secValEl.textContent   = timeLeft + 's';
      secValEl.style.color   = '';
      secValEl.classList.toggle('urgent', timeLeft <= 10);
    }
  }

  /* ── Timer (time mode) ──────────────────────────────────────── */
  function startTimer() {
    clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      timeLeft--;
      updateHUD();
      if (timeLeft <= 10) sfx.tickUrgent();
      if (timeLeft <= 0) {
        clearInterval(timerHandle);
        endGame();
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerHandle);
    timerHandle = null;
    sfx.stopUrgent();
  }

  /* ── Interactions ───────────────────────────────────────────── */
  function onTileClick(i) {
    if (busy) return;
    if (selected === -1) {
      selected = i;
      cells[i].classList.add('selected');
      sfx.select();
    } else if (selected === i) {
      cells[i].classList.remove('selected');
      selected = -1;
    } else {
      const prev = selected;
      cells[prev].classList.remove('selected');
      selected = -1;
      trySwap(prev, i);
    }
  }

  function onDragStart(e, i) {
    dragSrc = i;
    e.dataTransfer.effectAllowed = 'move';
    const ghost = cells[i].cloneNode(true);
    Object.assign(ghost.style, { opacity: '0.01', position: 'fixed', top: '-200px' });
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 32, 32);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  function onDrop(e, i) {
    e.preventDefault();
    if (dragSrc === -1 || dragSrc === i) return;
    trySwap(dragSrc, i);
    dragSrc = -1;
  }

  /* ── Swap logic ─────────────────────────────────────────────── */
  async function trySwap(a, b) {
    if (busy) return;
    if (!adjacent(a, b)) { flashInvalid(a); return; }
    busy = true;

    [board[a], board[b]] = [board[b], board[a]];
    syncDOM();
    cells[a].classList.add('swapping');
    cells[b].classList.add('swapping');
    await sleep(120);
    cells[a].classList.remove('swapping');
    cells[b].classList.remove('swapping');

    if (findMatches().length === 0) {
      [board[a], board[b]] = [board[b], board[a]];
      syncDOM();
      sfx.invalid();
      cells[a].classList.add('invalid');
      cells[b].classList.add('invalid');
      await sleep(320);
      cells[a].classList.remove('invalid');
      cells[b].classList.remove('invalid');
      busy = false;
      return;
    }

    sfx.swap();
    if (currentMode === 'moves') { movesLeft--; updateHUD(); }
    await cascade();

    const movesExhausted = currentMode === 'moves' && movesLeft <= 0;
    if (movesExhausted) {
      await sleep(200);
      endGame();
    } else if (!hasAtLeastOneMove()) {
      await sleep(300);
      await shuffleBoard();
    }

    busy = false;
  }

  /* ── Cascade ────────────────────────────────────────────────── */
  async function cascade() {
    let combo = 0;
    while (true) {
      const matches = findMatches();
      if (matches.length === 0) break;
      combo++;

      const pts = (matches.length * 30 + Math.max(0, matches.length - 3) * 10) * combo;
      score += pts;
      updateHUD();

      if (combo >= 2) showComboToast(combo);
      sfx.match(combo);

      matches.forEach(i => cells[i].classList.add('clearing'));
      await sleep(380);
      matches.forEach(i => { board[i] = null; cells[i].classList.remove('clearing'); });

      applyGravity();
      syncDOM();
      sfx.drop();

      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < 2; r++) cells[gridIdx(r, c)].classList.add('dropping');
      }
      await sleep(300);
      cells.forEach(el => el.classList.remove('dropping'));
    }
  }

  /* ── Shuffle ────────────────────────────────────────────────── */
  async function shuffleBoard() {
    sfx.shuffle();
    showToast('Shuffling…', '#7ee8a2');
    await sleep(600);
    for (let i = SIZE - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [board[i], board[j]] = [board[j], board[i]];
    }
    let sanity = 0;
    while (findMatches().length > 0 && sanity++ < 20) {
      findMatches().forEach(i => board[i] = null);
      applyGravity();
    }
    if (!hasAtLeastOneMove()) await shuffleBoard();
    else syncDOM();
  }

  /* ── Game over ──────────────────────────────────────────────── */
  async function endGame() {
    stopTimer();
    busy = true;

    const isNew = await lb.addScore(currentMode, score);
    await lb.show(currentMode);
    sfx.gameOver(isNew);

    const modeNames = { infinite: 'Infinite', moves: '30 Moves', time: '90 Sec' };
    oTitleEl.textContent = score > 500 ? '🎉 Ka pai!' : '😔 Game Over';
    oBodyEl.innerHTML    = `${modeNames[currentMode]} mode<br>Your score:<br><strong>${score.toLocaleString()}</strong>`;
    oBestEl.classList.toggle('hidden', !isNew);
    overlayEl.classList.remove('hidden');
  }

  /* ── UI helpers ─────────────────────────────────────────────── */
  function flashInvalid(i) {
    cells[i].classList.add('invalid');
    setTimeout(() => cells[i].classList.remove('invalid'), 350);
  }

  function showComboToast(n) {
    const labels = ['', '', '🔥 Combo!', '⚡ Double!', '💥 Triple!', '🌟 Mega!'];
    showToast(labels[n] || `🌟 ×${n}!`, '#f9e784');
  }

  function showToast(txt, color) {
    toastEl.textContent = txt;
    toastEl.style.color = color;
    toastEl.classList.remove('hidden');
    toastEl.style.animation = 'none';
    void toastEl.offsetWidth;
    toastEl.style.animation = '';
    setTimeout(() => toastEl.classList.add('hidden'), 820);
  }

  /* ── Legend ─────────────────────────────────────────────────── */
  function buildLegend() {
    let el = document.getElementById('legend');
    if (!el) { el = document.createElement('div'); el.id = 'legend'; document.getElementById('app').appendChild(el); }
    el.innerHTML = TILES.map(t =>
      `<div class="leg-item">
        <div class="leg-swatch" style="background:var(--c-${t.type})">${t.emoji}</div>
        ${t.label}
      </div>`).join('');
  }

  /* ── Mode selector ──────────────────────────────────────────── */
  function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    lb.show(mode);
    restart();
  }

  /* ── Init / restart ─────────────────────────────────────────── */
  function restart() {
    stopTimer();
    busy     = false;
    selected = -1;
    score    = 0;
    movesLeft = START_MOVES;
    timeLeft  = START_TIME;

    overlayEl.classList.add('hidden');
    generateBoard();
    buildDOM();
    buildLegend();
    updateHUD();

    if (currentMode === 'time') startTimer();
  }

  return { restart, setMode, toggleMute: sfx.toggleMute, isMuted: sfx.isMuted, init: restart };
})();

/* ── Boot ───────────────────────────────────────────────────────── */
game.init();
lb.show('infinite');

/* Sync mute button to restored preference */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('mute-btn');
  if (btn && game.isMuted()) btn.textContent = '🔇';
});
