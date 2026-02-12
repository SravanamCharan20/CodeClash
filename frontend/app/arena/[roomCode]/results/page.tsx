"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getArena,
  getArenaSubmissions,
  getErrorMessage,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { getRoomSession, normalizeRoomCode } from "@/lib/session";
import { Arena, LeaderboardEntry, SubmissionListPayload, Verdict } from "@/lib/types";

const VERDICT_OPTIONS: Array<"" | Verdict> = [
  "",
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
];

export default function ResultsPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();

  const roomCode = normalizeRoomCode(String(params.roomCode || ""));
  const session = useMemo(() => getRoomSession(roomCode), [roomCode]);

  const [arena, setArena] = useState<Arena | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const [submissionsData, setSubmissionsData] = useState<SubmissionListPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [filterUserId, setFilterUserId] = useState("");
  const [filterVerdict, setFilterVerdict] = useState<"" | Verdict>("");

  const loadArenaSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getArena(roomCode);
      setArena(response.arena);
      setLeaderboard(response.leaderboard || []);

      if (response.arena.state === "LOBBY") {
        router.replace(`/arena/${roomCode}/lobby`);
        return;
      }

      if (response.arena.state === "LIVE") {
        router.replace(`/arena/${roomCode}/contest`);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [roomCode, router]);

  const loadSubmissions = useCallback(async () => {
    try {
      const response = await getArenaSubmissions(roomCode, {
        page,
        limit,
        userId: filterUserId || undefined,
        verdict: filterVerdict || undefined,
        includeCode: true,
      });

      setSubmissionsData(response);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [roomCode, page, limit, filterUserId, filterVerdict]);

  useEffect(() => {
    void loadArenaSummary();
  }, [loadArenaSummary]);

  useEffect(() => {
    if (!arena) return;
    void loadSubmissions();
  }, [arena, loadSubmissions]);

  const podium = leaderboard.slice(0, 3);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded border border-zinc-300 p-4">
          <h1 className="text-xl font-semibold">Results: {roomCode}</h1>
          <p className="mt-1 text-sm text-zinc-600">Final contest summary and submission history.</p>
          <p className="mt-2 text-sm">Viewer: {session?.name || "Guest"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm"
              onClick={() => void loadArenaSummary()}
            >
              Refresh
            </button>
            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm"
              onClick={() => router.push("/")}
            >
              Dashboard
            </button>
          </div>
        </header>

        {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded border border-zinc-300 p-4">
            <h2 className="text-lg font-semibold">Podium</h2>
            {loading ? <p className="mt-2 text-sm text-zinc-600">Loading...</p> : null}

            {podium.length === 0 ? <p className="mt-2 text-sm text-zinc-600">No results yet.</p> : null}

            <div className="mt-3 space-y-2">
              {podium.map((entry) => (
                <div key={entry.userId} className="rounded border border-zinc-200 p-3">
                  <p className="font-medium">
                    #{entry.rank} {entry.name}
                  </p>
                  <p className="text-sm text-zinc-700">
                    score={entry.score}, penalty={entry.penaltySeconds}s, attempts={entry.attempts}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-zinc-300 p-4">
            <h2 className="text-lg font-semibold">Contest Meta</h2>
            <p className="mt-2 text-sm">State: {arena?.state || "-"}</p>
            <p className="mt-1 text-sm">Finish reason: {arena?.finishReason || "-"}</p>
            <p className="mt-1 text-sm">Started: {formatDateTime(arena?.startTime || null)}</p>
            <p className="mt-1 text-sm">Ended: {formatDateTime(arena?.endTime || null)}</p>
            <p className="mt-1 text-sm">Finished at: {formatDateTime(arena?.finishedAt || null)}</p>
          </div>
        </section>

        <section className="rounded border border-zinc-300 p-4">
          <h2 className="text-lg font-semibold">Full Leaderboard</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {leaderboard.map((entry) => (
              <div key={entry.userId} className="rounded border border-zinc-200 p-2 text-sm">
                <p className="font-medium">
                  #{entry.rank} {entry.name}
                </p>
                <p className="text-zinc-700">
                  score={entry.score}, solved={entry.solvedCount}, penalty={entry.penaltySeconds}s
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-zinc-300 p-4">
          <h2 className="text-lg font-semibold">Submission History</h2>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              value={filterUserId}
              onChange={(event) => {
                setFilterUserId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All Users</option>
              {arena?.participants.map((participant) => (
                <option key={participant.userId} value={participant.userId}>
                  {participant.name}
                </option>
              ))}
            </select>

            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              value={filterVerdict}
              onChange={(event) => {
                setFilterVerdict(event.target.value as "" | Verdict);
                setPage(1);
              }}
            >
              {VERDICT_OPTIONS.map((verdict) => (
                <option key={verdict || "ALL"} value={verdict}>
                  {verdict || "All Verdicts"}
                </option>
              ))}
            </select>

            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm"
              onClick={() => void loadSubmissions()}
            >
              Apply Filters
            </button>

            <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              page={submissionsData?.pagination.page || page}, total={submissionsData?.pagination.totalCount || 0}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {submissionsData?.submissions.map((submission) => (
              <article key={submission.id} className="rounded border border-zinc-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {submission.participantName} • {submission.language} • {submission.verdict}
                  </p>
                  <p className="text-xs text-zinc-500">{formatDateTime(submission.createdAt)}</p>
                </div>

                <p className="mt-1 text-zinc-700">
                  passed={submission.passedCount}/{submission.totalCount}, runtime={submission.executionMs}ms,
                  score+={submission.scoreAwarded}, penalty+={submission.penaltySecondsAdded}
                </p>

                {submission.sourceCode ? (
                  <pre className="mt-2 overflow-x-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-xs">
                    {submission.sourceCode}
                  </pre>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">Source code hidden until contest finishes.</p>
                )}
              </article>
            ))}

            {submissionsData && submissionsData.submissions.length === 0 ? (
              <p className="text-sm text-zinc-600">No submissions found for current filter.</p>
            ) : null}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm disabled:opacity-50"
              disabled={!submissionsData?.pagination.hasPrevPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              className="rounded border border-zinc-400 px-3 py-2 text-sm disabled:opacity-50"
              disabled={!submissionsData?.pagination.hasNextPage}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
