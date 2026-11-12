// Revenue lifecycle emails (plan §3 plays P08–P12 and the feature-intent
// email P16), gallery numbers 30–35. Each template turns a play decision's
// `data` (packages/growth/src/plays/revenue) into founder-voice content for
// W1's `LifecycleLayout`: their number in the first line, one button, subject
// under 45 characters, and only claims the product and plan catalogue back.

import type { LifecycleEmailContent } from "../components/lifecycle-layout"
import {
  LIFECYCLE_SUBJECT_MAX,
  type LifecycleTemplate,
  type LifecycleTemplateInput,
} from "./lifecycle-adoption"

type Data = LifecycleTemplateInput["data"]

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

const str = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback

const n = (value: number) => value.toLocaleString("en-NG")

const fits = (preferred: string, fallback: string) =>
  preferred.length <= LIFECYCLE_SUBJECT_MAX ? preferred : fallback

function shell(
  input: LifecycleTemplateInput,
  content: Omit<
    LifecycleEmailContent,
    "businessName" | "firstName" | "unsubscribeUrl" | "preferencesUrl" | "cta"
  >,
): LifecycleEmailContent {
  return {
    ...content,
    businessName: input.businessName,
    firstName: input.firstName,
    // The play already chose the label for the checkout state.
    cta: { href: input.ctaHref, label: str(input.data.ctaLabel, "See plans") },
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesUrl: input.preferencesUrl,
  }
}

/** Plain nouns per P08 limit; the catalogue's "orders a month" reads badly here. */
const LIMIT_NOUNS: Record<string, [one: string, many: string]> = {
  ordersPerMonth: ["order", "orders"],
  products: ["product", "products"],
  staff: ["staff account", "staff accounts"],
  storefrontItems: ["site item", "site items"],
  offlineDevices: ["offline device", "offline devices"],
}

function limitNoun(data: Data, count: number) {
  const [one, many] = LIMIT_NOUNS[str(data.limit)] ?? ["item", "items"]
  return count === 1 ? one : many
}

/** "Starter includes unlimited orders a month for ₦5,000/month." */
function recommendation(data: Data) {
  return `${str(data.recommendedPlanName, "The next plan")} includes ${str(data.recommendedLimitLabel, "more")} for ${str(data.recommendedPriceLabel, "a monthly fee")}.`
}

/** What to do next, true for both checkout states. */
function upgradePath(data: Data) {
  return data.checkoutAvailable
    ? "You can upgrade from Plan and billing and pay by card."
    : "Plan and billing shows what each plan includes."
}

/** What stops at 100%, per limit. Matches the product's limit checks. */
function atLimit(data: Data, planName: string) {
  const resetsOn = str(data.resetsOn)
  switch (str(data.limit)) {
    case "ordersPerMonth":
      return `New orders can't be recorded on ${planName} until the count resets on ${resetsOn}. Everything already recorded stays as it is.`
    case "products":
      return `You can't add another product on ${planName} until you archive one. Your current products keep selling.`
    case "staff":
      return `You can't invite another staff member on ${planName}. Everyone already invited keeps their access.`
    case "storefrontItems":
      return `Your site shows the first ${n(num(data.cap))} items. Anything after that stays in your catalog but not online.`
    default:
      return `You can't add another one on ${planName}.`
  }
}

/** 30 · P08 at 90% of a plan limit. */
export const limitWarningEmail: LifecycleTemplate = (input) => {
  const { data } = input
  const used = num(data.used)
  const cap = num(data.cap)
  const planName = str(data.planName, "your plan")
  const noun = limitNoun(data, cap)
  const monthly = str(data.limit) === "ordersPerMonth"
  return {
    subject: `${n(used)} of ${n(cap)} ${noun} used${monthly ? " this month" : ""}`,
    content: shell(input, {
      preview: `${n(num(data.left))} left on ${planName}. Here's what happens at ${n(cap)}.`,
      lead: monthly
        ? `${input.businessName} has recorded ${n(used)} of the ${n(cap)} orders ${planName} includes this month.`
        : `${input.businessName} is using ${n(used)} of the ${n(cap)} ${noun} ${planName} includes.`,
      stat: { label: `${planName} ${noun}`, value: `${n(used)} of ${n(cap)}` },
      body: [
        monthly
          ? `At ${n(cap)}, new orders wait until ${str(data.resetsOn)}, when the count resets.`
          : `At ${n(cap)}, you won't be able to add another until you remove one or change plan.`,
        `${recommendation(data)} ${upgradePath(data)}`,
      ],
    }),
  }
}

