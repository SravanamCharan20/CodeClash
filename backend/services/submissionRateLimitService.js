const inMemoryRateLimit = new Map();

function inMemoryKey(roomCode, userId) {
  return `${roomCode}:${userId}`;
}

export async function checkSubmissionCooldown({
  redis,
  roomCode,
  userId,
  cooldownSeconds,
}) {
  const key = `rate:submit:${roomCode}:${userId}`;

  try {
    const result = await redis.set(key, "1", "EX", cooldownSeconds, "NX");
    if (result === "OK") {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfterSeconds: Math.max(1, ttl || cooldownSeconds) };
  } catch {
    const now = Date.now();
    const memoryKey = inMemoryKey(roomCode, userId);
    const lastSeenAt = inMemoryRateLimit.get(memoryKey) || 0;

    if (now - lastSeenAt < cooldownSeconds * 1000) {
      const retryAfterSeconds = Math.ceil((cooldownSeconds * 1000 - (now - lastSeenAt)) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    inMemoryRateLimit.set(memoryKey, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
