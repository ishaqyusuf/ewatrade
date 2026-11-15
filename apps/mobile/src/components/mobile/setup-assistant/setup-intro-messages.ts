import { getCurrencySymbol } from "@ewatrade/utils"

export type SetupIntroKind = "product" | "service"

/** The `intro` route param, when Add item opened the chat. */
export function setupIntroKind(value: unknown): SetupIntroKind | null {
  return value === "product" || value === "service" ? value : null
}

/**
 * Static greeting for a chat opened from Add item: written here, not by the
 * model, so it shows at once, costs nothing and reads the same every time.
 * The owner's reply goes to the assistant as usual.
 */
export function setupIntroMessages(
  kind: SetupIntroKind,
  { currencyCode, name }: { currencyCode?: string; name?: string | null },
) {
  const firstName = name?.trim().split(/\s+/)[0]
  const money = getCurrencySymbol(currencyCode || "NGN")
  const greeting = firstName
    ? `Hi ${firstName}, how is your day going?`
    : "Hi, how is your day going?"
  if (kind === "service")
    return [
      greeting,
      "Tell me about the service you want to add and I will set it up for you.",
      `Start with the service name and what you charge. If the price changes by option, list each option with its price. If you quote each job, just say so. For example:\n- Wash and fold, ${money}1,500 per kg\n- Haircut: adults ${money}3,000, kids ${money}2,000`,
    ]
  return [
    greeting,
    "Tell me about the product you want to add and I will set it up for you.",
    `Start with the name, the price and how you sell it. If it has more than one price, list each price and what makes it different. For example:\n- Eggs, ${money}4,500 per crate\n- Rice: 50kg bag ${money}78,000, 25kg bag ${money}40,000`,
  ]
}
