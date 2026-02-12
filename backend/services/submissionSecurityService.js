const MAX_SOURCE_CODE_LENGTH = 50_000;

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /del\s+\/s\s+\/q\s+c:\\/i,
  /sudo\s+/i,
  /process\.env/i,
  /\/etc\/passwd/i,
  /child_process/i,
  /require\s*\(\s*["']fs["']\s*\)/i,
  /import\s+os/i,
  /subprocess\./i,
  /socket\./i,
];

export function validateSubmissionSource(sourceCode) {
  if (typeof sourceCode !== "string") {
    return "sourceCode must be a string";
  }

  if (!sourceCode.trim()) {
    return "sourceCode cannot be empty";
  }

  if (sourceCode.length > MAX_SOURCE_CODE_LENGTH) {
    return `sourceCode exceeds ${MAX_SOURCE_CODE_LENGTH} characters`;
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(sourceCode)) {
      return "sourceCode blocked by security policy";
    }
  }

  return null;
}
