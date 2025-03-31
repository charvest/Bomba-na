const socket = io();

let myId = "";
let myName = "";
let isMyTurn = false;
let countdownInterval = null;
let timeLeft = 10;
let players = [];
const bgMusic = document.getElementById("bgMusic");
const musicBtn = document.getElementById("musicBtn");
const musicIcon = document.getElementById("musicIcon");
let isMuted = false;

const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");
const nameEntry = document.getElementById("nameEntry");
const instructionModal = document.getElementById("instructionModal");
const gotItBtn = document.getElementById("gotItBtn");

const gameUI = document.getElementById("gameUI");
const statusDiv = document.getElementById("status");
const substringDiv = document.getElementById("substring");
const wordInput = document.getElementById("wordInput");
const submitBtn = document.getElementById("submitBtn");
const bombTimer = document.getElementById("timerText");

let currentRound = 0;

function generateSubstring() {
  currentRound++;

  // Update Round Indicator clearly
  const roundIndicatorEl = document.getElementById("roundIndicator");
  roundIndicatorEl.innerText = `Round: ${currentRound}`;

  if (currentRound <= 3) {
    return substrings.easy[Math.floor(Math.random() * substrings.easy.length)];
  } else if (currentRound <= 6) {
    return substrings.medium[
      Math.floor(Math.random() * substrings.medium.length)
    ];
  } else {
    return substrings.hard[Math.floor(Math.random() * substrings.hard.length)];
  }
}

// === JOIN BUTTON ===
joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (name) {
    myName = name;
    nameEntry.style.display = "none";
    instructionModal.style.display = "block"; // Show instructions next
  }
});

// Instructions button (Got It!) click
gotItBtn.addEventListener("click", () => {
  instructionModal.style.display = "none";
  gameMode.style.display = "block"; // Next: show game mode selection
});

// Single Player Mode Button
singlePlayerBtn.addEventListener("click", () => {
  gameMode.style.display = "none";
  gameUI.style.display = "block";
  playMusic(); // 👈 Clearly added here!
  initializeSinglePlayer();
});

// Multiplayer Mode Button
multiPlayerBtn.addEventListener("click", () => {
  gameMode.style.display = "none";
  gameUI.style.display = "block";
  playMusic(); // 👈 Clearly added here!
  initializeMultiplayer();
});
function initializeMultiplayer() {
  socket.emit("joinGame", myName);

  // Show waiting UI explicitly
  document.getElementById("waitingArea").style.display = "block";

  // Explicitly hide countdown bar until the game starts
  document.getElementById("countdownBar").style.display = "none";
}

function initializeMultiplayer() {
  socket.emit("joinGame", myName); // Only here should player join multiplayer
}

// Timer logic (shared by both modes, triggered here explicitly)
function startSinglePlayerTimer() {
  // Start the countdown timer logic explicitly here
  startCountdown();
}

function playMusic() {
  const bgMusic = document.getElementById("bgMusic");
  bgMusic.volume = 0.3; // Adjust the volume as desired
  bgMusic.play().catch((e) => {
    console.error("Autoplay was prevented:", e);
  });
}

function toggleMusic() {
  if (isMuted) {
    bgMusic.volume = 0.3;
    musicIcon.innerText = "🔊"; // Unmute icon
  } else {
    bgMusic.volume = 0;
    musicIcon.innerText = "🔇"; // Mute icon
  }
  isMuted = !isMuted;
}

// === SOCKET EVENTS ===
socket.on("connect", () => {
  myId = socket.id;
});

socket.on("gameFull", () => {
  statusDiv.innerText = "🚫 Game is full. Please try again later.";
  submitBtn.disabled = true;
  wordInput.disabled = true;
});
function initializeMultiplayer() {
  socket.emit("joinGame", myName);

  // Show waiting UI clearly
  document.getElementById("waitingArea").style.display = "block";
}
socket.on("playerList", (serverPlayers) => {
  players = serverPlayers;
  renderPlayers(players);

  const playerCountEl = document.getElementById("playerCount");
  playerCountEl.innerText = `${players.length}/2 players joined`;

  if (players.length === 2) {
    document.getElementById("waitingArea").style.display = "none";
  } else {
    document.getElementById("waitingArea").style.display = "block";
  }
});

socket.on("roundStart", (data) => {
  // Hide the waiting UI explicitly here
  document.getElementById("waitingArea").style.display = "none";

  players = data.players;
  isMyTurn = data.playerId === myId;
  timeLeft = data.time || 10;

  substringDiv.innerText = data.substring;
  renderPlayers(players, data.playerId);

  // Show and reset countdown bar clearly at round start
  const countdown = document.getElementById("countdownBar");
  countdown.style.display = "block";
  countdown.classList.remove("countdown-bar");
  void countdown.offsetWidth; // force reflow
  countdown.classList.add("countdown-bar");

  if (isMyTurn) {
    statusDiv.innerText = `✅ Your turn! ⏳ You have ${timeLeft} seconds...`;
    wordInput.disabled = false;
    submitBtn.disabled = false;
    wordInput.value = "";
    wordInput.focus();
    pulseBomb(true);
    startCountdown();
  } else {
    statusDiv.innerText = `⌛ Waiting for ${data.playerName}...`;
    wordInput.disabled = true;
    submitBtn.disabled = true;
    pulseBomb(false);
    stopCountdown();
  }
});

socket.on("validWord", ({ playerId, word }) => {
  const player = players.find((p) => p.id === playerId);
  if (player) player.lastWord = word;

  renderPlayers(players);
  flashInput(true);
  stopCountdown();
});

