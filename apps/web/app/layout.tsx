import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Move",
  description: "Keep, repair, or replace your Toyota, and when you can afford to.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
