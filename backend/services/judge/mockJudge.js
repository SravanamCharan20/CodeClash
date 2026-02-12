import { SUBMISSION_VERDICTS } from "../../models/Submission.js";

export async function runMockJudge({ sourceCode, testCases }) {
  const trimmed = sourceCode.trim();
  const lower = trimmed.toLowerCase();
  const totalCount = testCases.length;
  const executionMs = 25 + (trimmed.length % 200);

  if (lower.includes("syntaxerror") || lower.includes("compilationerror")) {
    return {
      verdict: SUBMISSION_VERDICTS.COMPILATION_ERROR,
      passedCount: 0,
      totalCount,
      executionMs,
      judgeMode: "MOCK_V2",
      stderr: "Compilation failed",
    };
  }

  if (lower.includes("while(true)") || lower.includes("for(;;)")) {
    return {
      verdict: SUBMISSION_VERDICTS.TIME_LIMIT_EXCEEDED,
      passedCount: 0,
      totalCount,
      executionMs: executionMs + 1200,
      judgeMode: "MOCK_V2",
      stderr: "Process exceeded CPU time limit",
    };
  }

  if (
    lower.includes("new array(100000000)") ||
    lower.includes("malloc(1000000000)") ||
    lower.includes("[0]*100000000")
  ) {
    return {
      verdict: SUBMISSION_VERDICTS.MEMORY_LIMIT_EXCEEDED,
      passedCount: 0,
      totalCount,
      executionMs,
      judgeMode: "MOCK_V2",
      stderr: "Process exceeded memory limit",
    };
  }

  if (lower.includes("throw new error") || lower.includes("zero division")) {
    return {
      verdict: SUBMISSION_VERDICTS.RUNTIME_ERROR,
      passedCount: 0,
      totalCount,
      executionMs,
      judgeMode: "MOCK_V2",
      stderr: "Runtime error detected",
    };
  }

  if (trimmed.length < 30 || (!lower.includes("return") && !lower.includes("print("))) {
    return {
      verdict: SUBMISSION_VERDICTS.WRONG_ANSWER,
      passedCount: totalCount > 2 ? 1 : 0,
      totalCount,
      executionMs,
      judgeMode: "MOCK_V2",
      stderr: "Output mismatch",
    };
  }

  return {
    verdict: SUBMISSION_VERDICTS.ACCEPTED,
    passedCount: totalCount,
    totalCount,
    executionMs,
    judgeMode: "MOCK_V2",
    stderr: "",
  };
}
