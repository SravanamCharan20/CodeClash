import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { connectDB } from "./config/db.js";
import { createRedisClient } from "./config/redis.js";
import { runtimeConfig } from "./config/runtime.js";
import arenaRoutes from "./routes/arenaRoutes.js";
import { submissionQueueEvents } from "./queues/submissionQueue.js";
import { getLeaderboardFromRedis } from "./services/leaderboardService.js";
import { sweepExpiredArenas } from "./services/arenaService.js";

const app = express();
const server = http.createServer(app);

const dirtyLeaderboardRooms = new Set();
const leaderboardRedis = createRedisClient();

app.use(cors({ origin: runtimeConfig.CLIENT_URL }));
app.use(express.json({ limit: "256kb" }));

const io = new Server(server, {
  cors: {
    origin: runtimeConfig.CLIENT_URL,
    methods: ["GET", "POST", "PATCH"],
  },
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

function parseReturnValue(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

async function emitTopLeaderboard(roomCode) {
  const topRows = await getLeaderboardFromRedis(leaderboardRedis, roomCode, 10);
  if (topRows.length === 0) return;

  io.to(roomCode).emit("arena:leaderboard-top", {
    roomCode,
    leaderboard: topRows,
  });
}

async function setupSocketRedisAdapter() {
  if (!runtimeConfig.SOCKET_REDIS_ADAPTER_ENABLED) return;

  const pubClient = createRedisClient();
  const subClient = createRedisClient();

  io.adapter(createAdapter(pubClient, subClient));

  pubClient.on("error", (error) => {
    console.error("Socket Redis pub error:", error.message);
  });

  subClient.on("error", (error) => {
    console.error("Socket Redis sub error:", error.message);
  });

  console.log("Socket.IO Redis adapter enabled");
}

function setupQueueEvents() {
  submissionQueueEvents.on("error", (error) => {
    console.error("QueueEvents error:", error.message);
  });

  submissionQueueEvents.on("completed", async ({ returnvalue }) => {
    try {
      const result = parseReturnValue(returnvalue);
      if (!result || !result.roomCode) return;

      if (result.type === "PROCESSED") {
        io.to(result.roomCode).emit("arena:submission-result", {
          roomCode: result.roomCode,
          jobId: result.jobId,
          userId: result.userId,
          verdict: result.submission.verdict,
          passedCount: result.submission.passedCount,
          totalCount: result.submission.totalCount,
          executionMs: result.submission.executionMs,
          scoreAwarded: result.submission.scoreAwarded,
          penaltySecondsAdded: result.submission.penaltySecondsAdded,
          judgeMode: result.submission.judgeMode,
          stderr: result.submission.stderr,
          serverTime: new Date().toISOString(),
        });

        if (result.leaderboardEntry) {
          io.to(result.roomCode).emit("arena:leaderboard-delta", {
            roomCode: result.roomCode,
            entry: result.leaderboardEntry,
          });
        }

        dirtyLeaderboardRooms.add(result.roomCode);

        if (result.finished) {
          io.to(result.roomCode).emit("arena:contest-finished", {
            roomCode: result.roomCode,
            state: "FINISHED",
            finishReason: result.finishReason,
            finishedAt: result.finishedAt,
            serverTime: new Date().toISOString(),
          });
        }

        return;
      }

      if (result.type === "SKIPPED") {
        io.to(result.roomCode).emit("arena:submission-skipped", {
          roomCode: result.roomCode,
          jobId: result.jobId,
          userId: result.userId,
          reason: result.reason,
          message: result.message,
        });
      }
    } catch (error) {
      console.error("Queue completed handler error:", error.message);
    }
  });

  submissionQueueEvents.on("failed", ({ jobId, failedReason }) => {
    io.emit("arena:submission-failed", {
      jobId,
      failedReason,
    });
  });

  setInterval(async () => {
    if (dirtyLeaderboardRooms.size === 0) return;

    const rooms = [...dirtyLeaderboardRooms];
    dirtyLeaderboardRooms.clear();

    for (const roomCode of rooms) {
      try {
        await emitTopLeaderboard(roomCode);
      } catch (error) {
        console.error(`Leaderboard broadcast error (${roomCode}):`, error.message);
      }
    }
  }, runtimeConfig.LEADERBOARD_BROADCAST_INTERVAL_MS);
}

connectDB()
  .then(async () => {
    console.log("connected to DB ...");

    await setupSocketRedisAdapter();
    setupQueueEvents();

    setInterval(async () => {
      try {
        const finalizedCount = await sweepExpiredArenas(io);
        if (finalizedCount > 0) {
          console.log(`Auto-finished ${finalizedCount} arena(s)`);
        }
      } catch (error) {
        console.error("Arena sweep error:", error.message);
      }
    }, runtimeConfig.ARENA_SWEEP_INTERVAL_MS);

    server.listen(runtimeConfig.PORT, () => {
      console.log(`Server is Listening at ${runtimeConfig.PORT}...`);
    });
  })
  .catch((error) => {
    console.log("Error  :", error.message);
  });
