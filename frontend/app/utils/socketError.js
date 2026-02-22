export const getSocketErrorMessage = (
  payload,
  fallback = "Something went wrong. Please try again."
) => {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (
    payload &&
    typeof payload === "object" &&
    typeof payload.message === "string" &&
    payload.message.trim()
  ) {
    return payload.message.trim();
  }

  return fallback;
};
