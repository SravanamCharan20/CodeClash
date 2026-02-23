import { spawn } from "child_process";
import { MAX_CODE_LENGTH, SUPPORTED_LANGUAGES } from "./utilsFunc.js";

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const EXEC_TIMEOUT_MS = parsePositiveInt(
  process.env.DOCKER_EXEC_TIMEOUT_MS,
  20000
);
const COMPILE_TIMEOUT_MS = parsePositiveInt(
  process.env.DOCKER_COMPILE_TIMEOUT_MS,
  1200
);
const MAX_OUTPUT_BYTES = parsePositiveInt(
  process.env.DOCKER_MAX_OUTPUT_BYTES,
  300 * 1024
);
const MAX_TEST_CASES = parsePositiveInt(process.env.DOCKER_MAX_TEST_CASES, 40);
const MAX_LOG_CHARS = parsePositiveInt(process.env.DOCKER_MAX_LOG_CHARS, 8 * 1024);

const DOCKER_CPU_LIMIT = process.env.DOCKER_EXEC_CPUS || "0.5";
const DOCKER_MEMORY_LIMIT = process.env.DOCKER_EXEC_MEMORY || "256m";
const DOCKER_PIDS_LIMIT = parsePositiveInt(process.env.DOCKER_EXEC_PIDS, 128);

const DOCKER_IMAGE_BY_LANGUAGE = {
  javascript: process.env.DOCKER_JS_IMAGE || "node:20-alpine",
  python: process.env.DOCKER_PY_IMAGE || "python:3.12-alpine",
};
const RESULT_START_MARKER = "__CODECLASH_RESULT_START__";
const RESULT_END_MARKER = "__CODECLASH_RESULT_END__";

