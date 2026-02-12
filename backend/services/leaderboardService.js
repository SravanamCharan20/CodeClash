const LEADERBOARD_SCORE_WEIGHT = 1_000_000_000_000;
const LEADERBOARD_PENALTY_WEIGHT = 1_000_000;
const NO_ACCEPTED_AT_EPOCH_SECONDS = 9_999_999_999;

function toEpochSeconds(value) {
  if (!value) return NO_ACCEPTED_AT_EPOCH_SECONDS;
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return NO_ACCEPTED_AT_EPOCH_SECONDS;
  return Math.floor(ms / 1000);
}

function leaderboardEntryFromParticipant(participant, rank = null) {
  return {
    rank,
    userId: participant.userId,
    name: participant.name,
    role: participant.role,
    score: participant.score,
    solvedCount: participant.solvedCount,
    attempts: participant.attempts,
    penaltySeconds: participant.penaltySeconds,
    acceptedAt: participant.acceptedAt || null,
  };
}

function rankScoreForParticipant(participant) {
  return (
    participant.score * LEADERBOARD_SCORE_WEIGHT -
    participant.penaltySeconds * LEADERBOARD_PENALTY_WEIGHT -
    toEpochSeconds(participant.acceptedAt)
  );
}

function leaderboardKey(roomCode) {
  return `leaderboard:${roomCode}`;
}

function leaderboardMetaKey(roomCode) {
  return `leaderboard:${roomCode}:meta`;
}

export async function seedLeaderboard(redis, roomCode, participants) {
  const scoreKey = leaderboardKey(roomCode);
  const metaKey = leaderboardMetaKey(roomCode);

  const pipeline = redis.pipeline();
  pipeline.del(scoreKey);
  pipeline.del(metaKey);

  for (const participant of participants) {
    pipeline.zadd(scoreKey, rankScoreForParticipant(participant), participant.userId);
    pipeline.hset(metaKey, participant.userId, JSON.stringify(leaderboardEntryFromParticipant(participant)));
  }

  await pipeline.exec();
}

export async function upsertParticipantInLeaderboard(redis, roomCode, participant) {
  const scoreKey = leaderboardKey(roomCode);
  const metaKey = leaderboardMetaKey(roomCode);

  const payload = leaderboardEntryFromParticipant(participant);

  await redis
    .multi()
    .zadd(scoreKey, rankScoreForParticipant(participant), participant.userId)
    .hset(metaKey, participant.userId, JSON.stringify(payload))
    .exec();
}

function parseLeaderboardMember(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getLeaderboardFromRedis(redis, roomCode, limit = 0) {
  const scoreKey = leaderboardKey(roomCode);
  const end = limit > 0 ? limit - 1 : -1;

  const members = await redis.zrevrange(scoreKey, 0, end);
  if (members.length === 0) return [];

  const metadata = await redis.hmget(leaderboardMetaKey(roomCode), ...members);

  return members
    .map((userId, index) => {
      const parsed = parseLeaderboardMember(metadata[index]);
      if (!parsed) return null;
      return {
        ...parsed,
        rank: index + 1,
        userId,
      };
    })
    .filter(Boolean);
}

export async function getParticipantLeaderboardRow(redis, roomCode, userId) {
  const scoreKey = leaderboardKey(roomCode);
  const rank = await redis.zrevrank(scoreKey, userId);
  if (rank === null) return null;

  const metadata = await redis.hget(leaderboardMetaKey(roomCode), userId);
  const parsed = parseLeaderboardMember(metadata);
  if (!parsed) return null;

  return {
    ...parsed,
    rank: rank + 1,
    userId,
  };
}

export async function clearLeaderboard(redis, roomCode) {
  await redis.del(leaderboardKey(roomCode), leaderboardMetaKey(roomCode));
}
