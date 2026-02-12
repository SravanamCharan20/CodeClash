import { randomUUID } from "node:crypto";
import { Arena, ROOM_STATES } from "../models/Arena.js";
import { Submission, SUBMISSION_VERDICTS } from "../models/Submission.js";
import { createRedisClient } from "../config/redis.js";
import { runtimeConfig } from "../config/runtime.js";
import { enqueueSubmissionJob, getSubmissionJob } from "../queues/submissionQueue.js";
import { generateRoomCode } from "../utils/generateRoomCode.js";
import {
  buildLeaderboard,
  finalizeArena,
  finalizeIfExpired,
  getRemainingSeconds,
} from "../services/arenaService.js";
import {
  getLeaderboardFromRedis,
  seedLeaderboard,
} from "../services/leaderboardService.js";
import { checkSubmissionCooldown } from "../services/submissionRateLimitService.js";
import { validateSubmissionSource } from "../services/submissionSecurityService.js";

const redisClient = createRedisClient();

const DIFFICULTIES = new Set(["EASY", "MEDIUM", "HARD"]);
const SUBMISSION_FILTER_VERDICTS = new Set(Object.values(SUBMISSION_VERDICTS));
const SUPPORTED_LANGUAGES = new Set(["javascript", "python", "cpp", "java"]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoomCode(value) {
  return cleanText(value).toUpperCase();
}

function parseBoundedInteger(value, defaultValue, minValue, maxValue) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return defaultValue;
  return Math.min(maxValue, Math.max(minValue, parsed));
}

function shouldIncludeSourceCode(arenaState, includeCodeQuery) {
  if (String(includeCodeQuery).toLowerCase() !== "true") return false;
  return arenaState === ROOM_STATES.FINISHED;
}

function formatSubmission(submission, includeSourceCode) {
  return {
    id: submission.id,
    roomCode: submission.roomCode,
    jobId: submission.jobId,
    userId: submission.userId,
    participantName: submission.participantName,
    language: submission.language,
    verdict: submission.verdict,
    passedCount: submission.passedCount,
    totalCount: submission.totalCount,
    executionMs: submission.executionMs,
    scoreAwarded: submission.scoreAwarded,
    penaltySecondsAdded: submission.penaltySecondsAdded,
    judgeMode: submission.judgeMode,
    createdAt: submission.createdAt,
    sourceCode: includeSourceCode ? submission.sourceCode : null,
  };
}

function publicArena(arena) {
  const visibleTestCases = arena.problem.testCases
    .filter((tc) => tc.isHidden === false)
    .map((tc) => ({
      input: tc.input,
      isHidden: false,
    }));

  return {
    id: arena.id,
    roomCode: arena.roomCode,
    name: arena.name,
    difficulty: arena.difficulty,
    durationMinutes: arena.durationMinutes,
    state: arena.state,
    createdBy: arena.createdBy,
    startTime: arena.startTime,
    endTime: arena.endTime,
    finishedAt: arena.finishedAt,
    finishReason: arena.finishReason,
    participants: arena.participants.map((p) => ({
      userId: p.userId,
      name: p.name,
      role: p.role,
      isReady: p.isReady,
      attempts: p.attempts,
      score: p.score,
      solvedCount: p.solvedCount,
      penaltySeconds: p.penaltySeconds,
      acceptedAt: p.acceptedAt,
    })),
    problem: {
      title: arena.problem.title,
      description: arena.problem.description,
      constraints: arena.problem.constraints,
      examples: arena.problem.examples,
      testCases: visibleTestCases,
      hiddenTestCount: Math.max(0, arena.problem.testCases.length - visibleTestCases.length),
    },
  };
}

async function generateUniqueRoomCode(maxAttempts = 15) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const roomCode = generateRoomCode();
    const exists = await Arena.exists({ roomCode });
    if (!exists) return roomCode;
  }
  throw new Error("Could not generate unique room code");
}

function validateProblem(problem) {
  if (!problem || typeof problem !== "object") return "problem is required";

  const title = cleanText(problem.title);
  const description = cleanText(problem.description);
  if (!title) return "problem.title is required";
  if (!description) return "problem.description is required";

  const testCases = Array.isArray(problem.testCases) ? problem.testCases : [];
  if (testCases.length === 0) return "at least one test case is required";

  for (const tc of testCases) {
    if (!cleanText(tc?.input) || !cleanText(tc?.output)) {
      return "each test case needs input and output";
    }
  }

  return null;
}

