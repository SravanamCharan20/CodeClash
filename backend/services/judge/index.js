import { runtimeConfig } from "../../config/runtime.js";
import { runDockerJudge } from "./dockerJudge.js";
import { runMockJudge } from "./mockJudge.js";

export async function runJudge({ language, sourceCode, testCases }) {
  if (runtimeConfig.JUDGE_PROVIDER === "docker") {
    return runDockerJudge({
      language,
      sourceCode,
      testCases,
      timeLimitMs: runtimeConfig.JUDGE_TIME_LIMIT_MS,
      memoryLimitMb: runtimeConfig.JUDGE_MEMORY_LIMIT_MB,
    });
  }

  return runMockJudge({ language, sourceCode, testCases });
}
