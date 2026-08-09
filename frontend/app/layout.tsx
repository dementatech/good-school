import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { resolveTheme } from "@/lib/theme/resolve-theme";
import { themeStyleTag } from "@/lib/theme/css-vars";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Named --font-sans (not --font-poppins) to match shadcn's globals.css
// `@theme inline` mapping, which expects that exact variable name.
const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "School OS",
  description: "Uganda Secondary School Management System",
};

export const viewport: Viewport = {
  themeColor: "#990000",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = await resolveTheme();

  return (
    <html lang="en" className={`${poppins.variable} ${geistMono.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStyleTag(theme) }} />
      </head>
      <body style={{ fontFamily: theme.fontFamily }}>
        <TooltipProvider>{children}</TooltipProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
