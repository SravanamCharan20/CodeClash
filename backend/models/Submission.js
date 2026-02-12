import mongoose from "mongoose";

export const SUBMISSION_VERDICTS = Object.freeze({
  ACCEPTED: "ACCEPTED",
  WRONG_ANSWER: "WRONG_ANSWER",
  TIME_LIMIT_EXCEEDED: "TIME_LIMIT_EXCEEDED",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  COMPILATION_ERROR: "COMPILATION_ERROR",
});

const submissionSchema = new mongoose.Schema(
  {
    arenaId: { type: mongoose.Schema.Types.ObjectId, ref: "Arena", required: true, index: true },
    roomCode: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    participantName: { type: String, required: true },
    language: { type: String, required: true, trim: true },
    sourceCode: { type: String, required: true },
    verdict: {
      type: String,
      enum: Object.values(SUBMISSION_VERDICTS),
      required: true,
    },
    passedCount: { type: Number, required: true, min: 0 },
    totalCount: { type: Number, required: true, min: 0 },
    executionMs: { type: Number, required: true, min: 0 },
    scoreAwarded: { type: Number, default: 0 },
    penaltySecondsAdded: { type: Number, default: 0 },
    judgeMode: { type: String, default: "MOCK_V1" },
  },
  { timestamps: true }
);

submissionSchema.index({ roomCode: 1, createdAt: -1 });
submissionSchema.index({ roomCode: 1, userId: 1, createdAt: -1 });

export const Submission = mongoose.model("Submission", submissionSchema);
