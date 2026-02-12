import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SUBMISSION_VERDICTS } from "../../models/Submission.js";

const LANGUAGE_CONFIG = {
  javascript: {
    image: "node:20-alpine",
    fileName: "Main.js",
    command: () => "node /workspace/Main.js",
  },
  python: {
    image: "python:3.11-alpine",
    fileName: "main.py",
    command: () => "python /workspace/main.py",
  },
  cpp: {
    image: "gcc:13",
    fileName: "Main.cpp",
    command: () => "g++ -O2 /workspace/Main.cpp -o /workspace/main && /workspace/main",
  },
  java: {
    image: "eclipse-temurin:17-jdk",
    fileName: "Main.java",
    command: () => "javac /workspace/Main.java && java -cp /workspace Main",
  },
};

function runDockerCommand({ args, input, timeoutMs }) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    execFile(
      "docker",
      args,
      {
        input,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const executionMs = Date.now() - startedAt;

        resolve({
          error,
          stdout: (stdout || "").trim(),
          stderr: (stderr || "").trim(),
          executionMs,
        });
      }
    );
  });
}

function isMemoryLimitError(result) {
  if (!result.error) return false;

  const stderr = (result.stderr || "").toLowerCase();
  return (
    stderr.includes("cannot allocate memory") ||
    stderr.includes("out of memory") ||
    result.error.code === 137 ||
    result.error.signal === "SIGKILL"
  );
}

function isTimeLimitError(result) {
  if (!result.error) return false;
  return Boolean(result.error.killed) || Boolean(result.error.signal === "SIGTERM");
}

function isCompilationFailure(language, stderr) {
  const text = (stderr || "").toLowerCase();

  if (text.includes("syntaxerror")) return true;
  if (language === "cpp" || language === "java") {
    return text.includes("error:") || text.includes("compilation failed");
  }

  return false;
}

export async function runDockerJudge({
  language,
  sourceCode,
  testCases,
  timeLimitMs,
  memoryLimitMb,
}) {
  const lang = LANGUAGE_CONFIG[language];

  if (!lang) {
    return {
      verdict: SUBMISSION_VERDICTS.COMPILATION_ERROR,
      passedCount: 0,
      totalCount: testCases.length,
      executionMs: 0,
      judgeMode: "DOCKER_V1",
      stderr: `Unsupported language: ${language}`,
    };
  }

  const workspace = await mkdtemp(path.join(os.tmpdir(), "codearena-judge-"));
  const sourcePath = path.join(workspace, lang.fileName);

  try {
    await writeFile(sourcePath, sourceCode, "utf8");

    let passedCount = 0;
    let totalExecutionMs = 0;

    for (const testCase of testCases) {
      const args = [
        "run",
        "--rm",
        "--network",
        "none",
        "--cpus",
        "1",
        "--memory",
        `${memoryLimitMb}m`,
        "-i",
        "-v",
        `${workspace}:/workspace`,
        lang.image,
        "sh",
        "-lc",
        lang.command(),
      ];

      const result = await runDockerCommand({
        args,
        input: (testCase.input || "") + "\n",
        timeoutMs: timeLimitMs,
      });

      totalExecutionMs += result.executionMs;

      if (isTimeLimitError(result)) {
        return {
          verdict: SUBMISSION_VERDICTS.TIME_LIMIT_EXCEEDED,
          passedCount,
          totalCount: testCases.length,
          executionMs: totalExecutionMs,
          judgeMode: "DOCKER_V1",
          stderr: result.stderr || "Process exceeded CPU time limit",
        };
      }

      if (isMemoryLimitError(result)) {
        return {
          verdict: SUBMISSION_VERDICTS.MEMORY_LIMIT_EXCEEDED,
          passedCount,
          totalCount: testCases.length,
          executionMs: totalExecutionMs,
          judgeMode: "DOCKER_V1",
          stderr: result.stderr || "Process exceeded memory limit",
        };
      }

      if (result.error) {
        if (isCompilationFailure(language, result.stderr)) {
          return {
            verdict: SUBMISSION_VERDICTS.COMPILATION_ERROR,
            passedCount,
            totalCount: testCases.length,
            executionMs: totalExecutionMs,
            judgeMode: "DOCKER_V1",
            stderr: result.stderr || "Compilation failed",
          };
        }

        return {
          verdict: SUBMISSION_VERDICTS.RUNTIME_ERROR,
          passedCount,
          totalCount: testCases.length,
          executionMs: totalExecutionMs,
          judgeMode: "DOCKER_V1",
          stderr: result.stderr || "Runtime error",
        };
      }

      const expected = (testCase.output || "").trim();
      if (result.stdout !== expected) {
        return {
          verdict: SUBMISSION_VERDICTS.WRONG_ANSWER,
          passedCount,
          totalCount: testCases.length,
          executionMs: totalExecutionMs,
          judgeMode: "DOCKER_V1",
          stderr: `Expected '${expected}' but got '${result.stdout}'`,
        };
      }

      passedCount += 1;
    }

    return {
      verdict: SUBMISSION_VERDICTS.ACCEPTED,
      passedCount,
      totalCount: testCases.length,
      executionMs: totalExecutionMs,
      judgeMode: "DOCKER_V1",
      stderr: "",
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