/** 31 · P08 at 100%: the plan comparison. Transactional. */
export const limitReachedEmail: LifecycleTemplate = (input) => {
  const { data } = input
  const cap = num(data.cap)
  const planName = str(data.planName, "your plan")
  const noun = limitNoun(data, cap)
  const monthly = str(data.limit) === "ordersPerMonth"
  return {
    subject: fits(
      `You've reached ${n(cap)} ${noun} on ${planName}`,
      `You've reached your ${planName} limit`,
    ),
    content: shell(input, {
      preview: `What changes now, and what ${str(data.recommendedPlanName, "the next plan")} includes.`,
      lead: `${input.businessName} has reached the ${n(cap)} ${noun} ${planName} includes${monthly ? " this month" : ""}.`,
      stat: {
        label: `${planName} → ${str(data.recommendedPlanName, "next plan")}`,
        value: `${n(cap)} → ${str(data.recommendedLimitLabel, "more")}`,
      },
      body: [
        atLimit(data, planName),
        `${recommendation(data)} ${upgradePath(data)}`,
      ],
    }),
  }
}

/** 32 · P09 success milestones. */
export const successMilestoneEmail: LifecycleTemplate = (input) => {
  const { data } = input
  const milestone = str(data.milestone)
  const sales = str(data.salesThisMonth)
  const nextLine = str(data.nextPlanLine)
  let subject: string
  let lead: string
  let stat: LifecycleEmailContent["stat"]
  if (milestone === "orders_100") {
    const orders = num(data.ordersTotal)
    subject = "100 orders on EwaTrade"
    lead = `${input.businessName} passed 100 orders on EwaTrade this week. You're at ${n(orders)} now.`
    stat = { label: "Orders recorded", value: n(orders) }
  } else if (milestone === "sales_3x") {
    subject = fits(
      `${sales} in sales so far this month`,
      "A big month on EwaTrade",
    )
    lead = `${input.businessName} has sold ${sales} so far this month. Your usual month is ${str(data.usualMonth)}.`
    stat = { label: "Sales this month", value: sales }
  } else {
    subject = fits(`${sales} is your best month yet`, "Your best month yet")
    lead = `${input.businessName} has sold ${sales} this month, more than any month before. Your best until now was ${str(data.bestPriorMonth)}.`
    stat = { label: "Sales this month", value: sales }
  }
  return {
    subject,
    content: shell(input, {
      preview: "Congratulations. Your numbers are below.",
      lead,
      stat,
      body: [
        "Congratulations. That took a lot of work.",
        `${nextLine} If you're happy where you are, there's nothing you need to do.`,
      ],
    }),
  }
}

/** 33 · P12 second business. */
export const secondBusinessEmail: LifecycleTemplate = (input) => {
  const { data } = input
  const orders = num(data.ordersLast7)
  const included = num(data.businessesIncluded)
  const planLine = data.needsUpgrade
    ? `${str(data.recommendedPlanName, "Growth")} includes ${n(included)} businesses for ${str(data.recommendedPriceLabel, "a monthly fee")}. ${upgradePath(data)}`
    : `${str(data.planName, "Your plan")} already includes ${n(included)} businesses, so you can add one now.`
  return {
    subject: "Running a second shop?",
    content: shell(input, {
      preview: `${n(orders)} orders in 7 days. If a second shop is next, it fits in the same account.`,
      lead: `${input.businessName} recorded ${n(orders)} orders in the last 7 days.`,
      body: [
        "At that pace, some owners open a second shop or stall. If you do, you can run it from the same EwaTrade login, with its own stock and sales.",
        planLine,
        "If that's not in your plans, you can ignore this email.",
      ],
    }),
  }
}

