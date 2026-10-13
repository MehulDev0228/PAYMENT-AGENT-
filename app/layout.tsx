import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AERA: Accounts receivable, on autopilot", template: "%s · AERA" },
  description: "AERA monitors every invoice, follows up with customers, verifies promises and reconciles payments, while every financial decision stays with your team.",
};

export const viewport: Viewport = { themeColor: "#0a0c10" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-medium">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
