import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: "AI Insight Reader",
  description: "AI-assisted reading workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
