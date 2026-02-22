"use client";

import { createContext, useContext, useEffect } from "react";
import { socket } from "./socket";
import { useUser } from "../utils/UserContext";
import { getSocketErrorMessage } from "./socketError";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user, loading } = useUser();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (socket.connected) {
        socket.disconnect();
      }
      return;
    }

    const identifyUser = () => {
      socket.emit("identify-user", {
        userId: user._id,
      });
    };

    const handleConnectError = (error) => {
      console.error("Socket connect error:", getSocketErrorMessage(error));
    };

    socket.on("connect", identifyUser);
    socket.on("connect_error", handleConnectError);

    if (!socket.connected) {
      socket.connect();
    } else {
      identifyUser();
    }

    return () => {
      socket.off("connect", identifyUser);
      socket.off("connect_error", handleConnectError);
    };
  }, [user, loading]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
