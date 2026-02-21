"use client";
import React from "react";
import { useUser } from "../utils/UserContext";

const Page = () => {
  const { user } = useUser();

  if (!user) return null; 

  return user.role === "admin" ? (
    <>
    <button className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2">Create Room</button>
    <button className="cursor-pointer rounded-sm p-2 text-white m-2">Join Room</button>
    </>
  ) : (
    <button className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2">Join Room</button>
  );
};

export default Page;