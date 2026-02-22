// sockets/index.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// roomId -> { status, createdAt, startedAt, members(Map(socketId -> member)) }
const rooms = new Map();

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_ID_LENGTH = 7;
const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const MAX_MEMBERS_PER_ROOM = 20;
const MAX_ABUSE_STRIKES = 6;

const GLOBAL_RATE_LIMIT = { windowMs: 8000, max: 45 };
const EVENT_RATE_LIMITS = {
  "identify-user": { windowMs: 10000, max: 8 },
  "create-room": { windowMs: 60000, max: 4 },
  "join-room": { windowMs: 20000, max: 8 },
  "toggle-ready": { windowMs: 6000, max: 12 },
  "start-room": { windowMs: 10000, max: 4 },
};

const CLIENT_EVENTS = new Set([
  "identify-user",
  "create-room",
  "join-room",
  "toggle-ready",
  "start-room",
]);

const normalizeRoomId = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const extractRoomId = (payload) => {
  if (typeof payload === "string") return normalizeRoomId(payload);
  if (payload && typeof payload === "object") {
    return normalizeRoomId(payload.roomId);
  }
  return "";
};

const parseCookieHeader = (cookieHeader = "") => {
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) return {};

  const cookies = {};
  for (const entry of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = entry.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    const rawValue = rawValueParts.join("=").trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return cookies;
};

function generateRoomId(length = ROOM_ID_LENGTH) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
  }
  return result;
}

function createUniqueRoomId() {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId));
  return roomId;
}

const toPublicMember = ({ userId, username, role, ready }) => ({
  userId,
  username,
  role,
  ready: Boolean(ready),
});

const buildLobbyState = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return null;

  const members = Array.from(room.members.values()).map(toPublicMember);
  const hasAdmin = members.some((member) => member.role === "admin");
  const allReady =
    members.length > 0 && members.every((member) => member.ready === true);

  return {
    roomId,
    status: room.status,
    members,
    memberCount: members.length,
    maxMembers: MAX_MEMBERS_PER_ROOM,
    allReady,
    canStart: room.status === "lobby" && hasAdmin && allReady,
  };
};

const emitLobbyUpdate = (io, roomId) => {
  const lobbyState = buildLobbyState(roomId);
  if (!lobbyState) return;
  io.to(roomId).emit("lobby-update", lobbyState);
};

const ensureRateState = (socket) => {
  if (!socket.data.rateState) {
    socket.data.rateState = {
      global: [],
      byEvent: new Map(),
      strikes: 0,
    };
  }

  return socket.data.rateState;
};

const hasExceededLimit = (timestamps, { windowMs, max }, now) => {
  while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= max) {
    return true;
  }

  timestamps.push(now);
  return false;
};

const registerAbuse = (socket, emitSocketError, message) => {
  const rateState = ensureRateState(socket);
  rateState.strikes += 1;
  emitSocketError(message);

  if (rateState.strikes >= MAX_ABUSE_STRIKES) {
    emitSocketError("Too many abusive requests. Connection closed.");
    socket.disconnect(true);
  }
};

const checkRateLimit = (socket, eventName, emitSocketError) => {
  const now = Date.now();
  const rateState = ensureRateState(socket);

  if (hasExceededLimit(rateState.global, GLOBAL_RATE_LIMIT, now)) {
    registerAbuse(socket, emitSocketError, "Too many requests. Slow down.");
    return false;
  }

  const eventLimit = EVENT_RATE_LIMITS[eventName];
  if (!eventLimit) return true;

  if (!rateState.byEvent.has(eventName)) {
    rateState.byEvent.set(eventName, []);
  }

  const eventTimestamps = rateState.byEvent.get(eventName);
  if (hasExceededLimit(eventTimestamps, eventLimit, now)) {
    registerAbuse(
      socket,
      emitSocketError,
      `Too many ${eventName} attempts. Please wait and try again.`
    );
    return false;
  }

  return true;
};

const removeSocketFromRoom = (io, socket, roomIdInput = socket.data.roomId) => {
  const roomId = normalizeRoomId(roomIdInput);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) {
    if (socket.data.roomId === roomId) {
      socket.data.roomId = undefined;
    }
    return;
  }

  const user = room.members.get(socket.id);
  if (!user) {
    if (socket.data.roomId === roomId) {
      socket.data.roomId = undefined;
    }
    return;
  }

  room.members.delete(socket.id);
  socket.leave(roomId);
  socket.data.roomId = undefined;
  console.log(`${user.username} left room ${roomId}`);

  if (room.members.size === 0) {
    rooms.delete(roomId);
    console.log(`Room deleted: ${roomId}`);
    return;
  }

  emitLobbyUpdate(io, roomId);
};

const resolveUserFromSocket = async (socket) => {
  const cookies = parseCookieHeader(socket.handshake?.headers?.cookie);
  const token = cookies.token;

  if (!token || !process.env.JWT_SECRET) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded._id).select("_id username role");
  if (!user) return null;

  return {
    userId: String(user._id),
    username: user.username,
    role: user.role,
  };
};

export const initSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const user = await resolveUserFromSocket(socket);
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
        removeSocketFromRoom(io, socket, socket.data.roomId);
      }

      const roomId = createUniqueRoomId();
      const room = {
        status: "lobby",
        createdAt: Date.now(),
        startedAt: null,
        members: new Map(),
      };

      room.members.set(socket.id, { ...socket.data.user, ready: false });
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.data.roomId = roomId;

      console.log(`Room created: ${roomId} by ${socket.data.user.username}`);
      socket.emit("room-created", roomId);
      emitLobbyUpdate(io, roomId);
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

      if (room.status !== "lobby") {
        emitSocketError("Room has already started");
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

      if (
        room.members.size >= MAX_MEMBERS_PER_ROOM &&
        !room.members.has(socket.id)
      ) {
        emitSocketError("Room is full");
        return;
      }

      if (socket.data.roomId && socket.data.roomId !== roomId) {
        removeSocketFromRoom(io, socket, socket.data.roomId);
      }

      socket.join(roomId);
      room.members.set(socket.id, {
        ...socket.data.user,
        ready: previousReadyState,
      });
      socket.data.roomId = roomId;

      console.log(`${socket.data.user.username} joined room ${roomId}`);
      socket.emit("room-joined", roomId);
      emitLobbyUpdate(io, roomId);
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

      emitLobbyUpdate(io, roomId);
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
        emitSocketError("Room has already started");
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

      const lobbyState = buildLobbyState(roomId);
      if (!lobbyState || !lobbyState.canStart) {
        emitSocketError("All members must be ready");
        return;
      }

      room.status = "started";
      room.startedAt = Date.now();
      emitLobbyUpdate(io, roomId);
      io.to(roomId).emit("room-started", { roomId });
    });

    socket.on("disconnect", () => {
      if (socket.data.roomId) {
        removeSocketFromRoom(io, socket, socket.data.roomId);
      }
    });
  });
};
