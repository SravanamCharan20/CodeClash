"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io } from "socket.io-client";
import {
  getArena,
  getErrorMessage,
  setReadyStatus,
  startArena,
} from "@/lib/api";
import { SOCKET_URL } from "@/lib/config";
import { getRoomSession, normalizeRoomCode } from "@/lib/session";
import { Arena, Participant } from "@/lib/types";

export default function LobbyPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();

  const roomCode = normalizeRoomCode(String(params.roomCode || ""));
  const session = useMemo(() => getRoomSession(roomCode), [roomCode]);

  const [arena, setArena] = useState<Arena | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me: Participant | null = useMemo(() => {
    if (!arena || !session) return null;
    return arena.participants.find((participant) => participant.userId === session.userId) || null;
  }, [arena, session]);

  const isAdmin = me?.role === "ADMIN";

  const loadArenaState = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      try {
        setError(null);
        const response = await getArena(roomCode);
        setArena(response.arena);

        if (response.arena.state === "LIVE") {
          router.replace(`/arena/${roomCode}/contest`);
          return;
        }

        if (response.arena.state === "FINISHED") {
          router.replace(`/arena/${roomCode}/results`);
        }
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [roomCode, router]
  );

  useEffect(() => {
    void loadArenaState(false);

    const intervalId = window.setInterval(() => {
      void loadArenaState(true);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [loadArenaState]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
      socket.emit("arena:join-room", roomCode);
    });

    socket.on("arena:participant-joined", () => {
      void loadArenaState(true);
    });

    socket.on("arena:ready-updated", () => {
      void loadArenaState(true);
    });

    socket.on("arena:contest-started", () => {
      router.replace(`/arena/${roomCode}/contest`);
    });

    socket.on("arena:contest-finished", () => {
      router.replace(`/arena/${roomCode}/results`);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode, router, loadArenaState]);

  async function handleToggleReady() {
    if (!session || !me) return;

    setActionLoading(true);
    setError(null);

    try {
      await setReadyStatus(roomCode, {
        userId: session.userId,
        isReady: !me.isReady,
      });
      await loadArenaState(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStartContest() {
    if (!session) return;

    setActionLoading(true);
    setError(null);

    try {
      await startArena(roomCode, { adminUserId: session.userId });
      router.replace(`/arena/${roomCode}/contest`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="rounded border border-zinc-300 p-4">
          <h1 className="text-xl font-semibold">Lobby: {roomCode}</h1>
          <p className="mt-1 text-sm text-zinc-600">Waiting room before contest starts.</p>
          <p className="mt-2 text-sm">
            Signed in as: <span className="font-medium">{session?.name || "Unknown"}</span>
            {session?.role ? ` (${session.role})` : ""}
          </p>
          {!session ? (
            <p className="mt-2 text-sm text-red-700">
              No saved session for this room. Join again from dashboard.
            </p>
          ) : null}
        </header>

        {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <section className="rounded border border-zinc-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Participants</h2>
            {loading ? <span className="text-sm text-zinc-600">Loading...</span> : null}
          </div>

          <ul className="mt-3 space-y-2">
            {arena?.participants.map((participant) => (
              <li
                key={participant.userId}
                className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2"
              >
                <div>
                  <p className="font-medium">{participant.name}</p>
                  <p className="text-xs text-zinc-600">{participant.role}</p>
                </div>
                <span className={`text-sm ${participant.isReady ? "text-green-700" : "text-zinc-500"}`}>
                  {participant.isReady ? "Ready" : "Not Ready"}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-3">
            {me ? (
              <button
                className="rounded border border-zinc-400 px-3 py-2 text-sm disabled:opacity-60"
                onClick={handleToggleReady}
                disabled={actionLoading || !session || arena?.state !== "LOBBY"}
              >
                {me.isReady ? "Mark Not Ready" : "Mark Ready"}
              </button>
            ) : null}

            {isAdmin ? (
              <button
                className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={handleStartContest}
                disabled={actionLoading || arena?.state !== "LOBBY"}
              >
                Start Contest
              </button>
            ) : null}

            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm"
              onClick={() => void loadArenaState(false)}
            >
              Refresh
            </button>

            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm"
              onClick={() => router.push("/")}
            >
              Back To Dashboard
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
