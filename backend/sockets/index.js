// sockets/index.js
// roomId -> Map(socketId -> userInfo)
const roomMembers = new Map();

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; 

function generateRoomId(length = 7) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ROOM_CHARS.charAt(
      Math.floor(Math.random() * ROOM_CHARS.length)
    );
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

export const initSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    const emitSocketError = (message) => socket.emit("socket-error", message);

    // IDENTIFY USER (FIRST)
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

    // CREATE ROOM (ADMIN)
    socket.on("create-room", () => {
      if (!socket.data.user) {
        emitSocketError("User not identified");
        return;
      }

      const roomId = createUniqueRoomId();
      socket.join(roomId);

      roomMembers.set(roomId, new Map());
      roomMembers.get(roomId).set(socket.id, socket.data.user);

      console.log(
        `Room created: ${roomId} by ${socket.data.user.username}`
      );

      socket.emit("room-created", roomId);

      io.to(roomId).emit("lobby-update", {
        roomId,
        members: Array.from(roomMembers.get(roomId).values()),
      });
    });

    // JOIN ROOM (USER)
    socket.on("join-room", (roomId) => {
      const normalizedRoomId =
        typeof roomId === "string" ? roomId.trim() : "";

      if (!normalizedRoomId) {
        emitSocketError("Room ID is required");
        return;
      }

      if (!socket.data.user) {
        emitSocketError("User not identified");
        return;
      }

      if (!roomMembers.has(normalizedRoomId)) {
        emitSocketError("Room does not exist");
        return;
      }

      socket.join(normalizedRoomId);
      roomMembers.get(normalizedRoomId).set(socket.id, socket.data.user);

      console.log(
        `${socket.data.user.username} joined room ${normalizedRoomId}`
      );

      socket.emit("room-joined", normalizedRoomId);

      io.to(normalizedRoomId).emit("lobby-update", {
        roomId: normalizedRoomId,
        members: Array.from(roomMembers.get(normalizedRoomId).values()),
      });
    });

    //DISCONNECT HANDLING
    socket.on("disconnect", () => {
      for (const [roomId, members] of roomMembers.entries()) {
        if (members.has(socket.id)) {
          const user = members.get(socket.id);
          members.delete(socket.id);

          console.log(
            `${user.username} left room ${roomId}`
          );

          io.to(roomId).emit("lobby-update", {
            roomId,
            members: Array.from(members.values()),
          });

          if (members.size === 0) {
            roomMembers.delete(roomId);
            console.log(`Room deleted: ${roomId}`);
          }
        }
      }
    });
  });
};
