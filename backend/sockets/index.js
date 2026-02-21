// sockets/index.js
import { randomUUID } from "crypto";

export const initSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Admin creates room
    socket.on("create-room", () => {
      const roomId = randomUUID();
      socket.join(roomId); // admin joins to the room

      console.log(`Room created: ${roomId} by ${socket.id}`);
      socket.emit("room-created", roomId);
    });

    socket.on("join-room",() => {
        
    })
  });
};
