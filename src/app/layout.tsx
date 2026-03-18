import type { Metadata } from "next";
import { LayoutContent } from "@/components/layout/layout-content";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { SpaceBackground } from "@/components/ui/space-background";
import "./globals.css";

export const metadata: Metadata = {
  title: "KitzChat",
  description: "AI business workspace for admins and customers.",
  applicationName: "KitzChat",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.png", type: "image/png", sizes: "256x256" },
      { url: "/brand/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/brand/icon.png", sizes: "512x512", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KitzChat",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1268fb" },
    { media: "(prefers-color-scheme: dark)", color: "#06080e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <SpaceBackground />
          <div className="relative z-10">
            <LayoutContent>{children}</LayoutContent>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
