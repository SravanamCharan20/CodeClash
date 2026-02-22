"use client";
import React, { useEffect } from "react";
import { useUser } from "../utils/UserContext";
import Link from "next/link";

const Page = () => {
  const { user } = useUser();
    // console.log(user)
  if (!user) return null;
  // 🔐 ADMIN VIEW
  if (user.role === "admin") {
    return (
      <>
        <Link
          href="/rooms/createRoom"
          className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
        >
          create Room
        </Link>

        <Link
          href="/rooms/joinRoom"
          className="cursor-pointer rounded-sm p-2 text-white m-2 inline-block"
        >
          Join Room
        </Link>
      </>
    );
  }

  // 👤 USER VIEW
  return (
    <Link
      href="/rooms/joinRoom"
      className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2 inline-block"
    >
      Join Room
    </Link>
  );
};

export default Page;