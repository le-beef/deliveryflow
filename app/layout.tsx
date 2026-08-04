import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeliveryFlow — PDV e pedidos online",
  description: "PDV instalável com pedidos por delivery e QR Code na mesa.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/deliveryflow-icon.png", apple: "/deliveryflow-icon.png" },
};

export const viewport: Viewport = { themeColor: "#171812", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
