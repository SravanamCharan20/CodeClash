"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socket } from "../../utils/socket";
import { useUser } from "../../utils/UserContext";
import { getSocketErrorMessage } from "../../utils/socketError";

const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const READY_COOLDOWN_MS = 700;
const START_COOLDOWN_MS = 1200;

export default function Lobby() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();

  const roomId = (searchParams.get("roomId") || "").trim().toUpperCase();
  const roomIdValid = ROOM_ID_REGEX.test(roomId);

  const [members, setMembers] = useState([]);
  const [allReady, setAllReady] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [roomStatus, setRoomStatus] = useState("lobby");
  const [socketReady, setSocketReady] = useState(socket.connected);
  const [isReadyActionPending, setIsReadyActionPending] = useState(false);
  const [isStartActionPending, setIsStartActionPending] = useState(false);
  const [error, setError] = useState("");
  const readyCooldownRef = useRef(null);
  const startCooldownRef = useRef(null);

  const me = useMemo(() => {
    if (!user) return null;
    return members.find((member) => member.userId === user._id) || null;
  }, [members, user]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!roomIdValid) return;

    const clearReadyCooldown = () => {
      if (readyCooldownRef.current) {
        clearTimeout(readyCooldownRef.current);
        readyCooldownRef.current = null;
      }
    };

    const clearStartCooldown = () => {
      if (startCooldownRef.current) {
        clearTimeout(startCooldownRef.current);
        startCooldownRef.current = null;
      }
    };

    const resetPendingState = () => {
      clearReadyCooldown();
      clearStartCooldown();
      setIsReadyActionPending(false);
      setIsStartActionPending(false);
    };

    const handleConnect = () => {
      setSocketReady(true);
      socket.emit("join-room", roomId);
    };

    const handleDisconnect = () => {
      setSocketReady(false);
      resetPendingState();
    };

    const handleLobbyUpdate = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setMembers(Array.isArray(payload.members) ? payload.members : []);
      setAllReady(Boolean(payload.allReady));
      setCanStart(Boolean(payload.canStart));
      setRoomStatus(payload.status === "started" ? "started" : "lobby");
      setError("");
      resetPendingState();
    };

    const handleRoomStarted = ({ roomId: startedRoomId } = {}) => {
      if (startedRoomId !== roomId) return;
      router.push(`/rooms/devarena?roomId=${roomId}`);
    };

    const handleRoomResume = ({ roomId: resumedRoomId } = {}) => {
      if (resumedRoomId !== roomId) return;
      router.push(`/rooms/devarena?roomId=${roomId}`);
    };

    const handleSocketError = (payload) => {
      resetPendingState();
      setError(getSocketErrorMessage(payload, "Socket error"));
    };

    const handleConnectError = (payload) => {
      setSocketReady(false);
      resetPendingState();
      setError(getSocketErrorMessage(payload, "Realtime connection failed"));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("lobby-update", handleLobbyUpdate);
    socket.on("room-started", handleRoomStarted);
    socket.on("room-resume", handleRoomResume);
    socket.on("socket-error", handleSocketError);
    socket.on("connect_error", handleConnectError);

    if (socket.connected) {
      socket.emit("join-room", roomId);
    }

    return () => {
      resetPendingState();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("lobby-update", handleLobbyUpdate);
      socket.off("room-started", handleRoomStarted);
      socket.off("room-resume", handleRoomResume);
      socket.off("socket-error", handleSocketError);
      socket.off("connect_error", handleConnectError);
    };
  }, [roomId, roomIdValid, router]);

  const handleToggleReady = () => {
    if (!roomIdValid || !me) return;
    if (!socketReady) {
      setError("Realtime connection is not ready");
      return;
    }
    if (roomStatus !== "lobby") {
      setError("Room is already started");
      return;
    }
    if (isReadyActionPending) return;

    setError("");
    setIsReadyActionPending(true);
    socket.emit("toggle-ready", { roomId, ready: !me.ready });
    readyCooldownRef.current = setTimeout(() => {
      setIsReadyActionPending(false);
    }, READY_COOLDOWN_MS);
  };

  const handleStartRoom = () => {
    if (!roomIdValid || !isAdmin) return;
    if (!socketReady) {
      setError("Realtime connection is not ready");
      return;
    }
    if (roomStatus !== "lobby") {
      setError("Room is already started");
      return;
    }
    if (!canStart) {
      setError("All participants must be ready");
      return;
    }
    if (isStartActionPending) return;

    setError("");
    setIsStartActionPending(true);
    socket.emit("start-room", { roomId });
    startCooldownRef.current = setTimeout(() => {
      setIsStartActionPending(false);
    }, START_COOLDOWN_MS);
  };

  if (!roomIdValid) {
    return (
      <main className="arena-page arena-grid-bg flex items-center justify-center">
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          Invalid room id
        </p>
      </main>
    );
  }

  return (
    <main className="arena-page arena-grid-bg px-1 pb-6 pt-2 sm:px-2">
      <section className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-5">
          <h1 className="text-xl font-semibold text-white">Lobby</h1>

          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-md border border-[var(--arena-border)] bg-black/30 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                Room ID
              </p>
              <p className="mt-1 font-semibold tracking-[0.14em] text-white">
                {roomId}
              </p>
            </div>

            <div className="rounded-md border border-[var(--arena-border)] bg-black/30 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                Status
              </p>
              <p className="mt-1 font-medium text-white">{roomStatus}</p>
            </div>

            <div className="rounded-md border border-[var(--arena-border)] bg-black/30 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                Connection
              </p>
              <p
                className={`mt-1 font-medium ${
                  socketReady ? "text-[var(--arena-green)]" : "text-red-400"
                }`}
              >
                {socketReady ? "Connected" : "Disconnected"}
              </p>
            </div>

            <div className="rounded-md border border-[var(--arena-border)] bg-black/30 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                All Ready
              </p>
              <p className="mt-1 font-medium text-white">
                {allReady ? "Yes" : "No"}
              </p>
            </div>
          </div>
        </aside>

        <section className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-5">
          <h2 className="text-lg font-semibold text-white">Participants</h2>
          <ul className="mt-4 space-y-3">
            {members.map((member, index) => (
              <li
                key={`${member.userId}-${index}`}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {member.username}
                    {member.role === "admin" && (
                      <span className="ml-2 text-xs text-[var(--arena-green)]">
                        ADMIN
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                    member.ready
                      ? "bg-green-500/15 text-green-300"
                      : "bg-neutral-700/40 text-neutral-300"
                  }`}
                >
                  {member.ready ? "READY" : "WAITING"}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {me && (
              <button
                className="h-11 rounded-md bg-[var(--arena-green)] text-sm font-semibold text-black transition hover:bg-[var(--arena-green-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  !socketReady || roomStatus !== "lobby" || isReadyActionPending
                }
                onClick={handleToggleReady}
              >
                {isReadyActionPending
                  ? "Updating..."
                  : me.ready
                  ? "Set Not Ready"
                  : "Ready Up"}
              </button>
            )}

            {isAdmin && (
              <button
                disabled={
                  !socketReady ||
                  roomStatus !== "lobby" ||
                  !canStart ||
                  isStartActionPending
                }
                className="h-11 rounded-md border border-[var(--arena-border)] bg-[#1f2937] text-sm font-semibold text-white transition hover:bg-[#273447] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleStartRoom}
              >
                {isStartActionPending ? "Starting..." : "Start Room"}
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
