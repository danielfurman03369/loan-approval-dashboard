const state = {
  currentPlayer: 'X',
  board: Array(9).fill(''),
  mode: 'human',
  difficulty: 'medium',
  score: { X: 0, O: 0, draw: 0 },
  isFinished: false,
};

const winningSets = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const elements = {
  boardGrid: document.getElementById('boardGrid'),
  boardShell: document.getElementById('boardShell'),
  currentPlayerLabel: document.getElementById('currentPlayerLabel'),
  statusLabel: document.getElementById('statusLabel'),
  scoreX: document.getElementById('scoreX'),
  scoreO: document.getElementById('scoreO'),
  scoreDraw: document.getElementById('scoreDraw'),
  playerMode: document.getElementById('playerMode'),
  difficulty: document.getElementById('difficulty'),
  startButton: document.getElementById('startButton'),
  restartButton: document.getElementById('restartButton'),
  messageTitle: document.getElementById('messageTitle'),
  preloadScreen: document.getElementById('preloadScreen'),
  themeToggle: document.getElementById('themeToggle'),
  settingsButton: document.getElementById('settingsButton'),
  modalClose: document.getElementById('modalClose'),
  modalCloseAction: document.getElementById('modalCloseAction'),
  settingsModal: document.getElementById('settingsModal'),
  modalPlayerMode: document.getElementById('modalPlayerMode'),
  modalDifficulty: document.getElementById('modalDifficulty'),
  confettiContainer: document.getElementById('confettiContainer'),
};

function createBoard() {
  elements.boardGrid.innerHTML = '';
  state.board = Array(9).fill('');
  state.isFinished = false;

  state.board.forEach((cell, index) => {
    const tile = document.createElement('button');
    tile.className = 'cell';
    tile.type = 'button';
    tile.setAttribute('aria-label', `Cell ${index + 1}`);
    tile.dataset.index = index;
    tile.addEventListener('click', cellClickHandler);
    tile.addEventListener('keydown', keyboardCellHandler);
    tile.tabIndex = 0;

    elements.boardGrid.appendChild(tile);
  });

  updateUI();
}

function cellClickHandler(event) {
  const index = Number(event.currentTarget.dataset.index);
  playMove(index);
}

function keyboardCellHandler(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.currentTarget.click();
  }
}

function playMove(index) {
  if (state.isFinished || state.board[index]) {
    return;
  }

  setCell(index, state.currentPlayer);

  const winner = checkWinner(state.board);
  if (winner) {
    endGame(winner);
    return;
  }

  if (state.board.every(Boolean)) {
    endGame('draw');
    return;
  }

  state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
  updateStatus(`Player ${state.currentPlayer}'s turn`);
  updateUI();

  if (state.mode === 'ai' && state.currentPlayer === 'O') {
    window.setTimeout(() => aiMove(), 500);
  }
}

function setCell(index, value) {
  state.board[index] = value;
  const cell = elements.boardGrid.querySelector(`[data-index='${index}']`);
  if (!cell) return;
  cell.classList.add('active');
  cell.innerHTML = renderMark(value);
  cell.setAttribute('aria-label', `Cell ${index + 1} ${value}`);
  playSound('tap');
}

function renderMark(value) {
  if (value === 'X') {
    return `
      <svg viewBox="0 0 120 120" class="mark x" aria-hidden="true">
        <path d="M24 24L96 96M96 24L24 96" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" />
      </svg>
    `;
  }

  if (value === 'O') {
    return `
      <svg viewBox="0 0 120 120" class="mark o" aria-hidden="true">
        <circle cx="60" cy="60" r="32" fill="none" stroke="currentColor" stroke-width="16" />
      </svg>
    `;
  }

  return '';
}

function getWinningLine(board) {
  return winningSets.find((line) => {
    const [a, b, c] = line;
    return board[a] && board[a] === board[b] && board[b] === board[c];
  });
}

function checkWinner(board) {
  const winLine = getWinningLine(board);
  if (!winLine) {
    return null;
  }

  return board[winLine[0]];
}

function endGame(result) {
  state.isFinished = true;
  if (result === 'draw') {
    state.score.draw += 1;
    updateStatus('It’s a draw. Try again.');
    updateMessage('Draw! Everyone scores one for style.', 'Standby');
    celebrateDraw();
  } else {
    state.score[result] += 1;
    updateStatus(`Player ${result} wins!`);
    updateMessage(`Victory for ${result}`, 'Winning Strike');
    playConfetti();
    highlightWinningCells();
  }

  updateScoreboard();
}

