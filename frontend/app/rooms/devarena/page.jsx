"use client";

import { useSearchParams } from "next/navigation";

const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;

export default function DevArenaPage() {
  const searchParams = useSearchParams();
  const roomId = (searchParams.get("roomId") || "").trim().toUpperCase();

  if (!ROOM_ID_REGEX.test(roomId)) {
    return <p className="text-red-500 m-2">Invalid room ID</p>;
  }

  return (
    <div>
      <h1>DevArena</h1>
      <p>Room ID: {roomId}</p>
      <p>Room started successfully.</p>
    </div>
  );
}
