import type { EventMetadata } from "@ewatrade/events/metadata"

const ctaActions = ["signup", "contact", "login", "whatsapp"] as const
const demoActions = [
  "navigation",
  "platform",
  "conversation",
  "reply",
  "send_sample",
  "reset",
  "review",
  "confirm_sample",
  "cancel_review",
  "return_chat",
  "pause",
  "play",
  "replay",
  "business",
  "compare",
  "faq",
  "theme",
  "menu_open",
  "menu_close",
  "chat_open",
  "chat_close",
  "guide_message",
  "assistant_message",
  "assistant_answer",
  "assistant_error",
  "registration_start",
  "registration_review",
  "registration_code_sent",
  "registration_confirm",
  "registration_created",
  "registration_error",
  "registration_edit",
  "registration_open_dashboard",
] as const
const channels = [
  "header",
  "menu",
  "hero",
  "assistant",
  "business_ribbon",
  "features",
  "businesses",
  "timeline",
  "availability",
  "pricing",
  "faq",
  "closing",
  "footer",
  "floating",
  "assistant_fab",
] as const
const statuses = [
  "opened",
  "closed",
  "stock_now",
  "count_later",
  "price_piece",
  "price_pack",
] as const
const categories = [
  "web",
  "mobile",
  "whatsapp",
  "setup",
  "sales",
  "product",
  "money",
  "free",
  "starter",
  "growth",
  "pro",
  "poultry",
  "pharmacy",
  "boutique",
  "laundry",
  "bakery",
  "light",
  "dark",
  "assistant",
  "features",
  "businesses",
  "product_day",
  "pricing",
  "faq",
  "contact",
  "support",
  "terms",
  "privacy",
  "billing_policy",
  "delete_account",
  "home",
  "sample",
  "general",
  "help",
] as const

export type MarketingChannel = (typeof channels)[number]
export type MarketingAction =
  | (typeof ctaActions)[number]
  | (typeof demoActions)[number]
export type MarketingCategory = (typeof categories)[number]
export type MarketingTrack = (name: string, properties: EventMetadata) => void

export function marketingAttrs(
  action: MarketingAction,
  channel: MarketingChannel,
  category: MarketingCategory = "general",
  status?: (typeof statuses)[number],
) {
  return {
    "data-marketing-action": action,
    "data-marketing-channel": channel,
    "data-marketing-category": category,
    "data-marketing-status": status,
  }
}

/** Only fixed product labels cross the analytics boundary, never text, URLs or input. */
export function marketingInteraction(input: {
  action?: string | null
  channel?: string | null
  category?: string | null
  status?: string | null
}) {
  const { action, channel, category, status } = input
  if (!action || !channel || !(channels as readonly string[]).includes(channel))
    return null
  const cta = (ctaActions as readonly string[]).includes(action)
  if (!cta && !(demoActions as readonly string[]).includes(action)) return null
  if (category && !(categories as readonly string[]).includes(category))
    return null
  if (status && !(statuses as readonly string[]).includes(status)) return null
  return {
    name: cta ? "marketing_cta_clicked" : "marketing_demo_interacted",
    properties: {
      surface: "marketing",
      action,
      channel,
      category: category || "general",
      ...(status ? { status } : {}),
    } satisfies EventMetadata,
  }
}

export function captureMarketingInteraction(
  track: MarketingTrack,
  input: Parameters<typeof marketingInteraction>[0],
) {
  const event = marketingInteraction(input)
  if (!event) return
  try {
    track(event.name, event.properties)
  } catch {
    /* Collection must never block an action. */
  }
}

export function captureMarketingClick(
  track: MarketingTrack,
  target: EventTarget | null,
) {
  if (!(target instanceof Element)) return
  const control = target.closest<HTMLElement>("a,button,summary")
  if (
    !control ||
    control.matches(":disabled,[aria-disabled=true]") ||
    control.closest("[inert]")
  )
    return
  if (control.dataset.previewPlatform) {
    captureMarketingInteraction(track, {
      action: "platform",
      channel: control.closest(".b-float") ? "floating" : "businesses",
      category: control.dataset.previewPlatform,
    })
    return
  }
  captureMarketingInteraction(track, {
    action: control.dataset.marketingAction,
    channel: control.dataset.marketingChannel,
    category: control.dataset.marketingCategory,
    status:
      control.tagName === "SUMMARY"
        ? control.closest("details")?.open
          ? "closed"
          : "opened"
        : control.dataset.marketingStatus,
  })
}
