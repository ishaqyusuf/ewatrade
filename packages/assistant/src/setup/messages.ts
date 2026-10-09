/** Client-safe constants and server-authored copy shared by API and dashboard. */

import type { SetupFollowUp } from "./follow-up"

export const SETUP_OFFER_PART = "data-setup-offer" as const
export const SETUP_DRAFT_PART = "data-setup-draft" as const
export const SETUP_RUN_PART = "data-setup-run" as const

export type SetupDraftChange = { revision: number; keys: string[] }

export type SetupAssistantDataParts = {
  "setup-offer": Record<string, never>
  "setup-draft": SetupDraftChange
  "setup-run": { remainingRequests: number; runId?: string }
}

export const SETUP_TOOL_LABELS: Record<string, string> = {
  setup_get_context: "Reviewing your setup",
  setup_search_quick_setups: "Looking up typical units",
  setup_search_categories: "Choosing categories",
  setup_draft_upsert_items: "Adding to your setup",
  setup_draft_upsert_customers: "Adding customers",
  setup_draft_remove: "Removing from your setup",
}

export const SETUP_QUICK_PROMPTS = [
  "Here is what I sell…",
  "I offer these services…",
  "These customers owe me money…",
] as const

type TextMessage = {
  role: "assistant"
  parts: Array<
    | { type: "text"; text: string }
    | { type: typeof SETUP_OFFER_PART; data: Record<string, never> }
  >
}

export function setupGreetingMessages(input: {
  businessName: string
  firstName: string | null
  businessType: string | null
}): TextMessage[] {
  const hello = input.firstName ? `Welcome, ${input.firstName}.` : "Welcome."
  const type = input.businessType
    ? ` I see you run a ${input.businessType.toLowerCase()} business.`
    : ""
  return [
    {
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `${hello} ${input.businessName} is ready on EwaTrade.${type}`,
        },
      ],
    },
    {
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Would you like me to set up your products, services, prices, stock and customers for you? Just tell me about your business in your own words, any language is fine. Or you can skip this and set things up yourself.",
        },
        { type: SETUP_OFFER_PART, data: {} },
      ],
    },
  ]
}

export function setupBeginMessage(): TextMessage {
  return {
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Tell me what you sell or the services you offer, with prices and how many you have now if you know. You can list them like:\n\n- Crate of eggs, 4500, 20 crates\n- Broiler chicken, 9000 each\n- Mama Ade owes me 15,000\n\nI'll put everything in a setup list you can check before anything is added.",
      },
    ],
  }
}

export function setupResumeMessage(followUp?: SetupFollowUp): TextMessage {
  const pending = followUp ? followUpLines(followUp) : []
  return {
    role: "assistant",
    parts: [
      {
        type: "text",
        text: pending.length
          ? ["Welcome back. Let's finish your setup list.", ...pending].join(
              "\n\n",
            )
          : "Welcome back. Your setup list is saved. Tell me anything else you sell, prices you'd like to change, or customers to add.",
      },
    ],
  }
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
      ? `Done. Your business now has ${listJoin(added as string[])} from this setup. You can find them in Catalog and Customers, and stock is ready in Inventory.`
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
