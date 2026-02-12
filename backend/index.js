import express from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { connectDB } from "./config/db.js";
import arenaRoutes from "./routes/arenaRoutes.js";
import { sweepExpiredArenas } from "./services/arenaService.js";


dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 7777;
const ARENA_SWEEP_INTERVAL_MS = Number(process.env.ARENA_SWEEP_INTERVAL_MS || 10000);

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "*", methods: ["GET", "POST", "PATCH"] },
});

app.set("io", io);

io.on("connection", (socket) => {
  socket.on("arena:join-room", (roomCode) => {
    if (typeof roomCode === "string" && roomCode.trim()) {
      socket.join(roomCode.trim().toUpperCase());
    }
  });
});


app.use("/api/arenas", arenaRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

connectDB()
  .then(() => {
    console.log("connected to DB ...");
    setInterval(async () => {
      try {
        const finalizedCount = await sweepExpiredArenas(io);
        if (finalizedCount > 0) {
          console.log(`Auto-finished ${finalizedCount} arena(s)`);
        }
      } catch (error) {
        console.error("Arena sweep error:", error.message);
      }
    }, ARENA_SWEEP_INTERVAL_MS);

    server.listen(PORT, () => {
      console.log(`Server is Listening at ${PORT}...`);
    });
  })
  .catch((e) => {
    console.log("Error  :", e.message);
  });
