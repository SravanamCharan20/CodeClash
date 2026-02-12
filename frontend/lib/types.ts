export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type RoomState = "LOBBY" | "LIVE" | "FINISHED";
export type Role = "ADMIN" | "PLAYER";

export type Verdict =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILATION_ERROR";

export interface Participant {
  userId: string;
  name: string;
  role: Role;
  isReady: boolean;
  attempts: number;
  score: number;
  solvedCount: number;
  penaltySeconds: number;
  acceptedAt: string | null;
}

export interface ArenaProblem {
  title: string;
  description: string;
  constraints: string[];
  examples: string[];
  testCases: Array<{
    input: string;
    isHidden: false;
  }>;
  hiddenTestCount: number;
}

export interface Arena {
  id: string;
  roomCode: string;
  name: string;
  difficulty: Difficulty;
  durationMinutes: number;
  state: RoomState;
  createdBy: string;
  startTime: string | null;
  endTime: string | null;
  finishedAt: string | null;
  finishReason: "TIME_UP" | "ADMIN_FINISHED" | "SYSTEM_FINISHED" | null;
  participants: Participant[];
  problem: ArenaProblem;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  role: Role;
  score: number;
  solvedCount: number;
  attempts: number;
  penaltySeconds: number;
  acceptedAt: string | null;
}

export interface ArenaPayload {
  arena: Arena;
  leaderboard?: LeaderboardEntry[];
  message?: string;
}

export interface TimerPayload {
  roomCode: string;
  state: RoomState;
  startTime: string | null;
  endTime: string | null;
  finishedAt: string | null;
  finishReason: "TIME_UP" | "ADMIN_FINISHED" | "SYSTEM_FINISHED" | null;
  remainingSeconds: number;
  serverTime: string;
}

export interface SubmissionRecord {
  id: string;
  roomCode: string;
  userId: string;
  participantName: string;
  language: string;
  verdict: Verdict;
  passedCount: number;
  totalCount: number;
  executionMs: number;
  scoreAwarded: number;
  penaltySecondsAdded: number;
  judgeMode: string;
  createdAt: string;
  sourceCode: string | null;
}

export interface SubmissionListPayload {
  roomCode: string;
  state: RoomState;
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: {
    userId: string | null;
    verdict: Verdict | null;
    includeCode: boolean;
  };
  submissions: SubmissionRecord[];
}

export interface SubmitPayload {
  submission: {
    id: string;
    verdict: Verdict;
    passedCount: number;
    totalCount: number;
    executionMs: number;
    scoreAwarded: number;
    penaltySecondsAdded: number;
    createdAt: string;
  };
  arena: Arena;
  leaderboard: LeaderboardEntry[];
}
