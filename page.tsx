"use client";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Deck from "react-poker";

const URL = process.env.NODE_ENV === "production" ? undefined : "http://localhost:3001";
export const socket = io(URL!);

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      Hi-Lo Haven
    </main>
  );
}
