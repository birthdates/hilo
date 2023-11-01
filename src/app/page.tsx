"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { io } from "socket.io-client";
import clsx from "clsx";
import Image from "next/image";

const URL = "http://69.194.47.37:3001";
const socket = io(URL!, {
  transports: ["websocket"],
  auth: {
    token: typeof localStorage !== "undefined" ? localStorage.getItem("token") : "",
  },
});

type Bet = {
  bet: number;
  multiplier: number;
  profit: number;
  type: number;
};

const BET_AMOUNTS = [1, 3, 5];
const BET_TYPES = ["HIGH", "LOW", "RED", "BLACK", "SAME", "CASH"];

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [cards, setCards] = useState<string[]>([]);
  const [waiting, setWaiting] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [bet, setBet] = useState<Bet | null>(null);
  const [state, setState] = useState<number>(0);
  const [betAmount, setBetAmount] = useState<number>(0);
  const [betType, setBetType] = useState<number>(0);
  const [lost, setLost] = useState<number>(-1);

  function detectMob() {
    return (
      typeof window !== "undefined" &&
      window.innerWidth <= 800 &&
      window.innerHeight <= 1000
    );
  }

  function addBet(amount: number) {
    if (state !== 0) return;
    setBetAmount((prev) => prev + amount);
  }

  function submitBet(type?: number) {
    if ((betAmount <= 0 && !bet) || waiting < Date.now()) {
      return;
    }
    if (state === 0) {
      socket.emit("bet", betAmount);
      setBetAmount(0);
      return;
    }
    if (!cards.length || !bet) {
      return;
    }
    socket.emit("bet", 1, type ?? betType);
  }

  function setType(type: number) {
    if (state === 0) return;
    setBetType(type);
    submitBet(type);
  }

  function clearBet() {
    if (state !== 0) return;
    setBetAmount(0);
  }

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    socket.once("new_token", (token: string) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("token", token);
      }
    });

    socket.on("card", (card: string) => {
      setCards((prev) => {
        const newArr = [card, ...prev];
        if (detectMob() && newArr.length > 1) {
          newArr.pop();
        }
        return newArr;
      });
    });

    socket.on("state", (state: number) => setState(state));
    socket.once("cards", (cards: string[]) => {
      if (!cards) return;
      if (detectMob() && cards.length > 1) {
        setCards(cards.slice(0, 1));
        return;
      }
      setCards(cards);
    });

    socket.on("bet", (bet: Bet | null, lost?: boolean) => {
      if (bet == null) {
        setLost(lost ? 0 : 1);
      }
      setBet(bet);
    });

    socket.on("start_game", (time: number) => {
      setCards([]);
      setBet(null);
      setLost(-1);
      setWaiting(time);
      setBetType(0);
    });

    socket.on("next_hand", (time: number) => {
      setWaiting(time);
    });

    socket.on("error", (err: string) => {
      // notif error
      console.error(err);
    });

    socket.once("waiting", (wait: number) => setWaiting(wait));

    socket.on("balance_update", (bal: number) => setBalance(bal ?? 0));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const interval = setInterval(() => {
      setWaiting((prev) => prev - 0.01);
    }, 100);

    return () => {
      socket.removeAllListeners();
      clearInterval(interval);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 select-none overflow-hidden">
      <span
        className={clsx("flex flex-col text-center absolute text-2xl font-bold", {
          "top-10": state !== 0,
          "top-20": state === 0,
        })}
      >
        <span>High-Low Haven</span>
        <span className="uppercase">Ace High</span>
      </span>
      {waiting > Date.now() && (
        // Format in mm:ss
        <span className="text-4xl block mb-5 font-bold w-full text-center">
          WAITING {new Date(waiting - Date.now()).toISOString().substr(14, 5)}
        </span>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mb-2">
        {cards.map((card, i) => (
          <Card key={i} suit={card[1]} card={card[0]} />
        ))}
      </div>
      <div className="flex flex-col">
        {bet && (
          <div className="flex flex-row">
            <div className="flex flex-col">
              <span className="text-lg font-bold">Bet: ${bet.bet.toFixed(2)}</span>
              <span className="text-lg font-bold">
                Multiplier: {bet.multiplier.toFixed(2)}x
              </span>
              <span className="text-lg font-bold">Profit: ${bet.profit.toFixed(2)}</span>
            </div>
          </div>
        )}
        {!bet && (
          <span className="text-gray-200 w-full text-center mt-4">
            {state === 0
              ? "Place a bet to play in this round."
              : lost >= 0
              ? lost == 0
                ? "You have lost this round."
                : "You have cashed out this round."
              : "You are not playing this round."}
          </span>
        )}
        {(bet || state === 0) && (
          <span className="font-bold text-2xl uppercase text-center mt-3">betting</span>
        )}
        {state === 0 && (
          <div
            className={clsx("flex flex-row mt-5", {
              "opacity-50": state !== 0,
            })}
          >
            {BET_AMOUNTS.map((amount) => (
              <div
                className="w-[4rem] h-[4rem] bottom-10 flex items-center justify-center mr-4"
                key={amount}
                onClick={() => addBet(amount)}
                style={{
                  background: "url(chips/" + amount + ".png) no-repeat center center",
                  backgroundSize: "contain",
                }}
              ></div>
            ))}
          </div>
        )}
        {bet && cards.length > 0 && (
          <div
            className={clsx("grid grid-cols-3 gap-3 mt-5", {
              "opacity-50": waiting < Date.now(),
            })}
          >
            {BET_TYPES.map((type, i) => (
              <div
                className={clsx(
                  "w-[4rem] h-[4rem] rounded-full transition-colors flex items-center justify-center",
                  {
                    "bg-[#eb9534]": betType === i,
                    "bg-gray-700": betType !== i,
                  }
                )}
                key={type}
                onClick={() => setType(i)}
              >
                <span className="font-bold">{type}</span>
              </div>
            ))}
          </div>
        )}
        {(bet || state === 0) && (
          <>
            {state === 0 && (
              <span className="text-center text-lg mt-2">
                Betting <span className="font-bold">${betAmount}</span>
              </span>
            )}
            {state === 0 && (
              <div className="flex flex-row mt-3 justify-center">
                <div
                  className="w-[4rem] h-[4rem] justify-center items-center flex rounded-full bg-red-500 font-bold text-gray-300"
                  onClick={clearBet}
                >
                  X
                </div>
                <div
                  className="w-[4rem] ml-3 h-[4rem] justify-center items-center flex rounded-full bg-green-600 font-bold text-gray-300 text-3xl"
                  onClick={() => submitBet()}
                >
                  ✓
                </div>
              </div>
            )}
          </>
        )}
        {state === 0 && (
          <div className="w-full fixed max-sm:top-5 md:bottom-5 flex z-10 items-center justify-center">
            <span className="text-center text-lg font-bold uppercase mt-2 p-3 rounded-md bg-zinc-800 text-gray-200">
              ${balance.toFixed(2)} Balance
            </span>
          </div>
        )}
      </div>
      {!detectMob() && (
        <>
          <div className="fixed flex items-center left-[10rem]">
            <Image
              alt="QR Code"
              width={250}
              height={250}
              src={
                "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=http://69.194.47.37:3000/"
              }
            ></Image>
          </div>
          <div className="fixed flex items-center right-[0rem]">
            <div className="p-4 bg-zinc-800 rounded-md text-white w-[30rem] text-sm text-clip shadow-2xl">
              <span className="font-bold text-xl w-full text-center">How to Play:</span>
              <span>
                <pre>
                  {" "}
                  <strong className="text-xl">1.</strong> Place a bet by tapping on the
                  chips and the <span className="text-xl">✓</span>
                  <br></br> button to submit your bet<br></br> at the start of a round{" "}
                  <br></br>(cannot join mid round).
                </pre>
              </span>
              <span>
                <pre>
                  {" "}
                  <strong className="text-xl">2.</strong> Wait for first card to be
                  flipped (first hand)...
                </pre>
              </span>
              <span>
                <pre>
                  {" "}
                  <strong className="text-xl">3.</strong> Bet on the next card to be
                  flipped
                  <br></br>(higher, lower, same, red, black)...
                </pre>
              </span>
              <span>
                <pre>
                  {" "}
                  <strong className="text-xl">4.</strong> Play all 3 hands in a round or
                  cash out early by
                  <br></br>selecting the CASH option and waiting.
                </pre>
              </span>
            </div>
          </div>
        </>
      )}
      {!isConnected && (
        // Loader that blurs background with spinning circle using tailwind
        <div className="fixed top-0 left-0 w-screen h-screen z-50 flex items-center justify-center bg-gray-900 bg-opacity-50">
          <div className="spinner"></div>
        </div>
      )}
    </main>
  );
}
