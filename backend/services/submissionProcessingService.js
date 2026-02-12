import mongoose from "mongoose";
import { Arena, ROOM_STATES } from "../models/Arena.js";
import { Submission } from "../models/Submission.js";
import { createRedisClient } from "../config/redis.js";
import { runJudge } from "./judge/index.js";
import {
  getParticipantLeaderboardRow,
  upsertParticipantInLeaderboard,
} from "./leaderboardService.js";
import { allNonAdminSolved, applySubmissionScoring } from "./scoringService.js";

const leaderboardRedis = createRedisClient();

function normalizeRoomCode(value) {
  return String(value || "").trim().toUpperCase();
}

function participantSnapshot(participant) {
  return {
    userId: participant.userId,
    name: participant.name,
    role: participant.role,
    score: participant.score,
    solvedCount: participant.solvedCount,
    attempts: participant.attempts,
    penaltySeconds: participant.penaltySeconds,
    acceptedAt: participant.acceptedAt || null,
  };
}

function maybeFinalizeByTime(arena, now = new Date()) {
  if (!arena.endTime) return false;
  if (now.getTime() < new Date(arena.endTime).getTime()) return false;

  arena.state = ROOM_STATES.FINISHED;
  arena.finishReason = "TIME_UP";
  arena.finishedAt = now;
  arena.endTime = now;
  return true;
}

async function runWithOptionalTransaction(handler) {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await handler(session);
    });

    return result;
  } catch (error) {
    const message = error?.message || "";

    if (
      message.includes("Transaction numbers are only allowed") ||
      message.includes("Transaction support is disabled")
    ) {
      return handler(null);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

async function findArena(roomCode, session) {
  const query = Arena.findOne({ roomCode });
  if (session) {
    query.session(session);
  }
  return query;
}

async function persistSubmission(payload, session) {
  if (session) {
    const [submission] = await Submission.create([payload], { session });
    return submission;
  }

  return Submission.create(payload);
}

async function persistArena(arena, session) {
  if (session) {
    await arena.save({ session });
    return;
  }

  await arena.save();
}

export async function processSubmissionJob(payload) {
  const roomCode = normalizeRoomCode(payload.roomCode);
  const userId = String(payload.userId || "").trim();
  const language = String(payload.language || "").trim();
  const sourceCode = String(payload.sourceCode || "");
  const jobId = String(payload.jobId || "");

  const initialArena = await Arena.findOne({ roomCode });
  if (!initialArena) {
    return {
      type: "SKIPPED",
      roomCode,
      userId,
      jobId,
      reason: "ARENA_NOT_FOUND",
      message: "Arena not found",
    };
  }

  if (initialArena.state !== ROOM_STATES.LIVE) {
    return {
      type: "SKIPPED",
      roomCode,
      userId,
      jobId,
      reason: "ARENA_NOT_LIVE",
      message: "Arena is not live",
      arenaState: initialArena.state,
    };
  }

  const judgeResult = await runJudge({
    language,
    sourceCode,
    testCases: initialArena.problem.testCases,
  });

  const transactionResult = await runWithOptionalTransaction(async (session) => {
    const arena = await findArena(roomCode, session);

    if (!arena) {
      return {
        type: "SKIPPED",
        roomCode,
        userId,
        jobId,
        reason: "ARENA_NOT_FOUND",
        message: "Arena not found",
      };
    }

    if (arena.state !== ROOM_STATES.LIVE) {
      return {
        type: "SKIPPED",
        roomCode,
        userId,
        jobId,
        reason: "ARENA_NOT_LIVE",
        message: "Arena is not live",
        arenaState: arena.state,
      };
    }

    const now = new Date();
    if (maybeFinalizeByTime(arena, now)) {
      await persistArena(arena, session);
      return {
        type: "SKIPPED",
        roomCode,
        userId,
        jobId,
        reason: "TIME_UP",
        message: "Contest time is over",
        arenaState: arena.state,
        finishReason: arena.finishReason,
      };
    }

    const participant = arena.participants.find((entry) => entry.userId === userId);
    if (!participant) {
      return {
        type: "SKIPPED",
        roomCode,
        userId,
        jobId,
        reason: "PARTICIPANT_NOT_FOUND",
        message: "Participant not found",
      };
    }

    const scoring = applySubmissionScoring({
      arena,
      participant,
      verdict: judgeResult.verdict,
      now,
    });

    const submission = await persistSubmission(
      {
        arenaId: arena.id,
        roomCode: arena.roomCode,
        jobId,
        userId,
        participantName: participant.name,
        language,
        sourceCode,
        verdict: judgeResult.verdict,
        passedCount: judgeResult.passedCount,
        totalCount: judgeResult.totalCount,
        executionMs: judgeResult.executionMs,
        scoreAwarded: scoring.scoreAwarded,
        penaltySecondsAdded: scoring.penaltySecondsAdded,
        judgeMode: judgeResult.judgeMode,
      },
      session
    );

    let finished = false;
    let finishReason = null;

    if (allNonAdminSolved(arena)) {
      arena.state = ROOM_STATES.FINISHED;
      arena.finishReason = "SYSTEM_FINISHED";
      arena.finishedAt = now;
      arena.endTime = now;
      finished = true;
      finishReason = arena.finishReason;
    }

    await persistArena(arena, session);

    return {
      type: "PROCESSED",
      roomCode,
      userId,
      jobId,
      arenaState: arena.state,
      finishReason,
      finished,
      finishedAt: arena.finishedAt,
      endTime: arena.endTime,
      participant: participantSnapshot(participant),
      submission: {
        id: submission.id,
        verdict: submission.verdict,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        executionMs: submission.executionMs,
        scoreAwarded: submission.scoreAwarded,
        penaltySecondsAdded: submission.penaltySecondsAdded,
        judgeMode: submission.judgeMode,
        createdAt: submission.createdAt,
        stderr: judgeResult.stderr || "",
      },
    };
  });

  if (transactionResult.type !== "PROCESSED") {
    return transactionResult;
  }

  await upsertParticipantInLeaderboard(
    leaderboardRedis,
    transactionResult.roomCode,
    transactionResult.participant
  );

  const leaderboardEntry = await getParticipantLeaderboardRow(
    leaderboardRedis,
    transactionResult.roomCode,
    transactionResult.userId
  );

  return {
    ...transactionResult,
    leaderboardEntry,
  };
}
