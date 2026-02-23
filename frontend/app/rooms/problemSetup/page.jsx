"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socket } from "../../utils/socket";
import { useUser } from "../../utils/UserContext";
import { getSocketErrorMessage } from "../../utils/socketError";

const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const MAX_PROBLEMS_PER_ROOM = 5;
const EMPTY_FACETS = {
  topics: [],
  tags: [],
  difficulties: [],
};

const toggleListValue = (current, value) =>
  current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];

function ProblemSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useUser();

  const roomId = (searchParams.get("roomId") || "").trim().toUpperCase();
  const roomIdValid = ROOM_ID_REGEX.test(roomId);

  const [socketReady, setSocketReady] = useState(socket.connected);
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [problems, setProblems] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState([]);
  const [selectedProblemIds, setSelectedProblemIds] = useState([]);
  const [search, setSearch] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [penaltySeconds, setPenaltySeconds] = useState(20);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const hydratedSelectionRef = useRef(false);
  const hydratedConfigRef = useRef(false);

  const problemById = useMemo(() => {
    const lookup = new Map();
    for (const problem of problems) {
      lookup.set(problem.id, problem);
    }
    return lookup;
  }, [problems]);

  const selectedProblems = useMemo(
    () =>
      selectedProblemIds
        .map((problemId) => problemById.get(problemId))
        .filter(Boolean),
    [problemById, selectedProblemIds]
  );

  useEffect(() => {
    hydratedSelectionRef.current = false;
    hydratedConfigRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!roomIdValid) return;

    const handleConnect = () => {
      setSocketReady(true);
      setError("");
      socket.emit("join-room", roomId);
    };

    const handleDisconnect = () => {
      setSocketReady(false);
      setIsSaving(false);
    };

    const handleSocketError = (payload) => {
      setIsSaving(false);
      setLoadingCatalog(false);
      setError(getSocketErrorMessage(payload, "Could not configure problems"));
    };

    const handleConnectError = (payload) => {
      setSocketReady(false);
      setIsSaving(false);
      setLoadingCatalog(false);
      setError(getSocketErrorMessage(payload, "Realtime connection failed"));
    };

    const handleProblemCatalog = (payload = {}) => {
      if (payload.roomId !== roomId) return;

      setLoadingCatalog(false);
      setError("");
      setFacets({
        topics: Array.isArray(payload.facets?.topics)
          ? payload.facets.topics
          : [],
        tags: Array.isArray(payload.facets?.tags) ? payload.facets.tags : [],
        difficulties: Array.isArray(payload.facets?.difficulties)
          ? payload.facets.difficulties
          : [],
      });
      setProblems(Array.isArray(payload.problems) ? payload.problems : []);

      const serverSelectedIds = Array.isArray(
        payload.selectedProblemSet?.problemIds
      )
        ? payload.selectedProblemSet.problemIds
        : [];
      if (!hydratedSelectionRef.current && serverSelectedIds.length > 0) {
        setSelectedProblemIds(serverSelectedIds.slice(0, MAX_PROBLEMS_PER_ROOM));
      }
      if (!hydratedConfigRef.current) {
        const configuredDurationSeconds = Number.parseInt(
          payload.selectedProblemSet?.durationSeconds,
          10
        );
        if (
          Number.isFinite(configuredDurationSeconds) &&
          configuredDurationSeconds > 0
        ) {
          setDurationMinutes(
            Math.max(2, Math.min(120, Math.round(configuredDurationSeconds / 60)))
          );
        }

        const configuredPenaltySeconds = Number.parseInt(
          payload.selectedProblemSet?.penaltySeconds,
          10
        );
        if (
          Number.isFinite(configuredPenaltySeconds) &&
          configuredPenaltySeconds >= 0
        ) {
          setPenaltySeconds(
            Math.max(0, Math.min(300, configuredPenaltySeconds))
          );
        }
      }
      hydratedSelectionRef.current = true;
      hydratedConfigRef.current = true;
    };

    const handleProblemsSet = ({ roomId: configuredRoomId } = {}) => {
      if (configuredRoomId !== roomId) return;
      setIsSaving(false);
      setError("");
      router.push(`/rooms/lobby?roomId=${roomId}`);
    };

    const handleRoomStarted = ({ roomId: startedRoomId } = {}) => {
      if (startedRoomId !== roomId) return;
      router.push(`/rooms/devarena?roomId=${roomId}`);
    };

    const handleRoomResume = ({ roomId: resumedRoomId } = {}) => {
      if (resumedRoomId !== roomId) return;
      router.push(`/rooms/devarena?roomId=${roomId}`);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("socket-error", handleSocketError);
    socket.on("connect_error", handleConnectError);
    socket.on("problem-catalog", handleProblemCatalog);
    socket.on("room-problems-set", handleProblemsSet);
    socket.on("room-started", handleRoomStarted);
    socket.on("room-resume", handleRoomResume);

    if (socket.connected) {
      socket.emit("join-room", roomId);
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("socket-error", handleSocketError);
      socket.off("connect_error", handleConnectError);
      socket.off("problem-catalog", handleProblemCatalog);
      socket.off("room-problems-set", handleProblemsSet);
      socket.off("room-started", handleRoomStarted);
      socket.off("room-resume", handleRoomResume);
    };
  }, [roomId, roomIdValid, router]);

  useEffect(() => {
    if (!roomIdValid || !socketReady) return;

    const debounceId = setTimeout(() => {
      setLoadingCatalog(true);
      socket.emit("get-problem-catalog", {
        roomId,
        topics: selectedTopics,
        tags: selectedTags,
        difficulties: selectedDifficulties,
        search,
      });
    }, 180);

    return () => {
      clearTimeout(debounceId);
    };
  }, [
    roomId,
    roomIdValid,
    socketReady,
    selectedTopics,
    selectedTags,
    selectedDifficulties,
    search,
  ]);

  const toggleProblemSelection = (problemId) => {
    setError("");

    setSelectedProblemIds((current) => {
      if (current.includes(problemId)) {
        return current.filter((id) => id !== problemId);
      }

      if (current.length >= MAX_PROBLEMS_PER_ROOM) {
        setError(`You can select up to ${MAX_PROBLEMS_PER_ROOM} problems`);
        return current;
      }

      return [...current, problemId];
    });
  };

  const handleSetProblems = () => {
    if (!roomIdValid) return;
    if (!socketReady) {
      setError("Realtime connection is not ready");
      return;
    }
    if (selectedProblemIds.length === 0) {
      setError("Select at least one problem");
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 2 || durationMinutes > 120) {
      setError("Duration must be between 2 and 120 minutes");
      return;
    }
    if (!Number.isFinite(penaltySeconds) || penaltySeconds < 0 || penaltySeconds > 300) {
      setError("Penalty must be between 0 and 300 seconds");
      return;
    }
    if (isSaving) return;

    setError("");
    setIsSaving(true);
    socket.emit("set-room-problems", {
      roomId,
      problemIds: selectedProblemIds,
      durationSeconds: durationMinutes * 60,
      penaltySeconds,
    });
  };

  if (!roomIdValid) {
    return (
      <main className="arena-page arena-grid-bg flex items-center justify-center">
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          Invalid room ID
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="arena-page arena-grid-bg flex items-center justify-center">
        <div className="h-40 w-full max-w-4xl animate-pulse rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/60" />
      </main>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <main className="arena-page arena-grid-bg flex items-center justify-center px-4">
        <section className="w-full max-w-md rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">Admin Access Only</h1>
          <p className="mt-2 text-sm text-[var(--arena-muted)]">
            Problem setup is available only for room admins.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-5 h-11 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-sm font-semibold text-white transition hover:bg-[#202025]"
          >
            Back to Dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="arena-page arena-grid-bg px-1 pb-6 pt-2 sm:px-2">
      <section className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-5">
          <h1 className="text-xl font-semibold text-white">Problem Setup</h1>
          <p className="mt-2 text-sm text-[var(--arena-muted)]">
            Choose by topic, tags, or both. Selected problems become the room
            challenge set.
          </p>

          <div className="mt-4 rounded-md border border-[var(--arena-border)] bg-black/30 px-3 py-2">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
              Room ID
            </p>
            <p className="mt-1 font-semibold tracking-[0.14em] text-white">
              {roomId}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                Duration (min)
              </label>
              <input
                type="number"
                min={2}
                max={120}
                value={durationMinutes}
                onChange={(event) =>
                  setDurationMinutes(
                    Number.parseInt(event.target.value || "0", 10) || 0
                  )
                }
                className="mt-2 h-10 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 text-sm text-white outline-none focus:border-[var(--arena-green)]"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                Penalty (sec)
              </label>
              <input
                type="number"
                min={0}
                max={300}
                value={penaltySeconds}
                onChange={(event) =>
                  setPenaltySeconds(
                    Number.parseInt(event.target.value || "0", 10) || 0
                  )
                }
                className="mt-2 h-10 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 text-sm text-white outline-none focus:border-[var(--arena-green)]"
              />
            </div>
          </div>

          <label className="mt-4 block text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
            Search
          </label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, topic, or tag"
            className="mt-2 h-11 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 text-sm text-white outline-none placeholder:text-[#71717a] focus:border-[var(--arena-green)]"
          />

          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
              Topics
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {facets.topics.map((topic) => {
                const active = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() =>
                      setSelectedTopics((current) =>
                        toggleListValue(current, topic)
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                      active
                        ? "border-[var(--arena-green)] bg-green-500/15 text-green-200"
                        : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-[#b6bec9] hover:bg-[#232a34]"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
              Tags
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {facets.tags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((current) => toggleListValue(current, tag))
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                      active
                        ? "border-[var(--arena-green)] bg-green-500/15 text-green-200"
                        : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-[#b6bec9] hover:bg-[#232a34]"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
              Difficulty
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {facets.difficulties.map((difficulty) => {
                const active = selectedDifficulties.includes(difficulty);
                return (
                  <button
                    key={difficulty}
                    type="button"
                    onClick={() =>
                      setSelectedDifficulties((current) =>
                        toggleListValue(current, difficulty)
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                      active
                        ? "border-[var(--arena-green)] bg-green-500/15 text-green-200"
                        : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-[#b6bec9] hover:bg-[#232a34]"
                    }`}
                  >
                    {difficulty}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Available Problems
              </h2>
              <p className="mt-1 text-sm text-[var(--arena-muted)]">
                Selected {selectedProblemIds.length}/{MAX_PROBLEMS_PER_ROOM}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/rooms/lobby?roomId=${roomId}`)}
              className="rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#202833]"
            >
              Go to Lobby
            </button>
          </div>

          {selectedProblems.length > 0 && (
            <div className="mt-4 rounded-md border border-[var(--arena-border)] bg-black/35 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                Current Selection
              </p>
              <ul className="mt-2 space-y-2">
                {selectedProblems.map((problem) => (
                  <li
                    key={problem.id}
                    className="text-sm text-white/90"
                  >{`${problem.title} (${problem.difficulty})`}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {loadingCatalog && (
              <div className="space-y-3">
                <div className="h-20 animate-pulse rounded-md border border-[var(--arena-border)] bg-white/5" />
                <div className="h-20 animate-pulse rounded-md border border-[var(--arena-border)] bg-white/5" />
              </div>
            )}

            {!loadingCatalog && problems.length === 0 && (
              <p className="rounded-md border border-[var(--arena-border)] bg-black/35 px-3 py-4 text-sm text-[var(--arena-muted)]">
                No problems match the selected filters.
              </p>
            )}

            {!loadingCatalog &&
              problems.map((problem) => {
                const checked = selectedProblemIds.includes(problem.id);
                return (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => toggleProblemSelection(problem.id)}
                    className={`w-full rounded-md border px-3 py-3 text-left transition ${
                      checked
                        ? "border-[var(--arena-green)] bg-green-500/10"
                        : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)] hover:bg-[#1f2731]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {problem.title}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                          {problem.topics.join(" • ")}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--arena-muted)]">
                          {problem.statement}
                        </p>
                        <p className="mt-1 text-xs text-[#9fb4cb]">
                          {problem.tags.join(", ")}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                          checked
                            ? "bg-green-500/20 text-green-200"
                            : "bg-white/10 text-white/80"
                        }`}
                      >
                        {checked ? "Selected" : problem.difficulty}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>

          <button
            disabled={!socketReady || selectedProblemIds.length === 0 || isSaving}
            onClick={handleSetProblems}
            className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-[var(--arena-green)] text-sm font-semibold text-black transition hover:bg-[var(--arena-green-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Set Problems & Continue"}
          </button>

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

export default function ProblemSetupPage() {
  return (
    <Suspense
      fallback={
        <main className="arena-page arena-grid-bg flex items-center justify-center px-4">
          <div className="h-40 w-full max-w-6xl animate-pulse rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/60" />
        </main>
      }
    >
      <ProblemSetupContent />
    </Suspense>
  );
}
