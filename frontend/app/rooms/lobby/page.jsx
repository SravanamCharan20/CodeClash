"use client";

import { useEffect, useState } from "react";
import { socket } from "../../utils/socket";
import { useSearchParams } from "next/navigation";

export default function Lobby() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");

  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!roomId) return;
    const normalizedRoomId = roomId.trim();

    const handleLobbyUpdate = (data) => {
      if (data.roomId === normalizedRoomId) {
        setMembers(data.members);
      }
    };

    const handleSocketError = (message) => {
      console.error("❌", message);
    };

    const handleConnect = () => {
      socket.emit("join-room", normalizedRoomId);
    };

    socket.on("lobby-update", handleLobbyUpdate);
    socket.on("socket-error", handleSocketError);
    socket.on("connect", handleConnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("lobby-update", handleLobbyUpdate);
      socket.off("socket-error", handleSocketError);
    };
  }, [roomId]);

  return (
    <div>
      <h1>Lobby</h1>

      <p>
        Room ID: <strong>{roomId}</strong>
      </p>

      <h3>Participants</h3>
      <ul>
        {members.map((user, index) => (
          <li key={index}>
            {user.username}
            {user.role === "admin" && " (Admin)"}
          </li>
        ))}
      </ul>
    </div>
  );
}
