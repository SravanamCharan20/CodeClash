"use client";

import { useEffect, useState } from "react";
import { socket } from "../../utils/socket";
import { useRouter } from "next/navigation";

const CreateRoom = () => {
  const router = useRouter();
  const [socketReady, setSocketReady] = useState(socket.connected);

  useEffect(() => {
    const handleRoomCreated = (roomId) => {
      console.log("✅ Room created:", roomId);
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
    socket.on("socket-error", handleSocketError);
    socket.on("room-created", handleRoomCreated);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("socket-error", handleSocketError);
      socket.off("room-created", handleRoomCreated);
    };
  }, [router]);

  const handleCreateRoom = () => {
    if (!socketReady) {
      console.warn("Socket not ready yet");
      return;
    }
    socket.emit("create-room");
  };

  return (
    <div>
      <h1>Create Clash</h1>

      <button
        disabled={!socketReady}
        onClick={handleCreateRoom}
        className="bg-green-500 disabled:opacity-50 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
      >
        Set
      </button>
    </div>
  );
};

export default CreateRoom;
