import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AnalyticsScript } from "@/components/analytics-script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Signflow",
  description: "Digitale Anwesenheitsnachweise für Coaches und Teilnehmer.",
  // Browser-Übersetzer (Chrome-Auto-Übersetzung, Extensions) NICHT auf diese
  // App loslassen: sie schreiben nicht nur die UI-Labels um („Löschen" →
  // „Löwen"), sondern paraphrasieren auch die vom Coach erfassten
  // Termin-Inhalte. Bei einem rechtlich relevanten Nachweis muss der Coach am
  // Bildschirm exakt das sehen, was gespeichert ist und im PDF landet.
  other: { google: "notranslate" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Die App ist durchgehend deutsch. Mit lang="en" bot Chrome eine Übersetzung
  // an bzw. übersetzte automatisch — zusammen mit `other.google` oben ist das
  // die Ursache für umgeschriebene Termin-Texte und UI-Labels.
  return (
    <html
      lang="de"
      translate="no"
      className={`${geistSans.variable} ${geistMono.variable} notranslate h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
      <AnalyticsScript />
    </html>
  );
}
