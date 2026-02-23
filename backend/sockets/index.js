// sockets/index.js
import User from "../models/User.js";
import {
  CLIENT_EVENTS,
  DEFAULT_ARENA_DURATION_SECONDS,
  DEFAULT_PENALTY_SECONDS,
  MAX_CODE_LENGTH,
  MAX_MEMBERS_PER_ROOM,
  MAX_PROBLEMS_PER_ROOM,
  PROBLEM_MAP,
  ROOM_ID_REGEX,
  SUPPORTED_LANGUAGES,
  buildLobbyState,
  checkRateLimit,
  createUniqueRoomId,
  emitLobbyUpdate,
  extractRoomId,
  getFilteredProblemCatalog,
  getProblemCatalogFacets,
  normalizeProblemIds,
  registerAbuse,
  removeSocketFromRoom,
  resolveUserFromSocket,
  toPublicProblemSet,
} from "./utils/utilsFunc.js";
import {
  executeCodeAgainstTests,
  isLanguageSupported,
} from "./utils/dockerExecutor.js";

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoundedInt = (value, min, max, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
};

const STARTED_ROOM_TTL_MS = parsePositiveInt(
  process.env.STARTED_ROOM_TTL_MS,
  30 * 60 * 1000
);
const STARTED_ROOM_CLEANUP_TICK_MS = parsePositiveInt(
  process.env.STARTED_ROOM_CLEANUP_TICK_MS,
  60 * 1000
);
const ROOM_COUNTDOWN_SECONDS = Math.min(
  parsePositiveInt(process.env.ROOM_COUNTDOWN_SECONDS, 3),
  10
);

const MIN_ARENA_DURATION_SECONDS = 120;
const MAX_ARENA_DURATION_SECONDS = 7200;
const MIN_PENALTY_SECONDS = 0;
const MAX_PENALTY_SECONDS = 300;
const MAX_VISIBLE_RUN_TESTS = 4;

// roomId -> room state
const rooms = new Map();
let startedRoomCleanupInterval;
const roomCountdownTimers = new Map();
const roomArenaTimers = new Map();

const clearRoomCountdown = (roomId) => {
  const activeCountdown = roomCountdownTimers.get(roomId);
  if (!activeCountdown) return;

  clearInterval(activeCountdown.intervalId);
  clearTimeout(activeCountdown.finishTimeoutId);
  roomCountdownTimers.delete(roomId);
};

const clearRoomArenaTimer = (roomId) => {
  const timeoutId = roomArenaTimers.get(roomId);
  if (!timeoutId) return;
  clearTimeout(timeoutId);
  roomArenaTimers.delete(roomId);
};

const getCountdownSecondsLeft = (countdownEndsAt) => {
  if (!countdownEndsAt) return 0;
  const remainingMs = countdownEndsAt - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
};

const emitCountdownTick = (io, roomId, countdownEndsAt) => {
  const secondsLeft = getCountdownSecondsLeft(countdownEndsAt);
  if (secondsLeft <= 0) return 0;

  io.to(roomId).emit("room-countdown", {
    roomId,
    secondsLeft,
    countdownEndsAt,
  });

  return secondsLeft;
};

const isArenaStatus = (status) =>
  status === "countdown" || status === "started" || status === "finished";

const isUserRoomParticipant = (room, userId) =>
  Boolean(room.participantUserIds?.has(userId));

const isUserActiveMember = (room, userId) => {
  for (const member of room.members.values()) {
    if (member.userId === userId) return true;
  }
  return false;
};

const getMemberByUserId = (room, userId) => {
  for (const member of room.members.values()) {
    if (member.userId === userId) return member;
  }
  return null;
};

const ensureParticipantProfile = (room, user) => {
  if (!room.participantProfiles) {
    room.participantProfiles = new Map();
  }

  room.participantUserIds?.add(user.userId);

  room.participantProfiles.set(user.userId, {
    userId: user.userId,
    username: user.username,
    role: user.role,
    lastSeenAt: Date.now(),
  });
};

const createProblemArenaState = (problemId) => ({
  problemId,
  attempts: 0,
  wrongAttempts: 0,
  solvedAt: null,
  lastResult: null,
  lastRuntimeMs: 0,
  codeByLanguage: {},
  lastLanguage: "javascript",
  updatedAt: null,
});

const createParticipantArenaState = (profile, problemIds) => ({
  userId: profile.userId,
  username: profile.username,
  role: profile.role,
  solvedCount: 0,
  submissions: 0,
  acceptedSubmissions: 0,
  wrongSubmissions: 0,
  penaltyMs: 0,
  totalRuntimeMs: 0,
  lastSubmissionAt: null,
  lastActivityAt: Date.now(),
  problems: new Map(
    problemIds.map((problemId) => [problemId, createProblemArenaState(problemId)])
  ),
});

