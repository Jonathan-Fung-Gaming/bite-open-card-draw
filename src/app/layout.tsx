import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const amazdoom = localFont({
  src: "./fonts/Amazdoomright-o1B0.ttf",
  variable: "--font-amazdoom",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Pump It Up Open Stage",
    template: "%s | Pump It Up Open Stage",
  },
  description: "Tournament draw, voting, and stage visualization for Pump It Up Open Stage.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={amazdoom.variable}>{children}</body>
    </html>
  );
}
