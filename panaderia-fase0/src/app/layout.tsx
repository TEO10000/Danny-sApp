import type { Metadata, Viewport } from "next";

import { RegistrarSW } from "@/components/RegistrarSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panadería — Gestión Interna",
  description: "Producción, ventas por sobrantes, caja y facturas — Principal y Consejo",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Danny's",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c75f1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
