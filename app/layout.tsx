import type { Metadata } from "next";
import { JetBrains_Mono, Silkscreen } from "next/font/google";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

/** Pixel display font for short Latin labels only (ux.md). */
const pixel = Silkscreen({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-silkscreen", display: "swap" });
/** Monospace for machine data: counts, ids, receipts. */
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Spectre Scribe",
  description: "Four agents write a three-chapter story in relay.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark", pixel.variable, mono.variable)}>
      <body className="min-h-screen antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
