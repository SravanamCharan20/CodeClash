"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createArena, getErrorMessage, joinArena } from "@/lib/api";
import {
  generateUserId,
  getLastRoomSession,
  normalizeRoomCode,
  saveRoomSession,
} from "@/lib/session";
import { Difficulty } from "@/lib/types";

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function HomePage() {
  const router = useRouter();

  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastRoomCode, setLastRoomCode] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    adminName: "",
    roomName: "",
    difficulty: "MEDIUM" as Difficulty,
    durationMinutes: 60,
    problemTitle: "",
    problemDescription: "",
    constraints: "",
    examples: "",
    visibleInput: "",
    visibleOutput: "",
    hiddenInput: "",
    hiddenOutput: "",
  });

  const [joinForm, setJoinForm] = useState({
    playerName: "",
    roomCode: "",
  });

  useEffect(() => {
    const lastSession = getLastRoomSession();
    setLastRoomCode(lastSession?.roomCode || null);
  }, []);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const adminName = createForm.adminName.trim();
    const roomName = createForm.roomName.trim();
    const problemTitle = createForm.problemTitle.trim();
    const problemDescription = createForm.problemDescription.trim();
    const visibleInput = createForm.visibleInput.trim();
    const visibleOutput = createForm.visibleOutput.trim();
    const hiddenInput = createForm.hiddenInput.trim();
    const hiddenOutput = createForm.hiddenOutput.trim();

    if (!adminName || !roomName || !problemTitle || !problemDescription || !visibleInput || !visibleOutput) {
      setError("Please fill all required create-arena fields.");
      return;
    }

    const hiddenPairProvided = Boolean(hiddenInput || hiddenOutput);
    if (hiddenPairProvided && (!hiddenInput || !hiddenOutput)) {
      setError("For hidden test case, provide both input and output.");
      return;
    }

    setCreateLoading(true);

    try {
      const adminUserId = generateUserId();
      const response = await createArena({
        roomName,
        difficulty: createForm.difficulty,
        durationMinutes: createForm.durationMinutes,
        admin: { userId: adminUserId, name: adminName },
        problem: {
          title: problemTitle,
          description: problemDescription,
          constraints: parseLines(createForm.constraints),
          examples: parseLines(createForm.examples),
          testCases: [
            {
              input: visibleInput,
              output: visibleOutput,
              isHidden: false,
            },
            ...(hiddenInput && hiddenOutput
              ? [
                  {
                    input: hiddenInput,
                    output: hiddenOutput,
                    isHidden: true,
                  },
                ]
              : []),
          ],
        },
      });

      saveRoomSession({
        roomCode: response.arena.roomCode,
        userId: adminUserId,
        name: adminName,
        role: "ADMIN",
      });

      router.push(`/arena/${response.arena.roomCode}/lobby`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const playerName = joinForm.playerName.trim();
    const roomCode = normalizeRoomCode(joinForm.roomCode);

    if (!playerName || !roomCode) {
      setError("Please enter your name and room code.");
      return;
    }

    setJoinLoading(true);

    try {
      const userId = generateUserId();
      const response = await joinArena(roomCode, { userId, name: playerName });
      const participant = response.arena.participants.find((entry) => entry.userId === userId);

      saveRoomSession({
        roomCode,
        userId,
        name: playerName,
        role: participant?.role || "PLAYER",
      });

      router.push(`/arena/${roomCode}/lobby`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <section className="rounded border border-zinc-300 p-4">
          <h1 className="text-2xl font-semibold">CodeArena</h1>
          <p className="mt-1 text-sm text-zinc-600">Minimal UI mode: full functionality first.</p>

          {lastRoomCode ? (
            <button
              className="mt-4 rounded border border-zinc-400 px-3 py-2 text-sm"
              onClick={() => router.push(`/arena/${lastRoomCode}`)}
            >
              Resume Last Arena ({lastRoomCode})
            </button>
          ) : null}

          {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

          <form className="mt-4 grid gap-3" onSubmit={handleCreateSubmit}>
            <h2 className="text-lg font-semibold">Create Arena (Admin)</h2>

            <input
              className="rounded border border-zinc-300 px-3 py-2"
              placeholder="Your Name *"
              value={createForm.adminName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, adminName: event.target.value }))}
            />
            <input
              className="rounded border border-zinc-300 px-3 py-2"
              placeholder="Room Name *"
              value={createForm.roomName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, roomName: event.target.value }))}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <select
                className="rounded border border-zinc-300 px-3 py-2"
                value={createForm.difficulty}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, difficulty: event.target.value as Difficulty }))
                }
              >
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </select>

              <input
                className="rounded border border-zinc-300 px-3 py-2"
                type="number"
                min={5}
                max={300}
                value={createForm.durationMinutes}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, durationMinutes: Number(event.target.value) || 60 }))
                }
              />
            </div>

            <input
              className="rounded border border-zinc-300 px-3 py-2"
              placeholder="Problem Title *"
              value={createForm.problemTitle}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, problemTitle: event.target.value }))}
            />

            <textarea
              className="min-h-24 rounded border border-zinc-300 px-3 py-2"
              placeholder="Problem Description *"
              value={createForm.problemDescription}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, problemDescription: event.target.value }))
              }
            />

            <textarea
              className="min-h-20 rounded border border-zinc-300 px-3 py-2"
              placeholder="Constraints (one per line, optional)"
              value={createForm.constraints}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, constraints: event.target.value }))}
            />

            <textarea
              className="min-h-20 rounded border border-zinc-300 px-3 py-2"
              placeholder="Examples (one per line, optional)"
              value={createForm.examples}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, examples: event.target.value }))}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <textarea
                className="min-h-20 rounded border border-zinc-300 px-3 py-2"
                placeholder="Visible Test Input *"
                value={createForm.visibleInput}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, visibleInput: event.target.value }))}
              />
              <textarea
                className="min-h-20 rounded border border-zinc-300 px-3 py-2"
                placeholder="Visible Test Output *"
                value={createForm.visibleOutput}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, visibleOutput: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <textarea
                className="min-h-20 rounded border border-zinc-300 px-3 py-2"
                placeholder="Hidden Test Input (optional)"
                value={createForm.hiddenInput}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, hiddenInput: event.target.value }))}
              />
              <textarea
                className="min-h-20 rounded border border-zinc-300 px-3 py-2"
                placeholder="Hidden Test Output (optional)"
                value={createForm.hiddenOutput}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, hiddenOutput: event.target.value }))}
              />
            </div>

            <button
              type="submit"
              disabled={createLoading}
              className="rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createLoading ? "Creating..." : "Create Arena"}
            </button>
          </form>
        </section>

        <section className="rounded border border-zinc-300 p-4">
          <h2 className="text-lg font-semibold">Join Arena (Participant)</h2>

          <form className="mt-4 grid gap-3" onSubmit={handleJoinSubmit}>
            <input
              className="rounded border border-zinc-300 px-3 py-2"
              placeholder="Your Name *"
              value={joinForm.playerName}
              onChange={(event) => setJoinForm((prev) => ({ ...prev, playerName: event.target.value }))}
            />
            <input
              className="rounded border border-zinc-300 px-3 py-2"
              placeholder="Room Code (e.g. ABC-123) *"
              value={joinForm.roomCode}
              onChange={(event) => setJoinForm((prev) => ({ ...prev, roomCode: event.target.value }))}
            />
            <button
              type="submit"
              disabled={joinLoading}
              className="rounded bg-zinc-800 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {joinLoading ? "Joining..." : "Join Arena"}
            </button>
          </form>

          <div className="mt-6 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            <p className="font-medium">Flow in this frontend</p>
            <p className="mt-1">Dashboard → Lobby → Contest → Results (auto transitions by room state).</p>
          </div>
        </section>
      </div>
    </main>
  );
}
