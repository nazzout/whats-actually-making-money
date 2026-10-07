import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "What makes money?";
const DESCRIPTION =
  "Emerging products with real revenue, scored on how much the evidence can be trusted. Search a company, ask a question, or pick a starting point.";
// Shown by iMessage, Slack, X, LinkedIn and others when the link is shared. 1200x630, the standard share size.
// Bump ?v= whenever the image file changes: platforms cache previews by URL and would keep showing the old one.
const SHARE_IMAGE = { url: "/wmm-meta-share-image.png?v=2", width: 1200, height: 630, alt: "What makes money? A research tool that scores emerging businesses on real revenue and how much the evidence can be trusted." };

export const metadata: Metadata = {
  // Makes the relative image path absolute in share tags, which most platforms require.
  metadataBase: new URL("https://whatmakesmoney.io"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", url: "/", siteName: TITLE, title: TITLE, description: DESCRIPTION, images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [SHARE_IMAGE] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
