"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socket } from "../../utils/socket";
import { useUser } from "../../utils/UserContext";
import { getSocketErrorMessage } from "../../utils/socketError";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[440px] w-full animate-pulse rounded-md border border-[var(--arena-border)] bg-white/5" />
  ),
});

const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const CODE_SYNC_DELAY_MS = 280;

const formatSeconds = (totalSeconds) => {
  const safe = Math.max(0, Number.parseInt(totalSeconds || 0, 10));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
};

const formatRuntime = (runtimeMs) => {
  if (!Number.isFinite(runtimeMs) || runtimeMs < 0) return "0 ms";
  if (runtimeMs < 1000) return `${runtimeMs} ms`;
  return `${(runtimeMs / 1000).toFixed(2)} s`;
};

const getLanguageLabel = (language) => {
  if (language === "python") return "Python";
  return "JavaScript";
};

const formatValueForDisplay = (value) => {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getPreferredResultIndex = (results) => {
  if (!Array.isArray(results) || results.length === 0) return 0;
  const firstFailure = results.findIndex((result) => !result?.passed);
  return firstFailure >= 0 ? firstFailure : 0;
};

const hasText = (value) => typeof value === "string" && value.length > 0;

function DevArenaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useUser();

  const roomId = (searchParams.get("roomId") || "").trim().toUpperCase();
  const roomIdValid = ROOM_ID_REGEX.test(roomId);

  const [socketReady, setSocketReady] = useState(socket.connected);
  const [arenaState, setArenaState] = useState(null);
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [codeDrafts, setCodeDrafts] = useState({});
  const [presenceByUser, setPresenceByUser] = useState({});
  const [runResult, setRunResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [selectedRunResultIndex, setSelectedRunResultIndex] = useState(0);
  const [selectedSubmitResultIndex, setSelectedSubmitResultIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [codeViewer, setCodeViewer] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const syncTimersRef = useRef(new Map());

  const problemSet = arenaState?.problemSet || null;
  const problems = useMemo(
    () => (Array.isArray(problemSet?.problems) ? problemSet.problems : []),
    [problemSet]
  );
  const scoreboard = useMemo(
    () => (Array.isArray(arenaState?.scoreboard) ? arenaState.scoreboard : []),
    [arenaState]
  );
  const runTests = useMemo(
    () => (Array.isArray(runResult?.results) ? runResult.results : []),
    [runResult]
  );
  const submissionTests = useMemo(
    () =>
      Array.isArray(submitResult?.execution?.results)
        ? submitResult.execution.results
        : [],
    [submitResult]
  );
  const activeRunTest =
    runTests[
      Math.min(
        selectedRunResultIndex,
        runTests.length > 0 ? runTests.length - 1 : 0
      )
    ] || null;
  const activeSubmissionTest =
    submissionTests[
      Math.min(
        selectedSubmitResultIndex,
        submissionTests.length > 0 ? submissionTests.length - 1 : 0
      )
    ] || null;

  const meInScoreboard = useMemo(() => {
    if (!user) return null;
    return scoreboard.find((entry) => entry.userId === user._id) || null;
  }, [scoreboard, user]);

  const currentProblem = useMemo(() => {
    if (problems.length === 0) return null;
    return (
      problems.find((problem) => problem.id === selectedProblemId) || problems[0]
    );
  }, [problems, selectedProblemId]);

  const currentCode = useMemo(() => {
    if (!currentProblem) return "";
    const problemCodes = codeDrafts[currentProblem.id] || {};
    if (typeof problemCodes[language] === "string") {
      return problemCodes[language];
    }
    return currentProblem.starterCode?.[language] || "";
  }, [codeDrafts, currentProblem, language]);

  const timeLeftSeconds = useMemo(() => {
    if (!arenaState?.endsAt || arenaState.status !== "started") return 0;
    return Math.max(0, Math.ceil((arenaState.endsAt - nowTs) / 1000));
  }, [arenaState, nowTs]);

  const canSubmit =
    socketReady &&
    arenaState?.status === "started" &&
    currentProblem &&
    typeof currentCode === "string" &&
    currentCode.trim().length > 0;

  useEffect(() => {
    const ticker = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      clearInterval(ticker);
    };
  }, []);

  useEffect(() => {
    if (!roomIdValid) return;
    const syncTimers = syncTimersRef.current;

    const requestFreshState = () => {
      socket.emit("join-room", roomId);
      socket.emit("get-arena-state", { roomId });
    };

    const handleConnect = () => {
      setSocketReady(true);
      setError("");
      requestFreshState();
    };

    const handleDisconnect = () => {
      setSocketReady(false);
      setIsRunning(false);
      setIsSubmitting(false);
    };

    const handleRoomStarted = ({ roomId: startedRoomId } = {}) => {
      if (startedRoomId !== roomId) return;
      requestFreshState();
    };

    const handleRoomResume = ({ roomId: resumedRoomId } = {}) => {
      if (resumedRoomId !== roomId) return;
      requestFreshState();
    };

    const handleRoomFinished = ({ roomId: finishedRoomId, reason } = {}) => {
      if (finishedRoomId !== roomId) return;
      setInfoMessage(
        reason === "time_up"
          ? "Arena finished: time is over."
          : reason === "all_solved"
          ? "Arena finished: all participants solved all problems."
          : "Arena finished."
      );
      setIsSubmitting(false);
      setIsRunning(false);
      socket.emit("get-arena-state", { roomId });
    };

    const handleArenaState = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setArenaState(payload);
      setError("");

      const incomingProblems = Array.isArray(payload.problemSet?.problems)
        ? payload.problemSet.problems
        : [];
      if (incomingProblems.length > 0) {
        setSelectedProblemId((previous) => {
          if (
            previous &&
            incomingProblems.some((problem) => problem.id === previous)
          ) {
            return previous;
          }
          return incomingProblems[0].id;
        });

        setCodeDrafts((previous) => {
          const next = { ...previous };
          for (const problem of incomingProblems) {
            const existingByProblem = next[problem.id] || {};
            next[problem.id] = {
              javascript:
                typeof existingByProblem.javascript === "string"
                  ? existingByProblem.javascript
                  : problem.starterCode?.javascript || "",
              python:
                typeof existingByProblem.python === "string"
                  ? existingByProblem.python
                  : problem.starterCode?.python || "",
            };
          }
          return next;
        });
      }

      if (payload.status !== "started") {
        setIsRunning(false);
        setIsSubmitting(false);
      }
    };

    const handleRunResult = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setIsRunning(false);
      setRunResult(payload);
      setSelectedRunResultIndex(getPreferredResultIndex(payload.results));
      if (!payload.ok) {
        setError(payload.message || "Run failed");
      }
    };

    const handleSubmitResult = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setIsSubmitting(false);
      setSubmitResult(payload);
      setSelectedSubmitResultIndex(
        getPreferredResultIndex(payload.execution?.results)
      );
      if (!payload.execution?.ok) {
        setError(payload.execution?.message || "Submission failed");
      } else {
        setError("");
      }
    };

    const handleParticipantCode = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setCodeViewer(payload);
      setError("");
    };

    const handleCodePresence = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setPresenceByUser((previous) => ({
        ...previous,
        [payload.userId]: payload.updatedAt || Date.now(),
      }));
    };

    const handleSocketError = (payload) => {
      setIsRunning(false);
      setIsSubmitting(false);
      setError(getSocketErrorMessage(payload, "Socket error"));
    };

    const handleConnectError = (payload) => {
      setSocketReady(false);
      setIsRunning(false);
      setIsSubmitting(false);
      setError(getSocketErrorMessage(payload, "Realtime connection failed"));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room-started", handleRoomStarted);
    socket.on("room-resume", handleRoomResume);
    socket.on("room-finished", handleRoomFinished);
    socket.on("arena-state", handleArenaState);
    socket.on("code-run-result", handleRunResult);
    socket.on("solution-submitted", handleSubmitResult);
    socket.on("participant-code", handleParticipantCode);
    socket.on("arena-code-presence", handleCodePresence);
    socket.on("socket-error", handleSocketError);
    socket.on("connect_error", handleConnectError);

    if (socket.connected) {
      requestFreshState();
    }

    return () => {
      for (const timeoutId of syncTimers.values()) {
        clearTimeout(timeoutId);
      }
      syncTimers.clear();

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room-started", handleRoomStarted);
      socket.off("room-resume", handleRoomResume);
      socket.off("room-finished", handleRoomFinished);
      socket.off("arena-state", handleArenaState);
      socket.off("code-run-result", handleRunResult);
      socket.off("solution-submitted", handleSubmitResult);
      socket.off("participant-code", handleParticipantCode);
      socket.off("arena-code-presence", handleCodePresence);
      socket.off("socket-error", handleSocketError);
      socket.off("connect_error", handleConnectError);
    };
  }, [roomId, roomIdValid]);

  const queueCodeSync = (problemId, nextLanguage, nextCode) => {
    if (!roomIdValid) return;

    const key = `${problemId}:${nextLanguage}`;
    const previousTimer = syncTimersRef.current.get(key);
    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const timeoutId = setTimeout(() => {
      socket.emit("arena-code-update", {
        roomId,
        problemId,
        language: nextLanguage,
        code: nextCode,
      });
      syncTimersRef.current.delete(key);
    }, CODE_SYNC_DELAY_MS);

    syncTimersRef.current.set(key, timeoutId);
  };

  const handleEditorChange = (nextValue) => {
    if (!currentProblem) return;

    const normalized = typeof nextValue === "string" ? nextValue : "";
    setCodeDrafts((previous) => ({
      ...previous,
      [currentProblem.id]: {
        ...(previous[currentProblem.id] || {}),
        [language]: normalized,
      },
    }));

    queueCodeSync(currentProblem.id, language, normalized);
  };

  const handleRunCode = () => {
    if (!currentProblem) return;
    if (!socketReady) {
      setError("Realtime connection is not ready");
      return;
    }
    if (arenaState?.status !== "started") {
      setError("Arena is not active");
      return;
    }
    if (isRunning || isSubmitting) return;

    setError("");
    setIsRunning(true);
    setRunResult(null);
    socket.emit("run-code", {
      roomId,
      problemId: currentProblem.id,
      language,
      code: currentCode,
    });
  };

  const handleSubmit = () => {
    if (!currentProblem) return;
    if (!socketReady) {
      setError("Realtime connection is not ready");
      return;
    }
    if (arenaState?.status !== "started") {
      setError("Arena is not active");
      return;
    }
    if (isSubmitting || isRunning) return;

    setError("");
    setIsSubmitting(true);
    setSubmitResult(null);
    socket.emit("submit-solution", {
      roomId,
      problemId: currentProblem.id,
      language,
      code: currentCode,
    });
  };

  const handleRequestCode = (targetUserId) => {
    if (!currentProblem) return;
    socket.emit("request-participant-code", {
      roomId,
      targetUserId,
      problemId: currentProblem.id,
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
      <main className="arena-page arena-grid-bg flex items-center justify-center px-4">
        <div className="h-40 w-full max-w-6xl animate-pulse rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/60" />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="arena-page arena-grid-bg px-1 pb-6 pt-2 sm:px-2">
      <section className="mx-auto w-full max-w-[1400px] space-y-4">
        <header className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--arena-muted)]">
                DevArena
              </p>
              <h1 className="text-xl font-semibold text-white">Room {roomId}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-[var(--arena-border)] bg-black/35 px-3 py-1 text-[var(--arena-muted)]">
                Status: {arenaState?.status?.toUpperCase() || "WAITING"}
              </span>
              <span
                className={`rounded-full border px-3 py-1 font-semibold ${
                  arenaState?.status === "started"
                    ? "border-[var(--arena-green)] bg-green-500/10 text-green-200"
                    : "border-[var(--arena-border)] bg-black/35 text-[var(--arena-muted)]"
                }`}
              >
                Time Left: {formatSeconds(timeLeftSeconds)}
              </span>
              <span className="rounded-full border border-[var(--arena-border)] bg-black/35 px-3 py-1 text-[var(--arena-muted)]">
                Connected: {socketReady ? "Yes" : "No"}
              </span>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-full border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 py-1 text-sm font-semibold text-white transition hover:bg-[#212b36]"
              >
                Exit
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr_0.9fr]">
          <aside className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--arena-muted)]">
              Problems
            </h2>

            <div className="mt-3 space-y-2">
              {problems.map((problem, index) => {
                const active = currentProblem?.id === problem.id;
                const myProgress = meInScoreboard?.perProblem?.find(
                  (entry) => entry.problemId === problem.id
                );
                return (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => {
                      setSelectedProblemId(problem.id);
                      setRunResult(null);
                      setSubmitResult(null);
                      setSelectedRunResultIndex(0);
                      setSelectedSubmitResultIndex(0);
                      setError("");
                    }}
                    className={`w-full rounded-md border px-3 py-3 text-left transition ${
                      active
                        ? "border-[var(--arena-green)] bg-green-500/10"
                        : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)] hover:bg-[#1f2731]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {index + 1}. {problem.title}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                          {problem.difficulty} • {problem.topics.join(" • ")}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                          myProgress?.solved
                            ? "bg-green-500/20 text-green-200"
                            : "bg-white/10 text-white/80"
                        }`}
                      >
                        {myProgress?.solved ? "Solved" : "Open"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {currentProblem && (
              <div className="mt-4 rounded-md border border-[var(--arena-border)] bg-black/35 p-3">
                <h3 className="text-sm font-semibold text-white">{currentProblem.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[var(--arena-muted)]">
                  {currentProblem.statement}
                </p>
                <ul className="mt-3 space-y-1 text-xs text-[var(--arena-muted)]">
                  {(Array.isArray(currentProblem.constraints)
                    ? currentProblem.constraints
                    : []
                  ).map((constraint, index) => (
                    <li key={`${constraint}-${index}`}>• {constraint}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          <section className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                  Editor
                </p>
                <h2 className="text-lg font-semibold text-white">
                  {currentProblem ? currentProblem.title : "Select a problem"}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="h-10 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 text-sm font-medium text-white outline-none"
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                </select>

                <button
                  type="button"
                  onClick={handleRunCode}
                  disabled={!canSubmit || isRunning || isSubmitting}
                  className="h-10 rounded-md border border-[var(--arena-border)] bg-[#1f2937] px-4 text-sm font-semibold text-white transition hover:bg-[#273447] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunning ? "Running..." : "Run"}
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || isSubmitting || isRunning}
                  className="h-10 rounded-md bg-[var(--arena-green)] px-4 text-sm font-semibold text-black transition hover:bg-[var(--arena-green-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-md border border-[var(--arena-border)]">
              <MonacoEditor
                height="440px"
                language={language === "python" ? "python" : "javascript"}
                theme="vs-dark"
                value={currentCode}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  automaticLayout: true,
                  tabSize: 2,
                  smoothScrolling: true,
                  padding: { top: 12 },
                }}
              />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-md border border-[var(--arena-border)] bg-black/35 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                  Run Output
                </p>
                {!runResult && (
                  <p className="mt-2 text-sm text-[var(--arena-muted)]">
                    Execute code to view sample test results.
                  </p>
                )}
                {runResult && (
                  <div className="mt-2 space-y-2 text-sm text-white/90">
                    {runResult.ok ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              runResult.passedAll
                                ? "bg-green-500/20 text-green-200"
                                : "bg-yellow-500/20 text-yellow-200"
                            }`}
                          >
                            {runResult.passedAll ? "Accepted" : "Wrong Answer"}
                          </span>
                          <span className="text-xs text-[var(--arena-muted)]">
                            Passed {runResult.passedCount}/
                            {runResult.passedCount + runResult.failedCount} tests
                            {" "}• Runtime {formatRuntime(runResult.runtimeMs)}
                          </span>
                        </div>

                        {(hasText(runResult.setupStdout) ||
                          hasText(runResult.setupStderr)) && (
                          <div className="space-y-2 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] p-2 text-xs">
                            <p className="uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                              Setup Output
                            </p>
                            {hasText(runResult.setupStdout) && (
                              <div>
                                <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                  Stdout
                                </p>
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                  {runResult.setupStdout}
                                </pre>
                              </div>
                            )}
                            {hasText(runResult.setupStderr) && (
                              <div>
                                <p className="mb-1 uppercase tracking-[0.08em] text-red-300">
                                  Stderr
                                </p>
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/10 p-2 text-red-200">
                                  {runResult.setupStderr}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}

                        {runTests.length > 0 && (
                          <>
                            <div className="flex gap-1 overflow-x-auto pb-1">
                              {runTests.map((result, index) => (
                                <button
                                  key={`run-case-${result.index}-${index}`}
                                  type="button"
                                  onClick={() => setSelectedRunResultIndex(index)}
                                  className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold transition ${
                                    selectedRunResultIndex === index
                                      ? result.passed
                                        ? "border-green-400/70 bg-green-500/20 text-green-200"
                                        : "border-red-400/70 bg-red-500/20 text-red-200"
                                      : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-white/80 hover:bg-[#1e2732]"
                                  }`}
                                >
                                  Case {index + 1} {result.passed ? "PASS" : "FAIL"}
                                </button>
                              ))}
                            </div>

                            {activeRunTest && (
                              <div className="space-y-2 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] p-2 text-xs">
                                <div>
                                  <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                    Input
                                  </p>
                                  <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                    {formatValueForDisplay(activeRunTest.input)}
                                  </pre>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                      Output
                                    </p>
                                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                      {formatValueForDisplay(activeRunTest.output)}
                                    </pre>
                                  </div>
                                  <div>
                                    <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                      Expected
                                    </p>
                                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                      {formatValueForDisplay(activeRunTest.expected)}
                                    </pre>
                                  </div>
                                </div>

                                {activeRunTest.error && (
                                  <div>
                                    <p className="mb-1 uppercase tracking-[0.08em] text-red-300">
                                      Error
                                    </p>
                                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/10 p-2 text-red-200">
                                      {activeRunTest.error}
                                    </pre>
                                  </div>
                                )}

                                {hasText(activeRunTest.stdout) && (
                                  <div>
                                    <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                      Stdout
                                    </p>
                                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                      {activeRunTest.stdout}
                                    </pre>
                                  </div>
                                )}

                                {hasText(activeRunTest.stderr) && (
                                  <div>
                                    <p className="mb-1 uppercase tracking-[0.08em] text-red-300">
                                      Stderr
                                    </p>
                                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/10 p-2 text-red-200">
                                      {activeRunTest.stderr}
                                    </pre>
                                  </div>
                                )}

                                <p className="text-[11px] text-[var(--arena-muted)]">
                                  Test Runtime:{" "}
                                  {formatRuntime(activeRunTest.runtimeMs || 0)}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-red-300">{runResult.message || "Run failed"}</p>
                        {hasText(runResult.stdout) && (
                          <div>
                            <p className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                              Stdout
                            </p>
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-xs text-white/90">
                              {runResult.stdout}
                            </pre>
                          </div>
                        )}
                        {hasText(runResult.stderr) && (
                          <div>
                            <p className="mb-1 text-xs uppercase tracking-[0.08em] text-red-300">
                              Stderr
                            </p>
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
                              {runResult.stderr}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-[var(--arena-border)] bg-black/35 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--arena-muted)]">
                  Submission
                </p>
                {!submitResult && (
                  <p className="mt-2 text-sm text-[var(--arena-muted)]">
                    Submit solution for full evaluation and scoring.
                  </p>
                )}
                {submitResult && (
                  <div className="mt-2 space-y-2 text-sm text-white/90">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          submitResult.accepted
                            ? "bg-green-500/20 text-green-200"
                            : "bg-red-500/20 text-red-200"
                        }`}
                      >
                        {submitResult.accepted ? "Accepted" : "Not Accepted"}
                      </span>
                      <span className="text-xs text-[var(--arena-muted)]">
                        {submitResult.accepted
                          ? submitResult.newlySolved
                            ? "Problem solved."
                            : "Already solved earlier."
                          : `Reason: ${submitResult.execution?.errorType || "wrong_answer"}`}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--arena-muted)]">
                      Passed {submitResult.execution?.passedCount || 0}/
                      {(submitResult.execution?.passedCount || 0) +
                        (submitResult.execution?.failedCount || 0)}
                      {" "}tests • Runtime{" "}
                      {formatRuntime(submitResult.execution?.runtimeMs || 0)}
                    </p>
                    {submitResult.penaltyAppliedSeconds > 0 && (
                      <p className="text-yellow-300">
                        Penalty applied: +{submitResult.penaltyAppliedSeconds}s
                      </p>
                    )}

                    {(hasText(submitResult.execution?.setupStdout) ||
                      hasText(submitResult.execution?.setupStderr)) && (
                      <div className="space-y-2 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] p-2 text-xs">
                        <p className="uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                          Setup Output
                        </p>
                        {hasText(submitResult.execution?.setupStdout) && (
                          <div>
                            <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                              Stdout
                            </p>
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                              {submitResult.execution.setupStdout}
                            </pre>
                          </div>
                        )}
                        {hasText(submitResult.execution?.setupStderr) && (
                          <div>
                            <p className="mb-1 uppercase tracking-[0.08em] text-red-300">
                              Stderr
                            </p>
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/10 p-2 text-red-200">
                              {submitResult.execution.setupStderr}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {submissionTests.length > 0 && (
                      <>
                        <div className="flex gap-1 overflow-x-auto pb-1">
                          {submissionTests.map((result, index) => (
                            <button
                              key={`submit-case-${result.index}-${index}`}
                              type="button"
                              onClick={() => setSelectedSubmitResultIndex(index)}
                              className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold transition ${
                                selectedSubmitResultIndex === index
                                  ? result.passed
                                    ? "border-green-400/70 bg-green-500/20 text-green-200"
                                    : "border-red-400/70 bg-red-500/20 text-red-200"
                                  : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-white/80 hover:bg-[#1e2732]"
                              }`}
                            >
                              Case {index + 1} {result.passed ? "PASS" : "FAIL"}
                            </button>
                          ))}
                        </div>

                        {activeSubmissionTest && (
                          <div className="space-y-2 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] p-2 text-xs">
                            <div>
                              <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                Input
                              </p>
                              <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                {formatValueForDisplay(activeSubmissionTest.input)}
                              </pre>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <div>
                                <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                  Output
                                </p>
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                  {formatValueForDisplay(activeSubmissionTest.output)}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                  Expected
                                </p>
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                  {formatValueForDisplay(activeSubmissionTest.expected)}
                                </pre>
                              </div>
                            </div>

                            {activeSubmissionTest.error && (
                              <div>
                                <p className="mb-1 uppercase tracking-[0.08em] text-red-300">
                                  Error
                                </p>
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/10 p-2 text-red-200">
                                  {activeSubmissionTest.error}
                                </pre>
                              </div>
                            )}

                            {hasText(activeSubmissionTest.stdout) && (
                              <div>
                                <p className="mb-1 uppercase tracking-[0.08em] text-[var(--arena-muted)]">
                                  Stdout
                                </p>
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--arena-border)] bg-black/35 p-2 text-white/90">
                                  {activeSubmissionTest.stdout}
                                </pre>
                              </div>
                            )}

                            {hasText(activeSubmissionTest.stderr) && (
                              <div>
                                <p className="mb-1 uppercase tracking-[0.08em] text-red-300">
                                  Stderr
                                </p>
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-red-500/40 bg-red-500/10 p-2 text-red-200">
                                  {activeSubmissionTest.stderr}
                                </pre>
                              </div>
                            )}

                            <p className="text-[11px] text-[var(--arena-muted)]">
                              Test Runtime:{" "}
                              {formatRuntime(activeSubmissionTest.runtimeMs || 0)}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            {infoMessage && (
              <p className="mt-3 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 py-2 text-sm text-[var(--arena-muted)]">
                {infoMessage}
              </p>
            )}
          </section>

          <aside className="rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--arena-muted)]">
              Live Scoreboard
            </h2>

            <div className="mt-3 max-h-[660px] space-y-2 overflow-y-auto pr-1">
              {scoreboard.map((entry, index) => {
                const isMe = entry.userId === user._id;
                const lastPresenceAt = presenceByUser[entry.userId] || 0;
                const isTyping = nowTs - lastPresenceAt < 6000;

                return (
                  <div
                    key={entry.userId}
                    className={`rounded-md border px-3 py-3 ${
                      isMe
                        ? "border-[var(--arena-green)] bg-green-500/10"
                        : "border-[var(--arena-border)] bg-[var(--arena-panel-soft)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          #{index + 1} {entry.username}
                        </p>
                        <p className="mt-1 text-xs text-[var(--arena-muted)]">
                          Solved {entry.solvedCount}/{arenaState?.totalProblems || 0} •
                          Penalty {entry.penaltySeconds}s • Time{" "}
                          {formatSeconds(Math.floor(entry.effectiveTimeMs / 1000))}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            entry.isOnline ? "bg-[var(--arena-green)]" : "bg-[#6b7280]"
                          }`}
                        />
                        {isTyping && (
                          <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-300">
                            typing
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {(Array.isArray(entry.perProblem) ? entry.perProblem : []).map(
                        (problem) => (
                          <div
                            key={`${entry.userId}-${problem.problemId}`}
                            className={`rounded px-2 py-1 text-[11px] font-semibold ${
                              problem.solved
                                ? "bg-green-500/15 text-green-200"
                                : "bg-white/10 text-white/70"
                            }`}
                          >
                            {problem.problemId.replaceAll("-", " ")} •
                            {problem.solved ? " solved" : ` a:${problem.attempts}`}
                          </div>
                        )
                      )}
                    </div>

                    {arenaState?.canViewCodes && !isMe && currentProblem && (
                      <button
                        type="button"
                        onClick={() => handleRequestCode(entry.userId)}
                        className="mt-2 rounded-md border border-[var(--arena-border)] bg-black/35 px-2 py-1 text-xs font-semibold text-white transition hover:bg-[#252c37]"
                      >
                        View {entry.username}&apos;s code
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </section>

      {codeViewer && (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-4xl rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)] p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {codeViewer.username} • {currentProblem?.title || codeViewer.problemId}
                </h3>
                <p className="text-xs text-[var(--arena-muted)]">
                  {getLanguageLabel(codeViewer.language)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCodeViewer(null)}
                className="rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 py-1.5 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-md border border-[var(--arena-border)]">
              <MonacoEditor
                height="420px"
                language={codeViewer.language === "python" ? "python" : "javascript"}
                theme="vs-dark"
                value={codeViewer.code || ""}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  readOnly: true,
                  automaticLayout: true,
                  padding: { top: 12 },
                }}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default function DevArenaPage() {
  return (
    <Suspense
      fallback={
        <main className="arena-page arena-grid-bg flex items-center justify-center px-4">
          <div className="h-40 w-full max-w-6xl animate-pulse rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/60" />
        </main>
      }
    >
      <DevArenaContent />
    </Suspense>
  );
}
