// app/layout.tsx
import type { Metadata, Viewport } from "next"; // ★ Viewportを追加
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Smart Scheduler",
  description: "AI日程調整アシスタント",
  // ★以下を追加（iPhone用）
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Scheduler",
  },
};

// ★以下を追加（スマホでズームしすぎない設定など）
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#9333ea",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>{children}</body>
    </html>
  );
}