const JS_RUNNER = String.raw`
const fs = require("fs");
const vm = require("vm");
const util = require("util");
const RESULT_START_MARKER = "__CODECLASH_RESULT_START__";
const RESULT_END_MARKER = "__CODECLASH_RESULT_END__";

const emit = (payload) => {
  process.stdout.write(
    RESULT_START_MARKER + JSON.stringify(payload) + RESULT_END_MARKER
  );
};

const startedAt = Date.now();
const failAndExit = (errorType, message, extra = {}) => {
  emit({
    ok: false,
    errorType,
    message,
    ...extra,
    runtimeMs: Date.now() - startedAt,
  });
  process.exit(0);
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normalize = (value) => {
  if (value === undefined) return "__undefined__";
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalize(value[key]);
    }
    return sorted;
  }
  return value;
};

const stableStringify = (value) => JSON.stringify(normalize(value));
const deepEqual = (left, right) => stableStringify(left) === stableStringify(right);

let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch {
  failAndExit("bad_payload", "Invalid execution payload");
}

const tests = Array.isArray(payload.tests) ? payload.tests : [];
if (tests.length === 0) {
  failAndExit("bad_payload", "No tests provided");
}
const maxLogChars = toPositiveInt(payload.maxLogChars, 8192);

const truncateLog = (text) => {
  const value = typeof text === "string" ? text : String(text || "");
  if (value.length <= maxLogChars) return value;
  const suffix = "\n... [truncated]";
  if (maxLogChars <= suffix.length) {
    return suffix.slice(0, maxLogChars);
  }
  return value.slice(0, maxLogChars - suffix.length) + suffix;
};

const formatLogPart = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return util.inspect(value, { depth: 2, breakLength: 100 });
  }
};

const logState = {
  stdout: "",
  stderr: "",
};

const appendLog = (stream, args) => {
  const line = args.map((arg) => formatLogPart(arg)).join(" ");
  if (!line) return;
  const current = stream === "stderr" ? logState.stderr : logState.stdout;
  const next = current ? current + "\n" + line : line;
  const truncated = truncateLog(next);
  if (stream === "stderr") {
    logState.stderr = truncated;
  } else {
    logState.stdout = truncated;
  }
};

const clearLogs = () => {
  logState.stdout = "";
  logState.stderr = "";
};

const getLogs = () => ({
  stdout: logState.stdout || null,
  stderr: logState.stderr || null,
});

const sandboxConsole = {
  log: (...args) => appendLog("stdout", args),
  info: (...args) => appendLog("stdout", args),
  debug: (...args) => appendLog("stdout", args),
  warn: (...args) => appendLog("stderr", args),
  error: (...args) => appendLog("stderr", args),
};

const context = {
  module: { exports: {} },
  exports: {},
  console: sandboxConsole,
};
vm.createContext(context);

clearLogs();
try {
  vm.runInContext(String(payload.code || ""), context, {
    timeout: Number(payload.compileTimeoutMs) || 1000,
  });
} catch (error) {
  failAndExit(
    "compile_error",
    String(error && error.message ? error.message : error),
    getLogs()
  );
}
const setupLogs = getLogs();

let solve = null;
if (typeof context.solve === "function") {
  solve = context.solve;
} else if (typeof context.module.exports === "function") {
  solve = context.module.exports;
} else if (
  context.module.exports &&
  typeof context.module.exports.solve === "function"
) {
  solve = context.module.exports.solve;
} else if (typeof context.exports.solve === "function") {
  solve = context.exports.solve;
}

if (typeof solve !== "function") {
  failAndExit("compile_error", "solve(input) function not found");
}

const results = [];
const stopOnFirstFailure = Boolean(payload.stopOnFirstFailure);
for (let index = 0; index < tests.length; index += 1) {
  const test = tests[index] || {};
  const testStartedAt = Date.now();
  clearLogs();
  try {
    const output = solve(test.input);
    const passed = deepEqual(output, test.expected);
    const logs = getLogs();
    results.push({
      index,
      input: test.input,
      expected: test.expected,
      output: output === undefined ? null : output,
      passed,
      error: null,
      stdout: logs.stdout,
      stderr: logs.stderr,
      runtimeMs: Date.now() - testStartedAt,
    });

    if (!passed && stopOnFirstFailure) {
      break;
    }
  } catch (error) {
    const logs = getLogs();
    results.push({
      index,
      input: test.input,
      expected: test.expected,
      output: null,
      passed: false,
      error: String(error && error.message ? error.message : error),
      stdout: logs.stdout,
      stderr: logs.stderr,
      runtimeMs: Date.now() - testStartedAt,
    });
    if (stopOnFirstFailure) {
      break;
    }
  }
}

const passedCount = results.filter((result) => result.passed).length;
emit({
  ok: true,
  language: "javascript",
  passedAll: passedCount === results.length,
  passedCount,
  failedCount: results.length - passedCount,
  runtimeMs: Date.now() - startedAt,
  setupStdout: setupLogs.stdout,
  setupStderr: setupLogs.stderr,
  results,
});
`;