function highlightWinningCells() {
  const winLine = getWinningLine(state.board);
  if (!winLine) return;
  winLine.forEach((index) => {
    const cell = elements.boardGrid.querySelector(`[data-index='${index}']`);
    if (cell) cell.classList.add('win');
  });
}

function updateUI() {
  elements.currentPlayerLabel.textContent = state.currentPlayer;
  elements.playerMode.value = state.mode;
  elements.difficulty.value = state.difficulty;
  updateScoreboard();
}

function updateStatus(text) {
  elements.statusLabel.textContent = text;
}

function updateMessage(title, copy) {
  elements.messageTitle.textContent = title;
  elements.messageTitle.nextElementSibling.textContent = copy;
}

function updateScoreboard() {
  elements.scoreX.textContent = state.score.X;
  elements.scoreO.textContent = state.score.O;
  elements.scoreDraw.textContent = state.score.draw;
}

function aiMove() {
  if (state.isFinished) return;
  const index = chooseAiMove();
  playMove(index);
}

function chooseAiMove() {
  const empty = state.board
    .map((value, index) => (value ? null : index))
    .filter((value) => value !== null);

  if (state.difficulty === 'easy') {
    return chooseRandom(empty);
  }

  const opponent = 'X';
  const current = 'O';

  const winningMove = findWinningMove(state.board, current);
  if (winningMove !== null) {
    return winningMove;
  }

  const blockMove = findWinningMove(state.board, opponent);
  if (state.difficulty === 'medium' && Math.random() < 0.4) {
    return chooseRandom(empty);
  }

  if (blockMove !== null) {
    return blockMove;
  }

  if (state.difficulty === 'impossible') {
    return minimaxDecision(state.board, current).index;
  }

  if (state.difficulty === 'medium') {
    return minimaxDecision(state.board, current, 2).index;
  }

  return chooseRandom(empty);
}

function chooseRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function findWinningMove(board, player) {
  for (const line of winningSets) {
    const values = line.map((idx) => board[idx]);
    const filled = values.filter(Boolean).length;
    const matches = values.filter((value) => value === player).length;
    const emptyIndex = line.find((idx) => !board[idx]);
    if (filled === 2 && matches === 2 && emptyIndex !== undefined) {
      return emptyIndex;
    }
  }
  return null;
}

function minimaxDecision(board, player, maxDepth = 6) {
  const opponent = player === 'X' ? 'O' : 'X';
  const available = board
    .map((value, index) => (value ? null : index))
    .filter((value) => value !== null);
  
  if (available.length === 0 || maxDepth === 0 || checkWinner(board) || board.every(Boolean)) {
    return { score: evaluateBoard(board, player) };
  }

  const moves = [];

  available.forEach((index) => {
    const newBoard = [...board];
    newBoard[index] = player;
    const result = minimaxDecision(newBoard, opponent, maxDepth - 1);
    moves.push({ index, score: -result.score });
  });

  const best = moves.reduce((bestMove, move) => {
    if (!bestMove || move.score > bestMove.score) return move;
    return bestMove;
  }, null);

  return best;
}

function evaluateBoard(board, player) {
  const winner = checkWinner(board);
  if (winner === player) return 100;
  if (winner && winner !== player) return -100;
  return 0;
}

function resetGame(resetScores = false) {
  if (resetScores) {
    state.score = { X: 0, O: 0, draw: 0 };
    updateMessage('New session loaded', 'Choose your opponent and start the match.');
  }
  state.currentPlayer = 'X';
  state.board = Array(9).fill('');
  state.isFinished = false;
  elements.boardGrid.querySelectorAll('.cell').forEach((cell) => {
    cell.className = 'cell';
    cell.innerHTML = '';
  });
  updateStatus(`Player ${state.currentPlayer}'s turn`);
  updateUI();
  if (state.mode === 'ai' && state.currentPlayer === 'O') {
    window.setTimeout(() => aiMove(), 600);
  }
}

