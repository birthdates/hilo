import chalk from "chalk";
import { createServer } from "http";
import { Server } from "socket.io";
import { getRedisClient } from "./redis.js";
import express from "express";

const app = express();
const server = createServer(app);
const STARTING_BALANCE = 50;
const HOUSE_EDGE = 0.05; // 5% house edge
const io = new Server(server, {
  cors: {
    origin: "http://69.194.47.37:3000",
  },
});
const TOKEN_TO_SOCKET = {};
import fs from "fs";

let gameState = 0; // 0 = waiting to start, 1 = waiting for next hand

/**
 * token -> {
 *  bet: number,
 *  multiplier: number,
 *  profit: number,
 *  betType: number (0 = low, 1 = high, 2 = red, 3 = black, 4 = same card, 5 = cash out)
 * }
 */
let betInfo = {};

const fetchBalance = async (token) => {
  const client = await getRedisClient();
  const balance = parseFloat(await client.get(token));
  return balance;
};

const generateRandomID = () => {
  // 32 character id
  return Math.random().toString(36).substr(2, 32);
};

const updateBalance = async (token, balance) => {
  if (balance !== undefined && isNaN(balance)) {
    throw new Error("Balance must be a number.");
  }
  const client = await getRedisClient();
  const fetch = balance === undefined;

  if (fetch) {
    balance = await fetchBalance(token);
  }

  const socket = TOKEN_TO_SOCKET[token];
  if (socket) socket.emit("balance_update", balance);

  if (!fetch) {
    await client.set(token, balance);
  }
};

// Authentication
io.use(async (socket, next) => {
  let token = socket.handshake.auth.token;
  const client = await getRedisClient();

  if (!token || !(await client.exists(token))) {
    // Generate random 32 character token and store it in Redis (token -> balance)
    token = generateRandomID();
    client.set(token, STARTING_BALANCE);
    socket.newConnection = true;
  }

  // set token
  socket.token = token;
  TOKEN_TO_SOCKET[token] = socket;

  next();
});

io.on("connection", async (socket) => {
  // Send generated token to client on connection
  if (socket.newConnection) {
    socket.emit("new_token", socket.token);
  }

  // Send balance to client on connection
  await updateBalance(socket.token);

  socket.emit("cards", shownCards);
  socket.emit("waiting", waitingTime);
  socket.emit("state", gameState);

  const bet = betInfo[socket.token];
  if (bet) {
    socket.emit("bet", bet);
  }

  socket.on("disconnect", () => {
    delete TOKEN_TO_SOCKET[socket.token];
  });

  socket.on("bet", async (amount, type) => {
    if (
      (isNaN(amount) && isNaN(type)) ||
      amount <= 0 ||
      type < 0 ||
      type > 5 ||
      waitingTime < Date.now()
    ) {
      return;
    }

    let bet = betInfo[socket.token];
    const balance = await fetchBalance(socket.token);
    if (!bet) {
      if (gameState !== 0) {
        socket.emit("error", "You can only bet at the start of a new hand.");
        return;
      }
      if (amount > balance) {
        socket.emit("error", "Insufficient funds.");
        return;
      }
      bet = {
        bet: 0,
        multiplier: 1.0,
        profit: 0.0,
        betType: type || 0,
      };
    }

    if (previousCard && gameState !== 0) {
      bet.betType = type;
    } else {
      if (amount > balance) {
        socket.emit("error", "Insufficient funds.");
        return;
      }
      dataCollected.totalBets += amount;
      await updateBalance(socket.token, balance - amount);
      bet.bet += amount;
    }

    betInfo[socket.token] = bet;
    socket.emit("bet", bet);
  });
});

const dataCollected = JSON.parse(fs.readFileSync("./data.json", "utf-8"));

let round = 0;
let handID = "";
let previousCard = "";
let shownCards = [];

const finishBet = async (token, bet) => {
  const balance = await fetchBalance(token);
  const winnings = bet.profit;
  if (isNaN(winnings)) {
    return;
  }
  dataCollected.totalProfit += winnings;
  await updateBalance(token, balance + bet.bet + winnings);
};

const finishRound = async () => {
  const bets = Object.entries(betInfo);
  for (const [token, bet] of bets) {
    finishBet(token, bet);
  }
  previousCard = "";
  betInfo = {};
};

