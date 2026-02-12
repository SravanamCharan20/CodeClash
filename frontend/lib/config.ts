const DEFAULT_API_BASE_URL = "http://localhost:7777";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

export const SOCKET_URL = (
  process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE_URL
).replace(/\/$/, "");
