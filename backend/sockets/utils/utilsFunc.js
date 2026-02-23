import jwt from "jsonwebtoken";

export const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_ID_LENGTH = 7;
export const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
export const MAX_MEMBERS_PER_ROOM = 20;
export const MAX_ABUSE_STRIKES = 6;
export const MAX_PROBLEMS_PER_ROOM = 6;
export const MAX_CODE_LENGTH = 60000;
export const DEFAULT_ARENA_DURATION_SECONDS = 15 * 60;
export const DEFAULT_PENALTY_SECONDS = 20;

export const GLOBAL_RATE_LIMIT = { windowMs: 8000, max: 55 };
export const EVENT_RATE_LIMITS = {
  "identify-user": { windowMs: 10000, max: 8 },
  "create-room": { windowMs: 60000, max: 4 },
  "join-room": { windowMs: 20000, max: 10 },
  "get-problem-catalog": { windowMs: 10000, max: 12 },
  "set-room-problems": { windowMs: 12000, max: 8 },
  "toggle-ready": { windowMs: 6000, max: 14 },
  "start-room": { windowMs: 10000, max: 4 },
  "get-arena-state": { windowMs: 6000, max: 20 },
  "arena-code-update": { windowMs: 2000, max: 35 },
  "run-code": { windowMs: 10000, max: 10 },
  "submit-solution": { windowMs: 12000, max: 10 },
  "request-participant-code": { windowMs: 10000, max: 25 },
};

export const CLIENT_EVENTS = new Set([
  "identify-user",
  "create-room",
  "join-room",
  "get-problem-catalog",
  "set-room-problems",
  "toggle-ready",
  "start-room",
  "get-arena-state",
  "arena-code-update",
  "run-code",
  "submit-solution",
  "request-participant-code",
]);

export const SUPPORTED_LANGUAGES = ["javascript", "python"];

