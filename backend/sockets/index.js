// sockets/index.js
import User from "../models/User.js";
import {
  CLIENT_EVENTS,
  MAX_MEMBERS_PER_ROOM,
  ROOM_ID_REGEX,
  buildLobbyState,
  checkRateLimit,
  createUniqueRoomId,
  emitLobbyUpdate,
  extractRoomId,
  registerAbuse,
  removeSocketFromRoom,
  resolveUserFromSocket,
} from "./utils/utilsFunc.js";

// roomId -> { status, createdAt, startedAt, members(Map(socketId -> member)) }
const rooms = new Map();

export const initSocket = (io) => {
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
        members: new Map(),
      };

      room.members.set(socket.id, { ...socket.data.user, ready: false });
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.data.roomId = roomId;

      console.log(`Room created: ${roomId} by ${socket.data.user.username}`);
      socket.emit("room-created", roomId);
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
        removeSocketFromRoom(io, rooms, socket, socket.data.roomId);
      }

      socket.join(roomId);
      room.members.set(socket.id, {
        ...socket.data.user,
        ready: previousReadyState,
      });
      socket.data.roomId = roomId;

      console.log(`${socket.data.user.username} joined room ${roomId}`);
      socket.emit("room-joined", roomId);
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

      const lobbyState = buildLobbyState(rooms, roomId, MAX_MEMBERS_PER_ROOM);
      if (!lobbyState || !lobbyState.canStart) {
        emitSocketError("All members must be ready");
        return;
      }

      room.status = "started";
      room.startedAt = Date.now();
      emitLobbyUpdate(io, rooms, roomId, MAX_MEMBERS_PER_ROOM);
      io.to(roomId).emit("room-started", { roomId });
    });

    socket.on("disconnect", () => {
      if (socket.data.roomId) {
        removeSocketFromRoom(io, rooms, socket, socket.data.roomId);
      }
    });
  });
};
