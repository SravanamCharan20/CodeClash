'use client';
import React, { useState } from "react";

const Signup = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    try {
      const res = await fetch("http://localhost:8888/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Signup failed");
      }
      
      setSuccess("Signup successful 🎉");
    } catch (err) {
      setError(err.message);
      console.error("Error:", err.message);
    }
  };

  return (
    <div className="flex flex-col gap-3 max-w-sm mx-auto mt-10">
      <input
        type="text"
        placeholder="Username"
        onChange={(e) => setUsername(e.target.value)}
        className="border p-2"
      />

      <input
        type="email"
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2"
      />

      <input
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2"
      />

      <button
        onClick={handleSubmit}
        className="bg-indigo-500 text-white py-2 rounded"
      >
        Sign Up
      </button>

      {success && <p className="text-green-600">{success}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
};

export default Signup;