const ensureArenaParticipantState = (room, userId) => {
  if (!room.arena || !room.arena.participants) {
    return null;
  }

  let participant = room.arena.participants.get(userId);
  if (!participant) {
    const profile = room.participantProfiles?.get(userId);
    if (!profile) return null;

    participant = createParticipantArenaState(
      profile,
      room.problemSet?.problemIds || []
    );
    room.arena.participants.set(userId, participant);
  }

  for (const problemId of room.problemSet?.problemIds || []) {
    if (!participant.problems.has(problemId)) {
      participant.problems.set(problemId, createProblemArenaState(problemId));
    }
  }

  return participant;
};

const initializeArenaForRoom = (room) => {
  const now = Date.now();
  const durationSeconds =
    room.problemSet?.durationSeconds || DEFAULT_ARENA_DURATION_SECONDS;
  const penaltySeconds =
    room.problemSet?.penaltySeconds ?? DEFAULT_PENALTY_SECONDS;

  room.arena = {
    startedAt: now,
    endsAt: now + durationSeconds * 1000,
    durationSeconds,
    penaltySeconds,
    finishedAt: null,
    finishedReason: null,
    participants: new Map(),
  };

  const problemIds = room.problemSet?.problemIds || [];
  for (const profile of room.participantProfiles?.values() || []) {
    room.arena.participants.set(
      profile.userId,
      createParticipantArenaState(profile, problemIds)
    );
  }

  return room.arena;
};

const buildArenaState = (roomId, room) => {
  const arena = room.arena;
  const now = Date.now();
  const problemIds = room.problemSet?.problemIds || [];
  const totalProblems = problemIds.length;
  const startedAt = arena?.startedAt || room.startedAt || null;
  const endsAt = arena?.endsAt || null;

  const onlineUserIds = new Set(
    Array.from(room.members.values()).map((member) => member.userId)
  );

  const scoreboard = [];
  for (const profile of room.participantProfiles?.values() || []) {
    const participant = arena?.participants?.get(profile.userId);

    const perProblem = problemIds.map((problemId) => {
      const progress = participant?.problems?.get(problemId);
      return {
        problemId,
        attempts: progress?.attempts || 0,
        wrongAttempts: progress?.wrongAttempts || 0,
        solved: Boolean(progress?.solvedAt),
        solvedAt: progress?.solvedAt || null,
        lastResult: progress?.lastResult || null,
      };
    });

    const solvedTimestamps = perProblem
      .map((problem) => problem.solvedAt)
      .filter(Boolean);
    const latestSolvedAt =
      solvedTimestamps.length > 0 ? Math.max(...solvedTimestamps) : null;

    const penaltyMs = participant?.penaltyMs || 0;
    let effectiveTimeMs = penaltyMs;

    if (startedAt && latestSolvedAt) {
      effectiveTimeMs += Math.max(0, latestSolvedAt - startedAt);
    }

    scoreboard.push({
      userId: profile.userId,
      username: profile.username,
      role: profile.role,
      isOnline: onlineUserIds.has(profile.userId),
      solvedCount: participant?.solvedCount || 0,
      submissions: participant?.submissions || 0,
      acceptedSubmissions: participant?.acceptedSubmissions || 0,
      wrongSubmissions: participant?.wrongSubmissions || 0,
      penaltySeconds: Math.floor(penaltyMs / 1000),
      effectiveTimeMs,
      lastSubmissionAt: participant?.lastSubmissionAt || null,
      lastActivityAt: participant?.lastActivityAt || null,
      perProblem,
      codeAvailableCount: perProblem.filter((problem) => {
        const progress = participant?.problems?.get(problem.problemId);
        if (!progress || !progress.codeByLanguage) return false;
        return Object.values(progress.codeByLanguage).some(
          (value) => typeof value === "string" && value.length > 0
        );
      }).length,
    });
  }

  scoreboard.sort((left, right) => {
    if (right.solvedCount !== left.solvedCount) {
      return right.solvedCount - left.solvedCount;
    }
    if (left.effectiveTimeMs !== right.effectiveTimeMs) {
      return left.effectiveTimeMs - right.effectiveTimeMs;
    }
    if (left.wrongSubmissions !== right.wrongSubmissions) {
      return left.wrongSubmissions - right.wrongSubmissions;
    }
    return left.username.localeCompare(right.username);
  });

  const timeLeftSeconds =
    room.status === "started" && endsAt
      ? Math.max(0, Math.ceil((endsAt - now) / 1000))
      : 0;

  return {
    roomId,
    status: room.status,
    startedAt,
    endsAt,
    finishedAt: room.finishedAt || arena?.finishedAt || null,
    durationSeconds:
      arena?.durationSeconds ||
      room.problemSet?.durationSeconds ||
      DEFAULT_ARENA_DURATION_SECONDS,
    penaltySeconds:
      arena?.penaltySeconds ??
      room.problemSet?.penaltySeconds ??
      DEFAULT_PENALTY_SECONDS,
    timeLeftSeconds,
    totalProblems,
    canViewCodes: room.status === "finished",
    problemSet: toPublicProblemSet(room.problemSet),
    scoreboard,
  };
};