const PY_RUNNER = String.raw`
import contextlib
import io
import json
import sys
import time

RESULT_START_MARKER = "__CODECLASH_RESULT_START__"
RESULT_END_MARKER = "__CODECLASH_RESULT_END__"
started_at = int(time.time() * 1000)

def emit(payload):
    sys.stdout.write(RESULT_START_MARKER + json.dumps(payload) + RESULT_END_MARKER)
    sys.stdout.flush()


def fail_and_exit(error_type, message, extra = None):
    payload = {
        "ok": False,
        "errorType": error_type,
        "message": message,
        "runtimeMs": int(time.time() * 1000) - started_at,
    }
    if isinstance(extra, dict):
        payload.update(extra)
    emit(payload)
    raise SystemExit(0)


def to_positive_int(value, fallback):
    try:
        parsed = int(value)
    except Exception:
        return fallback
    return parsed if parsed > 0 else fallback


def truncate_log(value, max_chars):
    text = value if isinstance(value, str) else str(value or "")
    if len(text) <= max_chars:
        return text
    suffix = "\n... [truncated]"
    if max_chars <= len(suffix):
        return suffix[:max_chars]
    return text[: max_chars - len(suffix)] + suffix


def normalize_log(value, max_chars):
    text = truncate_log(value, max_chars).rstrip("\n")
    return text if len(text) > 0 else None


try:
    payload = json.loads(sys.stdin.read() or "{}")
except Exception:
    fail_and_exit("bad_payload", "Invalid execution payload")


max_log_chars = to_positive_int(payload.get("maxLogChars"), 8192)


def normalize(value):
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize(value[key]) for key in sorted(value.keys())}
    return value


def deep_equal(left, right):
    return json.dumps(normalize(left), sort_keys=True) == json.dumps(normalize(right), sort_keys=True)


tests = payload.get("tests") if isinstance(payload.get("tests"), list) else []
if len(tests) == 0:
    fail_and_exit("bad_payload", "No tests provided")

namespace = {}
setup_stdout_io = io.StringIO()
setup_stderr_io = io.StringIO()
try:
    with contextlib.redirect_stdout(setup_stdout_io), contextlib.redirect_stderr(setup_stderr_io):
        exec(str(payload.get("code", "")), namespace)
except Exception as error:
    fail_and_exit(
        "compile_error",
        str(error),
        {
            "stdout": normalize_log(setup_stdout_io.getvalue(), max_log_chars),
            "stderr": normalize_log(setup_stderr_io.getvalue(), max_log_chars),
        },
    )

setup_stdout = normalize_log(setup_stdout_io.getvalue(), max_log_chars)
setup_stderr = normalize_log(setup_stderr_io.getvalue(), max_log_chars)

solve = namespace.get("solve")
if not callable(solve):
    fail_and_exit("compile_error", "solve(input) function not found")

results = []
stop_on_first_failure = bool(payload.get("stopOnFirstFailure"))
for index, test in enumerate(tests):
    test_started_at = int(time.time() * 1000)
    test_stdout_io = io.StringIO()
    test_stderr_io = io.StringIO()
    try:
        with contextlib.redirect_stdout(test_stdout_io), contextlib.redirect_stderr(test_stderr_io):
            output = solve(test.get("input"))
        passed = deep_equal(output, test.get("expected"))
        results.append({
            "index": index,
            "input": test.get("input"),
            "expected": test.get("expected"),
            "output": output,
            "passed": passed,
            "error": None,
            "stdout": normalize_log(test_stdout_io.getvalue(), max_log_chars),
            "stderr": normalize_log(test_stderr_io.getvalue(), max_log_chars),
            "runtimeMs": int(time.time() * 1000) - test_started_at,
        })
        if (not passed) and stop_on_first_failure:
            break
    except Exception as error:
        results.append({
            "index": index,
            "input": test.get("input"),
            "expected": test.get("expected"),
            "output": None,
            "passed": False,
            "error": str(error),
            "stdout": normalize_log(test_stdout_io.getvalue(), max_log_chars),
            "stderr": normalize_log(test_stderr_io.getvalue(), max_log_chars),
            "runtimeMs": int(time.time() * 1000) - test_started_at,
        })
        if stop_on_first_failure:
            break

passed_count = len([result for result in results if result.get("passed")])
emit({
    "ok": True,
    "language": "python",
    "passedAll": passed_count == len(results),
    "passedCount": passed_count,
    "failedCount": len(results) - passed_count,
    "runtimeMs": int(time.time() * 1000) - started_at,
    "setupStdout": setup_stdout,
    "setupStderr": setup_stderr,
    "results": results,
})
`;

const buildDockerArgs = (language) => {
  const base = [
    "run",
    "--rm",
    "--network",
    "none",
    "--cpus",
    DOCKER_CPU_LIMIT,
    "--memory",
    DOCKER_MEMORY_LIMIT,
    "--pids-limit",
    String(DOCKER_PIDS_LIMIT),
    "-i",
    DOCKER_IMAGE_BY_LANGUAGE[language],
  ];

  if (language === "javascript") {
    return [...base, "node", "-e", JS_RUNNER];
  }

  return [...base, "python", "-c", PY_RUNNER];
};

const normalizeTests = (tests) => {
  if (!Array.isArray(tests)) return [];
  return tests.slice(0, MAX_TEST_CASES).map((test) => ({
    input: test.input,
    expected: test.expected,
  }));
};

const inferInfraError = (stderr) => {
  const lowered = String(stderr || "").toLowerCase();
  if (lowered.includes("cannot connect to the docker daemon")) {
    return "Docker daemon is not reachable";
  }
  if (lowered.includes("is the docker daemon running")) {
    return "Docker daemon is not running";
  }
  if (lowered.includes("permission denied") && lowered.includes("docker")) {
    return "Docker permission denied for backend process";
  }
  if (lowered.includes("unable to find image")) {
    return "Docker image is not available on this host";
  }
  return "Docker execution failed";
};

