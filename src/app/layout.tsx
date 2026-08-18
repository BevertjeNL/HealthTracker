import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LogoutButton } from "@/components/LogoutButton";
import { hasAuthenticatedSession } from "@/lib/session-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HealthTracker",
  description: "Persoonlijk dashboard voor gezondheid en hardlopen.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const authenticated = await hasAuthenticatedSession();

  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {authenticated && <LogoutButton />}
        {children}
      </body>
    </html>
  );
}
