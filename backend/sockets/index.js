// sockets/index.js
import User from "../models/User.js";
import {
  CLIENT_EVENTS,
  MAX_PROBLEMS_PER_ROOM,
  MAX_MEMBERS_PER_ROOM,
  PROBLEM_MAP,
  ROOM_ID_REGEX,
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

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

// roomId -> { status, createdAt, startedAt, countdownEndsAt, abandonedAt, members(Map(socketId -> member)), participantUserIds(Set(userId)), problemSet }
const rooms = new Map();
let startedRoomCleanupInterval;
const roomCountdownTimers = new Map();

const clearRoomCountdown = (roomId) => {
  const activeCountdown = roomCountdownTimers.get(roomId);
  if (!activeCountdown) return;

  clearInterval(activeCountdown.intervalId);
  clearTimeout(activeCountdown.finishTimeoutId);
  roomCountdownTimers.delete(roomId);
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

const isUserActiveMember = (room, userId) => {
  for (const member of room.members.values()) {
    if (member.userId === userId) return true;
  }
  return false;
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
    latestRoom.startedAt = Date.now();
    latestRoom.countdownEndsAt = null;
    latestRoom.abandonedAt =
      latestRoom.members.size === 0 ? Date.now() : null;

    emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
    io.to(roomId).emit("room-started", {
      roomId,
      startedAt: latestRoom.startedAt,
    });
  }, ROOM_COUNTDOWN_SECONDS * 1000 + 100);

  intervalId.unref?.();
  finishTimeoutId.unref?.();
  roomCountdownTimers.set(roomId, { intervalId, finishTimeoutId });
};

export const initSocket = (io) => {
  if (!startedRoomCleanupInterval) {
    startedRoomCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [roomId, room] of rooms.entries()) {
        if (room.status !== "started" || room.members.size > 0) {
          continue;
        }

        if (!room.abandonedAt) {
          room.abandonedAt = now;
          continue;
        }

        if (now - room.abandonedAt >= STARTED_ROOM_TTL_MS) {
          clearRoomCountdown(roomId);
          rooms.delete(roomId);
          console.log(`Started room cleaned up: ${roomId}`);
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

      // Identity is server-authenticated from the JWT cookie.
      // This event is kept for frontend compatibility and tamper detection.
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
        removeSocketFromRoom(io, rooms, socket, socket.data.roomId);
      }

      const roomId = createUniqueRoomId(rooms);
      const room = {
        status: "lobby",
        createdAt: Date.now(),
        startedAt: null,
        countdownEndsAt: null,
        abandonedAt: null,
        members: new Map(),
        participantUserIds: new Set([socket.data.user.userId]),
        problemSet: null,
      };

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
        room.participantUserIds?.has(userId);

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

      if (Array.isArray(payload.problemIds)) {
        if (payload.problemIds.length > MAX_PROBLEMS_PER_ROOM) {
          emitSocketError(
            `You can configure up to ${MAX_PROBLEMS_PER_ROOM} problems`
          );
          return;
        }
      } else {
        emitSocketError("Problem list is required");
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

      room.problemSet = {
        problemIds,
        problems: selectedProblems,
        configuredBy: socket.data.user.userId,
        configuredAt: Date.now(),
      };
      room.abandonedAt = null;

      const publicProblemSet = toPublicProblemSet(room.problemSet);
      socket.emit("room-problems-set", {
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
          }
        }
      }

      const isStartedRoom = room.status === "started";
      const isCountdownRoom = room.status === "countdown";
      const isLobbyRoom = room.status === "lobby";

      if (isStartedRoom || isCountdownRoom) {
        if (!room.participantUserIds?.has(socket.data.user.userId)) {
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
        removeSocketFromRoom(io, rooms, socket, socket.data.roomId);
      }

      socket.join(roomId);
      room.members.set(socket.id, {
        ...socket.data.user,
        ready: previousReadyState,
      });
      room.abandonedAt = null;
      if (isLobbyRoom) {
        room.participantUserIds?.add(socket.data.user.userId);
      }
      socket.data.roomId = roomId;

      console.log(`${socket.data.user.username} joined room ${roomId}`);
      if (isStartedRoom) {
        socket.emit("room-resume", { roomId });
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

    socket.on("disconnect", () => {
      if (socket.data.roomId) {
        removeSocketFromRoom(io, rooms, socket, socket.data.roomId);
      }
    });
  });
};
