import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Vay Agora · Agências parceiras", template: "%s · Vay Agora Agências parceiras" },
  description: "Portal das agências parceiras da Vay Agora.",
};

export const viewport: Viewport = { themeColor: "#715BCA" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