async function resolveLeaderboard(arena) {
  try {
    let redisBoard = await getLeaderboardFromRedis(redisClient, arena.roomCode);

    if (redisBoard.length === 0 && arena.state !== ROOM_STATES.LOBBY) {
      await seedLeaderboard(redisClient, arena.roomCode, arena.participants);
      redisBoard = await getLeaderboardFromRedis(redisClient, arena.roomCode);
    }

    if (redisBoard.length > 0) {
      return redisBoard;
    }
  } catch {
    // fall back to DB-derived leaderboard if Redis is unavailable
  }

  return buildLeaderboard(arena);
}

export async function createArena(req, res) {
  try {
    const roomName = cleanText(req.body.roomName);
    const difficulty = cleanText(req.body.difficulty).toUpperCase();
    const durationMinutes = Number(req.body.durationMinutes);

    const adminUserId = cleanText(req.body.admin?.userId);
    const adminName = cleanText(req.body.admin?.name);

    if (!roomName) return res.status(400).json({ message: "roomName is required" });
    if (!DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({ message: "difficulty must be EASY|MEDIUM|HARD" });
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 300) {
      return res.status(400).json({ message: "durationMinutes must be 5..300" });
    }
    if (!adminUserId || !adminName) {
      return res.status(400).json({ message: "admin.userId and admin.name are required" });
    }

    const problemError = validateProblem(req.body.problem);
    if (problemError) return res.status(400).json({ message: problemError });

    const roomCode = await generateUniqueRoomCode();
    const problem = req.body.problem;

    const arena = await Arena.create({
      roomCode,
      name: roomName,
      difficulty,
      durationMinutes,
      state: ROOM_STATES.LOBBY,
      createdBy: adminUserId,
      participants: [
        {
          userId: adminUserId,
          name: adminName,
          role: "ADMIN",
          isReady: true,
        },
      ],
      problem: {
        title: cleanText(problem.title),
        description: cleanText(problem.description),
        constraints: Array.isArray(problem.constraints)
          ? problem.constraints.map(cleanText).filter(Boolean)
          : [],
        examples: Array.isArray(problem.examples)
          ? problem.examples.map(cleanText).filter(Boolean)
          : [],
        testCases: problem.testCases.map((tc) => ({
          input: cleanText(tc.input),
          output: cleanText(tc.output),
          isHidden: tc.isHidden !== false,
        })),
      },
    });

    return res.status(201).json({ arena: publicArena(arena) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function getArenaByRoomCode(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const io = req.app.get("io");

    let arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });

    arena = await finalizeIfExpired(arena, io);
    const leaderboard = await resolveLeaderboard(arena);

    return res.status(200).json({ arena: publicArena(arena), leaderboard });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function joinArena(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const userId = cleanText(req.body.userId);
    const name = cleanText(req.body.name);

    if (!userId || !name) return res.status(400).json({ message: "userId and name are required" });

    const arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });
    if (arena.state !== ROOM_STATES.LOBBY) {
      return res.status(409).json({ message: "Contest already started or finished" });
    }

    const existingByUserId = arena.participants.find((p) => p.userId === userId);
    if (existingByUserId) {
      return res.status(200).json({ arena: publicArena(arena), message: "Already joined" });
    }

    const existingByName = arena.participants.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (existingByName) return res.status(409).json({ message: "Name already taken in this room" });

    arena.participants.push({
      userId,
      name,
      role: "PLAYER",
      isReady: false,
    });

    await arena.save();

    const io = req.app.get("io");
    if (io) {
      io.to(arena.roomCode).emit("arena:participant-joined", {
        roomCode: arena.roomCode,
        participant: { userId, name, role: "PLAYER", isReady: false },
        participantCount: arena.participants.length,
      });
    }

    return res.status(200).json({ arena: publicArena(arena) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function setReadyStatus(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const userId = cleanText(req.body.userId);
    const isReady = req.body.isReady;

    if (!userId || typeof isReady !== "boolean") {
      return res.status(400).json({ message: "userId and boolean isReady are required" });
    }

    const arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });
    if (arena.state !== ROOM_STATES.LOBBY) {
      return res.status(409).json({ message: "Ready status can only change in LOBBY" });
    }

    const participant = arena.participants.find((p) => p.userId === userId);
    if (!participant) return res.status(404).json({ message: "Participant not found" });

    participant.isReady = isReady;
    await arena.save();

    const io = req.app.get("io");
    if (io) {
      io.to(arena.roomCode).emit("arena:ready-updated", {
        roomCode: arena.roomCode,
        userId,
        isReady,
      });
    }

    return res.status(200).json({ arena: publicArena(arena) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function startArena(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const adminUserId = cleanText(req.body.adminUserId);

    if (!adminUserId) return res.status(400).json({ message: "adminUserId is required" });

    const arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });
    if (arena.state !== ROOM_STATES.LOBBY) {
      return res.status(409).json({ message: "Arena is not in LOBBY state" });
    }

    const admin = arena.participants.find(
      (p) => p.userId === adminUserId && p.role === "ADMIN"
    );
    if (!admin) return res.status(403).json({ message: "Only admin can start the contest" });

    if (arena.participants.length < 2) {
      return res.status(409).json({ message: "At least 2 participants are required to start" });
    }

    const now = new Date();
    arena.state = ROOM_STATES.LIVE;
    arena.startTime = now;
    arena.endTime = new Date(now.getTime() + arena.durationMinutes * 60 * 1000);
    arena.finishedAt = null;
    arena.finishReason = null;

    await arena.save();

    try {
      await seedLeaderboard(redisClient, arena.roomCode, arena.participants);
    } catch {
      // non-fatal; leaderboard can still be served from DB fallback
    }

    const io = req.app.get("io");
    if (io) {
      io.to(arena.roomCode).emit("arena:contest-started", {
        roomCode: arena.roomCode,
        state: arena.state,
        startTime: arena.startTime,
        endTime: arena.endTime,
        remainingSeconds: getRemainingSeconds(arena, now),
        serverTime: now,
      });
    }

    return res.status(200).json({ arena: publicArena(arena) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function getArenaTimer(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const io = req.app.get("io");

    let arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });

    arena = await finalizeIfExpired(arena, io);
    const now = new Date();

    return res.status(200).json({
      roomCode: arena.roomCode,
      state: arena.state,
      startTime: arena.startTime,
      endTime: arena.endTime,
      finishedAt: arena.finishedAt,
      finishReason: arena.finishReason,
      remainingSeconds: getRemainingSeconds(arena, now),
      serverTime: now,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function getArenaLeaderboard(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const io = req.app.get("io");

    let arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });

    arena = await finalizeIfExpired(arena, io);
    const now = new Date();
    const leaderboard = await resolveLeaderboard(arena);

    return res.status(200).json({
      roomCode: arena.roomCode,
      state: arena.state,
      startTime: arena.startTime,
      endTime: arena.endTime,
      finishedAt: arena.finishedAt,
      finishReason: arena.finishReason,
      remainingSeconds: getRemainingSeconds(arena, now),
      leaderboard,
      serverTime: now,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function getArenaSubmissions(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const userId = cleanText(req.query.userId);
    const verdict = cleanText(req.query.verdict).toUpperCase();
    const page = parseBoundedInteger(req.query.page, 1, 1, 100000);
    const limit = parseBoundedInteger(req.query.limit, 20, 1, 100);
    const io = req.app.get("io");

    let arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });

    arena = await finalizeIfExpired(arena, io);

    if (verdict && !SUBMISSION_FILTER_VERDICTS.has(verdict)) {
      return res.status(400).json({
        message: `verdict must be one of: ${[...SUBMISSION_FILTER_VERDICTS].join(", ")}`,
      });
    }

    const query = { roomCode };
    if (userId) query.userId = userId;
    if (verdict) query.verdict = verdict;

    const [totalCount, submissions] = await Promise.all([
      Submission.countDocuments(query),
      Submission.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    const includeSourceCode = shouldIncludeSourceCode(arena.state, req.query.includeCode);
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

    return res.status(200).json({
      roomCode: arena.roomCode,
      state: arena.state,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1,
      },
      filters: {
        userId: userId || null,
        verdict: verdict || null,
        includeCode: includeSourceCode,
      },
      submissions: submissions.map((submission) => formatSubmission(submission, includeSourceCode)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function submitSolution(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const userId = cleanText(req.body.userId);
    const language = cleanText(req.body.language).toLowerCase();
    const sourceCode = typeof req.body.sourceCode === "string" ? req.body.sourceCode : "";

    if (!userId || !language || !sourceCode.trim()) {
      return res.status(400).json({ message: "userId, language and sourceCode are required" });
    }

    if (!SUPPORTED_LANGUAGES.has(language)) {
      return res.status(400).json({
        message: `language must be one of: ${[...SUPPORTED_LANGUAGES].join(", ")}`,
      });
    }

    const validationError = validateSubmissionSource(sourceCode);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const io = req.app.get("io");
    let arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });

    arena = await finalizeIfExpired(arena, io);
    if (arena.state !== ROOM_STATES.LIVE) {
      return res.status(409).json({ message: "Arena is not LIVE" });
    }

    const participant = arena.participants.find((p) => p.userId === userId);
    if (!participant) return res.status(404).json({ message: "Participant not found" });

    const cooldown = await checkSubmissionCooldown({
      redis: redisClient,
      roomCode,
      userId,
      cooldownSeconds: runtimeConfig.SUBMISSION_COOLDOWN_SECONDS,
    });

    if (!cooldown.allowed) {
      return res.status(429).json({
        message: "Submission rate limit exceeded",
        retryAfterSeconds: cooldown.retryAfterSeconds,
      });
    }

    const jobId = randomUUID();
    await enqueueSubmissionJob({
      jobId,
      roomCode,
      userId,
      language,
      sourceCode,
      submittedAt: new Date().toISOString(),
    });

    return res.status(202).json({
      roomCode,
      jobId,
      status: "QUEUED",
      queuedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({ message: error.message || "Submission queue unavailable" });
  }
}

export async function getSubmissionJobStatus(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const jobId = cleanText(req.params.jobId);

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await getSubmissionJob(jobId);
    if (job) {
      const jobRoomCode = normalizeRoomCode(job.data?.roomCode);
      if (jobRoomCode && jobRoomCode !== roomCode) {
        return res.status(403).json({ message: "Job does not belong to this room" });
      }

      const state = await job.getState();
      return res.status(200).json({
        roomCode,
        jobId,
        state,
        result: state === "completed" ? job.returnvalue : null,
        failedReason: state === "failed" ? job.failedReason : null,
      });
    }

    const persistedSubmission = await Submission.findOne({ roomCode, jobId }).sort({ createdAt: -1 });

    if (persistedSubmission) {
      return res.status(200).json({
        roomCode,
        jobId,
        state: "completed",
        result: {
          type: "PROCESSED",
          roomCode,
          userId: persistedSubmission.userId,
          submission: {
            id: persistedSubmission.id,
            verdict: persistedSubmission.verdict,
            passedCount: persistedSubmission.passedCount,
            totalCount: persistedSubmission.totalCount,
            executionMs: persistedSubmission.executionMs,
            scoreAwarded: persistedSubmission.scoreAwarded,
            penaltySecondsAdded: persistedSubmission.penaltySecondsAdded,
            judgeMode: persistedSubmission.judgeMode,
            createdAt: persistedSubmission.createdAt,
          },
        },
      });
    }

    return res.status(404).json({ message: "Job not found" });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

export async function finishArena(req, res) {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const requestedBy = cleanText(req.body.requestedBy);
    if (!requestedBy) return res.status(400).json({ message: "requestedBy is required" });

    const io = req.app.get("io");
    const arena = await Arena.findOne({ roomCode });
    if (!arena) return res.status(404).json({ message: "Arena not found" });

    if (arena.state === ROOM_STATES.FINISHED) {
      const leaderboard = await resolveLeaderboard(arena);
      return res.status(200).json({
        message: "Arena already finished",
        arena: publicArena(arena),
        leaderboard,
      });
    }

    const admin = arena.participants.find(
      (participant) => participant.userId === requestedBy && participant.role === "ADMIN"
    );
    if (!admin) return res.status(403).json({ message: "Only admin can finish the contest" });

    const finishedArena = await finalizeArena(arena, io, "ADMIN_FINISHED");
    const leaderboard = await resolveLeaderboard(finishedArena);

    return res.status(200).json({
      arena: publicArena(finishedArena),
      leaderboard,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}
