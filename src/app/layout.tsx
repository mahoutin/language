import type { Metadata, Viewport } from "next";
import "./globals.css";
import { basePath } from "@/lib/base-path";
export const metadata: Metadata = {
  manifest: `${basePath}/manifest.webmanifest`,
  title: "Everyday English — Apprendre à votre rythme",
  description: "Un parcours guidé pour commencer à communiquer en anglais.",
  appleWebApp: {
    capable: true,
    title: "Everyday English",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = { themeColor: "#143f43" };
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
