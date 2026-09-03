import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "運用管理",
  description: "保守用車の運用計画・運用実績管理",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
