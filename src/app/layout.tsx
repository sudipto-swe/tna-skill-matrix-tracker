import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "TNA & Skill Matrix Tracker — Workforce Competency Management",
  description:
    "Training Needs Analysis & Skill Matrix Tracker: competency records, role requirements, gap analysis, TNA prioritisation, training calendar, attendance and qualification monitoring. Portfolio simulation with synthetic data.",
  keywords: ["Training Needs Analysis", "Skill Matrix", "Competency Management", "TNA", "Manufacturing HR", "L&D"],
  authors: [{ name: "TNA Portfolio Project" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
