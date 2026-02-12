import { SUBMISSION_VERDICTS } from "../models/Submission.js";

export const ACCEPTED_SCORE = 100;
export const WRONG_SUBMISSION_PENALTY_SECONDS = 10 * 60;

export function applySubmissionScoring({ arena, participant, verdict, now = new Date() }) {
  participant.attempts += 1;

  let scoreAwarded = 0;
  let penaltySecondsAdded = 0;

  if (verdict === SUBMISSION_VERDICTS.ACCEPTED) {
    if (participant.solvedCount === 0) {
      const elapsedSeconds = arena.startTime
        ? Math.max(0, Math.floor((now.getTime() - new Date(arena.startTime).getTime()) / 1000))
        : 0;

      scoreAwarded = ACCEPTED_SCORE;
      penaltySecondsAdded = elapsedSeconds;

      participant.score += scoreAwarded;
      participant.solvedCount = 1;
      participant.penaltySeconds += penaltySecondsAdded;
      participant.acceptedAt = now;
    }
  } else {
    penaltySecondsAdded = WRONG_SUBMISSION_PENALTY_SECONDS;
    participant.penaltySeconds += penaltySecondsAdded;
  }

  return {
    scoreAwarded,
    penaltySecondsAdded,
    attempts: participant.attempts,
    score: participant.score,
    solvedCount: participant.solvedCount,
    penaltySeconds: participant.penaltySeconds,
    acceptedAt: participant.acceptedAt,
  };
}

export function allNonAdminSolved(arena) {
  const targetParticipants = arena.participants.filter((participant) => participant.role !== "ADMIN");
  const evaluationPool = targetParticipants.length > 0 ? targetParticipants : arena.participants;
  return evaluationPool.every((participant) => participant.solvedCount > 0);
}
