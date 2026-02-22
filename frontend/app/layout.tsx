import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "./utils/UserContext";
import { SocketProvider } from "./utils/SocketProvider";
import Navbar from "./components/Navbar";

export const metadata: Metadata = {
  title: "CodeClash",
  description: "Competitive coding platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[var(--arena-bg)] text-[var(--arena-text)] antialiased">
        <UserProvider>
          <SocketProvider>
            <Navbar />
            <main className="mx-auto w-full max-w-[1720px] px-3 pt-24 sm:px-4 md:px-6">
              {children}
            </main>
          </SocketProvider>
        </UserProvider>
      </body>
    </html>
  );
}
