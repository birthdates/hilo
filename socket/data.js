// Convert data from data.json into a CSV file:
// Bet Type, Target Multiplier, Chance, Card

import { readFileSync, writeFileSync } from "fs";

const data = JSON.parse(readFileSync("./data.json", "utf8"));

const getCard = (c) => c.replace("!", "10");

const BET_TYPES = {
  0: "Low",
  1: "High",
  2: "Red",
  3: "Black",
  4: "Same",
};

const csv = data.bets
  .filter((x) => !x.cash && x.multiplier && x.chance)
  .map(({ betType, multiplier, chance, hand }) => {
    return `${BET_TYPES[betType]},${multiplier ?? 1},${chance ?? 0},${getCard(
      data.hands[hand].card
    )}`;
  });

csv.unshift("Bet Type, Target Multiplier, Chance, Card");

writeFileSync("./data.csv", csv.join("\n"), "utf8");
