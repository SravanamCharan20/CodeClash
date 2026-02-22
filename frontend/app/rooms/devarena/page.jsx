"use client";

import { useSearchParams } from "next/navigation";

export default function DevArenaPage() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");

  return (
    <div>
      <h1>DevArena</h1>
      <p>Room ID: {roomId}</p>
      <p>Room started successfully.</p>
    </div>
  );
}
