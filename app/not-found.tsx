import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Seite nicht gefunden
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Die Seite, die du suchst, existiert nicht oder wurde verschoben.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