function setupListeners() {
  elements.playerMode.addEventListener('change', (event) => {
    state.mode = event.target.value;
    elements.modalPlayerMode.value = state.mode;
    const text = state.mode === 'human' ? 'Human battle ready.' : 'AI engaged.';
    updateStatus(text);
    updateMessage('Mode updated', `Opponent set to ${state.mode === 'ai' ? 'AI' : 'Human'}.`);
  });

  elements.difficulty.addEventListener('change', (event) => {
    state.difficulty = event.target.value;
    elements.modalDifficulty.value = state.difficulty;
    updateStatus(`Difficulty: ${state.difficulty}`);
    updateMessage('Difficulty selected', `Strategic mode: ${state.difficulty}.`);
  });

  elements.settingsButton.addEventListener('click', () => {
    elements.settingsModal.classList.remove('hidden');
  });

  elements.modalClose.addEventListener('click', () => {
    elements.settingsModal.classList.add('hidden');
  });

  elements.modalCloseAction.addEventListener('click', () => {
    elements.settingsModal.classList.add('hidden');
  });

  elements.modalPlayerMode.addEventListener('change', (event) => {
    state.mode = event.target.value;
    elements.playerMode.value = state.mode;
    updateStatus(`Mode: ${state.mode}`);
  });

  elements.modalDifficulty.addEventListener('change', (event) => {
    state.difficulty = event.target.value;
    elements.difficulty.value = state.difficulty;
    updateStatus(`Difficulty: ${state.difficulty}`);
  });

  elements.startButton.addEventListener('click', () => {
    resetGame(true);
    playSound('start');
  });

  elements.restartButton.addEventListener('click', () => {
    resetGame(false);
    playSound('start');
  });

  elements.themeToggle.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const root = document.documentElement;
  const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = nextTheme;
  playSound('toggle');
}

function playConfetti() {
  const count = 28;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i += 1) {
    const confetto = document.createElement('div');
    confetto.className = 'confetti-particle';
    const size = Math.random() * 10 + 10;
    confetto.style.width = `${size}px`;
    confetto.style.height = `${size * 0.4}px`;
    confetto.style.left = `${Math.random() * 100}%`;
    confetto.style.background = `hsl(${Math.random() * 260 + 120}, 90%, 68%)`;
    confetto.style.transform = `rotate(${Math.random() * 360}deg)`;
    frag.appendChild(confetto);

    const animationDuration = 1200 + Math.random() * 700;
    confetto.animate(
      [
        { transform: `translateY(0) rotate(${Math.random() * 360}deg)`, opacity: 1 },
        { transform: `translateY(120vh) translateX(${Math.random() * 120 - 60}vw) rotate(${Math.random() * 1080}deg)`, opacity: 0 },
      ],
      {
        duration: animationDuration,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }
    );
  }

  elements.confettiContainer.appendChild(frag);
  setTimeout(() => {
    elements.confettiContainer.querySelectorAll('.confetti-particle').forEach((item) => item.remove());
  }, 2200);
}

function celebrateDraw() {
  const glow = document.createElement('div');
  glow.className = 'draw-glow';
  elements.boardShell?.appendChild(glow);
  window.setTimeout(() => glow.remove(), 1400);
}

function bindGlobalHoverEffects() {
  document.querySelectorAll('.button').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      const diameter = Math.max(button.clientWidth, button.clientHeight);
      ripple.style.width = ripple.style.height = `${diameter}px`;
      ripple.style.left = `${event.clientX - button.getBoundingClientRect().left - diameter / 2}px`;
      ripple.style.top = `${event.clientY - button.getBoundingClientRect().top - diameter / 2}px`;
      button.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 600);
    });
  });
}

function playSound(type) {
  if (!window.AudioContext) return;
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  gain.gain.value = 0.12;

  if (type === 'tap') {
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440;
    gain.gain.setTargetAtTime(0.001, context.currentTime + 0.04, 0.02);
  }

  if (type === 'start') {
    oscillator.type = 'sine';
    oscillator.frequency.value = 260;
    gain.gain.setTargetAtTime(0.001, context.currentTime + 0.2, 0.02);
  }

  if (type === 'toggle') {
    oscillator.type = 'square';
    oscillator.frequency.value = 520;
    gain.gain.setTargetAtTime(0.001, context.currentTime + 0.1, 0.02);
  }

  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

function hidePreloader() {
  window.requestAnimationFrame(() => {
    elements.preloadScreen.classList.add('hidden');
  });
}

function initialize() {
  createBoard();
  setupListeners();
  bindGlobalHoverEffects();
  updateStatus(`Player ${state.currentPlayer}'s turn`);
  updateMessage('Let the match begin', 'Choose a square to send the move through the glass.');
  window.addEventListener('load', hidePreloader);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      elements.settingsModal.classList.add('hidden');
    }
  });
}

initialize();
