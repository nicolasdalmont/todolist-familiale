import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppUpdateWatcher } from "@/components/AppUpdateWatcher";
import { PendingOverlayProvider } from "@/components/PendingOverlay";
import { ToastProvider } from "@/components/Toast";
import { BottomNav } from "@/components/BottomNav";
import { PullToRefresh } from "@/components/PullToRefresh";
import "./globals.css";

export const metadata: Metadata = {
  title: "Checkberry",
  description: "Gestion de tâches partagées en famille.",
  manifest: "/manifest.json",
  // Favicon : fichiers src/app/icon.svg (+ icon.png de repli), détectés
  // automatiquement par l'App Router. Ici on ne déclare que l'icône
  // apple-touch (écran d'accueil iOS), pour laquelle on veut la version 192.
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#D6336C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">
        <ToastProvider>
          <PendingOverlayProvider>
            <PullToRefresh>{children}</PullToRefresh>
          </PendingOverlayProvider>
          <BottomNav />
        </ToastProvider>
        <ServiceWorkerRegister />
        <AppUpdateWatcher />
      </body>
    </html>
  );
}
