"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socket } from "../../utils/socket";
import { useUser } from "../../utils/UserContext";
import { getSocketErrorMessage } from "../../utils/socketError";

const ROOM_ID_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
const READY_COOLDOWN_MS = 700;
const START_COOLDOWN_MS = 1200;

export default function Lobby() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();

  const roomId = (searchParams.get("roomId") || "").trim().toUpperCase();
  const roomIdValid = ROOM_ID_REGEX.test(roomId);

  const [members, setMembers] = useState([]);
  const [allReady, setAllReady] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [roomStatus, setRoomStatus] = useState("lobby");
  const [socketReady, setSocketReady] = useState(socket.connected);
  const [isReadyActionPending, setIsReadyActionPending] = useState(false);
  const [isStartActionPending, setIsStartActionPending] = useState(false);
  const [error, setError] = useState("");
  const readyCooldownRef = useRef(null);
  const startCooldownRef = useRef(null);

  const me = useMemo(() => {
    if (!user) return null;
    return members.find((member) => member.userId === user._id) || null;
  }, [members, user]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!roomIdValid) return;

    const clearReadyCooldown = () => {
      if (readyCooldownRef.current) {
        clearTimeout(readyCooldownRef.current);
        readyCooldownRef.current = null;
      }
    };

    const clearStartCooldown = () => {
      if (startCooldownRef.current) {
        clearTimeout(startCooldownRef.current);
        startCooldownRef.current = null;
      }
    };

    const resetPendingState = () => {
      clearReadyCooldown();
      clearStartCooldown();
      setIsReadyActionPending(false);
      setIsStartActionPending(false);
    };

    const handleConnect = () => {
      setSocketReady(true);
      socket.emit("join-room", roomId);
    };

    const handleDisconnect = () => {
      setSocketReady(false);
      resetPendingState();
    };

    const handleLobbyUpdate = (payload = {}) => {
      if (payload.roomId !== roomId) return;
      setMembers(Array.isArray(payload.members) ? payload.members : []);
      setAllReady(Boolean(payload.allReady));
      setCanStart(Boolean(payload.canStart));
      setRoomStatus(payload.status === "started" ? "started" : "lobby");
      setError("");
      resetPendingState();
    };

    const handleRoomStarted = ({ roomId: startedRoomId } = {}) => {
      if (startedRoomId !== roomId) return;
      router.push(`/rooms/devarena?roomId=${roomId}`);
    };

    const handleSocketError = (payload) => {
      resetPendingState();
      setError(getSocketErrorMessage(payload, "Socket error"));
    };

    const handleConnectError = (payload) => {
      setSocketReady(false);
      resetPendingState();
      setError(getSocketErrorMessage(payload, "Realtime connection failed"));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("lobby-update", handleLobbyUpdate);
    socket.on("room-started", handleRoomStarted);
    socket.on("socket-error", handleSocketError);
    socket.on("connect_error", handleConnectError);

    if (socket.connected) {
      socket.emit("join-room", roomId);
    }

    return () => {
      resetPendingState();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("lobby-update", handleLobbyUpdate);
      socket.off("room-started", handleRoomStarted);
      socket.off("socket-error", handleSocketError);
      socket.off("connect_error", handleConnectError);
    };
  }, [roomId, roomIdValid, router]);

  const handleToggleReady = () => {
    if (!roomIdValid || !me) return;
    if (!socketReady) {
      setError("Realtime connection is not ready");
      return;
    }
    if (roomStatus !== "lobby") {
      setError("Room is already started");
      return;
    }
    if (isReadyActionPending) return;

    setError("");
    setIsReadyActionPending(true);
    socket.emit("toggle-ready", { roomId, ready: !me.ready });
    readyCooldownRef.current = setTimeout(() => {
      setIsReadyActionPending(false);
    }, READY_COOLDOWN_MS);
  };

  const handleStartRoom = () => {
    if (!roomIdValid || !isAdmin) return;
    if (!socketReady) {
      setError("Realtime connection is not ready");
      return;
    }
    if (roomStatus !== "lobby") {
      setError("Room is already started");
      return;
    }
    if (!canStart) {
      setError("All participants must be ready");
      return;
    }
    if (isStartActionPending) return;

    setError("");
    setIsStartActionPending(true);
    socket.emit("start-room", { roomId });
    startCooldownRef.current = setTimeout(() => {
      setIsStartActionPending(false);
    }, START_COOLDOWN_MS);
  };

  if (!roomIdValid) {
    return <p className="text-red-500 m-2">Invalid room id</p>;
  }

  return (
    <div>
      <h1>Lobby</h1>

      <p>
        Room ID: <strong>{roomId}</strong>
      </p>
      <p>Status: {roomStatus}</p>
      <p>Connection: {socketReady ? "Connected" : "Disconnected"}</p>

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
          className="bg-green-500 disabled:opacity-50 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
          disabled={!socketReady || roomStatus !== "lobby" || isReadyActionPending}
          onClick={handleToggleReady}
        >
          {isReadyActionPending
            ? "Updating..."
            : me.ready
            ? "Unready"
            : "Ready"}
        </button>
      )}

      {isAdmin && (
        <button
          disabled={
            !socketReady ||
            roomStatus !== "lobby" ||
            !canStart ||
            isStartActionPending
          }
          className="bg-blue-500 disabled:opacity-50 border cursor-pointer border-black rounded-sm p-2 text-black m-2"
          onClick={handleStartRoom}
        >
          {isStartActionPending ? "Starting..." : "Start Room"}
        </button>
      )}

      <p>All Ready: {allReady ? "Yes" : "No"}</p>

      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