const emitArenaState = (io, roomId, targetSocket = null) => {
  const room = rooms.get(roomId);
  if (!room || !isArenaStatus(room.status)) return;

  const payload = buildArenaState(roomId, room);
  if (targetSocket) {
    targetSocket.emit("arena-state", payload);
    return;
  }

  io.to(roomId).emit("arena-state", payload);
};

const finishRoom = (io, roomId, reason = "completed") => {
  const room = rooms.get(roomId);
  if (!room || room.status === "finished") return;

  clearRoomCountdown(roomId);
  clearRoomArenaTimer(roomId);

  const now = Date.now();
  room.status = "finished";
  room.finishedAt = now;
  room.abandonedAt = room.members.size === 0 ? now : null;

  if (room.arena) {
    room.arena.finishedAt = now;
    room.arena.finishedReason = reason;
  }

  emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
  emitArenaState(io, roomId);

  io.to(roomId).emit("room-finished", {
    roomId,
    reason,
    finishedAt: now,
  });
};

const maybeFinishRoomEarly = (io, roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "started" || !room.arena) return;

  const totalProblems = room.problemSet?.problemIds?.length || 0;
  if (totalProblems === 0) return;

  for (const participant of room.arena.participants.values()) {
    if ((participant.solvedCount || 0) < totalProblems) {
      return;
    }
  }

  finishRoom(io, roomId, "all_solved");
};

const startArenaTimer = (io, roomId) => {
  clearRoomArenaTimer(roomId);

  const room = rooms.get(roomId);
  if (!room?.arena?.endsAt) return;

  const remainingMs = Math.max(0, room.arena.endsAt - Date.now());
  const timeoutId = setTimeout(() => {
    finishRoom(io, roomId, "time_up");
  }, remainingMs + 20);

  timeoutId.unref?.();
  roomArenaTimers.set(roomId, timeoutId);
};

const startRoomCountdown = (io, roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "lobby") return;

  clearRoomCountdown(roomId);

  room.status = "countdown";
  room.countdownEndsAt = Date.now() + ROOM_COUNTDOWN_SECONDS * 1000;
  room.abandonedAt = null;

  emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
  emitCountdownTick(io, roomId, room.countdownEndsAt);

  const intervalId = setInterval(() => {
    const latestRoom = rooms.get(roomId);
    if (!latestRoom || latestRoom.status !== "countdown") {
      clearRoomCountdown(roomId);
      return;
    }

    emitCountdownTick(io, roomId, latestRoom.countdownEndsAt);
  }, 1000);

  const finishTimeoutId = setTimeout(() => {
    clearRoomCountdown(roomId);

    const latestRoom = rooms.get(roomId);
    if (!latestRoom || latestRoom.status !== "countdown") return;

    latestRoom.status = "started";
    latestRoom.countdownEndsAt = null;
    latestRoom.abandonedAt = null;

    const arena = initializeArenaForRoom(latestRoom);
    latestRoom.startedAt = arena.startedAt;

    emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
    emitArenaState(io, roomId);

    io.to(roomId).emit("room-started", {
      roomId,
      startedAt: arena.startedAt,
      endsAt: arena.endsAt,
    });

    startArenaTimer(io, roomId);
  }, ROOM_COUNTDOWN_SECONDS * 1000 + 120);

  intervalId.unref?.();
  finishTimeoutId.unref?.();
  roomCountdownTimers.set(roomId, { intervalId, finishTimeoutId });
};

const getRoomProblemById = (room, problemId) => {
  if (!room?.problemSet?.problems || !Array.isArray(room.problemSet.problems)) {
    return null;
  }

  return (
    room.problemSet.problems.find((problem) => problem.id === problemId) || null
  );
};

const sanitizeLanguage = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const getProgressForProblem = (participantState, problemId) => {
  if (!participantState?.problems) return null;
  if (!participantState.problems.has(problemId)) {
    participantState.problems.set(problemId, createProblemArenaState(problemId));
  }
  return participantState.problems.get(problemId);
};