const extractExecutionPayload = (rawStdout) => {
  const stdout = String(rawStdout || "");
  const startIndex = stdout.lastIndexOf(RESULT_START_MARKER);
  if (startIndex < 0) return null;

  const resultStart = startIndex + RESULT_START_MARKER.length;
  const endIndex = stdout.indexOf(RESULT_END_MARKER, resultStart);
  if (endIndex < 0) return null;

  return stdout.slice(resultStart, endIndex).trim();
};

export const isLanguageSupported = (language) =>
  typeof language === "string" && SUPPORTED_LANGUAGES.includes(language);

export const executeCodeAgainstTests = async ({
  language,
  code,
  tests,
  stopOnFirstFailure = false,
}) => {
  if (!isLanguageSupported(language)) {
    return {
      ok: false,
      errorType: "validation",
      message: "Unsupported language",
    };
  }

  const codeString = typeof code === "string" ? code : "";
  if (!codeString.trim()) {
    return {
      ok: false,
      errorType: "validation",
      message: "Code cannot be empty",
    };
  }

  if (codeString.length > MAX_CODE_LENGTH) {
    return {
      ok: false,
      errorType: "validation",
      message: `Code is too large (max ${MAX_CODE_LENGTH} characters)`,
    };
  }

  const normalizedTests = normalizeTests(tests);
  if (normalizedTests.length === 0) {
    return {
      ok: false,
      errorType: "validation",
      message: "No tests available for execution",
    };
  }

  const payload = JSON.stringify({
    code: codeString,
    tests: normalizedTests,
    stopOnFirstFailure: Boolean(stopOnFirstFailure),
    compileTimeoutMs: COMPILE_TIMEOUT_MS,
    maxLogChars: MAX_LOG_CHARS,
  });

  return new Promise((resolve) => {
    const args = buildDockerArgs(language);

    let timedOut = false;
    let killedForOutput = false;
    let spawnError = null;
    let stdout = "";
    let stderr = "";

    const child = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, EXEC_TIMEOUT_MS);

    const enforceOutputLimit = () => {
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) {
        killedForOutput = true;
        child.kill("SIGKILL");
      }
    };

    child.on("error", (error) => {
      spawnError = error;
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      enforceOutputLimit();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      enforceOutputLimit();
    });

    child.on("close", () => {
      clearTimeout(timeoutId);

      if (spawnError) {
        if (spawnError.code === "ENOENT") {
          resolve({
            ok: false,
            errorType: "infra",
            message: "Docker CLI is not installed on the backend host",
          });
          return;
        }

        resolve({
          ok: false,
          errorType: "infra",
          message: spawnError.message || "Execution process failed",
        });
        return;
      }

      if (killedForOutput) {
        resolve({
          ok: false,
          errorType: "runtime",
          message: "Execution output exceeded the allowed limit",
        });
        return;
      }

      if (timedOut) {
        const likelyColdStart =
          /unable to find image|pulling from|download/i.test(stderr);
        resolve({
          ok: false,
          errorType: "timeout",
          message: likelyColdStart
            ? `Execution timed out after ${EXEC_TIMEOUT_MS}ms while preparing runtime image`
            : `Execution timed out after ${EXEC_TIMEOUT_MS}ms`,
        });
        return;
      }

      const payloadJson = extractExecutionPayload(stdout);
      if (!payloadJson) {
        if (!stdout.trim()) {
          resolve({
            ok: false,
            errorType: "infra",
            message: inferInfraError(stderr),
          });
          return;
        }

        resolve({
          ok: false,
          errorType: "runtime",
          message: "Execution produced invalid output",
        });
        return;
      }

      try {
        const parsed = JSON.parse(payloadJson);
        if (parsed && typeof parsed === "object") {
          resolve(parsed);
          return;
        }
      } catch {
        // fall through
      }

      resolve({
        ok: false,
        errorType: "runtime",
        message: "Execution produced invalid output",
      });
    });

    child.stdin.on("error", () => {
      // Ignore broken pipe if child exits quickly.
    });
    child.stdin.end(payload);
  });
};
