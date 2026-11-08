import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

/** Pixel display font for short Latin labels only (ux.md). */
const pixel = Silkscreen({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-silkscreen", display: "swap" });

export const metadata: Metadata = {
  title: "Spectre Scribe",
  description: "Four agents write a three-chapter story in relay.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={pixel.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
