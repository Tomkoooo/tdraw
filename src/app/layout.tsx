import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import ThemeProvider from "@/components/ThemeProvider";
import GlobalAppChrome from "@/components/GlobalAppChrome";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { getSiteUrl } from "@/lib/siteUrl";

const siteName = "tDraw";
const siteDescription =
  "iPad-first canvas for handwriting, diagrams, and shared notebooks—calm glass UI, real-time collaboration, and your library in one place.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: siteName,
  title: {
    default: "tDraw — iPad-first notes and canvas",
    template: "%s · tDraw",
  },
  description: siteDescription,
  keywords: ["tDraw", "iPad notes", "handwriting", "whiteboard", "canvas", "note-taking", "tldraw"],
  authors: [{ name: siteName }],
  creator: siteName,
  icons: {
    icon: [{ url: "/tDraw-fav.png", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteName,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName,
    title: "tDraw — iPad-first notes and canvas",
    description: siteDescription,
    url: "/",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: `${siteName} logo` }],
  },
  twitter: {
    card: "summary",
    title: "tDraw — iPad-first notes and canvas",
    description: siteDescription,
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans" data-theme-surface>
        <Script id="tdraw-theme-boot" strategy="beforeInteractive">
          {`(function(){try{var k='tdraw-theme';var m=localStorage.getItem(k);var d=window.matchMedia('(prefers-color-scheme:dark)').matches;var r=m==='light'?'light':m==='dark'?'dark':d?'dark':'light';document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`}
        </Script>
        <ThemeProvider>
          <SessionProvider>
            <ServiceWorkerRegister />
            <GlobalAppChrome>{children}</GlobalAppChrome>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
