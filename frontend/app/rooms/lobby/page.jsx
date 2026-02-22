"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socket } from "../../utils/socket";
import { useUser } from "../../utils/UserContext";

export default function Lobby() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();

  const roomId = (searchParams.get("roomId") || "").trim();

  const [members, setMembers] = useState([]);
  const [allReady, setAllReady] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [error, setError] = useState("");

  const me = useMemo(() => {
    if (!user) return null;
    return members.find((member) => member.userId === user._id) || null;
  }, [members, user]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!roomId) return;

    const handleConnect = () => {
      socket.emit("join-room", roomId);
    };

    const handleLobbyUpdate = (payload) => {
      if (payload.roomId !== roomId) return;
      setMembers(Array.isArray(payload.members) ? payload.members : []);
      setAllReady(Boolean(payload.allReady));
      setCanStart(Boolean(payload.canStart));
      setError("");
    };

    const handleRoomStarted = ({ roomId: startedRoomId }) => {
      if (startedRoomId !== roomId) return;
      router.push(`/rooms/devarena?roomId=${roomId}`);
    };

    const handleSocketError = (message) => {
      setError(message || "Socket error");
    };

    socket.on("connect", handleConnect);
    socket.on("lobby-update", handleLobbyUpdate);
    socket.on("room-started", handleRoomStarted);
    socket.on("socket-error", handleSocketError);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("lobby-update", handleLobbyUpdate);
      socket.off("room-started", handleRoomStarted);
      socket.off("socket-error", handleSocketError);
    };
  }, [roomId, router]);

  const handleToggleReady = () => {
    if (!roomId || !me) return;
    socket.emit("toggle-ready", { roomId, ready: !me.ready });
  };

  const handleStartRoom = () => {
    if (!roomId || !isAdmin) return;
    socket.emit("start-room", { roomId });
  };

  if (!roomId) {
    return <p>Invalid room id</p>;
  }

  return (
    <div>
      <h1>Lobby</h1>

      <p>
        Room ID: <strong>{roomId}</strong>
      </p>

      <h3>Participants</h3>
      <ul>
        {members.map((member, index) => (
          <li key={`${member.userId}-${index}`}>
            {member.username}
            {member.role === "admin" ? " (Admin)" : ""}
            {" - "}
            {member.ready ? "Ready" : "Not Ready"}
          </li>
        ))}
      </ul>

      {me && (
        <button
          className="bg-green-500 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
          onClick={handleToggleReady}
        >
          {me.ready ? "Unready" : "Ready"}
        </button>
      )}

      {isAdmin && (
        <button
          disabled={!canStart}
          className="bg-blue-500 disabled:opacity-50 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
          onClick={handleStartRoom}
        >
          Start Room
        </button>
      )}

      <p>All Ready: {allReady ? "Yes" : "No"}</p>

      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
