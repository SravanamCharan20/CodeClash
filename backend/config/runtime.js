import dotenv from "dotenv";

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toBool(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

export const runtimeConfig = {
  PORT: toInt(process.env.PORT, 7777),
  CLIENT_URL: process.env.CLIENT_URL || "*",
  MONGO_URL: process.env.MONGO_URL || "",
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  SOCKET_REDIS_ADAPTER_ENABLED: toBool(process.env.SOCKET_REDIS_ADAPTER_ENABLED, true),
  ARENA_SWEEP_INTERVAL_MS: toInt(process.env.ARENA_SWEEP_INTERVAL_MS, 10000),
  LEADERBOARD_BROADCAST_INTERVAL_MS: toInt(process.env.LEADERBOARD_BROADCAST_INTERVAL_MS, 1500),
  SUBMISSION_COOLDOWN_SECONDS: toInt(process.env.SUBMISSION_COOLDOWN_SECONDS, 5),
  SUBMISSION_QUEUE_REMOVE_ON_COMPLETE: toInt(process.env.SUBMISSION_QUEUE_REMOVE_ON_COMPLETE, 5000),
  SUBMISSION_QUEUE_REMOVE_ON_FAIL: toInt(process.env.SUBMISSION_QUEUE_REMOVE_ON_FAIL, 5000),
  SUBMISSION_WORKER_CONCURRENCY: toInt(process.env.SUBMISSION_WORKER_CONCURRENCY, 4),
  JUDGE_PROVIDER: (process.env.JUDGE_PROVIDER || "mock").trim().toLowerCase(),
  JUDGE_TIME_LIMIT_MS: toInt(process.env.JUDGE_TIME_LIMIT_MS, 2000),
  JUDGE_MEMORY_LIMIT_MB: toInt(process.env.JUDGE_MEMORY_LIMIT_MB, 256),
};
