"use client";

import Link from "next/link";
import { useUser } from "../utils/UserContext";

const Brand = () => {
  return (
    <div className="flex items-center gap-3">
      <span className="text-4xl font-semibold text-[var(--arena-green)]">
        &lt;/&gt;
      </span>
      <h1 className="text-4xl font-semibold tracking-tight text-white">
        CodeArena
      </h1>
    </div>
  );
};

const FeatureItem = ({ title, text }) => {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-2 w-2 rounded-full bg-[var(--arena-green)]" />
      <div>
        <p className="text-base font-medium text-white">{title}</p>
        <p className="text-sm text-[var(--arena-muted)]">{text}</p>
      </div>
    </li>
  );
};

export default function Page() {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <main className="arena-page arena-grid-bg flex items-center justify-center px-4 py-12">
        <div className="grid w-full max-w-[1200px] gap-6 lg:grid-cols-2">
          <div className="h-[430px] animate-pulse rounded-lg border border-white/10 bg-white/5" />
          <div className="h-[430px] animate-pulse rounded-lg border border-white/10 bg-white/5" />
        </div>
      </main>
    );
  }

  if (!user) return null;

  const isAdmin = user.role === "admin";

  return (
    <main className="arena-page arena-grid-bg overflow-x-hidden px-1 pb-6 pt-2 sm:px-2">
      <section className="mx-auto grid w-full max-w-[1280px] gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/80 p-6 sm:p-8">
          <Brand />

          <div className="mt-6 max-w-2xl min-w-0">
            <p className="inline-flex rounded-full border border-[var(--arena-border)] bg-black/50 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-[var(--arena-muted)]">
              REAL-TIME CODING BATTLES
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl xl:text-5xl">
              Practice speed, accuracy, and strategy with live room matches.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--arena-muted)] sm:text-lg">
              Create private arenas, invite friends with a room code, and solve
              the same challenge under one timer. Track readiness in lobby and
              start only when everyone is set.
            </p>
          </div>

          <ul className="mt-8 space-y-4">
            <FeatureItem
              title="Shared problem & judge conditions"
              text="All participants run against the exact same hidden tests."
            />
            <FeatureItem
              title="Live lobby synchronization"
              text="Join, ready status, and room state update instantly."
            />
            <FeatureItem
              title="Fast room onboarding"
              text="Create a room in one click or join via secure room code."
            />
          </ul>

          <div className="mt-8 inline-flex items-center gap-2 rounded border border-[var(--arena-border)] bg-black/50 px-3 py-2 text-sm">
            <span className="text-[var(--arena-muted)]">Signed in as</span>
            <span className="font-semibold text-white">{user.username}</span>
            <span className="rounded-full bg-[#1f232b] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#d6dbe4]">
              {user.role}
            </span>
          </div>
        </div>

        <div className="min-w-0 self-center rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)] p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold tracking-[0.12em] text-[var(--arena-muted)]">
              QUICK ACTIONS
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Start or Join a Room
            </h3>
            <p className="mt-2 text-sm text-[var(--arena-muted)]">
              Keep the flow simple: create a room if you are admin, otherwise
              join using the room code.
            </p>
          </div>

          <div className="space-y-4">
            {isAdmin && (
              <Link
                href="/rooms/createRoom"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--arena-green)] text-sm font-semibold text-black transition hover:brightness-105"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create Room
              </Link>
            )}

            {!isAdmin && (
              <button
                disabled
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#21262d] text-sm font-semibold text-[#a7afbc] opacity-75"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create Room
                <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  Admin
                </span>
              </button>
            )}

            <Link
              href="/rooms/joinRoom"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] text-sm font-semibold text-white transition hover:bg-[#1a2028]"
            >
              <svg
                className="h-4 w-4 text-[#b8bec8]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5 1.34 3.5 3 3.5zM8 11c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11zM16 20v-2c0-1.66-1.79-3-4-3H8c-2.21 0-4 1.34-4 3v2M21 20v-2c0-1.13-.81-2.13-2.03-2.66" />
              </svg>
              Join Room
            </Link>
          </div>

          <div className="mt-6 rounded-md border border-[var(--arena-border)] bg-black/35 px-4 py-3 text-sm text-[var(--arena-muted)]">
            No account switching needed. Share the room code and start competing.
          </div>
        </div>
      </section>
    </main>
  );
}
