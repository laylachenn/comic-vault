import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Black, JetBrains_Mono } from "next/font/google";
import { VaultProvider } from "@/components/VaultProvider";
import "./globals.css";

const display = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Archivo({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Layla's Comic Vault",
  description: "Keep track of your comic collection, with covers, series runs and a want list.",
  appleWebApp: { capable: true, title: "Comic Vault", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#171C33" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <VaultProvider>{children}</VaultProvider>
        <footer className="foot">
          <div className="wrap">
            Comic details and covers from <a href="https://comicvine.gamespot.com/" target="_blank" rel="noreferrer">Comic Vine</a>.
            Cover art belongs to its publishers. A personal, non-commercial project.
          </div>
        </footer>
      </body>
    </html>
  );
}