const updateState = (state) => {
  gameState = state;
  io.emit("state", state);
};

const startHand = async () => {
  round++;
  handID = generateRandomID();
  dataCollected.handsPlayed++;
  if (dataCollected.handsPlayed > 0) {
    // save
    fs.writeFileSync("./data.json", JSON.stringify(dataCollected, null, 2));
  }
  updateState(1); // waiting for bets
  flipCard();
  if (round >= 3) {
    waitingTime = Date.now() + 5000;
    io.emit("next_hand", Date.now() + 5000);
    setTimeout(async () => {
      await finishRound();
      startGame();
    }, 5000);
    return;
  }
  waitingTime = Date.now() + 15000;
  io.emit("next_hand", Date.now() + 15000);
  setTimeout(startHand, 15000);
};

const cards = ["2", "3", "4", "5", "6", "7", "8", "9", "!", "J", "Q", "K", "A"];
const suits = ["s", "h", "d", "c"];
let waitingTime = 0;

const isRed = (suit) => {
  return suit === "h" || suit === "d";
};

const isBlack = (suit) => {
  return suit === "s" || suit === "c";
};

const checkWinnings = (card, suit) => {
  const bets = Object.entries(betInfo);
  const cardIndex = cards.indexOf(card);

  const lastCardType = previousCard[0];
  const lastCardIndex = cards.indexOf(lastCardType);
  const lastCardSuit = previousCard[1];
  const lowChance = lastCardIndex / cards.length;
  const highChance = (cards.length - lastCardIndex) / cards.length;
  const sameChance = 1 / cards.length;

  dataCollected.hands[handID] = {
    card: card + suit,
    lowChance: lowChance * 100,
    highChance: highChance * 100,
  };
  for (const [key, bet] of bets) {
    let chanceUsed = 0;
    let failed = false;
    let cash = false;

    if (bet.betType === 0) {
      // High
      chanceUsed = highChance;
      if (lastCardIndex >= cardIndex) {
        failed = true;
      }
    } else if (bet.betType === 1) {
      // Low
      chanceUsed = lowChance;
      if (lastCardIndex <= cardIndex) {
        failed = true;
      }
    } else if (bet.betType === 4) {
      // Same
      chanceUsed = sameChance;
      if (lastCardIndex !== cardIndex || lastCardSuit !== suit) {
        failed = true;
      }
    } else if (bet.betType == 5) {
      finishBet(key, bet);
      cash = true;
    } else {
      if (bet.betType === 2 && !isRed(suit)) {
        failed = true;
      } else if (bet.betType === 3 && !isBlack(suit)) {
        failed = true;
      } else chanceUsed = 0.5; // red/black
    }
    let multiplier = 1 / chanceUsed;

    dataCollected.bets.push({
      hand: handID,
      betType: bet.betType,
      chance: chanceUsed * 100,
      cash,
      multiplier,
    });

    const socket = TOKEN_TO_SOCKET[key];

    if (failed || cash) {
      console.log("Loss:", previousCard, card, suit, betInfo[key]);
      delete betInfo[key];
      if (socket) socket.emit("bet", null, failed && !cash);
      continue;
    }

    if (multiplier - HOUSE_EDGE > 1) {
      multiplier -= HOUSE_EDGE;
    }
    console.log("Win", previousCard, card, suit, betInfo[key], multiplier);

    if (multiplier > 1) {
      betInfo[key].multiplier = multiplier;
      betInfo[key].profit += bet.bet * multiplier - bet.bet;
    }
    if (socket) socket.emit("bet", betInfo[key]);
  }
};

const flipCard = () => {
  const randomCard = cards[Math.floor(Math.random() * cards.length)];
  const randomSuit = suits[Math.floor(Math.random() * suits.length)];
  const card = randomCard + randomSuit;
  io.emit("card", card);
  if (previousCard) checkWinnings(randomCard, randomSuit);
  previousCard = card;
  shownCards = [card, ...shownCards];
};

const startGame = () => {
  updateState(0);
  previousCard = "";
  round = 0;
  shownCards = [];
  io.emit("cards", shownCards);
  waitingTime = Date.now() + 25000;
  io.emit("start_game", waitingTime);
  setTimeout(startHand, 25000);
};

startGame();

server.listen(3001, () => console.log(chalk.green("Server is running on port 3001")));
