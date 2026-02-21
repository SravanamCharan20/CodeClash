"use client";
import React, { useEffect } from "react";
import { useUser } from "../utils/UserContext";
import { socket } from "../utils/socket";

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

  const HandleCreateRoom = () => {
    socket.emit("create-room");
  };

  return user.role === "admin" ? (
    <>
      <button
        onClick={() => HandleCreateRoom()}
        className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
      >
        Create Room
      </button>
      <button className="cursor-pointer rounded-sm p-2 text-white m-2">
        Join Room
      </button>
    </>
  ) : (
    <>
      <button className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2">
        Join Room
      </button>
    </>
  );
};

export default Page;
