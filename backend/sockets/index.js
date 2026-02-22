// sockets/index.js
// roomId -> Map(socketId -> member)
const roomMembers = new Map();

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomId(length = 7) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
  }
  return result;
}

function createUniqueRoomId() {
  let roomId;
  do {
    roomId = generateRoomId(7);
  } while (roomMembers.has(roomId));
  return roomId;
}

const normalizeRoomId = (value) =>
  typeof value === "string" ? value.trim() : "";

const buildLobbyState = (roomId) => {
  const membersMap = roomMembers.get(roomId) ?? new Map();
  const members = Array.from(membersMap.values());
  const hasAdmin = members.some((member) => member.role === "admin");
  const allReady =
    members.length > 0 && members.every((member) => member.ready === true);

  return {
    roomId,
    members,
    allReady,
    canStart: hasAdmin && allReady,
  };
};

const emitLobbyUpdate = (io, roomId) => {
  if (!roomMembers.has(roomId)) return;
  io.to(roomId).emit("lobby-update", buildLobbyState(roomId));
};

export const initSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    const emitSocketError = (message) => socket.emit("socket-error", message);

    socket.on("identify-user", (payload = {}) => {
      const { userId, username, role } = payload;

      if (!userId || !username || !role) {
        emitSocketError("Invalid user payload");
        return;
      }

      socket.data.user = { userId, username, role };
      console.log(
        `User identified: ${username} (${role}) | socket: ${socket.id}`
      );
    });

    socket.on("create-room", () => {
      if (!socket.data.user) {
        emitSocketError("User not identified");
        return;
      }

      const roomId = createUniqueRoomId();
      const members = new Map();

      socket.join(roomId);
      members.set(socket.id, { ...socket.data.user, ready: false });
      roomMembers.set(roomId, members);
      socket.data.roomId = roomId;

      console.log(`Room created: ${roomId} by ${socket.data.user.username}`);
      socket.emit("room-created", roomId);
      emitLobbyUpdate(io, roomId);
    });

    socket.on("join-room", (roomIdInput) => {
      const roomId = normalizeRoomId(roomIdInput);

      if (!roomId) {
        emitSocketError("Room ID is required");
        return;
      }

      if (!socket.data.user) {
        emitSocketError("User not identified");
        return;
      }

      if (!roomMembers.has(roomId)) {
        emitSocketError("Room does not exist");
        return;
      }

      const members = roomMembers.get(roomId);

      // Prevent duplicate entries for same user (refresh/reconnect case).
      for (const [memberSocketId, member] of members.entries()) {
        if (member.userId === socket.data.user.userId) {
          members.delete(memberSocketId);
        }
      }

      socket.join(roomId);
      members.set(socket.id, { ...socket.data.user, ready: false });
      socket.data.roomId = roomId;

      console.log(`${socket.data.user.username} joined room ${roomId}`);
      socket.emit("room-joined", roomId);
      emitLobbyUpdate(io, roomId);
    });

    socket.on("toggle-ready", (payload = {}) => {
      const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);
      const ready = Boolean(payload.ready);

      if (!roomId) {
        emitSocketError("Room ID is required");
        return;
      }

      if (!roomMembers.has(roomId)) {
        emitSocketError("Room does not exist");
        return;
      }

      const members = roomMembers.get(roomId);
      if (!members.has(socket.id)) {
        emitSocketError("You are not in this room");
        return;
      }

      const member = members.get(socket.id);
      members.set(socket.id, { ...member, ready });

      emitLobbyUpdate(io, roomId);
    });

    socket.on("start-room", (payload = {}) => {
      const roomId = normalizeRoomId(payload.roomId || socket.data.roomId);

      if (!roomId) {
        emitSocketError("Room ID is required");
        return;
      }

      if (!roomMembers.has(roomId)) {
        emitSocketError("Room does not exist");
        return;
      }

      const members = roomMembers.get(roomId);
      const currentMember = members.get(socket.id);

      if (!currentMember) {
        emitSocketError("You are not in this room");
        return;
      }

      if (currentMember.role !== "admin") {
        emitSocketError("Only admin can start the room");
        return;
      }

      const lobbyState = buildLobbyState(roomId);
      if (!lobbyState.canStart) {
        emitSocketError("All members must be ready");
        return;
      }

      io.to(roomId).emit("room-started", { roomId });
    });

    socket.on("disconnect", () => {
      for (const [roomId, members] of roomMembers.entries()) {
        if (!members.has(socket.id)) continue;

        const user = members.get(socket.id);
        members.delete(socket.id);
        console.log(`${user.username} left room ${roomId}`);

        if (members.size === 0) {
          roomMembers.delete(roomId);
          console.log(`Room deleted: ${roomId}`);
        } else {
          emitLobbyUpdate(io, roomId);
        }

        break;
      }
    });
  });
};
