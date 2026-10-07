/** Client-safe constants and server-authored copy shared by API and dashboard. */

import type { SetupAttachmentPartData } from "./attachments"
import type { SetupFollowUp } from "./follow-up"

export const SETUP_OFFER_PART = "data-setup-offer" as const
export const SETUP_DRAFT_PART = "data-setup-draft" as const
export const SETUP_RUN_PART = "data-setup-run" as const

export type SetupDraftChange = { revision: number; keys: string[] }

export type SetupAssistantDataParts = {
  "setup-offer": Record<string, never>
  "setup-draft": SetupDraftChange
  "setup-run": { runId: string; remainingRequests: number }
  "setup-attachment": SetupAttachmentPartData
}

export const SETUP_TOOL_LABELS: Record<string, string> = {
  setup_get_context: "Reviewing your setup",
  setup_search_quick_setups: "Looking up typical units",
  setup_search_categories: "Choosing categories",
  setup_draft_upsert_items: "Adding to your setup",
  setup_draft_upsert_customers: "Adding customers",
  setup_draft_upsert_money_accounts: "Adding money accounts",
  setup_set_area: "Updating your setup steps",
  setup_draft_remove: "Removing from your setup",
}

type TextMessage = {
  role: "assistant"
  parts: Array<
    | { type: "text"; text: string }
    | { type: typeof SETUP_OFFER_PART; data: Record<string, never> }
  >
}

function listJoin(items: string[]) {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

/** Next questions first, then what is ready to confirm or add. */
function followUpLines(followUp: SetupFollowUp) {
  const lines: string[] = []
  if (followUp.questions.length)
    lines.push(
      followUp.questions.length === 1
        ? (followUp.questions[0] as string)
        : followUp.questions.map((question) => `- ${question}`).join("\n"),
    )
  const ready = followUp.readyToConfirm + followUp.waitingToAdd
  if (ready)
    lines.push(
      `${plural(ready, "record")} ${ready === 1 ? "is" : "are"} ready in your setup list. Confirm ${ready === 1 ? "it" : "them"} and press Add when you're happy.`,
    )
  return lines
}

export function setupCommitSummaryMessage(input: {
  products: number
  services: number
  customers: number
  balancesPending: number
  failed: number
  followUp?: SetupFollowUp
}): TextMessage {
  const added = [
    input.products ? plural(input.products, "product") : null,
    input.services ? plural(input.services, "service") : null,
    input.customers ? plural(input.customers, "customer") : null,
  ].filter(Boolean)
  const lines = [
    added.length
      ? `Done! Your business now has ${listJoin(added as string[])} from this setup. You can find them in Catalog and Customers, and stock is ready in Inventory.`
      : "Nothing new was added this time.",
  ]
  if (input.balancesPending)
    lines.push(
      `${plural(input.balancesPending, "customer balance")} could not be recorded yet. They are kept in your setup list; check the note there and press Add again.`,
    )
  if (input.failed)
    lines.push(
      `${plural(input.failed, "record")} could not be added. Check the setup list, fix the details and confirm again.`,
    )
  const pending = input.followUp ? followUpLines(input.followUp) : []
  if (pending.length)
    lines.push("Let's finish the rest of your list.", ...pending)
  else lines.push("Tell me if there is anything else you'd like to add.")
  return {
    role: "assistant",
    parts: [{ type: "text", text: lines.join("\n\n") }],
  }
}
