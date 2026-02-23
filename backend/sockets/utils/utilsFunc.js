import jwt from "jsonwebtoken";

export const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_ID_LENGTH = 7;
export const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
export const MAX_MEMBERS_PER_ROOM = 20;
export const MAX_ABUSE_STRIKES = 6;
export const MAX_PROBLEMS_PER_ROOM = 5;

export const GLOBAL_RATE_LIMIT = { windowMs: 8000, max: 45 };
export const EVENT_RATE_LIMITS = {
  "identify-user": { windowMs: 10000, max: 8 },
  "create-room": { windowMs: 60000, max: 4 },
  "join-room": { windowMs: 20000, max: 8 },
  "get-problem-catalog": { windowMs: 10000, max: 10 },
  "set-room-problems": { windowMs: 12000, max: 6 },
  "toggle-ready": { windowMs: 6000, max: 12 },
  "start-room": { windowMs: 10000, max: 4 },
};

export const CLIENT_EVENTS = new Set([
  "identify-user",
  "create-room",
  "join-room",
  "get-problem-catalog",
  "set-room-problems",
  "toggle-ready",
  "start-room",
]);

export const PROBLEM_CATALOG = [
  {
    id: "two-sum",
    title: "Two Sum",
    difficulty: "Easy",
    topics: ["array"],
    tags: ["hashmap", "lookup"],
  },
  {
    id: "contains-duplicate",
    title: "Contains Duplicate",
    difficulty: "Easy",
    topics: ["array"],
    tags: ["hashset"],
  },
  {
    id: "merge-intervals",
    title: "Merge Intervals",
    difficulty: "Medium",
    topics: ["sorting"],
    tags: ["intervals"],
  },
  {
    id: "sort-colors",
    title: "Sort Colors",
    difficulty: "Medium",
    topics: ["sorting", "array"],
    tags: ["two-pointers", "counting"],
  },
  {
    id: "single-number",
    title: "Single Number",
    difficulty: "Easy",
    topics: ["bit-manipulation"],
    tags: ["xor"],
  },
  {
    id: "counting-bits",
    title: "Counting Bits",
    difficulty: "Medium",
    topics: ["bit-manipulation", "dynamic-programming"],
    tags: ["bitmask"],
  },
  {
    id: "longest-substring-without-repeat",
    title: "Longest Substring Without Repeating Characters",
    difficulty: "Medium",
    topics: ["string"],
    tags: ["sliding-window", "hashmap"],
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "Easy",
    topics: ["stack"],
    tags: ["string"],
  },
  {
    id: "number-of-islands",
    title: "Number of Islands",
    difficulty: "Medium",
    topics: ["graph"],
    tags: ["dfs", "bfs", "matrix"],
  },
  {
    id: "course-schedule",
    title: "Course Schedule",
    difficulty: "Medium",
    topics: ["graph"],
    tags: ["topological-sort"],
  },
  {
    id: "kth-largest-element-in-an-array",
    title: "Kth Largest Element in an Array",
    difficulty: "Medium",
    topics: ["heap", "sorting"],
    tags: ["priority-queue"],
  },
  {
    id: "binary-tree-level-order-traversal",
    title: "Binary Tree Level Order Traversal",
    difficulty: "Medium",
    topics: ["tree"],
    tags: ["bfs"],
  },
  {
    id: "coin-change",
    title: "Coin Change",
    difficulty: "Medium",
    topics: ["dynamic-programming"],
    tags: ["unbounded-knapsack"],
  },
];

export const PROBLEM_MAP = new Map(
  PROBLEM_CATALOG.map((problem) => [problem.id, problem])
);

const normalizeFilterToken = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const sanitizeFilterList = (value, maxItems = 20) => {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const raw of value) {
    const token = normalizeFilterToken(raw);
    if (!token) continue;
    unique.add(token);
    if (unique.size >= maxItems) break;
  }
  return Array.from(unique);
};

