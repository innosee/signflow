"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";

export type Lang = "de" | "uk";

type Step = {
  num: string;
  title: string;
  body: string;
  // Bildunterschrift unter dem Screenshot — was genau zu sehen ist.
  caption: string;
  // Pfad relativ zu /public — beim Drop einer PNG dort wird der Fallback ausgeblendet.
  imageSrc: string;
};

type Tip = { title: string; body: string };

type Messages = {
  navBack: string;
  langLabelDe: string;
  langLabelUk: string;
  heroEyebrow: string;
  heroTitle: string;
  heroTitleAccent: string;
  heroIntro: string;
  pipelineHeading: string;
  pipelineLead: string;
  pipelineSteps: Array<{ label: string; place: string; desc: string }>;
  bildungstraegerEyebrow: string;
  bildungstraegerTitle: string;
  bildungstraegerLead: string;
  bildungstraegerBullets: string[];
  steps: Step[];
  tipsTitle: string;
  tips: Tip[];
  ctaTitle: string;
  ctaLead: string;
  ctaButtonContact: string;
  ctaButtonLogin: string;
  screenshotMissing: string;
};

const MESSAGES: Record<Lang, Messages> = {
  de: {
    navBack: "← zurück zur Anleitungs-Übersicht",
    langLabelDe: "Deutsch",
    langLabelUk: "Українська",
    heroEyebrow: "Mini-Anleitung · Schnellcheck",
    heroTitle: "Vom Schnellcheck zum fertigen Bericht",
    heroTitleAccent: "in 8 Schritten.",
    heroIntro:
      "Du hast einen Bericht-Entwurf in Word und willst ihn schnell durch den AMDL-Regelcheck schicken — ohne Kurs, ohne Teilnehmer-Datensatz im System? Dafür ist der Schnellcheck. Diese Seite zeigt dir den kompletten Weg, vom Klick im Coach-Dashboard bis zum fertigen Bericht in der Liste des Bildungsträgers.",
    pipelineHeading: "Was beim „Bericht prüfen“ technisch passiert",
    pipelineLead: "Drei Stufen, alle in der EU — Klartext verlässt Deutschland nie:",
    pipelineSteps: [
      {
        label: "Anonymisierung",
        place: "IONOS Frankfurt",
        desc: "Browser → Proxy direkt. Vercel/USA sieht keinen Klartext.",
      },
      {
        label: "Regel-Validierung",
        place: "Azure OpenAI EU",
        desc: "Pseudonymisierter Text wird gegen den AMDL-Katalog geprüft.",
      },
      {
        label: "Rück-Mapping",
        place: "Dein Browser",
        desc: "Platzhalter werden lokal wieder durch Originale ersetzt.",
      },
    ],
    bildungstraegerEyebrow: "Ende der Reise",
    bildungstraegerTitle: "Was der Bildungsträger sieht",
    bildungstraegerLead:
      "Sobald du auf „Bericht einreichen“ klickst, erscheint der Bericht in der zentralen Liste des Bildungsträgers — neben den Kurs-gebundenen Berichten, gekennzeichnet mit einem „Schnellcheck“-Badge.",
    bildungstraegerBullets: [
      "Übersichtsliste unter „Eingereichte Abschlussberichte“ mit Suche nach Name, Kunden-Nr., Coach oder Kurs.",
      "Pro Bericht zwei Aktionen: „Ansehen“ öffnet die Detailseite mit dem fertigen A4-Layout, „PDF“ lädt das druckfertige Dokument direkt.",
      "Ad-hoc-Berichte aus dem Schnellcheck haben keine Kurs-Verknüpfung — TN-Daten kommen aus dem Submit-Formular und werden mit dem Bericht zusammen gespeichert.",
    ],
    steps: [
      {
        num: "01",
        title: "Schnellcheck öffnen",
        body: "Im Coach-Dashboard auf „Berichts-Checker“. Ganz oben siehst du eine schwarze Karte „Schnellzugriff: Schnell-Check“ — Button „Schnell-Check öffnen“ klicken. Du landest auf einer leeren Eingabemaske, kein Kurs nötig.",
        caption:
          "Coach-Dashboard → Berichts-Checker → schwarze Schnellzugriff-Karte oben.",
        imageSrc: "/anleitung/schnellcheck/01-uebersicht.png",
      },
      {
        num: "02",
        title: "Drei Felder ausfüllen",
        body: "Teilnahme & Mitarbeit · Ablauf & Inhalte · Fazit & Empfehlungen. Schreib in normalem Fließtext — kein Layout-Stress, das Format ist standardisiert. Autosave läuft im Browser mit, ein versehentlicher Tab-Schluss ist unkritisch. Die Live-Sidebar rechts zeigt schon beim Tippen, welche Pflichtbausteine erkannt wurden.",
        caption:
          "Drei Textareas links, Live-Sidebar rechts mit Pflichtbaustein-Status.",
        imageSrc: "/anleitung/schnellcheck/02-felder.png",
      },
      {
        num: "03",
        title: "„Bericht prüfen“ klicken",
        body: "Schwarzer Button unten rechts. Erste Prüfung dauert ca. 6 Sekunden. Sidebar wechselt vom Live-Modus in einen Fortschrittsbalken: Anonymisierung → Validierung → Feedback → Ergebnis. Wenn etwas hakt, siehst du dort die exakte Fehlermeldung plus einen Direktlink zur Verbindungsdiagnose.",
        caption:
          "Pipeline-Fortschritt: drei grüne Häkchen + Verdict am Ende.",
        imageSrc: "/anleitung/schnellcheck/03-pruefen.png",
      },
      {
        num: "04",
        title: "Sidebar Stück für Stück abarbeiten",
        body: "Pro Verstoß erscheint rechts eine Karte mit Zitat aus deinem Text und konkretem Umformulierungs-Vorschlag. Drei Möglichkeiten: „Im Text übernehmen“ tauscht die Stelle direkt im Editor, „Im Text markieren“ springt zur Stelle und legt den Vorschlag in die Zwischenablage, oder Checkbox abhaken wenn du es manuell anders gelöst hast.",
        caption:
          "Verstoß-Karten in der Sidebar mit Zitat, Vorschlag und Aktions-Buttons.",
        imageSrc: "/anleitung/schnellcheck/04-sidebar.png",
      },
      {
        num: "05",
        title: "Erneut prüfen",
        body: "Sind alle Karten abgehakt oder übernommen, oben rechts „Bericht erneut prüfen“. Stellen, die das Modell trotz Übernahme nochmal anmäkelt, bekommen einen grauen Badge „schon übernommen“ — meist LLM-Rauschen, kannst du ignorieren. Sobald Status „pass“ steht, erscheinen unten zwei grüne Buttons: „Als PDF exportieren“ und „An Bildungsträger einreichen“.",
        caption:
          "Status „pass“ — zwei grüne Action-Buttons werden sichtbar.",
        imageSrc: "/anleitung/schnellcheck/05-recheck.png",
      },
      {
        num: "06",
        title: "An Bildungsträger einreichen",
        body: "Klick auf „An Bildungsträger einreichen“. Zwischen Editor und Footer öffnet sich ein kompaktes Formular für die TN-Daten: Vorname, Nachname (beide Pflicht), optional Kunden-Nr., AVGS-Nummer, Zeitraum, Gesamt-UE. Diese Felder werden direkt mit dem Bericht persistiert — der Bildungsträger sieht sie später in der Liste und in der Detailansicht. Mit „Bericht einreichen →“ abschicken.",
        caption:
          "Submit-Form mit 6 Feldern; Vorname und Nachname sind Pflicht.",
        imageSrc: "/anleitung/schnellcheck/06-einreichen.png",
      },
      {
        num: "07",
        title: "Erfolgs-Banner — fertig",
        body: "Nach erfolgreichem Submit erscheint ein grünes Banner „Bericht eingereicht“. Der Bericht ist jetzt beim Bildungsträger. Für den nächsten Bericht klickst du auf „Neuer Bericht“ (löscht den lokalen Entwurf inkl. Result-Cache und macht die Eingabemaske frei). Alternativ: vor dem Submit „Als PDF exportieren“ — wenn du den Bericht selbst weiterverwenden willst, ohne Submission.",
        caption:
          "Grünes Erfolgs-Banner mit Hinweis auf die Bildungsträger-Übersicht.",
        imageSrc: "/anleitung/schnellcheck/07-fertig.png",
      },
      {
        num: "08",
        title: "Bildungsträger sieht den Bericht",
        body: "Im Bildungsträger-Bereich unter „Eingereichte Abschlussberichte“ erscheint dein Bericht oben in der Liste — mit einem grauen „Schnellcheck“-Badge neben dem TN-Namen, damit klar ist: ad-hoc, nicht aus einem Kurs. Über „Ansehen“ öffnet sich die A4-pixelgenaue Detailansicht, „PDF“ lädt das druckfertige Dokument direkt herunter.",
        caption:
          "Bildungsträger-Liste mit „Schnellcheck“-Badge, Ansehen + PDF Buttons.",
        imageSrc: "/anleitung/schnellcheck/08-bt-liste.png",
      },
    ],
    tipsTitle: "Drei Tipps aus dem Pilot-Betrieb",
    tips: [
      {
        title: "Daten verlassen nie Deutschland",
        body: "Klartext geht nur zur Anonymisierungs-VM in Frankfurt. Ab dort sieht Vercel/USA und das Azure-Modell ausschließlich pseudonymisierten Text. Browser merkt sich die Mapping-Tabelle lokal und ersetzt Platzhalter beim Anzeigen wieder durch Originale.",
      },
      {
        title: "Kurze Texte = bessere Treffer",
        body: "Pro Sektion 4–8 Sätze reichen für saubere Ergebnisse. Sehr lange Texte verwässern die Regelprüfung — die KI fokussiert dann auf Stilfragen statt auf inhaltliche Pflichtbausteine.",
      },
      {
        title: "Mehr als zwei Recheck-Durchgänge brauchen die wenigsten Berichte",
        body: "Erstprüfung läuft, dann arbeitest du die Verstöße in der Sidebar einzeln ab — pro Stelle „Im Text übernehmen“ oder manuell anpassen. Erst wenn alle erledigt sind: ein einziger Re-Check zur Bestätigung. Falls das Modell danach noch was anmäkelt: graue „schon übernommen“-Badges sind meist LLM-Rauschen.",
      },
    ],
    ctaTitle: "Fragen oder hängt was?",
    ctaLead:
      "Direkter Draht zum Team. Bug-Reports, Wünsche, Onboarding für neue Coaches — meist Antwort am gleichen Werktag.",
    ctaButtonContact: "info@innosee.de",
    ctaButtonLogin: "Zum Login →",
    screenshotMissing: "Screenshot folgt",
  },

  uk: {
    navBack: "← повернутися до огляду інструкцій",
    langLabelDe: "Deutsch",
    langLabelUk: "Українська",
    heroEyebrow: "Міні-інструкція · Schnellcheck",
    heroTitle: "Від швидкої перевірки до готового звіту",
    heroTitleAccent: "за 8 кроків.",
    heroIntro:
      "У вас є чернетка звіту у Word і ви хочете швидко прогнати її через перевірку правил AMDL — без курсу, без запису учасника в системі? Саме для цього існує Schnellcheck (швидка перевірка). На цій сторінці показано весь шлях: від кліку в дашборді коуча до готового звіту у списку освітнього провайдера (Bildungsträger).",
    pipelineHeading: "Що технічно відбувається при «Bericht prüfen»",
    pipelineLead:
      "Три етапи, усі в межах ЄС — відкритий текст ніколи не залишає Німеччину:",
    pipelineSteps: [
      {
        label: "Анонімізація",
        place: "IONOS Франкфурт",
        desc: "Браузер → проксі напряму. Vercel/США не бачать відкритого тексту.",
      },
      {
        label: "Перевірка правил",
        place: "Azure OpenAI EU",
        desc: "Псевдонімізований текст перевіряється за каталогом AMDL.",
      },
      {
        label: "Зворотне зіставлення",
        place: "Ваш браузер",
        desc: "Заглушки локально знову замінюються на оригінали.",
      },
    ],
    bildungstraegerEyebrow: "Кінець подорожі",
    bildungstraegerTitle: "Що бачить освітній провайдер",
    bildungstraegerLead:
      "Щойно ви натиснете «Bericht einreichen» (Подати звіт), він з’явиться у централізованому списку освітнього провайдера — поруч зі звітами, прив’язаними до курсу, але з міткою «Schnellcheck».",
    bildungstraegerBullets: [
      "Список «Eingereichte Abschlussberichte» (Подані заключні звіти) з пошуком за іменем, номером клієнта, коучем або курсом.",
      "По кожному звіту дві дії: «Ansehen» (Переглянути) відкриває детальну сторінку у форматі A4, «PDF» завантажує готовий до друку документ напряму.",
      "Ad-hoc-звіти зі Schnellcheck не мають прив’язки до курсу — дані учасника беруться з форми подання та зберігаються разом зі звітом.",
    ],
    steps: [
      {
        num: "01",
        title: "Відкрити Schnellcheck",
        body: "У дашборді коуча натисніть «Berichts-Checker» (Перевірка звітів). Угорі ви побачите чорну картку «Schnellzugriff: Schnell-Check» — натисніть кнопку «Schnell-Check öffnen». Відкриється порожня форма, курс не потрібен.",
        caption:
          "Дашборд коуча → Berichts-Checker → чорна картка швидкого доступу вгорі.",
        imageSrc: "/anleitung/schnellcheck/01-uebersicht.png",
      },
      {
        num: "02",
        title: "Заповнити три поля",
        body: "Teilnahme & Mitarbeit (Участь і співпраця) · Ablauf & Inhalte (Перебіг і зміст) · Fazit & Empfehlungen (Висновок і рекомендації). Пишіть звичайним суцільним текстом — про оформлення турбуватися не треба, формат стандартизований. Автозбереження працює у браузері, випадкове закриття вкладки не страшне. Бічна панель праворуч уже під час набору показує, які обов’язкові розділи виявлено.",
        caption:
          "Три текстові поля ліворуч, бічна панель праворуч зі статусом обов’язкових розділів.",
        imageSrc: "/anleitung/schnellcheck/02-felder.png",
      },
      {
        num: "03",
        title: "Натиснути «Bericht prüfen» (Перевірити звіт)",
        body: "Чорна кнопка внизу праворуч. Перша перевірка триває близько 6 секунд. Бічна панель перемикається з живого режиму на індикатор прогресу: Анонімізація → Валідація → Зворотний зв’язок → Результат. Якщо щось зависло, ви побачите там точне повідомлення про помилку плюс пряме посилання на діагностику з’єднання.",
        caption:
          "Прогрес пайплайну: три зелені галочки + підсумок наприкінці.",
        imageSrc: "/anleitung/schnellcheck/03-pruefen.png",
      },
      {
        num: "04",
        title: "Опрацьовувати бічну панель крок за кроком",
        body: "По кожному порушенню праворуч з’являється картка з цитатою з вашого тексту та конкретною пропозицією переформулювання. Три варіанти: «Im Text übernehmen» (Застосувати) замінює фрагмент прямо в редакторі, «Im Text markieren» (Виділити) переходить до фрагмента і копіює пропозицію у буфер обміну, або просто позначте чекбокс, якщо ви вирішили це інакше вручну.",
        caption:
          "Картки порушень у бічній панелі: цитата, пропозиція, кнопки дій.",
        imageSrc: "/anleitung/schnellcheck/04-sidebar.png",
      },
      {
        num: "05",
        title: "Перевірити ще раз",
        body: "Коли всі картки позначені або застосовані, угорі праворуч натисніть «Bericht erneut prüfen» (Перевірити знову). Місця, які модель знову позначає попри застосовану зміну, отримують сірий бейдж «schon übernommen» (вже застосовано) — здебільшого це шум LLM, його можна ігнорувати. Як тільки статус «pass» (пройдено) — внизу з’являються дві зелені кнопки: «Als PDF exportieren» (Експорт у PDF) та «An Bildungsträger einreichen» (Подати освітньому провайдеру).",
        caption:
          "Статус «pass» — стають видимими дві зелені кнопки дій.",
        imageSrc: "/anleitung/schnellcheck/05-recheck.png",
      },
      {
        num: "06",
        title: "Подати освітньому провайдеру",
        body: "Натисніть «An Bildungsträger einreichen». Між редактором і нижньою панеллю відкриється компактна форма для даних учасника: ім’я, прізвище (обидва обов’язкові), за бажанням номер клієнта (Kunden-Nr.), номер AVGS, період (Zeitraum), загальна кількість UE (навчальних одиниць). Ці поля зберігаються разом зі звітом — освітній провайдер побачить їх у списку та на детальній сторінці. Натисніть «Bericht einreichen →», щоб надіслати.",
        caption:
          "Форма подання з 6 полями; ім’я та прізвище обов’язкові.",
        imageSrc: "/anleitung/schnellcheck/06-einreichen.png",
      },
      {
        num: "07",
        title: "Банер успіху — готово",
        body: "Після успішного надсилання з’являється зелений банер «Bericht eingereicht» (Звіт подано). Звіт уже в освітнього провайдера. Для наступного звіту натисніть «Neuer Bericht» (Новий звіт) — це очистить локальну чернетку разом з кешем результату та звільнить форму. Альтернатива: до подання натисніть «Als PDF exportieren», якщо хочете самі використати звіт без надсилання.",
        caption:
          "Зелений банер успіху з посиланням на огляд освітнього провайдера.",
        imageSrc: "/anleitung/schnellcheck/07-fertig.png",
      },
      {
        num: "08",
        title: "Освітній провайдер бачить звіт",
        body: "У розділі освітнього провайдера під «Eingereichte Abschlussberichte» (Подані заключні звіти) ваш звіт з’явиться вгорі списку — із сірим бейджем «Schnellcheck» поряд з іменем учасника, щоб було зрозуміло: ad-hoc, не з курсу. «Ansehen» відкриває детальний вигляд із піксельно точним макетом A4, «PDF» завантажує готовий до друку документ напряму.",
        caption:
          "Список освітнього провайдера з бейджем «Schnellcheck», кнопками Ansehen + PDF.",
        imageSrc: "/anleitung/schnellcheck/08-bt-liste.png",
      },
    ],
    tipsTitle: "Три поради з пілотного режиму",
    tips: [
      {
        title: "Дані ніколи не залишають Німеччину",
        body: "Відкритий текст йде лише до VM анонімізації у Франкфурті. Далі Vercel/США та модель Azure бачать виключно псевдонімізований текст. Браузер локально пам’ятає таблицю зіставлення та повертає оригінали при відображенні.",
      },
      {
        title: "Короткі тексти = кращі результати",
        body: "На розділ достатньо 4–8 речень, щоб отримати чіткі результати. Дуже довгі тексти розпорошують перевірку правил — тоді ШІ фокусується на стилі замість змістовних обов’язкових розділів.",
      },
      {
        title: "Більш ніж два повторні прогони — рідкість",
        body: "Перша перевірка пройшла, потім ви по черзі опрацьовуєте порушення в бічній панелі — по кожному фрагменту «Im Text übernehmen» або правка вручну. Лише коли все готово: один єдиний повторний прогін на підтвердження. Якщо модель після цього щось ще критикує — сірі бейджі «schon übernommen» здебільшого є шумом LLM.",
      },
    ],
    ctaTitle: "Питання або щось зависло?",
    ctaLead:
      "Прямий зв’язок із командою. Звіти про баги, побажання, онбординг нових коучів — зазвичай відповідь у той самий робочий день.",
    ctaButtonContact: "info@innosee.de",
    ctaButtonLogin: "До входу →",
    screenshotMissing: "Скріншот буде додано",
  },
};

