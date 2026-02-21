"use client";

import { useEffect, useState } from "react";
import { socket } from "../../utils/socket";
import { useRouter } from "next/navigation";

const JoinRoom = () => {
  const [roomId, setRoomId] = useState("");
  const [socketReady, setSocketReady] = useState(socket.connected);
  const router = useRouter();

  useEffect(() => {
    const handleRoomJoined = (roomId) => {
      console.log("✅ Joined room:", roomId);
      router.push(`/rooms/lobby?roomId=${roomId}`);
    };

    const handleConnect = () => {
      setSocketReady(true);
    };

    const handleDisconnect = () => {
      setSocketReady(false);
    };

    const handleSocketError = (message) => {
      console.error("❌", message);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room-joined", handleRoomJoined);
    socket.on("socket-error", handleSocketError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room-joined", handleRoomJoined);
      socket.off("socket-error", handleSocketError);
    };
  }, [router]);

  const handleJoinRoom = () => {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId || !socketReady) return;
    socket.emit("join-room", normalizedRoomId);
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
        className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2 disabled:opacity-50"
        disabled={!socketReady}
        onClick={handleJoinRoom}
      >
        Join Room
      </button>
    </div>
  );
};

export default JoinRoom;
