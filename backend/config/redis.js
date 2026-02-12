import Redis from "ioredis";
import { runtimeConfig } from "./runtime.js";

export function createRedisClient(options = {}) {
  const { forBull = false } = options;

  return new Redis(runtimeConfig.REDIS_URL, {
    maxRetriesPerRequest: forBull ? null : 3,
    enableReadyCheck: true,
  });
}
