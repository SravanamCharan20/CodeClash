"use client"

import Link from "next/link";
import React from "react";

const Navbar = () => {
  return (
    <nav
      className="
        fixed top-6 left-1/2 -translate-x-1/2
        z-50
        w-[90%] max-w-3xl
        backdrop-blur-md bg-black/60
        rounded-full
        shadow-lg shadow-black/30
        border border-white/10
      "
    >
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Logo + Brand */}
        <div className="flex items-center gap-3">
          <span className="text-xl">⚔️</span>
          <span className="text-lg font-semibold tracking-wide text-white">
            Code<span className="text-indigo-400">Clash</span>
          </span>
        </div>

        {/* Auth Buttons */}
        <div className="flex items-center gap-4">
          <Link
            href="/auth/signin"
            className="text-sm cursor-pointer text-gray-300 hover:text-white transition"
          >
            Sign In
          </Link>

          <Link
            href="/auth/signup"
            className="text-sm px-4 py-1.5 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white transition cursor-pointer"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
