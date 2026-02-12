import { Role } from "./types";

const SESSION_STORAGE_KEY = "codearena.room-sessions.v1";

export interface RoomSession {
  roomCode: string;
  userId: string;
  name: string;
  role: Role;
  createdAt: string;
}

type SessionStore = {
  byRoomCode: Record<string, RoomSession>;
  lastRoomCode: string | null;
};

function emptyStore(): SessionStore {
  return { byRoomCode: {}, lastRoomCode: null };
}

function readStore(): SessionStore {
  if (typeof window === "undefined") return emptyStore();

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return emptyStore();

  try {
    const parsed = JSON.parse(raw) as SessionStore;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      byRoomCode: parsed.byRoomCode || {},
      lastRoomCode: parsed.lastRoomCode || null,
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: SessionStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store));
}

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function generateUserId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `u_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function saveRoomSession(session: Omit<RoomSession, "createdAt">): RoomSession {
  const normalizedRoomCode = normalizeRoomCode(session.roomCode);
  const record: RoomSession = {
    ...session,
    roomCode: normalizedRoomCode,
    createdAt: new Date().toISOString(),
  };

  const store = readStore();
  store.byRoomCode[normalizedRoomCode] = record;
  store.lastRoomCode = normalizedRoomCode;
  writeStore(store);

  return record;
}

export function getRoomSession(roomCode: string): RoomSession | null {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const store = readStore();
  return store.byRoomCode[normalizedRoomCode] || null;
}

export function getLastRoomSession(): RoomSession | null {
  const store = readStore();
  if (!store.lastRoomCode) return null;
  return store.byRoomCode[store.lastRoomCode] || null;
}

export function clearRoomSession(roomCode: string): void {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const store = readStore();
  delete store.byRoomCode[normalizedRoomCode];
  if (store.lastRoomCode === normalizedRoomCode) {
    store.lastRoomCode = null;
  }
  writeStore(store);
}
