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
      router.push(`/rooms/problemSetup?roomId=${roomId}`);
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
    <main className="arena-page arena-grid-bg flex items-center justify-center px-3 py-4">
      <section className="w-full max-w-xl rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">
          Create Room
        </h1>
        <p className="mt-2 text-sm text-[var(--arena-muted)]">
          Generate a private room code, then configure the challenge set.
        </p>

        <div className="mt-6 rounded-lg border border-[var(--arena-border)] bg-black/35 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--arena-muted)]">
            Connection
          </p>
          <p
            className={`mt-1 text-sm font-medium ${
              socketReady ? "text-[var(--arena-green)]" : "text-red-400"
            }`}
          >
            {socketReady ? "Connected" : "Disconnected"}
          </p>
        </div>

        <button
          disabled={!socketReady || isCreating}
          onClick={handleCreateRoom}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-[var(--arena-green)] text-sm font-semibold text-black transition hover:bg-[var(--arena-green-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? "Creating room..." : "Create Room"}
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

export default CreateRoom;
