"use client";
import React, { useEffect } from "react";
import { useUser } from "../utils/UserContext";
import { socket } from "../utils/socket";
import Link from "next/link";

const Page = () => {
  const { user } = useUser();

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      console.log("✅ Connected to socket:", socket.id);
    });

    socket.on("room-created", (roomId) => {
      console.log("✅ Room created:", roomId);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!user) return null;

  const handleCreateRoom = () => {
    socket.emit("create-room");
  };

  // 🔐 ADMIN VIEW
  if (user.role === "admin") {
    return (
      <>
        <button
          onClick={handleCreateRoom}
          className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
        >
          Create Room
        </button>

        <Link
          href="/rooms/joinRoom"
          className="cursor-pointer rounded-sm p-2 text-white m-2 inline-block"
        >
          Join Room
        </Link>
      </>
    );
  }

  // 👤 USER VIEW
  return (
    <Link
      href="/rooms/joinRoom"
      className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2 inline-block"
    >
      Join Room
    </Link>
  );
};

export default Page;