import { Arena, ROOM_STATES } from "../models/Arena.js";
import { Submission, SUBMISSION_VERDICTS } from "../models/Submission.js";
import { generateRoomCode } from "../utils/generateRoomCode.js";
import {
  buildLeaderboard,
  finalizeArena,
  finalizeIfExpired,
  getRemainingSeconds,
} from "../services/arenaService.js";

const DIFFICULTIES = new Set(["EASY", "MEDIUM", "HARD"]);
const ACCEPTED_SCORE = 100;
const SUBMISSION_FILTER_VERDICTS = new Set(Object.values(SUBMISSION_VERDICTS));

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

function getMockJudgeResult(sourceCode, totalCount) {
  const trimmed = sourceCode.trim();
  const lower = trimmed.toLowerCase();
  const executionMs = 20 + (trimmed.length % 120);

  if (lower.includes("syntaxerror")) {
    return {
      verdict: SUBMISSION_VERDICTS.COMPILATION_ERROR,
      passedCount: 0,
      totalCount,
      executionMs,
    };
  }

  if (lower.includes("while(true)") || lower.includes("for(;;)")) {
    return {
      verdict: SUBMISSION_VERDICTS.TIME_LIMIT_EXCEEDED,
      passedCount: 0,
      totalCount,
      executionMs: executionMs + 1000,
    };
  }

  if (lower.includes("throw new error")) {
    return {
      verdict: SUBMISSION_VERDICTS.RUNTIME_ERROR,
      passedCount: 0,
      totalCount,
      executionMs,
    };
  }

  if (trimmed.length < 30 || (!lower.includes("return") && !lower.includes("print("))) {
    return {
      verdict: SUBMISSION_VERDICTS.WRONG_ANSWER,
      passedCount: totalCount > 1 ? 1 : 0,
      totalCount,
      executionMs,
    };
  }

  return {
    verdict: SUBMISSION_VERDICTS.ACCEPTED,
    passedCount: totalCount,
    totalCount,
    executionMs,
  };
}

function applyAcceptedScoring(arena, participant, now) {
  participant.attempts += 1;
  let scoreAwarded = 0;
  let penaltySecondsAdded = 0;

  if (participant.solvedCount === 0) {
    const elapsedSeconds = arena.startTime
      ? Math.max(0, Math.floor((now.getTime() - new Date(arena.startTime).getTime()) / 1000))
      : 0;
    const wrongAttemptPenalty = Math.max(0, participant.attempts - 1) * 20;

    scoreAwarded = ACCEPTED_SCORE;
    penaltySecondsAdded = elapsedSeconds + wrongAttemptPenalty;

    participant.score += scoreAwarded;
    participant.solvedCount = 1;
    participant.penaltySeconds += penaltySecondsAdded;
    participant.acceptedAt = now;
  }

  return { scoreAwarded, penaltySecondsAdded };
}

function allParticipantsSolved(arena) {
  const nonAdminParticipants = arena.participants.filter((participant) => participant.role !== "ADMIN");
  const evaluationPool = nonAdminParticipants.length > 0 ? nonAdminParticipants : arena.participants;
  return evaluationPool.every((participant) => participant.solvedCount > 0);
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

    return res.status(200).json({ arena: publicArena(arena), leaderboard: buildLeaderboard(arena) });
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

    return res.status(200).json({
      roomCode: arena.roomCode,
      state: arena.state,
      startTime: arena.startTime,
      endTime: arena.endTime,
      finishedAt: arena.finishedAt,
      finishReason: arena.finishReason,
      remainingSeconds: getRemainingSeconds(arena, now),
      leaderboard: buildLeaderboard(arena),
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
    const language = cleanText(req.body.language);
    const sourceCode = typeof req.body.sourceCode === "string" ? req.body.sourceCode : "";

    if (!userId || !language || !sourceCode.trim()) {
      return res
        .status(400)
        .json({ message: "userId, language and sourceCode are required" });
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

    const now = new Date();
    if (arena.endTime && now.getTime() >= new Date(arena.endTime).getTime()) {
      arena = await finalizeArena(arena, io, "TIME_UP");
      return res.status(409).json({ message: "Contest ended", arena: publicArena(arena) });
    }

    const totalCount = arena.problem.testCases.length;
    const judge = getMockJudgeResult(sourceCode, totalCount);

    let scoreAwarded = 0;
    let penaltySecondsAdded = 0;
    if (judge.verdict === SUBMISSION_VERDICTS.ACCEPTED) {
      const scoring = applyAcceptedScoring(arena, participant, now);
      scoreAwarded = scoring.scoreAwarded;
      penaltySecondsAdded = scoring.penaltySecondsAdded;
    } else {
      participant.attempts += 1;
    }

    const submission = await Submission.create({
      arenaId: arena.id,
      roomCode: arena.roomCode,
      userId,
      participantName: participant.name,
      language,
      sourceCode,
      verdict: judge.verdict,
      passedCount: judge.passedCount,
      totalCount: judge.totalCount,
      executionMs: judge.executionMs,
      scoreAwarded,
      penaltySecondsAdded,
    });

    await arena.save();
    const leaderboard = buildLeaderboard(arena);

    if (io) {
      io.to(arena.roomCode).emit("arena:submission-result", {
        roomCode: arena.roomCode,
        userId,
        verdict: judge.verdict,
        passedCount: judge.passedCount,
        totalCount: judge.totalCount,
        executionMs: judge.executionMs,
        scoreAwarded,
        penaltySecondsAdded,
        serverTime: now,
      });

      io.to(arena.roomCode).emit("arena:leaderboard-updated", {
        roomCode: arena.roomCode,
        leaderboard,
      });
    }

    let finalArena = arena;
    if (allParticipantsSolved(arena)) {
      finalArena = await finalizeArena(arena, io, "SYSTEM_FINISHED");
    }

    return res.status(201).json({
      submission: {
        id: submission.id,
        verdict: submission.verdict,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        executionMs: submission.executionMs,
        scoreAwarded: submission.scoreAwarded,
        penaltySecondsAdded: submission.penaltySecondsAdded,
        createdAt: submission.createdAt,
      },
      arena: publicArena(finalArena),
      leaderboard: buildLeaderboard(finalArena),
    });
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
      return res.status(200).json({
        message: "Arena already finished",
        arena: publicArena(arena),
        leaderboard: buildLeaderboard(arena),
      });
    }

    const admin = arena.participants.find(
      (participant) => participant.userId === requestedBy && participant.role === "ADMIN"
    );
    if (!admin) return res.status(403).json({ message: "Only admin can finish the contest" });

    const finishedArena = await finalizeArena(arena, io, "ADMIN_FINISHED");

    return res.status(200).json({
      arena: publicArena(finishedArena),
      leaderboard: buildLeaderboard(finishedArena),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}
