import type { Metadata, Viewport } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { AuthProvider } from "@/components/auth/AuthContext";
import { NoPageZoom } from "@/components/NoPageZoom";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Good School",
  description: "Uganda Secondary School Management System",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Good School",
  },
};

// The page never zooms on a phone (product decision). See also NoPageZoom and
// the touch rules in globals.css.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${quicksand.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <ToastProvider>
          <AuthProvider>
            {children}
            <PushNotificationPrompt />
          </AuthProvider>
        </ToastProvider>
        <NoPageZoom />
        <RegisterServiceWorker />
        <InstallPrompt />
      </body>
    </html>
  );
}