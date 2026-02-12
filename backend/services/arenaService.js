import { Arena, ROOM_STATES } from "../models/Arena.js";

function acceptedAtMs(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  return new Date(value).getTime();
}

export function buildLeaderboard(arena) {
  const ranked = [...arena.participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.penaltySeconds !== b.penaltySeconds) return a.penaltySeconds - b.penaltySeconds;

    const aAccepted = acceptedAtMs(a.acceptedAt);
    const bAccepted = acceptedAtMs(b.acceptedAt);
    if (aAccepted !== bAccepted) return aAccepted - bAccepted;

    return a.name.localeCompare(b.name);
  });

  return ranked.map((p, index) => ({
    rank: index + 1,
    userId: p.userId,
    name: p.name,
    role: p.role,
    score: p.score,
    solvedCount: p.solvedCount,
    attempts: p.attempts,
    penaltySeconds: p.penaltySeconds,
    acceptedAt: p.acceptedAt,
  }));
}

export function getRemainingSeconds(arena, now = new Date()) {
  if (arena.state !== ROOM_STATES.LIVE || !arena.endTime) return 0;
  const diffMs = new Date(arena.endTime).getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

export async function finalizeArena(arena, io, reason = "SYSTEM_FINISHED") {
  if (arena.state === ROOM_STATES.FINISHED) return arena;

  const now = new Date();
  arena.state = ROOM_STATES.FINISHED;
  arena.finishedAt = now;
  arena.finishReason = reason;
  if (!arena.endTime || new Date(arena.endTime).getTime() > now.getTime()) {
    arena.endTime = now;
  }

  await arena.save();

  if (io) {
    io.to(arena.roomCode).emit("arena:contest-finished", {
      roomCode: arena.roomCode,
      state: arena.state,
      finishedAt: arena.finishedAt,
      finishReason: arena.finishReason,
      leaderboard: buildLeaderboard(arena),
      serverTime: now,
    });
  }

  return arena;
}

export async function finalizeIfExpired(arena, io) {
  if (arena.state !== ROOM_STATES.LIVE || !arena.endTime) return arena;
  if (new Date().getTime() < new Date(arena.endTime).getTime()) return arena;
  return finalizeArena(arena, io, "TIME_UP");
}

export async function sweepExpiredArenas(io, limit = 100) {
  const now = new Date();
  const arenas = await Arena.find({
    state: ROOM_STATES.LIVE,
    endTime: { $lte: now },
  })
    .sort({ endTime: 1 })
    .limit(limit);

  for (const arena of arenas) {
    await finalizeArena(arena, io, "TIME_UP");
  }

  return arenas.length;
}