export const initSocket = (io) => {
  if (!startedRoomCleanupInterval) {
    startedRoomCleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [roomId, room] of rooms.entries()) {
        if (!isArenaStatus(room.status) || room.members.size > 0) {
          continue;
        }

        if (!room.abandonedAt) {
          room.abandonedAt = now;
          continue;
        }

        if (now - room.abandonedAt >= STARTED_ROOM_TTL_MS) {
          clearRoomCountdown(roomId);
          clearRoomArenaTimer(roomId);
          rooms.delete(roomId);
          console.log(`Arena room cleaned up: ${roomId}`);
        }
      }
    }, STARTED_ROOM_CLEANUP_TICK_MS);

    startedRoomCleanupInterval.unref?.();
  }

  io.use(async (socket, next) => {
    try {
      const user = await resolveUserFromSocket(socket, User);
      if (!user) {
        return next(new Error("UNAUTHORIZED"));
      }

      socket.data.user = user;
      return next();
    } catch {
      return next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id} (${socket.data.user.username})`);

    const emitSocketError = (message) => socket.emit("socket-error", message);

    socket.onAny((eventName) => {
      if (!CLIENT_EVENTS.has(eventName)) {
        registerAbuse(socket, emitSocketError, "Unsupported socket action");
      }
    });

    socket.on("identify-user", (payload = {}) => {
      if (!checkRateLimit(socket, "identify-user", emitSocketError)) return;

      if (
        payload &&
        typeof payload === "object" &&
        typeof payload.userId === "string" &&
        payload.userId.trim() &&
        payload.userId.trim() !== socket.data.user.userId
      ) {
        registerAbuse(socket, emitSocketError, "Identity mismatch detected");
        return;
      }

      socket.emit("user-identified", socket.data.user);
    });

    socket.on("create-room", () => {
      if (!checkRateLimit(socket, "create-room", emitSocketError)) return;

      if (socket.data.user.role !== "admin") {
        emitSocketError("Only admin users can create rooms");
        return;
      }

      if (socket.data.roomId) {
        const previousRoomId = socket.data.roomId;
        removeSocketFromRoom(io, rooms, socket, previousRoomId);
        emitArenaState(io, previousRoomId);
      }

      const roomId = createUniqueRoomId(rooms);
      const room = {
        status: "lobby",
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
        countdownEndsAt: null,
        abandonedAt: null,
        members: new Map(),
        participantUserIds: new Set([socket.data.user.userId]),
        participantProfiles: new Map(),
        problemSet: null,
        arena: null,
      };

      ensureParticipantProfile(room, socket.data.user);

      room.members.set(socket.id, { ...socket.data.user, ready: false });
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.data.roomId = roomId;

      console.log(`Room created: ${roomId} by ${socket.data.user.username}`);
      socket.emit("room-created", roomId);
      emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
    });

    socket.on("get-problem-catalog", (payload = {}) => {
      if (!checkRateLimit(socket, "get-problem-catalog", emitSocketError)) {
        return;
      }

      if (typeof payload !== "object" || payload === null) {
        emitSocketError("Invalid problem-catalog payload");
        return;
      }

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      const userId = socket.data.user.userId;
      const canAccessRoom =
        room.members.has(socket.id) ||
        isUserActiveMember(room, userId) ||
        isUserRoomParticipant(room, userId);

      if (!canAccessRoom) {
        emitSocketError("You are not allowed to access this room");
        return;
      }

      socket.emit("problem-catalog", {
        roomId,
        facets: getProblemCatalogFacets(),
        problems: getFilteredProblemCatalog(payload),
        selectedProblemSet: toPublicProblemSet(room.problemSet),
      });
    });

    socket.on("set-room-problems", (payload = {}) => {
      if (!checkRateLimit(socket, "set-room-problems", emitSocketError)) return;

      if (typeof payload !== "object" || payload === null) {
        emitSocketError("Invalid room-problems payload");
        return;
      }

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (room.status !== "lobby") {
        emitSocketError("Problems can only be configured in lobby");
        return;
      }

      const currentMember = room.members.get(socket.id);
      if (!currentMember) {
        emitSocketError("You are not in this room");
        return;
      }

      if (currentMember.role !== "admin") {
        emitSocketError("Only admin can configure problems");
        return;
      }

      if (!Array.isArray(payload.problemIds)) {
        emitSocketError("Problem list is required");
        return;
      }

      if (payload.problemIds.length > MAX_PROBLEMS_PER_ROOM) {
        emitSocketError(
          `You can configure up to ${MAX_PROBLEMS_PER_ROOM} problems`
        );
        return;
      }

      const problemIds = normalizeProblemIds(payload.problemIds);
      if (problemIds.length === 0) {
        emitSocketError("Select at least one problem");
        return;
      }

      const selectedProblems = [];
      for (const problemId of problemIds) {
        const problem = PROBLEM_MAP.get(problemId);
        if (!problem) {
          emitSocketError("One or more selected problems are invalid");
          return;
        }
        selectedProblems.push(problem);
      }

      const durationSeconds = parseBoundedInt(
        payload.durationSeconds,
        MIN_ARENA_DURATION_SECONDS,
        MAX_ARENA_DURATION_SECONDS,
        DEFAULT_ARENA_DURATION_SECONDS
      );
      if (durationSeconds === null) {
        emitSocketError(
          `Duration must be between ${MIN_ARENA_DURATION_SECONDS} and ${MAX_ARENA_DURATION_SECONDS} seconds`
        );
        return;
      }

      const penaltySeconds = parseBoundedInt(
        payload.penaltySeconds,
        MIN_PENALTY_SECONDS,
        MAX_PENALTY_SECONDS,
        DEFAULT_PENALTY_SECONDS
      );
      if (penaltySeconds === null) {
        emitSocketError(
          `Penalty must be between ${MIN_PENALTY_SECONDS} and ${MAX_PENALTY_SECONDS} seconds`
        );
        return;
      }

      room.problemSet = {
        problemIds,
        problems: selectedProblems,
        configuredBy: socket.data.user.userId,
        configuredAt: Date.now(),
        durationSeconds,
        penaltySeconds,
      };

      room.arena = null;
      room.finishedAt = null;
      room.abandonedAt = null;

      for (const [memberSocketId, member] of room.members.entries()) {
        room.members.set(memberSocketId, {
          ...member,
          ready: member.role === "admin" ? false : false,
        });
      }

      const publicProblemSet = toPublicProblemSet(room.problemSet);
      io.to(roomId).emit("room-problems-set", {
        roomId,
        problemSet: publicProblemSet,
      });

      emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
    });

    socket.on("join-room", (roomIdInput) => {
      if (!checkRateLimit(socket, "join-room", emitSocketError)) return;

      const roomId = extractRoomId(roomIdInput);

      if (!roomId) {
        emitSocketError("Room ID is required");
        return;
      }

      if (!ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID format");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      let previousReadyState = false;
      for (const [memberSocketId, member] of room.members.entries()) {
        if (member.userId === socket.data.user.userId) {
          previousReadyState = Boolean(member.ready);
          room.members.delete(memberSocketId);
          const staleSocket = io.sockets.sockets.get(memberSocketId);
          if (staleSocket) {
            staleSocket.leave(roomId);
            staleSocket.data.roomId = undefined;
          }
        }
      }

      const isStartedRoom = room.status === "started";
      const isCountdownRoom = room.status === "countdown";
      const isFinishedRoom = room.status === "finished";
      const isLobbyRoom = room.status === "lobby";

      if (isStartedRoom || isCountdownRoom || isFinishedRoom) {
        if (!isUserRoomParticipant(room, socket.data.user.userId)) {
          emitSocketError("Room has already started");
          return;
        }
      } else if (isLobbyRoom) {
        if (
          room.members.size >= MAX_MEMBERS_PER_ROOM &&
          !room.members.has(socket.id)
        ) {
          emitSocketError("Room is full");
          return;
        }
      } else {
        emitSocketError("Room is not available");
        return;
      }

      if (socket.data.roomId && socket.data.roomId !== roomId) {
        const previousRoomId = socket.data.roomId;
        removeSocketFromRoom(io, rooms, socket, previousRoomId);
        emitArenaState(io, previousRoomId);
      }

      socket.join(roomId);
      room.members.set(socket.id, {
        ...socket.data.user,
        ready: isLobbyRoom ? previousReadyState : true,
      });

      ensureParticipantProfile(room, socket.data.user);
      room.abandonedAt = null;
      socket.data.roomId = roomId;

      if (isArenaStatus(room.status)) {
        ensureArenaParticipantState(room, socket.data.user.userId);
      }

      console.log(`${socket.data.user.username} joined room ${roomId}`);

      if (isStartedRoom || isFinishedRoom) {
        socket.emit("room-resume", {
          roomId,
          status: room.status,
        });
      } else {
        socket.emit("room-joined", roomId);
        if (isCountdownRoom) {
          const secondsLeft = getCountdownSecondsLeft(room.countdownEndsAt);
          if (secondsLeft > 0) {
            socket.emit("room-countdown", {
              roomId,
              secondsLeft,
              countdownEndsAt: room.countdownEndsAt,
            });
          }
        }
      }

      emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
      emitArenaState(io, roomId);
    });

    socket.on("toggle-ready", (payload = {}) => {
      if (!checkRateLimit(socket, "toggle-ready", emitSocketError)) return;

      if (typeof payload !== "object" || payload === null) {
        emitSocketError("Invalid ready payload");
        return;
      }

      if (typeof payload.ready !== "boolean") {
        emitSocketError("Ready value must be boolean");
        return;
      }

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (room.status !== "lobby") {
        emitSocketError("Room is already started");
        return;
      }

      const currentMember = room.members.get(socket.id);
      if (!currentMember) {
        emitSocketError("You are not in this room");
        return;
      }

      room.members.set(socket.id, {
        ...currentMember,
        ready: payload.ready,
      });

      emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
    });

    socket.on("start-room", (payload = {}) => {
      if (!checkRateLimit(socket, "start-room", emitSocketError)) return;

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (room.status !== "lobby") {
        if (room.status === "countdown") {
          emitSocketError("Countdown is already running");
        } else {
          emitSocketError("Room has already started");
        }
        return;
      }

      const currentMember = room.members.get(socket.id);
      if (!currentMember) {
        emitSocketError("You are not in this room");
        return;
      }

      if (currentMember.role !== "admin") {
        emitSocketError("Only admin can start the room");
        return;
      }

      const lobbyState = buildLobbyState(rooms, roomId, MAX_MEMBERS_PER_ROOM);
      if (!lobbyState || !lobbyState.canStart) {
        if (!lobbyState?.hasProblemSet) {
          emitSocketError("Admin must set room problems before start");
          return;
        }

        emitSocketError("All members must be ready");
        return;
      }

      startRoomCountdown(io, roomId);
    });

    socket.on("get-arena-state", (payload = {}) => {
      if (!checkRateLimit(socket, "get-arena-state", emitSocketError)) return;

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (!isArenaStatus(room.status)) {
        emitSocketError("Arena has not started");
        return;
      }

      const userId = socket.data.user.userId;
      if (!isUserRoomParticipant(room, userId)) {
        emitSocketError("You are not allowed in this arena");
        return;
      }

      emitArenaState(io, roomId, socket);
    });

    socket.on("arena-code-update", (payload = {}) => {
      if (!checkRateLimit(socket, "arena-code-update", emitSocketError)) {
        return;
      }

      if (typeof payload !== "object" || payload === null) {
        emitSocketError("Invalid code payload");
        return;
      }

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (room.status !== "started") {
        emitSocketError("Arena is not active");
        return;
      }

      if (!room.members.has(socket.id)) {
        emitSocketError("You are not active in this room");
        return;
      }

      const problemId =
        typeof payload.problemId === "string" ? payload.problemId.trim() : "";
      if (!problemId) {
        emitSocketError("Problem is required");
        return;
      }

      const roomProblem = getRoomProblemById(room, problemId);
      if (!roomProblem) {
        emitSocketError("Problem is not part of this room");
        return;
      }

      const language = sanitizeLanguage(payload.language);
      if (!isLanguageSupported(language)) {
        emitSocketError(`Supported languages: ${SUPPORTED_LANGUAGES.join(", ")}`);
        return;
      }

      const code = typeof payload.code === "string" ? payload.code : "";
      if (code.length > MAX_CODE_LENGTH) {
        emitSocketError(`Code too long (max ${MAX_CODE_LENGTH} chars)`);
        return;
      }

      const participant = ensureArenaParticipantState(room, socket.data.user.userId);
      if (!participant) {
        emitSocketError("Participant state is unavailable");
        return;
      }

      const progress = getProgressForProblem(participant, problemId);
      if (!progress) {
        emitSocketError("Problem progress is unavailable");
        return;
      }

      progress.codeByLanguage[language] = code;
      progress.lastLanguage = language;
      progress.updatedAt = Date.now();
      participant.lastActivityAt = progress.updatedAt;

      socket.to(roomId).emit("arena-code-presence", {
        roomId,
        userId: socket.data.user.userId,
        username: socket.data.user.username,
        problemId,
        language,
        updatedAt: progress.updatedAt,
      });
    });

    socket.on("run-code", async (payload = {}) => {
      if (!checkRateLimit(socket, "run-code", emitSocketError)) return;

      if (typeof payload !== "object" || payload === null) {
        emitSocketError("Invalid run payload");
        return;
      }

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (room.status !== "started") {
        emitSocketError("Arena is not active");
        return;
      }

      if (!room.members.has(socket.id)) {
        emitSocketError("You are not active in this room");
        return;
      }

      const problemId =
        typeof payload.problemId === "string" ? payload.problemId.trim() : "";
      const roomProblem = getRoomProblemById(room, problemId);
      if (!roomProblem) {
        emitSocketError("Problem is not part of this room");
        return;
      }

      const language = sanitizeLanguage(payload.language);
      if (!isLanguageSupported(language)) {
        emitSocketError(`Supported languages: ${SUPPORTED_LANGUAGES.join(", ")}`);
        return;
      }

      const code = typeof payload.code === "string" ? payload.code : "";
      if (!code.trim()) {
        emitSocketError("Code cannot be empty");
        return;
      }

      if (code.length > MAX_CODE_LENGTH) {
        emitSocketError(`Code too long (max ${MAX_CODE_LENGTH} chars)`);
        return;
      }

      if (socket.data.executionInFlight) {
        emitSocketError("Another execution is already in progress");
        return;
      }

      const participant = ensureArenaParticipantState(room, socket.data.user.userId);
      const progress = participant
        ? getProgressForProblem(participant, problemId)
        : null;
      if (progress) {
        progress.codeByLanguage[language] = code;
        progress.lastLanguage = language;
        progress.updatedAt = Date.now();
      }

      socket.data.executionInFlight = true;
      try {
        const visibleTests = Array.isArray(roomProblem.tests?.visible)
          ? roomProblem.tests.visible.slice(0, MAX_VISIBLE_RUN_TESTS)
          : [];

        const result = await executeCodeAgainstTests({
          language,
          code,
          tests: visibleTests,
          stopOnFirstFailure: false,
        });

        if (!result.ok) {
          socket.emit("code-run-result", {
            roomId,
            problemId,
            language,
            ok: false,
            errorType: result.errorType || "runtime",
            message: result.message || "Execution failed",
          });
          return;
        }

        socket.emit("code-run-result", {
          roomId,
          problemId,
          language,
          ok: true,
          passedAll: Boolean(result.passedAll),
          passedCount: result.passedCount || 0,
          failedCount: result.failedCount || 0,
          runtimeMs: result.runtimeMs || 0,
          results: Array.isArray(result.results) ? result.results : [],
        });
      } finally {
        socket.data.executionInFlight = false;
      }
    });

    socket.on("submit-solution", async (payload = {}) => {
      if (!checkRateLimit(socket, "submit-solution", emitSocketError)) return;

      if (typeof payload !== "object" || payload === null) {
        emitSocketError("Invalid submission payload");
        return;
      }

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (room.status !== "started") {
        if (room.status === "finished") {
          emitSocketError("Arena has already finished");
        } else {
          emitSocketError("Arena is not active");
        }
        return;
      }

      if (room.arena?.endsAt && Date.now() >= room.arena.endsAt) {
        finishRoom(io, roomId, "time_up");
        emitSocketError("Arena time is over");
        return;
      }

      if (!room.members.has(socket.id)) {
        emitSocketError("You are not active in this room");
        return;
      }

      const problemId =
        typeof payload.problemId === "string" ? payload.problemId.trim() : "";
      const roomProblem = getRoomProblemById(room, problemId);
      if (!roomProblem) {
        emitSocketError("Problem is not part of this room");
        return;
      }

      const language = sanitizeLanguage(payload.language);
      if (!isLanguageSupported(language)) {
        emitSocketError(`Supported languages: ${SUPPORTED_LANGUAGES.join(", ")}`);
        return;
      }

      const code = typeof payload.code === "string" ? payload.code : "";
      if (!code.trim()) {
        emitSocketError("Code cannot be empty");
        return;
      }

      if (code.length > MAX_CODE_LENGTH) {
        emitSocketError(`Code too long (max ${MAX_CODE_LENGTH} chars)`);
        return;
      }

      if (socket.data.executionInFlight) {
        emitSocketError("Another execution is already in progress");
        return;
      }

      const participant = ensureArenaParticipantState(room, socket.data.user.userId);
      if (!participant) {
        emitSocketError("Participant state is unavailable");
        return;
      }

      const progress = getProgressForProblem(participant, problemId);
      if (!progress) {
        emitSocketError("Problem progress is unavailable");
        return;
      }

      progress.codeByLanguage[language] = code;
      progress.lastLanguage = language;
      progress.updatedAt = Date.now();
      participant.lastActivityAt = progress.updatedAt;

      socket.data.executionInFlight = true;
      try {
        const visibleTests = Array.isArray(roomProblem.tests?.visible)
          ? roomProblem.tests.visible
          : [];
        const hiddenTests = Array.isArray(roomProblem.tests?.hidden)
          ? roomProblem.tests.hidden
          : [];
        const tests = [...visibleTests, ...hiddenTests];

        const execution = await executeCodeAgainstTests({
          language,
          code,
          tests,
          stopOnFirstFailure: false,
        });

        const now = Date.now();
        const penaltySeconds = room.problemSet?.penaltySeconds ?? DEFAULT_PENALTY_SECONDS;

        participant.submissions += 1;
        participant.lastSubmissionAt = now;
        participant.lastActivityAt = now;
        progress.attempts += 1;
        progress.lastRuntimeMs = execution.runtimeMs || 0;

        let accepted = false;
        let newlySolved = false;
        let penaltyApplied = 0;

        if (execution.ok && execution.passedAll) {
          accepted = true;
          progress.lastResult = "accepted";

          if (!progress.solvedAt) {
            progress.solvedAt = now;
            participant.solvedCount += 1;
            participant.acceptedSubmissions += 1;
            newlySolved = true;
          }
        } else {
          progress.lastResult =
            execution.errorType === "compile_error"
              ? "compile_error"
              : execution.errorType === "timeout"
              ? "timeout"
              : execution.errorType
              ? "runtime_error"
              : "wrong_answer";

          if (!progress.solvedAt) {
            progress.wrongAttempts += 1;
            participant.wrongSubmissions += 1;
            penaltyApplied = penaltySeconds;
            participant.penaltyMs += penaltySeconds * 1000;
          }
        }

        participant.totalRuntimeMs += execution.runtimeMs || 0;

        socket.emit("solution-submitted", {
          roomId,
          problemId,
          language,
          accepted,
          newlySolved,
          penaltyAppliedSeconds: penaltyApplied,
          execution: {
            ok: execution.ok,
            passedAll: Boolean(execution.passedAll),
            passedCount: execution.passedCount || 0,
            failedCount: execution.failedCount || 0,
            runtimeMs: execution.runtimeMs || 0,
            errorType: execution.errorType || null,
            message: execution.message || null,
            results: Array.isArray(execution.results) ? execution.results : [],
          },
        });

        emitArenaState(io, roomId);
        maybeFinishRoomEarly(io, roomId);
      } finally {
        socket.data.executionInFlight = false;
      }
    });

    socket.on("request-participant-code", (payload = {}) => {
      if (!checkRateLimit(socket, "request-participant-code", emitSocketError)) {
        return;
      }

      if (typeof payload !== "object" || payload === null) {
        emitSocketError("Invalid code request payload");
        return;
      }

      const roomId = extractRoomId(payload.roomId || socket.data.roomId);
      if (!roomId || !ROOM_ID_REGEX.test(roomId)) {
        emitSocketError("Invalid room ID");
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        emitSocketError("Room does not exist");
        return;
      }

      if (room.status !== "finished") {
        emitSocketError("Codes are available after arena completion");
        return;
      }

      const requesterId = socket.data.user.userId;
      if (!isUserRoomParticipant(room, requesterId)) {
        emitSocketError("You are not allowed to access this room");
        return;
      }

      const targetUserId =
        typeof payload.targetUserId === "string" ? payload.targetUserId.trim() : "";
      const problemId =
        typeof payload.problemId === "string" ? payload.problemId.trim() : "";
      const requestedLanguage = sanitizeLanguage(payload.language);

      if (!targetUserId || !problemId) {
        emitSocketError("Target user and problem are required");
        return;
      }

      const targetParticipant = room.arena?.participants?.get(targetUserId);
      if (!targetParticipant) {
        emitSocketError("Target participant does not exist");
        return;
      }

      const progress = targetParticipant.problems?.get(problemId);
      if (!progress) {
        emitSocketError("Problem data does not exist for participant");
        return;
      }

      const languages = Object.keys(progress.codeByLanguage || {});
      const fallbackLanguage = progress.lastLanguage || languages[0] || "javascript";
      const language = isLanguageSupported(requestedLanguage)
        ? requestedLanguage
        : fallbackLanguage;
      const code = progress.codeByLanguage?.[language] || "";

      socket.emit("participant-code", {
        roomId,
        targetUserId,
        username: targetParticipant.username,
        problemId,
        language,
        code,
        updatedAt: progress.updatedAt || null,
      });
    });

    socket.on("disconnect", () => {
      const previousRoomId = socket.data.roomId;
      if (previousRoomId) {
        removeSocketFromRoom(io, rooms, socket, previousRoomId);
        emitArenaState(io, previousRoomId);
      }
    });
  });
};
