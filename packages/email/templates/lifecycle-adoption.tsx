// Adoption and retention lifecycle emails (plan §3 plays P02–P07, P13–P15).
// Each template turns a play decision's `data` into founder-voice content for
// W1's `LifecycleLayout`: their number in the first line, one button, subject
// under 45 characters.

import type { LifecycleEmailContent } from "../components/lifecycle-layout"

/** What the sender knows besides the play's data. */
export type LifecycleTemplateInput = {
  data: Record<string, string | number | boolean | null>
  businessName: string
  firstName?: string | null
  /** Signed `/go/:token` link to the play's CTA path. */
  ctaHref: string
  unsubscribeUrl: string
  preferencesUrl: string
}

export type LifecycleTemplateResult = {
  subject: string
  content: LifecycleEmailContent
}

export type LifecycleTemplate = (
  input: LifecycleTemplateInput,
) => LifecycleTemplateResult

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

const count = (value: number, one: string, many = `${one}s`) =>
  `${value.toLocaleString("en-NG")} ${value === 1 ? one : many}`

function money(minor: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode || "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(minor / 100)
}

/** Subjects stay under 45 characters (plan §6); long business names fall back. */
export const LIFECYCLE_SUBJECT_MAX = 44

const fits = (preferred: string, fallback: string) =>
  preferred.length <= LIFECYCLE_SUBJECT_MAX ? preferred : fallback

function monthName(reportMonth: unknown) {
  const [year, month] = String(reportMonth).split("-").map(Number)
  if (!year || !month) return "Last month"
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  })
}

function shell(
  input: LifecycleTemplateInput,
  content: Omit<
    LifecycleEmailContent,
    "businessName" | "firstName" | "unsubscribeUrl" | "preferencesUrl" | "cta"
  > & { ctaLabel: string },
): LifecycleEmailContent {
  const { ctaLabel, ...rest } = content
  return {
    ...rest,
    businessName: input.businessName,
    firstName: input.firstName,
    cta: { href: input.ctaHref, label: ctaLabel },
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesUrl: input.preferencesUrl,
  }
}

/** 21 · P02: products in, no sale yet. */
export const firstSaleEmail: LifecycleTemplate = (input) => {
  const items = num(input.data.catalogItems)
  return {
    subject: "Record your first sale on EwaTrade",
    content: shell(input, {
      preview: `${count(items, "product")} are ready. The next step is a sale.`,
      lead: `You've added ${count(items, "product")} to ${input.businessName}. The next step is recording a sale.`,
      body: [
        "The next time someone buys, open EwaTrade and record it: the items, the amount and how they paid. It goes into today's sales, and you can see the day's total whenever you want it.",
        "If something stops you, reply and tell me what it is.",
      ],
      ctaLabel: "Record a sale",
    }),
  }
}

/** 22 · P03: activated, no WhatsApp or Telegram link. */
export const assistantChannelEmail: LifecycleTemplate = (input) => {
  const orders = num(input.data.ordersTotal)
  return {
    subject: "Check your shop from WhatsApp",
    content: shell(input, {
      preview: "Ask for today's sales from the chat you already use.",
      lead: `You've recorded ${count(orders, "sale")} on EwaTrade so far.`,
      body: [
        "Connect WhatsApp and you can ask the EwaTrade assistant how much you sold today, or what's running low, from the same chat app you use all day.",
        "Prefer Telegram? You can connect that instead.",
      ],
      ctaLabel: "Connect WhatsApp",
    }),
  }
}

/** 23 · P04: 5+ items, no published site. */
export const siteSetupEmail: LifecycleTemplate = (input) => {
  const items = num(input.data.catalogItems)
  return {
    subject: `Put your ${count(items, "product")} online`,
    content: shell(input, {
      preview: "Your EwaTrade site is free to publish.",
      lead: `You have ${count(items, "product")} in EwaTrade, and none of them are on a website yet.`,
      body: [
        "Your EwaTrade site is free. Customers can see what you sell and send you an order, and those orders arrive with the rest of your sales.",
        "Pick a look, check the preview, then publish.",
      ],
      ctaLabel: "Publish my site",
    }),
  }
}

/** 24 · P05: site live 14+ days, free address. */
export const customDomainEmail: LifecycleTemplate = (input) => {
  const items = num(input.data.catalogItems)
  const liveDays = num(input.data.liveDays)
  return {
    subject: "Give your site its own name",
    content: shell(input, {
      preview: "A short name is easier to share than a long address.",
      lead:
        liveDays > 0
          ? `Your site has been live for ${liveDays} days with ${count(items, "product")} on it.`
          : `Your site has ${count(items, "product")} online.`,
      body: [
        "A name like yourshop.com.ng fits on a flyer, a receipt or a WhatsApp status, and customers remember it. You can search for one and buy it inside EwaTrade.",
      ],
      ctaLabel: "Find a domain",
    }),
  }
}

