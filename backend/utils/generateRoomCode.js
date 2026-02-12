const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(size = 6) {
  let raw = "";
  for (let i = 0; i < size; i += 1) {
    raw += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}