export function SchnellcheckGuide({ initialLang }: { initialLang: Lang }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);
  const t = MESSAGES[lang];

  function setLang(next: Lang) {
    if (next === lang) return;
    setLangState(next);
    // URL aktualisieren, damit der Link teilbar bleibt; ohne Scroll-Sprung,
    // damit der Leser an seiner aktuellen Stelle bleibt. Vollständigen
    // Pfad mitgeben, damit relative Auflösung nicht stolpert.
    const target =
      next === "de"
        ? "/anleitung/schnellcheck"
        : "/anleitung/schnellcheck?lang=uk";
    router.replace(target, { scroll: false });
  }

  return (
    <div lang={lang} className="flex min-h-screen flex-col bg-white text-zinc-900">
      <LandingNav />
      <main className="flex-1">
        <Hero t={t} lang={lang} setLang={setLang} />
        <PipelineCard t={t} />
        <StepsList t={t} />
        <BildungstraegerSection t={t} />
        <TipsSection t={t} />
        <Cta t={t} />
      </main>
      <LandingFooter />
    </div>
  );
}

function Hero({
  t,
  lang,
  setLang,
}: {
  t: Messages;
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  return (
    <section className="border-b border-zinc-200 bg-linear-to-b from-zinc-50 to-white">
      <div className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Link
            href="/anleitung"
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            {t.navBack}
          </Link>
          <LangToggle lang={lang} setLang={setLang} t={t} />
        </div>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t.heroEyebrow}
        </span>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-5xl">
          {t.heroTitle}{" "}
          <span className="text-zinc-500">{t.heroTitleAccent}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
          {t.heroIntro}
        </p>
      </div>
    </section>
  );
}