socket.on("preGameCountdown", (countdown) => {
  const statusDiv = document.getElementById("status");
  statusDiv.innerText = `⏳ Game starting in ${countdown}...`;

  // Optional: visually highlight countdown clearly
  statusDiv.style.color = "#fff";
  statusDiv.style.backgroundColor = "#3f51b5";
  statusDiv.style.padding = "10px";
  statusDiv.style.borderRadius = "8px";

  // Hide waiting area clearly when countdown starts
  document.getElementById("waitingArea").style.display = "none";
});

socket.on("wordRejected", (word) => {
  statusDiv.innerText = `❌ "${word}" is not valid! You lost a life.`;
  flashInput(false);
});

socket.on("playerLostLife", (playerId) => {
  const player = players.find((p) => p.id === playerId);
  if (player) {
    player.lives--;
    if (player.lives <= 0) player.eliminated = true;
    popHeart(playerId);
  }
  renderPlayers(players);
});

socket.on("playerEliminated", (playerName) => {
  statusDiv.innerText = `💥 ${playerName} was eliminated!`;
  stopCountdown();
  triggerExplosion();
});

socket.on("gameOver", (winnerName) => {
  substringDiv.innerText = "";
  statusDiv.innerText = `🏆 Game Over! ${winnerName} won!`;
  wordInput.disabled = true;
  submitBtn.disabled = true;
  stopCountdown();
  launchConfetti();
});

// === WORD SUBMIT ===
submitBtn.addEventListener("click", () => {
  if (!isMyTurn) return;
  const word = wordInput.value.trim();
  if (word) {
    socket.emit("submitWord", word);
    wordInput.value = "";
  }
});

// === COUNTDOWN ===
function startCountdown() {
  clearInterval(countdownInterval);
  bombTimer.innerText = timeLeft;
  countdownInterval = setInterval(() => {
    timeLeft--;
    bombTimer.innerText = timeLeft;
    updateBombGlow();
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);
}

function stopCountdown() {
  clearInterval(countdownInterval);
  bombTimer.innerText = "--";
  resetBombGlow();
}

// === RENDERING ===
function renderPlayers(playerList, activePlayerId = null) {
  const playerListDiv = document.getElementById("playerList");
  const livesArea = document.getElementById("livesArea");
  playerListDiv.innerHTML = "";
  livesArea.innerHTML = "";

  playerList.forEach((player) => {
    const playerLine = document.createElement("div");
    playerLine.innerText =
      player.name +
      (player.lastWord ? ` ➤ "${player.lastWord}"` : "") +
      (player.eliminated ? " ❌" : "");
    if (player.id === activePlayerId) {
      playerLine.style.color = "#ffd700";
      playerLine.style.fontWeight = "bold";
    }
    playerListDiv.appendChild(playerLine);

    const heartDiv = document.createElement("div");
    heartDiv.classList.add("player-heart");
    heartDiv.id = "heart-" + player.id;
    heartDiv.innerHTML = `
            <div>${player.name}</div>
            <span>${"❤️".repeat(player.lives)}</span>
        `;
    livesArea.appendChild(heartDiv);
  });
}

function popHeart(playerId) {
  const heartBox = document.getElementById("heart-" + playerId);
  if (!heartBox) return;

  const span = heartBox.querySelector("span");
  if (span) {
    const currentHearts = span.innerText.length;
    if (currentHearts > 0) {
      span.innerText = "❤️".repeat(currentHearts - 1);
    }
  }
}

function triggerExplosion() {
  const bomb = document.getElementById("bombDisplay");
  if (!bomb) return;

  bomb.classList.add("exploding");
  bomb.innerText = "💥";
  document.body.classList.add("shake-screen");

  setTimeout(() => {
    bomb.classList.remove("exploding");
    bomb.innerText = "---";
    document.body.classList.remove("shake-screen");
  }, 1000);
}

function updateBombGlow() {
  const bomb = document.getElementById("bombDisplay");
  if (!bomb) return;

  const intensity = 5 + (10 - timeLeft) * 3;
  bomb.style.boxShadow = `0 0 ${intensity}px rgba(255, 204, 0, 0.7)`;
  bomb.style.transform = `scale(${1 + (10 - timeLeft) * 0.02})`;
}

function resetBombGlow() {
  const bomb = document.getElementById("bombDisplay");
  if (!bomb) return;

  bomb.style.boxShadow = "0 0 10px rgba(255, 204, 0, 0.4)";
  bomb.style.transform = "scale(1)";
}

function flashInput(success) {
  wordInput.classList.remove("shake", "correct");
  void wordInput.offsetWidth;
  wordInput.classList.add(success ? "correct" : "shake");
  setTimeout(() => {
    wordInput.classList.remove("shake", "correct");
  }, 700);
}

function typeSubstring(text) {
  const el = document.getElementById("substring");
  let i = 0;
  el.innerText = "";
  const interval = setInterval(() => {
    el.innerText += text[i];
    i++;
    if (i >= text.length) clearInterval(interval);
  }, 50);
}

// === 🎉 Confetti
function launchConfetti() {
  const count = 120;
  for (let i = 0; i < count; i++) {
    const confetti = document.createElement("div");
    confetti.classList.add("confetti");
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.animationDelay = `${Math.random()}s`;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3000);
  }
}

// === MISSING: pulseBomb (optional visual)
function pulseBomb(enable) {
  const bomb = document.getElementById("bombDisplay");
  if (!bomb) return;
  bomb.style.animation = enable
    ? "pulseBomb 1.0s infinite ease-in-out"
    : "none";
}
