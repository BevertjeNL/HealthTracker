import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LiveCoachRefresh } from "@/components/LiveCoachRefresh";
import { PullToRefresh } from "@/components/PullToRefresh";
import { hasAuthenticatedSession } from "@/lib/session-server";
import "./globals.css";
import "./pulse.css";
import "./ios.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse | Jouw hardloopcoach",
  applicationName: "Pulse",
  description: "Persoonlijke hardloopcoach met Strava-runanalyse en Apple Health-herstelcontext.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
      },
      {
        url: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/favicon.ico",
    apple: {
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
    other: [
      {
        rel: "mask-icon",
        url: "/safari-pinned-tab.svg",
        color: "#183e2e",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Pulse",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false, date: false, address: false, email: false },
  robots: { index: false, follow: false },
};

// The UI is light only, so the status bar colour stays light as well (a dark theme-color on a light page looks broken).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#f5f4ef",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const authenticated = await hasAuthenticatedSession();

  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {authenticated && <LiveCoachRefresh />}
        {authenticated && <PullToRefresh />}
        {children}
      </body>
    </html>
  );
}
