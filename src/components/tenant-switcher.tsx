"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { switchTenant } from "@/lib/tenant-actions";
import type { MembershipView } from "@/lib/memberships";

type Props = {
  memberships: MembershipView[];
  activeTenantId: string;
  activeTenantName: string;
};

const roleLabel = (role: MembershipView["role"]) =>
  role === "bildungstraeger" ? "Bildungsträger" : "Coach";

/**
 * Tenant-Switcher im Header (Membership-Modell Phase 2). Zeigt den aktiven
 * Träger und — sofern vorhanden — die weiteren Mitgliedschaften zum Wechseln.
 * Bietet immer „Bildungsträger gründen" an, damit auch ein Coach mit nur einer
 * Mitgliedschaft seinen eigenen Träger anlegen kann.
 */
export function TenantSwitcher({
  memberships,
  activeTenantId,
  activeTenantName,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const others = memberships.filter((m) => m.tenantId !== activeTenantId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-[12rem] items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
      >
        <span className="truncate font-medium">{activeTenantName}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-zinc-500"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-zinc-300 bg-white py-1 shadow-lg"
        >
          {others.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Wechseln zu
              </div>
              {others.map((m) => (
                <form key={m.tenantId} action={switchTenant}>
                  <input type="hidden" name="tenantId" value={m.tenantId} />
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  >
                    <span className="truncate font-medium text-zinc-900">
                      {m.tenantName}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {roleLabel(m.role)}
                    </span>
                  </button>
                </form>
              ))}
              <div className="my-1 border-t border-zinc-200" />
            </>
          )}
          <Link
            href="/konto/bildungstraeger-gruenden"
            role="menuitem"
            className="block px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            + Bildungsträger gründen
          </Link>
        </div>
      )}
    </div>
  );
}
