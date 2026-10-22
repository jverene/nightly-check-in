import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { headerDate } from "@/lib/time";

export const metadata: Metadata = {
  title: "Nightly Check-In",
  description: "Nightly check-in",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Check-In" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body>
        <div className="shell">
          <header className="app-header">
            <span className="name">Nightly Check-In</span>
            <span className="date">{headerDate()}</span>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