export const PROBLEM_CATALOG = [
  {
    id: "contains-duplicate",
    title: "Contains Duplicate",
    difficulty: "Easy",
    topics: ["array"],
    tags: ["hashset"],
    statement:
      "Given an integer array nums, return true if any value appears at least twice in the array, and return false if every element is distinct.",
    constraints: [
      "1 <= nums.length <= 100000",
      "-10^9 <= nums[i] <= 10^9",
    ],
    examples: [
      {
        input: { nums: [1, 2, 3, 1] },
        output: true,
      },
      {
        input: { nums: [1, 2, 3, 4] },
        output: false,
      },
    ],
    starterCode: {
      javascript: `function solve(input) {
  const { nums } = input;
  // Return true if duplicates exist, otherwise false.
  return false;
}

module.exports = solve;
`,
      python: `def solve(input):
    nums = input["nums"]
    # Return True if duplicates exist, otherwise False.
    return False
`,
    },
    tests: {
      visible: [
        { input: { nums: [1, 2, 3, 1] }, expected: true },
        { input: { nums: [1, 2, 3, 4] }, expected: false },
      ],
      hidden: [
        { input: { nums: [2, 14, 18, 22, 2] }, expected: true },
        { input: { nums: [9] }, expected: false },
        { input: { nums: [-1, -1] }, expected: true },
      ],
    },
  },
  {
    id: "single-number",
    title: "Single Number",
    difficulty: "Easy",
    topics: ["bit-manipulation", "array"],
    tags: ["xor"],
    statement:
      "Given a non-empty array of integers nums, every element appears twice except for one. Find that single one.",
    constraints: [
      "1 <= nums.length <= 30000",
      "-30000 <= nums[i] <= 30000",
      "Exactly one element appears once.",
    ],
    examples: [
      {
        input: { nums: [2, 2, 1] },
        output: 1,
      },
      {
        input: { nums: [4, 1, 2, 1, 2] },
        output: 4,
      },
    ],
    starterCode: {
      javascript: `function solve(input) {
  const { nums } = input;
  // Return the element that appears exactly once.
  return 0;
}

module.exports = solve;
`,
      python: `def solve(input):
    nums = input["nums"]
    # Return the element that appears exactly once.
    return 0
`,
    },
    tests: {
      visible: [
        { input: { nums: [2, 2, 1] }, expected: 1 },
        { input: { nums: [4, 1, 2, 1, 2] }, expected: 4 },
      ],
      hidden: [
        { input: { nums: [7] }, expected: 7 },
        { input: { nums: [5, 3, 5] }, expected: 3 },
      ],
    },
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "Easy",
    topics: ["stack", "string"],
    tags: ["matching"],
    statement:
      "Given a string containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
    constraints: ["1 <= s.length <= 10000", "s contains only bracket characters"],
    examples: [
      {
        input: { s: "()[]{}" },
        output: true,
      },
      {
        input: { s: "([)]" },
        output: false,
      },
    ],
    starterCode: {
      javascript: `function solve(input) {
  const { s } = input;
  // Return true if brackets are validly nested.
  return false;
}

module.exports = solve;
`,
      python: `def solve(input):
    s = input["s"]
    # Return True if brackets are validly nested.
    return False
`,
    },
    tests: {
      visible: [
        { input: { s: "()[]{}" }, expected: true },
        { input: { s: "([)]" }, expected: false },
      ],
      hidden: [
        { input: { s: "((({[]})))" }, expected: true },
        { input: { s: "((" }, expected: false },
      ],
    },
  },
  {
    id: "merge-intervals",
    title: "Merge Intervals",
    difficulty: "Medium",
    topics: ["sorting"],
    tags: ["intervals"],
    statement:
      "Given an array of intervals where intervals[i] = [start_i, end_i], merge all overlapping intervals and return an array of the non-overlapping intervals that cover all intervals in the input.",
    constraints: [
      "1 <= intervals.length <= 10000",
      "0 <= start_i <= end_i <= 10000",
    ],
    examples: [
      {
        input: { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]] },
        output: [[1, 6], [8, 10], [15, 18]],
      },
      {
        input: { intervals: [[1, 4], [4, 5]] },
        output: [[1, 5]],
      },
    ],
    starterCode: {
      javascript: `function solve(input) {
  const { intervals } = input;
  // Return merged intervals.
  return [];
}

module.exports = solve;
`,
      python: `def solve(input):
    intervals = input["intervals"]
    # Return merged intervals.
    return []
`,
    },
    tests: {
      visible: [
        {
          input: { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]] },
          expected: [[1, 6], [8, 10], [15, 18]],
        },
        { input: { intervals: [[1, 4], [4, 5]] }, expected: [[1, 5]] },
      ],
      hidden: [
        { input: { intervals: [[1, 4], [0, 2], [3, 5]] }, expected: [[0, 5]] },
        { input: { intervals: [[2, 3], [4, 5]] }, expected: [[2, 3], [4, 5]] },
      ],
    },
  },
  {
    id: "number-of-islands",
    title: "Number of Islands",
    difficulty: "Medium",
    topics: ["graph"],
    tags: ["dfs", "bfs", "matrix"],
    statement:
      "Given an m x n 2D binary grid grid where '1' represents land and '0' represents water, return the number of islands.",
    constraints: ["1 <= m, n <= 200", "grid[i][j] is '0' or '1'"],
    examples: [
      {
        input: {
          grid: [
            ["1", "1", "1", "1", "0"],
            ["1", "1", "0", "1", "0"],
            ["1", "1", "0", "0", "0"],
            ["0", "0", "0", "0", "0"],
          ],
        },
        output: 1,
      },
      {
        input: {
          grid: [
            ["1", "1", "0", "0", "0"],
            ["1", "1", "0", "0", "0"],
            ["0", "0", "1", "0", "0"],
            ["0", "0", "0", "1", "1"],
          ],
        },
        output: 3,
      },
    ],
    starterCode: {
      javascript: `function solve(input) {
  const { grid } = input;
  // Return the number of islands.
  return 0;
}

module.exports = solve;
`,
      python: `def solve(input):
    grid = input["grid"]
    # Return the number of islands.
    return 0
`,
    },
    tests: {
      visible: [
        {
          input: {
            grid: [
              ["1", "1", "1", "1", "0"],
              ["1", "1", "0", "1", "0"],
              ["1", "1", "0", "0", "0"],
              ["0", "0", "0", "0", "0"],
            ],
          },
          expected: 1,
        },
        {
          input: {
            grid: [
              ["1", "1", "0", "0", "0"],
              ["1", "1", "0", "0", "0"],
              ["0", "0", "1", "0", "0"],
              ["0", "0", "0", "1", "1"],
            ],
          },
          expected: 3,
        },
      ],
      hidden: [
        {
          input: {
            grid: [
              ["1", "0", "1"],
              ["0", "1", "0"],
              ["1", "0", "1"],
            ],
          },
          expected: 5,
        },
      ],
    },
  },
  {
    id: "coin-change",
    title: "Coin Change",
    difficulty: "Medium",
    topics: ["dynamic-programming"],
    tags: ["unbounded-knapsack"],
    statement:
      "You are given an integer array coins representing coins of different denominations and an integer amount. Return the fewest number of coins needed to make up that amount. If impossible, return -1.",
    constraints: [
      "1 <= coins.length <= 12",
      "1 <= coins[i] <= 2^31 - 1",
      "0 <= amount <= 10000",
    ],
    examples: [
      {
        input: { coins: [1, 2, 5], amount: 11 },
        output: 3,
      },
      {
        input: { coins: [2], amount: 3 },
        output: -1,
      },
    ],
    starterCode: {
      javascript: `function solve(input) {
  const { coins, amount } = input;
  // Return minimum coins needed, or -1 if not possible.
  return -1;
}

module.exports = solve;
`,
      python: `def solve(input):
    coins = input["coins"]
    amount = input["amount"]
    # Return minimum coins needed, or -1 if not possible.
    return -1
`,
    },
    tests: {
      visible: [
        { input: { coins: [1, 2, 5], amount: 11 }, expected: 3 },
        { input: { coins: [2], amount: 3 }, expected: -1 },
      ],
      hidden: [
        { input: { coins: [1], amount: 0 }, expected: 0 },
        { input: { coins: [1, 3, 4], amount: 6 }, expected: 2 },
      ],
    },
  },
  {
    id: "kth-largest-element",
    title: "Kth Largest Element in an Array",
    difficulty: "Medium",
    topics: ["heap", "sorting"],
    tags: ["priority-queue"],
    statement:
      "Given an integer array nums and an integer k, return the k-th largest element in the array.",
    constraints: ["1 <= k <= nums.length <= 100000", "-10^4 <= nums[i] <= 10^4"],
    examples: [
      {
        input: { nums: [3, 2, 1, 5, 6, 4], k: 2 },
        output: 5,
      },
      {
        input: { nums: [3, 2, 3, 1, 2, 4, 5, 5, 6], k: 4 },
        output: 4,
      },
    ],
    starterCode: {
      javascript: `function solve(input) {
  const { nums, k } = input;
  // Return the k-th largest value.
  return 0;
}

module.exports = solve;
`,
      python: `def solve(input):
    nums = input["nums"]
    k = input["k"]
    # Return the k-th largest value.
    return 0
`,
    },
    tests: {
      visible: [
        { input: { nums: [3, 2, 1, 5, 6, 4], k: 2 }, expected: 5 },
        {
          input: { nums: [3, 2, 3, 1, 2, 4, 5, 5, 6], k: 4 },
          expected: 4,
        },
      ],
      hidden: [
        { input: { nums: [7, 6, 5, 4, 3, 2, 1], k: 7 }, expected: 1 },
        { input: { nums: [5, 5, 5], k: 2 }, expected: 5 },
      ],
    },
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

const sanitizeSearch = (value, maxLength = 64) =>
  normalizeFilterToken(String(value || "")).slice(0, maxLength);

const toPublicExample = (example) => ({
  input: example.input,
  output: example.output,
});

export const toPublicProblem = (problem) => ({
  id: problem.id,
  title: problem.title,
  difficulty: problem.difficulty,
  topics: [...problem.topics],
  tags: [...problem.tags],
  statement: problem.statement,
  constraints: Array.isArray(problem.constraints)
    ? [...problem.constraints]
    : [],
  examples: Array.isArray(problem.examples)
    ? problem.examples.map(toPublicExample)
    : [],
  starterCode: { ...(problem.starterCode || {}) },
});

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

export const getFilteredProblemCatalog = (filters = {}) => {
  const selectedTopics = sanitizeFilterList(filters.topics);
  const selectedTags = sanitizeFilterList(filters.tags);
  const selectedDifficulties = sanitizeFilterList(filters.difficulties);
  const search = sanitizeSearch(filters.search);

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
      const haystack = [
        problem.title,
        problem.statement,
        ...problem.topics,
        ...problem.tags,
      ]
        .join(" ")
        .toLowerCase();
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
    durationSeconds:
      Number.isFinite(problemSet.durationSeconds) && problemSet.durationSeconds > 0
        ? problemSet.durationSeconds
        : DEFAULT_ARENA_DURATION_SECONDS,
    penaltySeconds:
      Number.isFinite(problemSet.penaltySeconds) && problemSet.penaltySeconds >= 0
        ? problemSet.penaltySeconds
        : DEFAULT_PENALTY_SECONDS,
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
    arenaStartedAt: room.arena?.startedAt || room.startedAt || null,
    arenaEndsAt: room.arena?.endsAt || null,
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

  // Remove empty rooms only in lobby; countdown/started/finished states are rejoin-safe.
  if (room.members.size === 0 && room.status === "lobby") {
    rooms.delete(roomId);
    console.log(`Room deleted: ${roomId}`);
    return;
  }

  if (
    room.status === "started" ||
    room.status === "countdown" ||
    room.status === "finished"
  ) {
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
