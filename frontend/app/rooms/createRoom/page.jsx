"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "../../utils/socket";
import { useRouter } from "next/navigation";
import { getSocketErrorMessage } from "../../utils/socketError";

const CREATE_COOLDOWN_MS = 1500;

const CreateRoom = () => {
  const router = useRouter();
  const [socketReady, setSocketReady] = useState(socket.connected);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const createCooldownRef = useRef(null);

  useEffect(() => {
    const clearCreateCooldown = () => {
      if (createCooldownRef.current) {
        clearTimeout(createCooldownRef.current);
        createCooldownRef.current = null;
      }
    };

    const handleRoomCreated = (roomId) => {
      clearCreateCooldown();
      setIsCreating(false);
      setError("");

      if (typeof roomId !== "string" || roomId.trim().length === 0) {
        setError("Invalid room data received from server");
        return;
      }

      console.log("✅ Room created:", roomId);
      router.push(`/rooms/lobby?roomId=${roomId}`);
    };

    const handleConnect = () => {
      setSocketReady(true);
      setError("");
    };

    const handleDisconnect = () => {
      setSocketReady(false);
      setIsCreating(false);
    };

    const handleSocketError = (payload) => {
      clearCreateCooldown();
      setIsCreating(false);
      setError(getSocketErrorMessage(payload, "Could not create room"));
    };

    const handleConnectError = (payload) => {
      clearCreateCooldown();
      setSocketReady(false);
      setIsCreating(false);
      setError(getSocketErrorMessage(payload, "Realtime connection failed"));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("socket-error", handleSocketError);
    socket.on("connect_error", handleConnectError);
    socket.on("room-created", handleRoomCreated);

    return () => {
      clearCreateCooldown();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("socket-error", handleSocketError);
      socket.off("connect_error", handleConnectError);
      socket.off("room-created", handleRoomCreated);
    };
  }, [router]);

  const handleCreateRoom = () => {
    setError("");
    if (!socketReady) {
      setError("Realtime connection is not ready yet");
      return;
    }

    if (isCreating) {
      return;
    }

    setIsCreating(true);
    socket.emit("create-room");
    createCooldownRef.current = setTimeout(() => {
      setIsCreating(false);
    }, CREATE_COOLDOWN_MS);
  };

  return (
    <div>
      <h1>Create Clash</h1>

      <button
        disabled={!socketReady || isCreating}
        onClick={handleCreateRoom}
        className="bg-green-500 disabled:opacity-50 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
      >
        {isCreating ? "Creating..." : "Set"}
      </button>

      {error && <p className="text-red-500 m-2">{error}</p>}
    </div>
  );
};

export default CreateRoom;
