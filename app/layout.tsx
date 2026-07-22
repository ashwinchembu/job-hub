import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;

  return {
    metadataBase: new URL(baseUrl),
    title: "Job Hub — Applications & Interview Prep",
    description: "A local-first workspace for applications, follow-ups, interview practice, and problem journals.",
    openGraph: {
      title: "Job Hub",
      description: "Applications. Follow-ups. Interview prep.",
      type: "website",
      images: [{ url: `${baseUrl}/og.png`, width: 1536, height: 1024, alt: "Job Hub application and interview-prep workspace" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Job Hub",
      description: "Applications. Follow-ups. Interview prep.",
      images: [`${baseUrl}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
