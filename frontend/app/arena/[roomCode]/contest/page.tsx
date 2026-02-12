"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io } from "socket.io-client";
import {
  finishArena,
  getArena,
  getArenaLeaderboard,
  getSubmissionJobStatus,
  getArenaTimer,
  getErrorMessage,
  submitSolution,
} from "@/lib/api";
import { SOCKET_URL } from "@/lib/config";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getRoomSession, normalizeRoomCode } from "@/lib/session";
import { Arena, LeaderboardEntry } from "@/lib/types";

function leaderboardSort(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.penaltySeconds !== b.penaltySeconds) return a.penaltySeconds - b.penaltySeconds;

  const aAccepted = a.acceptedAt ? new Date(a.acceptedAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bAccepted = b.acceptedAt ? new Date(b.acceptedAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (aAccepted !== bAccepted) return aAccepted - bAccepted;

  return a.name.localeCompare(b.name);
}

function upsertLeaderboardEntry(
  current: LeaderboardEntry[],
  entry: LeaderboardEntry
): LeaderboardEntry[] {
  const merged = [...current.filter((row) => row.userId !== entry.userId), entry].sort(leaderboardSort);
  return merged.map((row, index) => ({ ...row, rank: index + 1 }));
}

export default function ContestPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();

  const roomCode = normalizeRoomCode(String(params.roomCode || ""));
  const session = useMemo(() => getRoomSession(roomCode), [roomCode]);

  const [arena, setArena] = useState<Arena | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const [language, setLanguage] = useState("javascript");
  const [sourceCode, setSourceCode] = useState(
    "function solve(input) {\n  // Write your solution\n  return input;\n}\n"
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  const me = useMemo(() => {
    if (!arena || !session) return null;
    return arena.participants.find((participant) => participant.userId === session.userId) || null;
  }, [arena, session]);

  const isAdmin = me?.role === "ADMIN";

  const loadContestState = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      try {
        setError(null);

        const [arenaResponse, timerResponse, leaderboardResponse] = await Promise.all([
          getArena(roomCode),
          getArenaTimer(roomCode),
          getArenaLeaderboard(roomCode),
        ]);

        setArena(arenaResponse.arena);
        setLeaderboard(leaderboardResponse.leaderboard || arenaResponse.leaderboard || []);
        setRemainingSeconds(timerResponse.remainingSeconds);

        if (arenaResponse.arena.state === "LOBBY") {
          router.replace(`/arena/${roomCode}/lobby`);
          return;
        }

        if (arenaResponse.arena.state === "FINISHED") {
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
    void loadContestState(false);

    const syncInterval = window.setInterval(() => {
      void loadContestState(true);
    }, 5000);

    return () => window.clearInterval(syncInterval);
  }, [loadContestState]);

  useEffect(() => {
    if (arena?.state !== "LIVE") return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [arena?.state]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("connect", () => {
      socket.emit("arena:join-room", roomCode);
    });

    socket.on("arena:leaderboard-updated", (payload: { leaderboard: LeaderboardEntry[] }) => {
      if (Array.isArray(payload?.leaderboard)) {
        setLeaderboard(payload.leaderboard);
      }
    });

    socket.on("arena:leaderboard-delta", (payload: { entry: LeaderboardEntry }) => {
      if (payload?.entry) {
        setLeaderboard((previous) => upsertLeaderboardEntry(previous, payload.entry));
      }
    });

    socket.on("arena:leaderboard-top", (payload: { leaderboard: LeaderboardEntry[] }) => {
      if (Array.isArray(payload?.leaderboard) && payload.leaderboard.length > 0) {
        setLeaderboard(payload.leaderboard);
      }
    });

    socket.on(
      "arena:submission-result",
      (payload: {
        jobId?: string;
        userId: string;
        verdict: string;
        passedCount: number;
        totalCount: number;
        executionMs: number;
      }) => {
        if (payload.userId === session?.userId) {
          setFeedback(
            `${payload.verdict} (${payload.passedCount}/${payload.totalCount}) in ${payload.executionMs}ms`
          );
          if (!payload.jobId || payload.jobId === pendingJobId) {
            setPendingJobId(null);
            void loadContestState(true);
          }
        }
      }
    );

    socket.on(
      "arena:submission-skipped",
      (payload: { userId: string; jobId?: string; message?: string }) => {
        if (payload.userId === session?.userId) {
          if (!payload.jobId || payload.jobId === pendingJobId) {
            setPendingJobId(null);
            setError(payload.message || "Submission was skipped.");
            void loadContestState(true);
          }
        }
      }
    );

    socket.on("arena:submission-failed", (payload: { jobId?: string; failedReason?: string }) => {
      if (pendingJobId && payload?.jobId === pendingJobId) {
        setPendingJobId(null);
        setError(payload.failedReason || "Submission job failed.");
      }
    });

    socket.on(
      "arena:contest-started",
      (payload: { endTime: string; remainingSeconds?: number; serverTime?: string }) => {
        if (typeof payload.remainingSeconds === "number") {
          setRemainingSeconds(payload.remainingSeconds);
          return;
        }

        const endTimeMs = payload.endTime ? new Date(payload.endTime).getTime() : NaN;
        const serverTimeMs = payload.serverTime ? new Date(payload.serverTime).getTime() : Date.now();

        if (!Number.isNaN(endTimeMs)) {
          setRemainingSeconds(Math.max(0, Math.floor((endTimeMs - serverTimeMs) / 1000)));
        }
      }
    );

    socket.on("arena:contest-finished", () => {
      router.replace(`/arena/${roomCode}/results`);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode, router, session?.userId, pendingJobId, loadContestState]);

  useEffect(() => {
    if (!pendingJobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const status = await getSubmissionJobStatus(roomCode, pendingJobId);
        if (cancelled) return;

        if (status.state === "completed") {
          setPendingJobId(null);

          const result = status.result;

          if (result && result.type === "PROCESSED") {
            const submission = result.submission;
            setFeedback(
              `${submission.verdict} (${submission.passedCount}/${submission.totalCount}) in ${submission.executionMs}ms`
            );

            if (result.leaderboardEntry) {
              setLeaderboard((previous) =>
                upsertLeaderboardEntry(previous, result.leaderboardEntry as LeaderboardEntry)
              );
            }

            if (result.finished || result.arenaState === "FINISHED") {
              router.replace(`/arena/${roomCode}/results`);
              return;
            }
          } else if (result && result.type === "SKIPPED") {
            setError(result.message || "Submission skipped.");
          }

          await loadContestState(true);
          return;
        }

        if (status.state === "failed") {
          setPendingJobId(null);
          setError(status.failedReason || "Submission failed.");
        }
      } catch (err) {
        if (cancelled) return;
        setPendingJobId(null);
        setError(getErrorMessage(err));
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pendingJobId, roomCode, router, loadContestState]);

  async function handleSubmitSolution() {
    if (!session) {
      setError("No session found. Please rejoin from dashboard.");
      return;
    }

    if (!sourceCode.trim()) {
      setError("Source code cannot be empty.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await submitSolution(roomCode, {
        userId: session.userId,
        language,
        sourceCode,
      });

      setPendingJobId(response.jobId);
      setFeedback(`Submission queued (job: ${response.jobId.slice(0, 8)})`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinishContest() {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      await finishArena(roomCode, { requestedBy: session.userId });
      router.replace(`/arena/${roomCode}/results`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[1.1fr_1.4fr_1fr]">
        <section className="rounded border border-zinc-300 p-4">
          <h1 className="text-lg font-semibold">Problem</h1>
          <p className="mt-1 text-sm text-zinc-600">Room: {roomCode}</p>

          {loading ? <p className="mt-3 text-sm text-zinc-600">Loading...</p> : null}

          {arena ? (
            <>
              <h2 className="mt-3 text-base font-semibold">{arena.problem.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{arena.problem.description}</p>

              {arena.problem.constraints.length > 0 ? (
                <div className="mt-4">
                  <p className="text-sm font-medium">Constraints</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {arena.problem.constraints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {arena.problem.examples.length > 0 ? (
                <div className="mt-4">
                  <p className="text-sm font-medium">Examples</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {arena.problem.examples.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p>Visible tests: {arena.problem.testCases.length}</p>
                <p>Hidden tests: {arena.problem.hiddenTestCount}</p>
              </div>
            </>
          ) : null}
        </section>

        <section className="rounded border border-zinc-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Editor</h2>
            <div className="flex items-center gap-2">
              <label htmlFor="language" className="text-sm text-zinc-700">
                Language
              </label>
              <select
                id="language"
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
            </div>
          </div>

          <textarea
            className="mt-3 min-h-[430px] w-full rounded border border-zinc-300 p-3 font-mono text-sm"
            value={sourceCode}
            onChange={(event) => setSourceCode(event.target.value)}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              disabled={submitting || loading || Boolean(pendingJobId)}
              onClick={handleSubmitSolution}
            >
              {submitting ? "Queueing..." : pendingJobId ? "Submission In Queue..." : "Submit"}
            </button>

            {isAdmin ? (
              <button
                className="rounded border border-zinc-500 px-4 py-2 text-sm disabled:opacity-60"
                disabled={submitting || loading}
                onClick={handleFinishContest}
              >
                Finish Contest (Admin)
              </button>
            ) : null}

            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm"
              onClick={() => void loadContestState(false)}
            >
              Refresh
            </button>
          </div>

          {feedback ? (
            <p className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
              {feedback}
            </p>
          ) : null}

          {pendingJobId ? (
            <p className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
              Waiting for judge result... jobId={pendingJobId}
            </p>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </section>

        <section className="rounded border border-zinc-300 p-4">
          <h2 className="text-lg font-semibold">Live Leaderboard</h2>
          <p className="mt-1 text-sm text-zinc-600">State: {arena?.state || "-"}</p>
          <p className="mt-1 text-sm font-medium">Time Left: {formatDuration(remainingSeconds)}</p>
          <p className="mt-1 text-xs text-zinc-500">Start: {formatDateTime(arena?.startTime || null)}</p>
          <p className="mt-1 text-xs text-zinc-500">End: {formatDateTime(arena?.endTime || null)}</p>

          <div className="mt-3 space-y-2">
            {leaderboard.map((entry) => (
              <div key={entry.userId} className="rounded border border-zinc-200 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    #{entry.rank} {entry.name}
                  </span>
                  <span>{entry.score} pts</span>
                </div>
                <p className="text-xs text-zinc-600">
                  solved={entry.solvedCount} attempts={entry.attempts} penalty={entry.penaltySeconds}s
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
