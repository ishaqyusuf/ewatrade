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

const MORE_INVITES = {
  products:
    "Do you sell anything else? Tell me about all of it in one message: how you sell each item, the price for each way you sell it, and how many you have now.",
  services:
    "Do you offer any other services? Tell me about all of them in one message: what each one is, and its price or whether you quote per job.",
  both: "Do you sell or offer anything else? Tell me about all of it in one message: for each product, how you sell it, the price for each way and how many you have now; for each service, its price or whether you quote per job.",
} as const

/**
 * One batched question for everything else the owner sells (7 October
 * direction), worded for what was just added: services have no stock.
 */
export function setupMoreProductsInvite(
  mediaEnabled: boolean,
  added: keyof typeof MORE_INVITES = "products",
) {
  const ask = MORE_INVITES[added]
  return mediaEnabled
    ? `${ask} You can also send a price list, a photo or a file.`
    : ask
}

export function setupCommitSummaryMessage(input: {
  products: number
  services: number
  /** Products the business uses but does not sell. */
  internalUse?: number
  customers: number
  /** Cash pockets and bank or mobile money accounts. */
  moneyAccounts?: number
  balancesPending: number
  failed: number
  followUp?: SetupFollowUp
  /** A product or service was just added from the chat: ask for the rest at once. */
  inviteMore?: boolean
  /** Photos, files and voice notes are on, so the invite may offer them. */
  mediaEnabled?: boolean
}): TextMessage {
  const internalUse = input.internalUse ?? 0
  const moneyAccounts = input.moneyAccounts ?? 0
  const added = [
    input.products ? plural(input.products, "product") : null,
    input.services ? plural(input.services, "service") : null,
    internalUse
      ? `${internalUse} ${internalUse === 1 ? "item" : "items"} you use`
      : null,
    input.customers ? plural(input.customers, "customer") : null,
    moneyAccounts
      ? `${moneyAccounts} cash and bank ${moneyAccounts === 1 ? "account" : "accounts"}`
      : null,
  ].filter((entry): entry is string => entry !== null)
  const places = [
    input.products || input.services || internalUse ? "Catalog" : null,
    input.customers ? "Customers" : null,
    moneyAccounts ? "Finance" : null,
  ].filter((entry): entry is string => entry !== null)
  const stock = input.products || internalUse
  const lines = [
    added.length
      ? `Done! Your business now has ${listJoin(added)} from this setup. You can find them in ${listJoin(places)}${stock ? ", and stock is ready in Inventory" : ""}.`
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
  else
    lines.push(
      input.inviteMore
        ? setupMoreProductsInvite(
            input.mediaEnabled === true,
            !input.services ? "products" : input.products ? "both" : "services",
          )
        : "Tell me if there is anything else you'd like to add.",
    )
  return {
    role: "assistant",
    parts: [{ type: "text", text: lines.join("\n\n") }],
  }
}
