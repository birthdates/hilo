import chalk from "chalk";
import { createServer } from "http";
import { Server } from "socket.io";
import { createTables } from "./data.js";
import { getRedisClient } from "./redis.js";
import express from "express";

const app = express();
const server = createServer(app);
const STARTING_BALANCE = 50;
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
  },
});
const TOKEN_TO_SOCKET = {};

let gameState = 0; // 0 = waiting to start, 1 = waiting for bets, 2 = waiting for next hand

/**
 * token -> {
 *  bet: number,
 *  multiplier: number,
 *  betType: number (0 = low, 1 = high, 2 = red, 3 = black, 4 = same card)
 * }
 */
const betInfo = {};

const fetchBalance = async (token) => {
  const client = await getRedisClient();
  const balance = parseInt(await client.get(token));
  await client.disconnect();
  return balance;
};

const generateRandomID = () => {
  return Math.random().toString(36).substr(2);
};

const updateBalance = async (token, balance) => {
  const client = await getRedisClient();
  const fetch = !balance;

  if (fetch) {
    balance = await fetchBalance(token);
  }

  const socket = TOKEN_TO_SOCKET[token];
  socket.emit("balance_update", balance);

  if (!fetch) {
    await client.set(token, balance);
    await client.disconnect();
  }
};

// Authentication
io.use(async (socket, next) => {
  let token = socket.handshake.auth.token;
  const client = await getRedisClient();

  if (!token) {
    // Generate random token and store it in Redis (token -> balance)
    token = Math.random().toString(36).substr(2);
    client.set(token, STARTING_BALANCE);
    socket.newConnection = true;
  }

  if (!client.exists(token)) {
    return next(new Error("Invalid token"));
  }
  await client.disconnect();

  // set token
  socket.token = token;
  TOKEN_TO_SOCKET[token] = socket;

  next();
});

io.on("connection", (socket) => {
  // Send generated token to client on connection
  if (socket.newConnection) {
    socket.emit("token", socket.token);
  }

  // Send balance to client on connection
  updateBalance(socket.token);

  socket.on("disconnect", () => {
    delete TOKEN_TO_SOCKET[socket.token];
  });

  socket.on("bet", async (amount, type) => {
    if (gameState > 1 || isNaN(amount) || isNaN(type) || type < 0 || type > 4) {
      return;
    }

    let bet = betInfo[socket.token];
    if (!bet) {
      if (gameState !== 0) {
        socket.emit("error", "You can only bet at the start of a new hand.");
        return;
      }
      const balance = await fetchBalance(socket.token);
      if (amount > balance) {
        socket.emit("error", "Insufficient funds.");
        return;
      }
      bet = {
        bet: amount,
        multiplier: 1.0,
        betType: type,
      };
    }

    updateBalance(socket.token, balance - amount);
    bet.betType = type;
  });
});

const dataCollected = {
  handsPlayed: 0,
  hands: {
    id: {
      card: "Qs", // Queen of spades
      lowChance: 1,
      highChance: 95,
    },
  },
  bets: [
    {
      hand: "id",
      betType: 0,
      chance: 0.0,
      multiplier: 1.0, // 0 if loss
    },
  ],
};

let round = 0;
let handID = "";
let previousCard = "";

const finishRound = async () => {
  const bets = Object.entries(betInfo);
  for (const [token, bet] of bets) {
    const balance = await fetchBalance(token);
    const winnings = bet.bet * bet.multiplier;
    updateBalance(token, balance + winnings);
  }
  previousCard = "";
  betInfo = {};
};

const startHand = async () => {
  round++;
  if (round > 5) {
    await finishRound();
    startGame();
    return;
  }
  handID = generateRandomID();
  dataCollected.handsPlayed++;
  gameState = 2; // waiting for next hand
  setTimeout(startHand, 5000);
};

const cards = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const suits = ["s", "h", "d", "c"];

const isRed = (suit) => {
  return suit === "h" || suit === "d";
};

const isBlack = (suit) => {
  return suit === "s" || suit === "c";
};

const checkWinnings = (card, suit) => {
  const bets = Object.entires(betInfo);
  const cardIndex = cards.indexOf(card);
  const lowChance = index / cards.length;
  const highChance = (cards.length - index) / cards.length;
  const sameChance = 1 / cards.length;

  const lastCardType = previousCard[0];
  const lastCardIndex = cards.indexOf(lastCardType);
  const lastCardSuit = previousCard[1];

  dataCollected.hands[handID] = {
    card: card + suit,
    lowChance: lowChance * 100,
    highChance: highChance * 100,
  };
  for (const [key, bet] of bets) {
    let chanceUsed = 0;

    if (bet.betType === 0) {
      chanceUsed = lowChance;
      if (lastCardIndex > cardIndex) {
        chanceUsed = 0;
      }
    } else if (bet.betType === 1) {
      chanceUsed = highChance;
      if (lastCardIndex < cardIndex) {
        chanceUsed = 0;
      }
    } else if (bet.betType === 4) {
      chanceUsed = sameChance;
      if (lastCardIndex !== cardIndex || lastCardSuit !== suit) {
        chanceUsed = 0;
      }
    } else {
      chanceUsed = 0.5; // red/black
      if (bet.betType === 2 && !isRed(suit)) {
        chanceUsed = 0;
      } else if (bet.betType === 3 && !isBlack(suit)) {
        chanceUsed = 0;
      }
    }
    const multiplier = chanceUsed <= 0 ? 0 : 1 / chanceUsed;

    dataCollected.bets.push({
      hand: handID,
      betType: bet.betType,
      chance,
      multiplier,
    });

    if (multiplier <= 0) {
      delete betInfo[key];
      return;
    }
    betInfo[key].multiplier += multiplier;
  }
};

const flipCard = () => {
  const randomCard = cards[Math.floor(Math.random() * cards.length)];
  const randomSuit = suits[Math.floor(Math.random() * suits.length)];
  const card = randomCard + randomSuit;
  io.emit("card", card);
  if (!previousCard) checkWinnings(randomCard, randomSuit);
  previousCard = card;
};

const startGame = () => {
  gameState = 0; // waiting to start
  previousCard = "";
  round = 0;
  setTimeout(startHand, 5000);
};

createTables();

server.listen(3001, () => chalk.green("Server is running on port 3001"));