/** 25 · P06: 10+ orders, at most one money account. */
export const moneyAccountsEmail: LifecycleTemplate = (input) => {
  const orders = num(input.data.ordersTotal)
  const accounts = num(input.data.moneyAccounts)
  return {
    subject: "Keep cash and bank apart",
    content: shell(input, {
      preview: "Add your bank account next to cash.",
      lead:
        accounts === 0
          ? `You've recorded ${count(orders, "sale")}, and none of that money is in a money account yet.`
          : `You've recorded ${count(orders, "sale")}, and all of that money sits in one account.`,
      body: [
        "Add your bank account next to cash, plus POS or mobile money if you take them. Each payment then lands where it really went, and at closing time you can count the drawer against cash alone.",
      ],
      ctaLabel: "Add an account",
    }),
  }
}

/** 26 · P07: busy owner, no staff. */
export const staffEmail: LifecycleTemplate = (input) => {
  const orders = num(input.data.ordersThisMonth)
  const days = num(input.data.activeDays28)
  return {
    subject: "Let a sales rep record sales",
    content: shell(input, {
      preview: "Invite staff and you still see every sale.",
      lead: `You've recorded ${count(orders, "sale")} this month, and worked in EwaTrade on ${days} of the last 28 days.`,
      body: [
        "Invite a sales rep and they can record sales on their own phone. You choose what they can see, and every sale shows who recorded it.",
      ],
      ctaLabel: "Invite staff",
    }),
  }
}

/** 27 · P13: day 1 of the month, last month's numbers. */
export const monthlyReportEmail: LifecycleTemplate = (input) => {
  const orders = num(input.data.ordersLastMonth)
  const sales = money(
    num(input.data.salesMinorLastMonth),
    String(input.data.currencyCode ?? "NGN"),
  )
  const month = monthName(input.data.reportMonth)
  return {
    subject: `Your ${month} on EwaTrade`,
    content: shell(input, {
      preview: `${count(orders, "sale")}, ${sales} in ${month}.`,
      lead: `In ${month}, ${input.businessName} recorded ${count(orders, "sale")} worth ${sales}.`,
      stat: { label: `Sales in ${month}`, value: sales },
      body: ["Your report has the full month, item by item."],
      ctaLabel: "Open my report",
    }),
  }
}

/** 28 · P14: was a regular, now 10+ quiet days. */
export const atRiskEmail: LifecycleTemplate = (input) => {
  const days = num(input.data.inactiveDays)
  const orders = num(input.data.ordersTotal)
  return {
    subject: fits(
      `${days} quiet days at ${input.businessName}`,
      `${days} quiet days on EwaTrade`,
    ),
    content: shell(input, {
      preview: "Your sales and stock are where you left them.",
      lead: `${input.businessName} has ${count(orders, "sale")} on EwaTrade, and nothing new in the last ${days} days.`,
      body: [
        "When you're back, recording a sale is one screen: the items, the amount and how they paid.",
        "If something got in the way, reply and tell me. I read every reply.",
      ],
      ctaLabel: "Open EwaTrade",
    }),
  }
}

/** 29 · P15: 30+ days dormant, sent once. */
export const winBackEmail: LifecycleTemplate = (input) => {
  const days = num(input.data.inactiveDays)
  const orders = num(input.data.ordersTotal)
  return {
    subject: "Can I ask what happened?",
    content: shell(input, {
      preview: "One reply from you helps us fix the right thing.",
      lead:
        orders > 0
          ? `It's been ${days} days since anything happened at ${input.businessName}, after ${count(orders, "sale")} on EwaTrade.`
          : `It's been ${days} days since ${input.businessName} was set up on EwaTrade.`,
      body: [
        "If something didn't work for you, reply to this email and tell me what it was. I read every reply, and it decides what we fix next.",
        "If you just got busy, your products and sales are still there.",
      ],
      ctaLabel: "Open EwaTrade",
    }),
  }
}

/** Keyed by the plays' `templateKey`. */
export const LIFECYCLE_ADOPTION_TEMPLATES = {
  "lifecycle-first-sale": firstSaleEmail,
  "lifecycle-assistant-channel": assistantChannelEmail,
  "lifecycle-site-setup": siteSetupEmail,
  "lifecycle-custom-domain": customDomainEmail,
  "lifecycle-money-accounts": moneyAccountsEmail,
  "lifecycle-staff": staffEmail,
  "lifecycle-monthly-report": monthlyReportEmail,
  "lifecycle-at-risk": atRiskEmail,
  "lifecycle-win-back": winBackEmail,
} satisfies Record<string, LifecycleTemplate>
