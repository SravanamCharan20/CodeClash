import { API_BASE_URL } from "./config";
import {
  ArenaPayload,
  Difficulty,
  LeaderboardEntry,
  SubmissionJobStatusPayload,
  SubmissionQueuedPayload,
  SubmissionListPayload,
  TimerPayload,
  Verdict,
} from "./types";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const qp = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    qp.set(key, String(value));
  });

  const str = qp.toString();
  return str ? `?${str}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(json.message || `Request failed (${response.status})`, response.status);
  }

  return json as T;
}

export async function createArena(payload: {
  roomName: string;
  difficulty: Difficulty;
  durationMinutes: number;
  admin: { userId: string; name: string };
  problem: {
    title: string;
    description: string;
    constraints: string[];
    examples: string[];
    testCases: Array<{ input: string; output: string; isHidden: boolean }>;
  };
}): Promise<ArenaPayload> {
  return request<ArenaPayload>("/api/arenas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getArena(roomCode: string): Promise<ArenaPayload> {
  return request<ArenaPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}`);
}

export async function joinArena(
  roomCode: string,
  payload: { userId: string; name: string }
): Promise<ArenaPayload> {
  return request<ArenaPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function setReadyStatus(
  roomCode: string,
  payload: { userId: string; isReady: boolean }
): Promise<ArenaPayload> {
  return request<ArenaPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}/ready`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function startArena(
  roomCode: string,
  payload: { adminUserId: string }
): Promise<ArenaPayload> {
  return request<ArenaPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}/start`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getArenaTimer(roomCode: string): Promise<TimerPayload> {
  return request<TimerPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}/timer`);
}

export async function getArenaLeaderboard(roomCode: string): Promise<{
  roomCode: string;
  state: string;
  startTime: string | null;
  endTime: string | null;
  finishedAt: string | null;
  finishReason: string | null;
  remainingSeconds: number;
  leaderboard: LeaderboardEntry[];
  serverTime: string;
}> {
  return request(`/api/arenas/${normalizeRoomCode(roomCode)}/leaderboard`);
}

export async function submitSolution(
  roomCode: string,
  payload: {
    userId: string;
    language: string;
    sourceCode: string;
  }
): Promise<SubmissionQueuedPayload> {
  return request<SubmissionQueuedPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}/submissions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSubmissionJobStatus(
  roomCode: string,
  jobId: string
): Promise<SubmissionJobStatusPayload> {
  return request<SubmissionJobStatusPayload>(
    `/api/arenas/${normalizeRoomCode(roomCode)}/submissions/jobs/${jobId}`
  );
}

export async function finishArena(
  roomCode: string,
  payload: { requestedBy: string }
): Promise<ArenaPayload> {
  return request<ArenaPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}/finish`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getArenaSubmissions(
  roomCode: string,
  options?: {
    page?: number;
    limit?: number;
    userId?: string;
    verdict?: Verdict;
    includeCode?: boolean;
  }
): Promise<SubmissionListPayload> {
  const query = toQuery({
    page: options?.page,
    limit: options?.limit,
    userId: options?.userId,
    verdict: options?.verdict,
    includeCode: options?.includeCode ? "true" : undefined,
  });

  return request<SubmissionListPayload>(`/api/arenas/${normalizeRoomCode(roomCode)}/submissions${query}`);
}
