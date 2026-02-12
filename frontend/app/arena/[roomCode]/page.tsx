"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getArena, getErrorMessage } from "@/lib/api";
import { normalizeRoomCode } from "@/lib/session";

export default function ArenaEntryPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();

  const roomCode = normalizeRoomCode(String(params.roomCode || ""));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveRoute() {
      try {
        const response = await getArena(roomCode);
        if (cancelled) return;

        if (response.arena.state === "LOBBY") {
          router.replace(`/arena/${roomCode}/lobby`);
          return;
        }

        if (response.arena.state === "LIVE") {
          router.replace(`/arena/${roomCode}/contest`);
          return;
        }

        router.replace(`/arena/${roomCode}/results`);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    }

    if (roomCode) {
      void resolveRoute();
    }

    return () => {
      cancelled = true;
    };
  }, [roomCode, router]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-xl rounded border border-zinc-300 p-4">
        <h1 className="text-lg font-semibold">Resolving Arena Route...</h1>
        <p className="mt-2 text-sm text-zinc-600">Room: {roomCode}</p>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
    </main>
  );
}
