'use client';
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../../utils/UserContext";

const Signin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [btnLoading, setBtnLoading] = useState(false);

  const { setUser, loading: authLoading } = useUser();
  const router = useRouter();

  const handleSignin = async () => {
    setError("");
    setSuccess("");
    setBtnLoading(true);

    try {
      const res = await fetch("http://localhost:8888/auth/signin", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Signin failed");
      }

      setSuccess("Logged in successfully 🎉");
      setUser(data.user);
      router.push("/");

    } catch (err) {
      setError(err.message);
    } finally {
      setBtnLoading(false);
    }
  };

  // Optional: avoid flicker while auth is hydrating
  if (authLoading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-sm bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-center mb-6">
          Sign in to <span className="text-indigo-400">CodeClash</span>
        </h2>

        <input
          type="email"
          placeholder="Email"
          className="w-full mb-3 px-3 py-2 rounded bg-black/40 border border-white/10 focus:outline-none"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full mb-4 px-3 py-2 rounded bg-black/40 border border-white/10 focus:outline-none"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleSignin}
          disabled={btnLoading}
          className="w-full py-2 rounded bg-indigo-500 hover:bg-indigo-600 transition disabled:opacity-50"
        >
          {btnLoading ? "Signing in..." : "Sign In"}
        </button>

        {success && (
          <p className="text-green-400 text-sm text-center mt-3">
            {success}
          </p>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center mt-3">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default Signin;
