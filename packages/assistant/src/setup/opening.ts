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

type Money = (major: number) => string

/** Fallback examples that fit the onboarding profile; generic when unknown. */
const PRODUCT_EXAMPLES: Record<string, (money: Money) => string> = {
  "general-retail-groceries": (m) =>
    `Indomie: ${m(9500)} a carton or ${m(250)} a pack, 15 cartons now.`,
  "animal-feed-agricultural-supplies": (m) =>
    `Eggs: ${m(4500)} a crate or ${m(200)} a piece, 20 crates now.`,
  "fashion-apparel": (m) =>
    `Men's T-shirt: ${m(6000)} each, sizes M, L and XL, 25 now.`,
  "fabrics-tailoring": (m) =>
    `Ankara fabric: ${m(18000)} for 6 yards or ${m(3500)} a yard, 10 pieces now.`,
  "drinks-water-distribution": (m) =>
    `Bottled water: ${m(2800)} a pack of 12 or ${m(300)} a bottle, 40 packs now.`,
  "food-bakery-catering": (m) =>
    `Sliced bread: ${m(1200)} a loaf, 30 loaves now.`,
  "beauty-salon-spa": (m) => `Hair cream: ${m(3500)} a jar, 12 jars now.`,
  "laundry-dry-cleaning": (m) => `Garment bag: ${m(1500)} each, 30 now.`,
  "electronics-phone-shops": (m) => `Phone charger: ${m(4500)} each, 20 now.`,
  "repair-maintenance": (m) =>
    `Engine oil: ${m(8000)} a 4-litre gallon, 10 gallons now.`,
  "pharmacy-health-retail": (m) =>
    `Paracetamol: ${m(800)} a pack or ${m(100)} a card, 30 packs now.`,
  "hardware-building-materials": (m) =>
    `Cement: ${m(9000)} a bag, 80 bags now.`,
  "wholesale-distribution": (m) =>
    `Spaghetti: ${m(19000)} a carton of 20, 50 cartons now.`,
}
const DEFAULT_PRODUCT_EXAMPLE = PRODUCT_EXAMPLES[
  "animal-feed-agricultural-supplies"
] as (money: Money) => string

const SERVICE_EXAMPLES: Record<string, (money: Money) => string> = {
  "beauty-salon-spa": (m) =>
    `"Haircut, ${m(3000)}" or "Braids, priced by style"`,
  "laundry-dry-cleaning": (m) =>
    `"Shirt wash and iron, ${m(500)} each" or "Duvet cleaning, priced by size"`,
  "repair-maintenance": (m) =>
    `"Generator servicing, ${m(15000)}" or "Repairs, priced per job"`,
  "electronics-phone-shops": (m) =>
    `"Phone screen replacement, ${m(25000)}" or "Repairs, priced per job"`,
  "fabrics-tailoring": (m) =>
    `"Sewing a native outfit, ${m(15000)}" or "Adjustments, priced per job"`,
  "food-bakery-catering": (m) =>
    `"Small chops for 50 guests, ${m(75000)}" or "Event catering, priced per event"`,
  "professional-services": (m) =>
    `"Consultation, ${m(20000)} an hour" or "Website design, priced per project"`,
}
const defaultServiceExample = (m: Money) =>
  `"Consultation, ${m(10000)}" or "Repairs, priced per job"`

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

function sharedRules(context: SetupBusinessContext) {
  const answers = context.mediaEnabled
    ? "the owner answers by typing, a voice note in any language, or a photo or file."
    : "the owner answers by typing, in any language. Photos, files and voice notes are switched off: never offer them."
  return `Write plain, warm text in English, as one short chat message of at most about 100 words: no headings, no emojis, at most one short list. Never invent facts about the business beyond the context, never claim anything was saved or created, and do not offer buttons or choices to click: ${answers}`
}

export function setupOpeningInstructions(
  context: SetupBusinessContext,
  firstName: string | null,
  now = new Date(),
) {
  return `You write the first message EwaTrade's Setup Assistant sends a business owner who has just signed up.

Trusted business context (from the server): ${trustedFacts(context, firstName, now)}

The message must:
1. Greet the owner (by first name if known) and name the business.
2. ${context.mediaEnabled ? "Say in one sentence that you can set up their shop with them right here, and that they can type, send a voice note in any language, or send a photo or file such as a price list or record book." : "Say in one sentence that you can set up their shop with them right here in this chat, and that they can type in any language."}
3. Say plainly that nothing here is compulsory and they can stop any time and continue later from the dashboard or in this chat.
4. End with ONE batched question about their main ${context.operatingModel === "services" ? "service: what it is, whether it has a fixed price or is quoted per job, and the price" : "product: how they sell it (one or more ways, such as by piece, crate or bag), the price for each way, how many they have right now, and anything else about it"}. Give one short example that fits this kind of business and uses the ${context.currencyCode} currency.

${sharedRules(context)}`
}

export function setupOpeningFallback(
  context: SetupBusinessContext,
  firstName: string | null,
) {
  const hello = firstName ? `Welcome, ${firstName}!` : "Welcome!"
  const profile = context.businessProfile?.key ?? ""
  const price = (major: number) => money(context.currencyCode, major)
  const question =
    context.operatingModel === "services"
      ? `Let's start with your main service. What is it, and do you charge a fixed price (how much?) or quote per job? For example: ${(SERVICE_EXAMPLES[profile] ?? defaultServiceExample)(price)}.`
      : `Let's start with your main product. How do you sell it (by the piece, crate, bag or more than one way), what is the price for each, and how many do you have right now? Anything else I should know about it? For example: "${(PRODUCT_EXAMPLES[profile] ?? DEFAULT_PRODUCT_EXAMPLE)(price)}"`
  return [
    context.mediaEnabled
      ? `${hello} I'm here to set up ${context.businessName} on EwaTrade with you. You can type, send a voice note in any language, or send a photo or file of your price list or record book.`
      : `${hello} I'm here to set up ${context.businessName} on EwaTrade with you, right here in this chat. Just type, in any language.`,
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

${sharedRules(context)}`
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
  const tellMe = context.mediaEnabled
    ? "Tell me about them in one message, or send a photo or file."
    : "Tell me about them in one message."
  if (next && !followUp?.questions.length)
    lines.push(
      open.length > 1
        ? `Still to set up for ${context.businessName}: ${open.map((entry) => entry.label).join("; ")}. Shall we continue with ${next.label}? ${tellMe}`
        : `Shall we continue with ${next.label}? ${tellMe}`,
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
