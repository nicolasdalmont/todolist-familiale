import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppUpdateWatcher } from "@/components/AppUpdateWatcher";
import { PendingOverlayProvider } from "@/components/PendingOverlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "To-Do List Familiale",
  description: "Application de gestion de tâches partagées en famille.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#E2621F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <PendingOverlayProvider>{children}</PendingOverlayProvider>
        <ServiceWorkerRegister />
        <AppUpdateWatcher />
      </body>
    </html>
  );
}
