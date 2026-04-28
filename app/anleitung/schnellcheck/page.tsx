import type { Metadata } from "next";

import { SchnellcheckGuide } from "./schnellcheck-guide";

export const metadata: Metadata = {
  title: "Schnellcheck-Anleitung — Signflow",
  description:
    "Schritt-für-Schritt: vom Schnellcheck im Coach-Bereich bis zum fertigen PDF in der Liste des Bildungsträgers. Zweisprachig DE / UK.",
};

type Props = {
  searchParams: Promise<{ lang?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const { lang } = await searchParams;
  const initialLang = lang === "uk" ? "uk" : "de";
  return <SchnellcheckGuide initialLang={initialLang} />;
}
