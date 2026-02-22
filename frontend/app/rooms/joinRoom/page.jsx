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

    const handleRoomResume = ({ roomId } = {}) => {
      clearJoinCooldown();
      setIsJoining(false);
      setError("");

      if (!ROOM_ID_REGEX.test(roomId || "")) {
        setError("Server returned an invalid room ID");
        return;
      }

      router.push(`/rooms/devarena?roomId=${roomId}`);
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
    socket.on("room-resume", handleRoomResume);
    socket.on("socket-error", handleSocketError);
    socket.on("connect_error", handleConnectError);

    return () => {
      clearJoinCooldown();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room-joined", handleRoomJoined);
      socket.off("room-resume", handleRoomResume);
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
    <main className="arena-page arena-grid-bg flex items-center justify-center px-3 py-4">
      <section className="w-full max-w-xl rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">
          Join Room
        </h1>
        <p className="mt-2 text-sm text-[var(--arena-muted)]">
          Enter the room code shared by your friend.
        </p>

        <label className="mt-6 block text-xs uppercase tracking-[0.14em] text-[var(--arena-muted)]">
          Room Code
        </label>
        <input
          placeholder="ENTER CODE"
          value={roomId}
          className="mt-2 h-11 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 text-center text-sm font-semibold tracking-[0.18em] text-white outline-none placeholder:text-[#71717a] focus:border-[var(--arena-green)]"
          onChange={(e) => {
            setRoomId(normalizeRoomInput(e.target.value));
            setError("");
          }}
        />

        <button
          className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-[var(--arena-green)] text-sm font-semibold text-black transition hover:bg-[var(--arena-green-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!socketReady || isJoining}
          onClick={handleJoinRoom}
        >
          {isJoining ? "Joining..." : "Join Room"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-sm font-semibold text-white transition hover:bg-[#202025]"
        >
          Back to Dashboard
        </button>

        {error && (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </section>
    </main>
  );
};

export default JoinRoom;