function LangToggle({
  lang,
  setLang,
  t,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Messages;
}) {
  return (
    <div
      role="group"
      aria-label="Sprache / Мова"
      className="inline-flex shrink-0 rounded-full border border-zinc-300 bg-white p-1 text-xs font-medium"
    >
      <LangButton
        active={lang === "de"}
        onClick={() => setLang("de")}
        label={t.langLabelDe}
        flag="🇩🇪"
      />
      <LangButton
        active={lang === "uk"}
        onClick={() => setLang("uk")}
        label={t.langLabelUk}
        flag="🇺🇦"
      />
    </div>
  );
}

function LangButton({
  active,
  onClick,
  label,
  flag,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  flag: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-zinc-900 px-3 py-1 text-white"
          : "rounded-full px-3 py-1 text-zinc-600 hover:text-zinc-900"
      }
    >
      <span aria-hidden className="mr-1.5">
        {flag}
      </span>
      {label}
    </button>
  );
}

function PipelineCard({ t }: { t: Messages }) {
  return (
    <section className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-xl border border-zinc-300 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-950">
            {t.pipelineHeading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            {t.pipelineLead}
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {t.pipelineSteps.map((s, i) => (
              <li
                key={s.label}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <div className="text-sm font-semibold text-zinc-950">
                    {s.label}
                  </div>
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                  {s.place}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                  {s.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function StepsList({ t }: { t: Messages }) {
  return (
    <section className="border-b border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
        <ol className="space-y-6">
          {t.steps.map((s) => (
            <li
              key={s.num}
              className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7"
            >
              <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                <div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                    {s.num}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-zinc-950">
                    {s.title}
                  </h3>
                </div>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-zinc-700">
                    {s.body}
                  </p>
                  <ScreenshotSlot
                    src={s.imageSrc}
                    alt={s.caption}
                    fallbackLabel={t.screenshotMissing}
                    stepNum={s.num}
                  />
                  <p className="mt-2 text-xs italic text-zinc-500">
                    {s.caption}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ScreenshotSlot({
  src,
  alt,
  fallbackLabel,
  stepNum,
}: {
  src: string;
  alt: string;
  fallbackLabel: string;
  stepNum: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
      {failed ? (
        <FallbackMockup label={fallbackLabel} stepNum={stepNum} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- Optional asset, kann fehlen; <img> erlaubt onError-Fallback ohne Build-Bruch.
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="block h-auto w-full"
          loading="lazy"
        />
      )}
    </div>
  );
}

function FallbackMockup({
  label,
  stepNum,
}: {
  label: string;
  stepNum: string;
}) {
  return (
    <svg
      role="img"
      aria-label={`${label} — ${stepNum}`}
      viewBox="0 0 800 480"
      className="block h-auto w-full"
    >
      <rect width="800" height="480" fill="#f4f4f5" />
      <rect
        x="20"
        y="20"
        width="760"
        height="36"
        rx="6"
        fill="#e4e4e7"
      />
      <circle cx="44" cy="38" r="6" fill="#f43f5e" />
      <circle cx="64" cy="38" r="6" fill="#f59e0b" />
      <circle cx="84" cy="38" r="6" fill="#10b981" />
      <rect
        x="120"
        y="28"
        width="640"
        height="20"
        rx="10"
        fill="#fafafa"
      />
      <rect
        x="20"
        y="76"
        width="760"
        height="384"
        rx="8"
        fill="#ffffff"
        stroke="#d4d4d8"
      />
      <text
        x="400"
        y="240"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="14"
        fill="#71717a"
      >
        {label}
      </text>
      <text
        x="400"
        y="270"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="56"
        fontWeight="600"
        fill="#27272a"
      >
        {stepNum}
      </text>
    </svg>
  );
}

function BildungstraegerSection({ t }: { t: Messages }) {
  return (
    <section className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {t.bildungstraegerEyebrow}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          {t.bildungstraegerTitle}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
          {t.bildungstraegerLead}
        </p>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {t.bildungstraegerBullets.map((b, i) => (
            <li
              key={i}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-relaxed text-zinc-700"
            >
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TipsSection({ t }: { t: Messages }) {
  return (
    <section className="border-b border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-950">
          {t.tipsTitle}
        </h2>
        <ul className="mt-8 grid gap-5 md:grid-cols-3">
          {t.tips.map((tip) => (
            <li
              key={tip.title}
              className="rounded-xl border border-zinc-200 bg-white p-6"
            >
              <h3 className="text-base font-semibold text-zinc-950">
                {tip.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                {tip.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Cta({ t }: { t: Messages }) {
  return (
    <section className="bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-14 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            {t.ctaTitle}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            {t.ctaLead}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="mailto:info@innosee.de"
            className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
          >
            {t.ctaButtonContact}
          </a>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:text-white"
          >
            {t.ctaButtonLogin}
          </Link>
        </div>
      </div>
    </section>
  );
}
