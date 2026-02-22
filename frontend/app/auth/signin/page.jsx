"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "../../utils/UserContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8888";

const FeatureRow = ({ text }) => (
  <li className="flex items-center gap-2 text-sm text-[var(--arena-muted)]">
    <span className="h-1.5 w-1.5 rounded-full bg-[var(--arena-green)]" />
    {text}
  </li>
);

export default function Signin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { setUser } = useUser();
  const router = useRouter();

  const handleSignin = async () => {
    setError("");
    setSuccess("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/auth/signin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Signin failed");

      setUser(data.user);
      setSuccess("Welcome back. Redirecting...");
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="arena-page arena-grid-bg flex items-center justify-center px-3 py-4">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-xl border border-[var(--arena-border)] bg-[var(--arena-panel)]/90 lg:grid-cols-[1.15fr_0.85fr]">
        <aside className="border-b border-[var(--arena-border)] p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <span className="text-4xl font-semibold text-[var(--arena-green)]">
              &lt;/&gt;
            </span>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              CodeArena
            </h1>
          </div>

          <h2 className="mt-6 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Login. Compile. Dominate.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--arena-muted)]">
            Jump back into your coding rooms, sync with your friends in real
            time, and continue your battle streak.
          </p>

          <ul className="mt-6 space-y-3">
            <FeatureRow text="Real-time room join and ready states" />
            <FeatureRow text="Live competition with shared judge conditions" />
            <FeatureRow text="Fast room creation and secure room entry" />
          </ul>
        </aside>

        <div className="p-6 sm:p-8">
          <h3 className="text-2xl font-semibold text-white">Sign In</h3>
          <p className="mt-1 text-sm text-[var(--arena-muted)]">
            Use your account to continue.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--arena-muted)]">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="h-11 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 text-sm text-white outline-none placeholder:text-[#71717a] focus:border-[var(--arena-green)]"
                onChange={(e) => setEmail(e.target.value)}
                value={email}
              />
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--arena-muted)]">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="h-11 w-full rounded-md border border-[var(--arena-border)] bg-[var(--arena-panel-soft)] px-3 text-sm text-white outline-none placeholder:text-[#71717a] focus:border-[var(--arena-green)]"
                onChange={(e) => setPassword(e.target.value)}
                value={password}
              />
            </div>
          </div>

          <button
            onClick={handleSignin}
            disabled={submitting}
            className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-[var(--arena-green)] text-sm font-semibold text-black transition hover:bg-[var(--arena-green-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Enter Arena"}
          </button>

          {success && (
            <p className="mt-4 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              {success}
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <p className="mt-6 text-sm text-[var(--arena-muted)]">
            New here?{" "}
            <Link
              className="font-medium text-[var(--arena-green)] transition hover:text-[var(--arena-green-strong)]"
              href="/auth/signup"
            >
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
