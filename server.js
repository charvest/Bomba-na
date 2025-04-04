const fs = require("fs");
const path = require("path");

// Load quiz questions
const questions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "questions.json"))
);
let currentQuestionIndex = 0;

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const https = require("https");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

app.use(express.static("public"));

let players = [];
let currentTurn = 0;
let gameStarted = false;
let substring = '';
let timer = null;
let countdownInterval = null; // ✅ Add this!


// === Tagalog Word Checker via Wiktionary API ===
function isValidTagalogWord(word) {
  return new Promise((resolve) => {
    const title = encodeURIComponent(word.toLowerCase());
    const url = `https://en.wiktionary.org/w/api.php?action=query&titles=${title}&prop=revisions&rvprop=content&format=json&origin=*`;

    https
      .get(url, (res) => {
        let rawData = "";
        res.on("data", (chunk) => (rawData += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(rawData);
            const pages = data.query.pages;
            const page = Object.values(pages)[0];

            if (!page || page.missing) return resolve(false);

            const content = page.revisions?.[0]?.["*"] || "";
            const isTagalog =
              content.includes("==Tagalog==") || content.includes("{{tl-");
            resolve(isTagalog);
          } catch (e) {
            console.error("API parse error:", e);
            resolve(false);
          }
        });
      })
      .on("error", (err) => {
        console.error("Wiki fetch failed:", err);
        resolve(false);
      });
  });
}

const generateSubstring = () => {
  const samples = [
    "yan",
    "um",
    "syon",
    "hon",
    "pan",
    "mag",
    "pag",
    "nag",
    "han",
  ];
  return samples[Math.floor(Math.random() * samples.length)];
};

function startRound() {
  if (players.length < 2) return;

  while (players[currentTurn]?.eliminated) {
    currentTurn = (currentTurn + 1) % players.length;
  }

  const currentPlayer = players[currentTurn];

  // Get next question
  const questionObj = questions[currentQuestionIndex % questions.length];
  currentQuestionIndex++;

  io.emit("roundStart", {
    playerId: currentPlayer.id,
    playerName: currentPlayer.name,
    question: questionObj.question,
    time: 10,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      lives: p.lives,
      eliminated: p.eliminated,
    })),
  });

  clearTimeout(timer);
  timer = setTimeout(() => {
    eliminateOrLoseLife(currentPlayer.id);
  }, 10000);
}

const eliminateOrLoseLife = (playerId) => {
  const player = players.find((p) => p.id === playerId);
  if (!player || player.eliminated) return;

  player.lives--;
  io.emit("playerLostLife", player.id);

  if (player.lives <= 0) {
    player.eliminated = true;
    io.emit("playerEliminated", player.name);
  }

  const alivePlayers = players.filter((p) => !p.eliminated);
  if (alivePlayers.length === 1) {
    const winner = alivePlayers[0];
    io.emit("gameOver", winner.name);
    gameStarted = false;

    setTimeout(() => {
      players = players.filter((p) => !p.eliminated);
      players.forEach((p) => {
        p.lives = 3;
        p.eliminated = false;
        delete p.lastWord;
      });

      if (players.length >= 4) {
        currentTurn = 0;
        gameStarted = true;
        startRound();
      } else {
        io.emit("playerList", players);
      }
    }, 5000);
    return;
  }

  nextTurn();
};

const nextTurn = () => {
  do {
    currentTurn = (currentTurn + 1) % players.length;
  } while (players[currentTurn].eliminated);

  startRound();
};

// Player Join
io.on("connection", (socket) => {
  socket.on("joinGame", (name) => {
    if (players.length >= 4 || gameStarted) {
      socket.emit("gameFull");
      return;
    }

    players.push({ id: socket.id, name, lives: 3, eliminated: false });
    io.emit("playerList", players);

    // Automatically start pre-game countdown clearly when exactly two players join
    if (players.length === 4) {
      io.emit("preGameCountdown", 5); // 5-second countdown
      startPreGameCountdown();
    }
  });

  socket.on("disconnect", () => {
    players = players.filter((p) => p.id !== socket.id);
    io.emit("playerList", players);
    gameStarted = false;
    clearInterval(countdownInterval);
  });
  socket.on("submitWord", (word) => {
    const currentPlayer = players[currentTurn];
    if (!currentPlayer || socket.id !== currentPlayer.id) return;

    // Clean submitted word to avoid corrupted input
    word = word?.trim().toLowerCase();

    isValidTagalogWord(word).then((isValid) => {
      if (word.includes(substring) && isValid) {
        clearTimeout(timer);
        io.emit("validWord", {
          playerId: socket.id,
          playerName: currentPlayer.name,
          word,
        });
        nextTurn();
      } else {
        socket.emit("wordRejected", word);
        eliminateOrLoseLife(socket.id);
      }
    });
  });

  // Pre-game Countdown logic
  function startPreGameCountdown() {
    let countdown = 5; // seconds before game starts clearly
    countdownInterval = setInterval(() => {
      countdown--;
      io.emit("preGameCountdown", countdown);

      if (countdown <= 0) {
        clearInterval(countdownInterval);
        gameStarted = true;
        startRound();
      }
    }, 1000);
  }
  socket.on("disconnect", () => {
    const leaving = players.find((p) => p.id === socket.id);
    if (leaving) leaving.eliminated = true;

    const alive = players.filter((p) => !p.eliminated);
    if (alive.length === 1 && gameStarted) {
      io.emit("gameOver", alive[0].name);
      gameStarted = false;
    }

    io.emit(
      "playerList",
      players.map((p) => ({
        id: p.id,
        name: p.name,
        lives: p.lives,
        eliminated: p.eliminated,
      }))
    );
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
