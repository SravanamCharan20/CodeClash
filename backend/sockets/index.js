// sockets/index.js
import { randomUUID } from "crypto";

const activeRooms = new Set();

export const initSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Admin creates room
    socket.on("create-room", () => {
      const roomId = randomUUID();

      activeRooms.add(roomId);
      socket.join(roomId); // admin joins to the room

      console.log(`Room created: ${roomId} by ${socket.id}`);

      // 3️⃣ confirm join
      socket.emit("room-created", roomId);
    });

    socket.on("join-room", (roomId) => {
      if (!activeRooms.has(roomId)) {
        socket.emit("error", "Room does not exist");
        return;
      }

      socket.join(roomId);
      console.log(`${socket.id} joined room ${roomId}`);

      // 3️⃣ confirm join
      socket.emit("room-joined", roomId);
    });
  });
};
