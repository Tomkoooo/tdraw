import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tDraw - Premium iPad-first note-taking",
  description: "A clean, minimalist, premium note-taking app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "tDraw",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
