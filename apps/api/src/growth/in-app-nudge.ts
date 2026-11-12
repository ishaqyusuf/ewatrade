// In-app Home card for lifecycle plays (plan §4.2, workstream W2).
//
// The daily sweep (W1) decides eligibility and writes an `in_app` ledger row;
// this module only turns the visible row into card copy. Clients render what
// they get and never decide eligibility themselves.

/** Plays with an in-app surface. Mobile maps each key to its own screen. */
export const IN_APP_NUDGE_KEYS = [
  "first_sale",
  "assistant_channel",
  "site_setup",
  "money_accounts",
] as const
export type InAppNudgeKey = (typeof IN_APP_NUDGE_KEYS)[number]

type NudgeCopy = {
  key: InAppNudgeKey
  title: string
  body: string
  ctaLabel: string
  /** Dashboard path; mobile uses `key` instead. */
  ctaPath: string
}

const NUDGE_COPY: Record<string, NudgeCopy> = {
  P02_first_sale: {
    key: "first_sale",
    title: "Record your first sale",
    body: "Your products are in. Record the next sale you make and EwaTrade starts counting your sales and stock.",
    ctaLabel: "Record a sale",
    ctaPath: "/?orderSheet=create",
  },
  P03_assistant_channel: {
    key: "assistant_channel",
    title: "Check your shop from WhatsApp",
    body: "Connect WhatsApp or Telegram and ask for today's sales or stock from a chat.",
    ctaLabel: "Connect",
    ctaPath: "/account/whatsapp",
  },
  P04_site_setup: {
    key: "site_setup",
    title: "Put your products online",
    body: "Publish a free EwaTrade site so customers can see what you sell and order.",
    ctaLabel: "Publish my site",
    ctaPath: "/storefront",
  },
  P06_money_accounts: {
    key: "money_accounts",
    title: "Keep cash and bank apart",
    body: "Add your bank account next to cash so each sale's money lands in the right place.",
    ctaLabel: "Add an account",
    ctaPath: "/finance/accounts?financeSheet=account",
  },
}

/** The ledger fields the card needs (a subset of W1's `getActiveInAppNudge`). */
export type InAppNudgeRow = { id: string; playId: string }

export type InAppNudge = NudgeCopy & { id: string; playId: string }

/** Ledger play ids may carry a variant suffix, e.g. `"P08_limit:products"`. */
export function toInAppNudge(row: InAppNudgeRow | null): InAppNudge | null {
  if (!row) return null
  const copy = NUDGE_COPY[row.playId.split(":")[0] ?? ""]
  return copy ? { ...copy, id: row.id, playId: row.playId } : null
}
