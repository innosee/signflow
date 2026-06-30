# Stripe / Billing — Plan (noch NICHT scharf)

> Status: **nur Planung.** Kein Stripe-Code im Repo, keine Billing-Spalten auf
> `tenants`. Stripe wird **bewusst erst nach** „bug-freie Software für Kunde 1"
> scharf geschaltet. Dieses Dokument hält das Modell fest, damit es bereitliegt.
> Verwandt: Memory `project_pricing_model`, `project_stripe_billing_plan`,
> `project_multitenant_live`.

## Preis (zu bestätigen)
- **Signflow für Bildungsträger: €599 / Monat** ⚠️ *Annahme — bitte bestätigen
  (monatlich vs. jährlich).* Bei /Jahr decken €599 die ~€120/Mo Infra-Kosten pro
  Tenant kaum → monatlich ist das wahrscheinliche Modell.
- USt.: klären ob €599 **netto** (B2B üblich) → auf Rechnung + USt./Reverse-Charge
  via **Stripe Tax**.

## Modell (Stripe-Objekte)
| Stripe-Objekt | Bedeutung bei uns |
|---|---|
| **Product** | „Signflow" — ein Product reicht; weitere pro Tarifstufe später |
| **Price** | recurring €599/Monat (ein Price je Stufe×Intervall) |
| **Customer** | **= ein `tenant` (Bildungsträger)** |
| **Subscription** | je Tenant ein Abo auf den €599-Price |

### DB-Mapping (später additiv auf `tenants`)
- `stripe_customer_id` (text, null)
- `stripe_subscription_id` (text, null)
- `plan` / `subscription_status` (enum/text — aus Webhooks gepflegt)
- Migration nach dem etablierten Muster: `drizzle/manual/<datum>-stripe-billing.sql`
  (additiv + idempotent) + `scripts/apply-stripe-billing-migration.mjs`.

## Rabatt (z.B. 50% für einzelne Kunden) = **Coupon**, kein zweiter Price
- **Einen Coupon** anlegen: `percent_off: 50`, Dauer wählen:
  - `forever` → dauerhaft 50% (Partner zahlt immer €299,50)
  - `repeating` + `duration_in_months: X` → z.B. erste 6 Monate
  - `once` → nur erste Rechnung
- Coupon **direkt an die Subscription/den Customer** hängen → **kein Code nötig**,
  Stripe rechnet automatisch −50% und zeigt es **transparent auf jeder Rechnung**.
- Jederzeit entfernbar/änderbar, **ohne** den Listenpreis anzufassen.
- **Variante** (Self-Service-Einlösung): **Promotion Code** (z.B. `PARTNER50`) der
  auf denselben Coupon zeigt — nur wenn Kunden den Code selbst eintippen sollen.
- **Anti-Pattern:** Rabatt NICHT als zweiten €299-Price abbilden → doppelte
  Preispflege + Rechnung sieht aus wie Vollpreis. Coupon hält Listenpreis +
  Nachlass getrennt und nachvollziehbar.

## Scharf-Schalten — Reihenfolge (wenn so weit)
1. Alles im **Stripe Test-Mode** (Test-Keys) anlegen + komplett durchklicken.
2. Integration **hinter Flag** `BILLING_ENABLED` (analog `AFA_SUBMISSION_ENABLED`
   in `src/lib/feature-flags.ts`) — stört Kunde 1 nicht.
3. **Webhooks** (`invoice.paid`, `customer.subscription.updated/deleted`, …) →
   `tenants.subscription_status` pflegen. Signatur-Secret prüfen.
4. **Customer Portal** aktivieren → Kunde verwaltet Zahlungsmittel/Rechnungen selbst.
5. **Stripe Tax** für USt./Reverse-Charge.
6. Tarife in [pricing.tsx](src/components/landing/pricing.tsx) mit echten Beträgen
   nachziehen (heute Platzhalter, `project_pricing_model`).

## Bewusst offen / zu entscheiden
- [ ] €599 **monatlich oder jährlich** (bestätigen)
- [ ] netto/brutto + USt.-Behandlung
- [ ] Tarifstufen final (ein Product vs. mehrere)
- [ ] Trial-Phase ja/nein
- [ ] Zahlungsabbruch-Verhalten (Grace Period / Tenant deaktivieren)
