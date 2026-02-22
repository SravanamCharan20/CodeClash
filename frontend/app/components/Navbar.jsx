"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  PlusSquare,
  UserCircle2,
  Users,
} from "lucide-react";
import { useUser } from "../utils/UserContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8888";

const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "U";
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800";

export default function Navbar() {
  const { user, setUser, loading } = useUser();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const initials = useMemo(() => getInitials(user?.username), [user?.username]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsideClick = (event) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      router.push("/auth/signin");
    } catch {
      console.error("Logout failed");
    }
  };

  if (loading) {
    return (
      <nav className="fixed left-1/2 top-4 z-50 w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2">
        <div className="h-14 animate-pulse rounded-full border border-white/10 bg-black/55" />
      </nav>
    );
  }

  return (
    <nav className="fixed left-1/2 top-4 z-50 w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2">
      <div className="flex items-center justify-between rounded-full border border-white/15 bg-black/70 px-4 py-2 shadow-[0_14px_35px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="text-2xl font-bold text-[var(--arena-green)]">&lt;/&gt;</span>
          <span className="text-xl font-semibold tracking-tight text-white">
            Code<span className="text-[var(--arena-green)]">Clash</span>
          </span>
        </Link>

        {!user ? (
          <div className="flex items-center gap-2">
            <Link
              href="/auth/signin"
              className="rounded-full border cursor-pointer border-white/15 px-3 py-1.5 text-sm text-neutral-100 transition hover:bg-neutral-800"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-full bg-[var(--arena-green)] cursor-pointer px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-[var(--arena-green-strong)]"
            >
              Sign Up
            </Link>
          </div>
        ) : (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-neutral-900/80 px-2 py-1.5 text-sm transition hover:border-white/30"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden max-w-[130px] truncate text-neutral-100 sm:block">
                {user.username}
              </span>
              <ChevronDown className="h-4 w-4 text-neutral-300" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-black/95 p-2 shadow-2xl">
                <div className="mb-2 flex items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-2 py-2">
                  <UserCircle2 className="h-4 w-4 text-neutral-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {user.username}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-neutral-400">
                      {user.role}
                    </p>
                  </div>
                </div>

                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className={menuItemClass}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>

                {user.role === "admin" && (
                  <Link
                    href="/rooms/createRoom"
                    onClick={() => setMenuOpen(false)}
                    className={menuItemClass}
                  >
                    <PlusSquare className="h-4 w-4" />
                    Create Room
                  </Link>
                )}

                <Link
                  href="/rooms/joinRoom"
                  onClick={() => setMenuOpen(false)}
                  className={menuItemClass}
                >
                  <Users className="h-4 w-4" />
                  Join Room
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
