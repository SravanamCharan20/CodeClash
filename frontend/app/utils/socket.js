import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8888";

export const socket = io(SOCKET_URL, {
  withCredentials: true,
  autoConnect: false,
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 8,
  reconnectionDelay: 700,
  reconnectionDelayMax: 3000,
  transports: ["websocket", "polling"],
});
