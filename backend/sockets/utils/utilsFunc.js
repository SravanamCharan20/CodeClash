import jwt from "jsonwebtoken";

export const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_ID_LENGTH = 7;
export const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
export const MAX_MEMBERS_PER_ROOM = 20;
export const MAX_ABUSE_STRIKES = 6;

export const GLOBAL_RATE_LIMIT = { windowMs: 8000, max: 45 };
export const EVENT_RATE_LIMITS = {
  "identify-user": { windowMs: 10000, max: 8 },
  "create-room": { windowMs: 60000, max: 4 },
  "join-room": { windowMs: 20000, max: 8 },
  "toggle-ready": { windowMs: 6000, max: 12 },
  "start-room": { windowMs: 10000, max: 4 },
};

export const CLIENT_EVENTS = new Set([
  "identify-user",
  "create-room",
  "join-room",
  "toggle-ready",
  "start-room",
]);

export const normalizeRoomId = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

export const extractRoomId = (payload) => {
  if (typeof payload === "string") return normalizeRoomId(payload);
  if (payload && typeof payload === "object") {
    return normalizeRoomId(payload.roomId);
  }
  return "";
};

export const parseCookieHeader = (cookieHeader = "") => {
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

export const generateRoomId = (length = ROOM_ID_LENGTH) => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
  }
  return result;
};

export const createUniqueRoomId = (rooms) => {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId));
  return roomId;
};

export const toPublicMember = ({ userId, username, role, ready }) => ({
  userId,
  username,
  role,
  ready: Boolean(ready),
});

export const buildLobbyState = (
  rooms,
  roomId,
  maxMembers = MAX_MEMBERS_PER_ROOM
) => {
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
    maxMembers,
    allReady,
    canStart: room.status === "lobby" && hasAdmin && allReady,
  };
};

export const emitLobbyUpdate = (
  io,
  rooms,
  roomId,
  maxMembers = MAX_MEMBERS_PER_ROOM
) => {
  const lobbyState = buildLobbyState(rooms, roomId, maxMembers);
  if (!lobbyState) return;
  io.to(roomId).emit("lobby-update", lobbyState);
};

export const ensureRateState = (socket) => {
  if (!socket.data.rateState) {
    socket.data.rateState = {
      global: [],
      byEvent: new Map(),
      strikes: 0,
    };
  }

  return socket.data.rateState;
};

export const hasExceededLimit = (timestamps, { windowMs, max }, now) => {
  while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= max) {
    return true;
  }

  timestamps.push(now);
  return false;
};

export const registerAbuse = (
  socket,
  emitSocketError,
  message,
  maxAbuseStrikes = MAX_ABUSE_STRIKES
) => {
  const rateState = ensureRateState(socket);
  rateState.strikes += 1;
  emitSocketError(message);

  if (rateState.strikes >= maxAbuseStrikes) {
    emitSocketError("Too many abusive requests. Connection closed.");
    socket.disconnect(true);
  }
};

export const checkRateLimit = (
  socket,
  eventName,
  emitSocketError,
  globalRateLimit = GLOBAL_RATE_LIMIT,
  eventRateLimits = EVENT_RATE_LIMITS,
  maxAbuseStrikes = MAX_ABUSE_STRIKES
) => {
  const now = Date.now();
  const rateState = ensureRateState(socket);

  if (hasExceededLimit(rateState.global, globalRateLimit, now)) {
    registerAbuse(
      socket,
      emitSocketError,
      "Too many requests. Slow down.",
      maxAbuseStrikes
    );
    return false;
  }

  const eventLimit = eventRateLimits[eventName];
  if (!eventLimit) return true;

  if (!rateState.byEvent.has(eventName)) {
    rateState.byEvent.set(eventName, []);
  }

  const eventTimestamps = rateState.byEvent.get(eventName);
  if (hasExceededLimit(eventTimestamps, eventLimit, now)) {
    registerAbuse(
      socket,
      emitSocketError,
      `Too many ${eventName} attempts. Please wait and try again.`,
      maxAbuseStrikes
    );
    return false;
  }

  return true;
};

export const removeSocketFromRoom = (
  io,
  rooms,
  socket,
  roomIdInput = socket.data.roomId,
  maxMembers = MAX_MEMBERS_PER_ROOM
) => {
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

  // Keep started rooms available for eligible participant re-joins.
  if (room.members.size === 0 && room.status !== "started") {
    rooms.delete(roomId);
    console.log(`Room deleted: ${roomId}`);
    return;
  }

  if (room.status === "started") {
    room.abandonedAt = room.members.size === 0 ? Date.now() : null;
  }

  emitLobbyUpdate(io, rooms, roomId, maxMembers);
};

export const resolveUserFromSocket = async (socket, UserModel) => {
  const cookies = parseCookieHeader(socket.handshake?.headers?.cookie);
  const token = cookies.token;

  if (!token || !process.env.JWT_SECRET) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await UserModel.findById(decoded._id).select("_id username role");
  if (!user) return null;

  return {
    userId: String(user._id),
    username: user.username,
    role: user.role,
  };
};
