"use client";

import { useEffect, useState } from "react";
import { socket } from "../../utils/socket"; // adjust path

const JoinRoom = () => {
  const [roomId, setRoomId] = useState("");

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      console.log("User socket connected:", socket.id);
    });

    socket.on("room-joined", (roomId) => {
      console.log("✅ Joined room:", roomId);
    });

    socket.on("error", (msg) => {
      console.error("❌", msg);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleJoinRoom = () => {
    socket.emit("join-room", roomId);
  };

  return (
    <div>
      <h1>Join Room</h1>

      <input
        placeholder="Enter Room ID"
        value={roomId}
        className="border border-green-500 m-3 p-2"
        onChange={(e) => setRoomId(e.target.value)}
      />

      <button
        className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
        onClick={handleJoinRoom}
      >
        Join Room
      </button>
    </div>
  );
};
export default JoinRoom;