export const getProblemCatalogFacets = () => {
  const topicSet = new Set();
  const tagSet = new Set();
  const difficultySet = new Set();

  for (const problem of PROBLEM_CATALOG) {
    for (const topic of problem.topics) topicSet.add(topic);
    for (const tag of problem.tags) tagSet.add(tag);
    difficultySet.add(problem.difficulty);
  }

  return {
    topics: Array.from(topicSet).sort(),
    tags: Array.from(tagSet).sort(),
    difficulties: Array.from(difficultySet).sort(),
  };
};

export const toPublicProblem = (problem) => ({
  id: problem.id,
  title: problem.title,
  difficulty: problem.difficulty,
  topics: [...problem.topics],
  tags: [...problem.tags],
});

export const getFilteredProblemCatalog = (filters = {}) => {
  const selectedTopics = sanitizeFilterList(filters.topics);
  const selectedTags = sanitizeFilterList(filters.tags);
  const selectedDifficulties = sanitizeFilterList(filters.difficulties);
  const search = normalizeFilterToken(filters.search);

  return PROBLEM_CATALOG.filter((problem) => {
    if (
      selectedTopics.length > 0 &&
      !selectedTopics.some((topic) => problem.topics.includes(topic))
    ) {
      return false;
    }

    if (
      selectedTags.length > 0 &&
      !selectedTags.some((tag) => problem.tags.includes(tag))
    ) {
      return false;
    }

    if (
      selectedDifficulties.length > 0 &&
      !selectedDifficulties.includes(problem.difficulty.toLowerCase())
    ) {
      return false;
    }

    if (search.length > 0) {
      const haystack = `${problem.title} ${problem.topics.join(" ")} ${problem.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  }).map(toPublicProblem);
};

export const normalizeProblemIds = (value, maxItems = MAX_PROBLEMS_PER_ROOM) => {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const raw of value) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    unique.add(id);
    if (unique.size >= maxItems) break;
  }
  return Array.from(unique);
};

export const toPublicProblemSet = (problemSet) => {
  if (!problemSet || !Array.isArray(problemSet.problems)) {
    return null;
  }

  return {
    problemIds: Array.isArray(problemSet.problemIds)
      ? [...problemSet.problemIds]
      : [],
    problems: problemSet.problems.map(toPublicProblem),
    configuredBy: problemSet.configuredBy || null,
    configuredAt: problemSet.configuredAt || null,
  };
};

export const normalizeRoomId = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

export const extractRoomId = (payload) => {
  if (typeof payload === "string") return normalizeRoomId(payload);
  if (payload && typeof payload === "object") {
    return normalizeRoomId(payload.roomId);
  }
  return "";
};

export const parseCookieHeader = (cookieHeader = "") => {
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) return {};

  const cookies = {};
  for (const entry of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = entry.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    const rawValue = rawValueParts.join("=").trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return cookies;
};

export const generateRoomId = (length = ROOM_ID_LENGTH) => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
  }
  return result;
};

export const createUniqueRoomId = (rooms) => {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId));
  return roomId;
};

export const toPublicMember = ({ userId, username, role, ready }) => ({
  userId,
  username,
  role,
  ready: Boolean(ready),
});

export const buildLobbyState = (
  rooms,
  roomId,
  maxMembers = MAX_MEMBERS_PER_ROOM
) => {
  const room = rooms.get(roomId);
  if (!room) return null;

  const members = Array.from(room.members.values()).map(toPublicMember);
  const hasAdmin = members.some((member) => member.role === "admin");
  const allReady =
    members.length > 0 && members.every((member) => member.ready === true);
  const problemSet = toPublicProblemSet(room.problemSet);
  const hasProblemSet = Boolean(problemSet && problemSet.problemIds.length > 0);

  return {
    roomId,
    status: room.status,
    members,
    memberCount: members.length,
    maxMembers,
    allReady,
    hasProblemSet,
    problemSet,
    canStart: room.status === "lobby" && hasAdmin && allReady && hasProblemSet,
  };
};

export const emitLobbyUpdate = (
  io,
  rooms,
  roomId,
  maxMembers = MAX_MEMBERS_PER_ROOM
) => {
  const lobbyState = buildLobbyState(rooms, roomId, maxMembers);
  if (!lobbyState) return;
  io.to(roomId).emit("lobby-update", lobbyState);
};

export const ensureRateState = (socket) => {
  if (!socket.data.rateState) {
    socket.data.rateState = {
      global: [],
      byEvent: new Map(),
      strikes: 0,
    };
  }

  return socket.data.rateState;
};

export const hasExceededLimit = (timestamps, { windowMs, max }, now) => {
  while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= max) {
    return true;
  }

  timestamps.push(now);
  return false;
};

export const registerAbuse = (
  socket,
  emitSocketError,
  message,
  maxAbuseStrikes = MAX_ABUSE_STRIKES
) => {
  const rateState = ensureRateState(socket);
  rateState.strikes += 1;
  emitSocketError(message);

  if (rateState.strikes >= maxAbuseStrikes) {
    emitSocketError("Too many abusive requests. Connection closed.");
    socket.disconnect(true);
  }
};

export const checkRateLimit = (
  socket,
  eventName,
  emitSocketError,
  globalRateLimit = GLOBAL_RATE_LIMIT,
  eventRateLimits = EVENT_RATE_LIMITS,
  maxAbuseStrikes = MAX_ABUSE_STRIKES
) => {
  const now = Date.now();
  const rateState = ensureRateState(socket);

  if (hasExceededLimit(rateState.global, globalRateLimit, now)) {
    registerAbuse(
      socket,
      emitSocketError,
      "Too many requests. Slow down.",
      maxAbuseStrikes
    );
    return false;
  }

  const eventLimit = eventRateLimits[eventName];
  if (!eventLimit) return true;

  if (!rateState.byEvent.has(eventName)) {
    rateState.byEvent.set(eventName, []);
  }

  const eventTimestamps = rateState.byEvent.get(eventName);
  if (hasExceededLimit(eventTimestamps, eventLimit, now)) {
    registerAbuse(
      socket,
      emitSocketError,
      `Too many ${eventName} attempts. Please wait and try again.`,
      maxAbuseStrikes
    );
    return false;
  }

  return true;
};

export const removeSocketFromRoom = (
  io,
  rooms,
  socket,
  roomIdInput = socket.data.roomId,
  maxMembers = MAX_MEMBERS_PER_ROOM
) => {
  const roomId = normalizeRoomId(roomIdInput);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) {
    if (socket.data.roomId === roomId) {
      socket.data.roomId = undefined;
    }
    return;
  }

  const user = room.members.get(socket.id);
  if (!user) {
    if (socket.data.roomId === roomId) {
      socket.data.roomId = undefined;
    }
    return;
  }

  room.members.delete(socket.id);
  socket.leave(roomId);
  socket.data.roomId = undefined;
  console.log(`${user.username} left room ${roomId}`);

  // Remove empty rooms only in lobby; countdown/started states should be rejoin-safe.
  if (room.members.size === 0 && room.status === "lobby") {
    rooms.delete(roomId);
    console.log(`Room deleted: ${roomId}`);
    return;
  }

  if (room.status === "started" || room.status === "countdown") {
    room.abandonedAt = room.members.size === 0 ? Date.now() : null;
  }

  emitLobbyUpdate(io, rooms, roomId, maxMembers);
};

export const resolveUserFromSocket = async (socket, UserModel) => {
  const cookies = parseCookieHeader(socket.handshake?.headers?.cookie);
  const token = cookies.token;

  if (!token || !process.env.JWT_SECRET) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await UserModel.findById(decoded._id).select("_id username role");
  if (!user) return null;

  return {
    userId: String(user._id),
    username: user.username,
    role: user.role,
  };
};
