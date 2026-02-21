"use client";

import { createContext, useContext, useEffect } from "react";
import { socket } from "./socket";
import { useUser } from "../utils/UserContext";

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
        username: user.username,
        role: user.role,
      });
    };

    socket.on("connect", identifyUser);

    if (!socket.connected) {
      socket.connect();
    } else {
      identifyUser();
    }

    return () => {
      socket.off("connect", identifyUser);
    };
  }, [user, loading]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