/** 34 · P16 feature intent: once, 24h after the third See plans tap. */
export const featureIntentEmail: LifecycleTemplate = (input) => {
  const { data } = input
  const label = str(data.featureLabel, "a paid feature")
  const lower = label.charAt(0).toLowerCase() + label.slice(1)
  const plan = str(data.recommendedPlanName, "a paid plan")
  return {
    subject: fits(`You looked at ${lower}`, "You looked at a paid feature"),
    content: shell(input, {
      preview: `It comes with ${plan}. Here's what that costs.`,
      lead: `You've opened ${lower} ${n(num(data.taps))} times on ${input.businessName}, and it isn't on the ${str(data.planName, "current")} plan.`,
      body: [
        `${label} comes with ${plan}, which is ${str(data.recommendedPriceLabel, "a monthly plan")}. ${upgradePath(data)}`,
        "If you were only looking, that's fine. I won't email you about it again.",
      ],
    }),
  }
}

/** Offer lines for P10 and P11, in the order the play chose. */
function capOffers(data: Data) {
  const offers = str(data.offers).split(",")
  const lines: string[] = []
  for (const offer of offers) {
    if (offer === "upgrade_starter")
      lines.push(
        `Starter gives you ${n(num(data.starterReplies))} replies a month, ${n(num(data.starterMultiple))} times what Free includes, for ${str(data.starterPriceLabel, "₦5,000/month")}.`,
      )
    if (offer === "top_up")
      lines.push("A top-up adds replies for the rest of this month.")
    if (offer === "telegram")
      lines.push(
        data.telegramLinked
          ? "Your Telegram assistant is already connected, and replies there don't count toward the WhatsApp limit."
          : "You can also connect Telegram. Replies there don't count toward the WhatsApp limit.",
      )
  }
  return lines
}

/** 35 · P10: 80% of the month's WhatsApp replies used. */
export const whatsappWarningEmail: LifecycleTemplate = (input) => {
  const { data } = input
  const left = num(data.left)
  return {
    subject: `${n(left)} WhatsApp replies left this month`,
    content: shell(input, {
      preview: `The count resets on ${str(data.resetsOn)}.`,
      lead: `Your assistant has used ${n(num(data.used))} of ${n(num(data.cap))} WhatsApp replies for ${input.businessName} this month.`,
      stat: { label: "WhatsApp replies left", value: n(left) },
      body: [`The count resets on ${str(data.resetsOn)}.`, ...capOffers(data)],
    }),
  }
}

/** 36 · P11: the month's WhatsApp replies are used up. Transactional. */
export const whatsappExhaustedEmail: LifecycleTemplate = (input) => {
  const { data } = input
  const cap = num(data.cap)
  return {
    subject: `You've used all ${n(cap)} WhatsApp replies`,
    content: shell(input, {
      preview: `WhatsApp replies start again on ${str(data.resetsOn)}. Telegram works tonight.`,
      lead: `Your assistant has used all ${n(cap)} WhatsApp replies for ${input.businessName} this month.`,
      body: [
        `It won't reply on WhatsApp again until the count resets on ${str(data.resetsOn)}.`,
        ...capOffers(data),
      ],
    }),
  }
}

/** Keyed by the plays' `templateKey`. */
export const LIFECYCLE_REVENUE_TEMPLATES = {
  "lifecycle-limit-warning": limitWarningEmail,
  "lifecycle-limit-reached": limitReachedEmail,
  "lifecycle-success-milestone": successMilestoneEmail,
  "lifecycle-second-business": secondBusinessEmail,
  "lifecycle-feature-intent": featureIntentEmail,
  "lifecycle-whatsapp-warning": whatsappWarningEmail,
  "lifecycle-whatsapp-exhausted": whatsappExhaustedEmail,
} satisfies Record<string, LifecycleTemplate>
