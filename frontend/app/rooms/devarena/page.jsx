"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socket } from "../../utils/socket";
import { getSocketErrorMessage } from "../../utils/socketError";

const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;

export default function DevArenaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = (searchParams.get("roomId") || "").trim().toUpperCase();
  const [roomStatus, setRoomStatus] = useState("started");
  const [problemSet, setProblemSet] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ROOM_ID_REGEX.test(roomId)) return;

    const handleConnect = () => {
      socket.emit("join-room", roomId);
    };

    const handleLobbyUpdate = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setRoomStatus(
        payload.status === "started" || payload.status === "countdown"
          ? payload.status
          : "lobby"
      );
      setProblemSet(
        payload.problemSet && typeof payload.problemSet === "object"
          ? payload.problemSet
          : null
      );
      setMemberCount(
        typeof payload.memberCount === "number" ? payload.memberCount : 0
      );
    };

    const handleRoomStarted = ({ roomId: startedRoomId } = {}) => {
      if (startedRoomId !== roomId) return;
      setRoomStatus("started");
      setError("");
    };

    const handleRoomResume = ({ roomId: resumedRoomId } = {}) => {
      if (resumedRoomId !== roomId) return;
      setError("");
    };

    const handleSocketError = (payload) => {
      setError(getSocketErrorMessage(payload, "Realtime room error"));
    };

    socket.on("connect", handleConnect);
    socket.on("lobby-update", handleLobbyUpdate);
    socket.on("room-started", handleRoomStarted);
    socket.on("room-resume", handleRoomResume);
    socket.on("socket-error", handleSocketError);

    if (socket.connected) {
      socket.emit("join-room", roomId);
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("lobby-update", handleLobbyUpdate);
      socket.off("room-started", handleRoomStarted);
      socket.off("room-resume", handleRoomResume);
      socket.off("socket-error", handleSocketError);
    };
  }, [roomId]);

  if (!ROOM_ID_REGEX.test(roomId)) {
    return (
      <main className="arena-page arena-grid-bg flex items-center justify-center">
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          Invalid room ID
        </p>
      </main>
    );
  }

  return (
    <main className="arena-page arena-grid-bg px-1 pb-6 pt-2 sm:px-2">
      <section className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-5">
          <h1 className="text-xl font-semibold text-white">DevArena</h1>
          <div className="mt-4 space-y-3 text-sm">
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
              <p className="mt-1 font-medium text-white">
                {roomStatus.toUpperCase()}
              </p>
            </div>

            <div className="rounded-md border border-[var(--arena-border)] bg-black/30 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                Active Players
              </p>
              <p className="mt-1 font-medium text-white">{memberCount}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-5 h-11 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-sm font-semibold text-white transition hover:bg-[#202833]"
          >
            Back to Dashboard
          </button>
        </aside>

        <section className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-5">
          <h2 className="text-lg font-semibold text-white">Assigned Problems</h2>
          {!problemSet && (
            <p className="mt-4 rounded-md border border-[var(--arena-border)] bg-black/35 px-3 py-3 text-sm text-[var(--arena-muted)]">
              Waiting for problem set synchronization...
            </p>
          )}

          {problemSet && (
            <ul className="mt-4 space-y-3">
              {(Array.isArray(problemSet.problems) ? problemSet.problems : []).map(
                (problem, index) => (
                  <li
                    key={problem.id || `${problem.title}-${index}`}
                    className="rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 py-3"
                  >
                    <p className="text-sm font-semibold text-white">
                      {index + 1}. {problem.title}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                      {problem.difficulty}
                    </p>
                    <p className="mt-1 text-xs text-[#9fb4cb]">
                      {(problem.topics || []).join(" • ")}
                    </p>
                  </li>
                )
              )}
            </ul>
          )}

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
