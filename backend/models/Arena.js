import mongoose from "mongoose";

export const ROOM_STATES = Object.freeze({
  LOBBY: "LOBBY",
  LIVE: "LIVE",
  FINISHED: "FINISHED",
});

const participantSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["ADMIN", "PLAYER"], default: "PLAYER" },
    isReady: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    solvedCount: { type: Number, default: 0 },
    penaltySeconds: { type: Number, default: 0 },
    acceptedAt: { type: Date, default: null },
  },
  { _id: false }
);

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true },
    isHidden: { type: Boolean, default: true },
  },
  { _id: false }
);

const problemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    constraints: { type: [String], default: [] },
    examples: { type: [String], default: [] },
    testCases: { type: [testCaseSchema], default: [] },
  },
  { _id: false }
);

const arenaSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ["EASY", "MEDIUM", "HARD"], required: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 300 },
    state: { type: String, enum: Object.values(ROOM_STATES), default: ROOM_STATES.LOBBY },
    participants: { type: [participantSchema], default: [] },
    createdBy: { type: String, required: true },
    problem: { type: problemSchema, required: true },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    finishReason: {
      type: String,
      enum: ["TIME_UP", "ADMIN_FINISHED", "SYSTEM_FINISHED"],
      default: null,
    },
  },
  { timestamps: true }
);

export const Arena = mongoose.model("Arena", arenaSchema);
