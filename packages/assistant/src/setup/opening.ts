/**
 * The assistant's own first message and its welcome-back message on a new
 * visit. Both are written by the model from trusted onboarding facts, with a
 * deterministic fallback when the provider is slow, failing or a rehearsal.
 */
import {
  type SetupAreaProgress,
  nextSetupArea,
  unfinishedSetupAreas,
} from "./areas"
import type { SetupFollowUp } from "./follow-up"
import type { SetupBusinessContext } from "./tools"

export const SETUP_OPENING_MAX_CHARS = 1_200

const CHANNEL_LABELS: Record<string, string> = {
  walk_in: "walk-in customers",
  phone_whatsapp: "phone and WhatsApp orders",
  delivery_pickup: "delivery and pickup",
  online: "online orders",
  sales_representatives: "sales representatives",
}

function money(currencyCode: string, major: number) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(major)
  } catch {
    return `${currencyCode} ${major.toLocaleString("en")}`
  }
}

function trustedFacts(
  context: SetupBusinessContext,
  firstName: string | null,
  now: Date,
) {
  return JSON.stringify({
    ownerFirstName: firstName,
    businessName: context.businessName,
    businessType: context.businessProfile?.title ?? null,
    sells: context.operatingModel,
    orderChannels: (context.orderChannels ?? []).map(
      (channel) => CHANNEL_LABELS[channel] ?? channel,
    ),
    currency: context.currencyCode,
    country: context.countryCode,
    alreadyCreated: context.existing,
    today: now.toISOString().slice(0, 10),
  })
}

const SHARED_RULES =
  "Write plain, warm text in English, as one short chat message of at most about 100 words: no headings, no emojis, at most one short list. Never invent facts about the business beyond the context, never claim anything was saved or created, and do not offer buttons or choices to click: the owner answers by typing, a voice note in any language, or a photo or file."

export function setupOpeningInstructions(
  context: SetupBusinessContext,
  firstName: string | null,
  now = new Date(),
) {
  return `You write the first message EwaTrade's Setup Assistant sends a business owner who has just signed up.

Trusted business context (from the server): ${trustedFacts(context, firstName, now)}

The message must:
1. Greet the owner (by first name if known) and name the business.
2. Say in one sentence that you can set up their shop with them right here, and that they can type, send a voice note in any language, or send a photo or file such as a price list or record book.
3. Say plainly that nothing here is compulsory and they can stop any time and continue later from the dashboard or in this chat.
4. End with ONE batched question about their main ${context.operatingModel === "services" ? "service: what it is, whether it has a fixed price or is quoted per job, and the price" : "product: how they sell it (one or more ways, such as by piece, crate or bag), the price for each way, how many they have right now, and anything else about it"}. Give one short example that fits this kind of business and uses the ${context.currencyCode} currency.

${SHARED_RULES}`
}

export function setupOpeningFallback(
  context: SetupBusinessContext,
  firstName: string | null,
) {
  const hello = firstName ? `Welcome, ${firstName}!` : "Welcome!"
  const question =
    context.operatingModel === "services"
      ? `Let's start with your main service. What is it, and do you charge a fixed price (how much?) or quote per job? For example: "Haircut, ${money(context.currencyCode, 3000)}" or "Repairs, priced per job".`
      : `Let's start with your main product. How do you sell it (by the piece, crate, bag or more than one way), what is the price for each, and how many do you have right now? Anything else I should know about it? For example: "Eggs: ${money(context.currencyCode, 4500)} a crate or ${money(context.currencyCode, 200)} a piece, 20 crates now."`
  return [
    `${hello} I'm here to set up ${context.businessName} on EwaTrade with you. You can type, send a voice note in any language, or send a photo or file of your price list or record book.`,
    "Nothing here is compulsory. You can stop any time and continue later from your dashboard or in this chat.",
    question,
  ].join("\n\n")
}

function progressFacts(
  progress: SetupAreaProgress[],
  followUp: SetupFollowUp | undefined,
) {
  return JSON.stringify({
    areas: progress.map(({ area, label, status, records }) => ({
      area,
      label,
      status,
      records,
    })),
    recordsNeedingDetails: followUp?.needsDetails ?? 0,
    recordsReadyToAdd:
      (followUp?.readyToConfirm ?? 0) + (followUp?.waitingToAdd ?? 0),
    nextQuestions: followUp?.questions ?? [],
  })
}

export function setupWelcomeBackInstructions(
  context: SetupBusinessContext,
  firstName: string | null,
  progress: SetupAreaProgress[],
  followUp: SetupFollowUp | undefined,
  now = new Date(),
) {
  return `You write the message EwaTrade's Setup Assistant shows when a business owner comes back to the setup chat.

Trusted business context (from the server): ${trustedFacts(context, firstName, now)}
Setup progress (from the server): ${progressFacts(progress, followUp)}

The message must:
1. Welcome them back briefly and ask how you can help today.
2. Mention, in a few words, the setup areas still open or started (not the ones DONE or SKIPPED), and any records waiting for details or ready to add.
3. Offer to continue with the next open area by asking its batched question, or with the pending questions listed, in one message. If nothing is open, offer to add more products, customers or accounts, or to change anything.
4. Remind them nothing is compulsory.

${SHARED_RULES}`
}

export function setupWelcomeBackFallback(
  context: SetupBusinessContext,
  firstName: string | null,
  progress: SetupAreaProgress[],
  followUp: SetupFollowUp | undefined,
) {
  const hello = firstName
    ? `Welcome back, ${firstName}! How can I help today?`
    : "Welcome back! How can I help today?"
  const lines = [hello]
  const open = unfinishedSetupAreas(progress)
  const ready = (followUp?.readyToConfirm ?? 0) + (followUp?.waitingToAdd ?? 0)
  if (followUp?.questions.length) lines.push(followUp.questions.join(" "))
  if (ready)
    lines.push(
      `${ready} record${ready === 1 ? " is" : "s are"} ready in your setup list. Confirm and add them whenever you're happy.`,
    )
  const next = nextSetupArea(progress)
  if (next && !followUp?.questions.length)
    lines.push(
      open.length > 1
        ? `Still to set up for ${context.businessName}: ${open.map((entry) => entry.label).join("; ")}. Shall we continue with ${next.label}? Tell me about them in one message, or send a photo or file.`
        : `Shall we continue with ${next.label}? Tell me about them in one message, or send a photo or file.`,
    )
  else if (!next && !followUp?.questions.length && !ready)
    lines.push(
      "Your setup is done. Tell me if you'd like to add more products, customers or accounts, or change anything.",
    )
  lines.push("Nothing is compulsory; stop whenever you like.")
  return lines.join("\n\n")
}

/** Model output is untrusted too: bounded, trimmed, never empty. */
export function cleanSetupOpening(text: string | null | undefined) {
  const value = (text ?? "").replace(/\r/g, "").trim()
  if (value.length < 20) return null
  return value.length > SETUP_OPENING_MAX_CHARS
    ? `${value.slice(0, SETUP_OPENING_MAX_CHARS).trimEnd()}…`
    : value
}
