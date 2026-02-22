"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "../../utils/socket";
import { useRouter } from "next/navigation";
import { getSocketErrorMessage } from "../../utils/socketError";

const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const ROOM_ID_ALLOWED = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/;
const JOIN_COOLDOWN_MS = 1500;

const normalizeRoomInput = (value) =>
  String(value ?? "")
    .toUpperCase()
    .split("")
    .filter((char) => ROOM_ID_ALLOWED.test(char))
    .join("")
    .slice(0, 7);

const JoinRoom = () => {
  const [roomId, setRoomId] = useState("");
  const [socketReady, setSocketReady] = useState(socket.connected);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const joinCooldownRef = useRef(null);

  useEffect(() => {
    const clearJoinCooldown = () => {
      if (joinCooldownRef.current) {
        clearTimeout(joinCooldownRef.current);
        joinCooldownRef.current = null;
      }
    };

    const handleRoomJoined = (roomId) => {
      clearJoinCooldown();
      setIsJoining(false);
      setError("");

      if (!ROOM_ID_REGEX.test(roomId || "")) {
        setError("Server returned an invalid room ID");
        return;
      }

      console.log("✅ Joined room:", roomId);
      router.push(`/rooms/lobby?roomId=${roomId}`);
    };

    const handleConnect = () => {
      setSocketReady(true);
      setError("");
    };

    const handleDisconnect = () => {
      setSocketReady(false);
      setIsJoining(false);
    };

    const handleSocketError = (payload) => {
      clearJoinCooldown();
      setIsJoining(false);
      setError(getSocketErrorMessage(payload, "Could not join room"));
    };

    const handleConnectError = (payload) => {
      clearJoinCooldown();
      setSocketReady(false);
      setIsJoining(false);
      setError(getSocketErrorMessage(payload, "Realtime connection failed"));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room-joined", handleRoomJoined);
    socket.on("socket-error", handleSocketError);
    socket.on("connect_error", handleConnectError);

    return () => {
      clearJoinCooldown();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room-joined", handleRoomJoined);
      socket.off("socket-error", handleSocketError);
      socket.off("connect_error", handleConnectError);
    };
  }, [router]);

  const handleJoinRoom = () => {
    setError("");

    if (!socketReady) {
      setError("Realtime connection is not ready yet");
      return;
    }

    if (!ROOM_ID_REGEX.test(roomId)) {
      setError("Enter a valid 7-character room ID");
      return;
    }

    if (isJoining) {
      return;
    }

    setIsJoining(true);
    socket.emit("join-room", roomId);
    joinCooldownRef.current = setTimeout(() => {
      setIsJoining(false);
    }, JOIN_COOLDOWN_MS);
  };

  return (
    <div>
      <h1>Join Room</h1>

      <input
        placeholder="Enter Room ID"
        value={roomId}
        className="border border-green-500 m-3 p-2"
        onChange={(e) => {
          setRoomId(normalizeRoomInput(e.target.value));
          setError("");
        }}
      />

      <button
        className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2 disabled:opacity-50"
        disabled={!socketReady || isJoining}
        onClick={handleJoinRoom}
      >
        {isJoining ? "Joining..." : "Join Room"}
      </button>

      {error && <p className="text-red-500 m-2">{error}</p>}
    </div>
  );
};

export default JoinRoom;
