import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SiteBanner from "@/components/SiteBanner";
import { SITE, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE.name} | Memecoins that give back`, template: `%s | ${SITE.name}` },
  description: SITE.tagline,
  openGraph: {
    title: `${SITE.name} | Memecoins that give back`,
    description: SITE.tagline,
    siteName: SITE.name,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.tagline },
};

export const viewport: Viewport = { themeColor: "#0b0a09", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <SiteBanner />
        <Header />
        <main className="min-h-[70vh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
