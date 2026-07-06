import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const oxanium = localFont({
  src: "./fonts/Oxanium-Medium.ttf",
  variable: "--font-oxanium",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  weight: "500",
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
      <body className={oxanium.variable}>{children}</body>
    </html>
  );
}
